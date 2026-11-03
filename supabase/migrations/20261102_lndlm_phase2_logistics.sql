-- ============================================================================
-- MIGRACIÓN FASE 2 - LNDLM 2026: Logística en Vivo, WebApp del Voluntario y Viandas
-- Requiere haber corrido antes: 20261030_lndlm_module.sql
-- Es idempotente: se puede ejecutar más de una vez sin romper nada.
-- ============================================================================

-- 1. Campos de check-in y recepción de viandas en lndlm_assignments
ALTER TABLE public.lndlm_assignments ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ;
ALTER TABLE public.lndlm_assignments ADD COLUMN IF NOT EXISTS check_in_photo_url TEXT;
ALTER TABLE public.lndlm_assignments ADD COLUMN IF NOT EXISTS is_food_receiver BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.lndlm_assignments ADD COLUMN IF NOT EXISTS food_received_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_lndlm_assignments_checkin ON public.lndlm_assignments(space_id, check_in_time);

-- 2. Camionetas Nodrizas (bases móviles de reparto)
CREATE TABLE IF NOT EXISTS public.lndlm_logistic_hubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.reuniones(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  moto_count INTEGER NOT NULL DEFAULT 2 CHECK (moto_count >= 0),
  zone_comunas INTEGER[] NOT NULL DEFAULT '{}',   -- Comunas que abastece
  zone_barrios TEXT[] NOT NULL DEFAULT '{}',      -- Barrios (normalizados) que abastece
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lndlm_hubs_meeting ON public.lndlm_logistic_hubs(meeting_id);

-- 3. Rutas de Reparto (cada fila = 1 viaje de 1 moto, máximo 10 viandas)
CREATE TABLE IF NOT EXISTS public.lndlm_delivery_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.reuniones(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.lndlm_logistic_hubs(id) ON DELETE CASCADE,
  moto_number INTEGER,
  trip_number INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_TRANSIT', 'DELIVERED')),
  total_viandas INTEGER NOT NULL DEFAULT 0 CHECK (total_viandas >= 0 AND total_viandas <= 10),
  distance_km DOUBLE PRECISION,
  -- [{ "space_id": "...", "space_name": "...", "viandas": 4, "food_receiver": "Nombre Apellido", ... }]
  itinerary JSONB NOT NULL DEFAULT '[]'::jsonb,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lndlm_routes_meeting ON public.lndlm_delivery_routes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_lndlm_routes_hub ON public.lndlm_delivery_routes(hub_id);

-- 4. Bucket de Storage para las fotos de evidencia del check-in
INSERT INTO storage.buckets (id, name, public)
VALUES ('lndlm-checkins', 'lndlm-checkins', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "lndlm_checkins_insert" ON storage.objects;
CREATE POLICY "lndlm_checkins_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'lndlm-checkins');

DROP POLICY IF EXISTS "lndlm_checkins_select" ON storage.objects;
CREATE POLICY "lndlm_checkins_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'lndlm-checkins');

-- ============================================================================
-- 5. FUNCIONES RPC PARA LA WEBAPP DEL VOLUNTARIO
--    SECURITY DEFINER: la app pública solo puede hacer estas 3 operaciones
--    puntuales (consultar, check-in, confirmar viandas) identificándose con DNI.
-- ============================================================================

-- 5.1 Consulta de hoja de ruta del voluntario por DNI
CREATE OR REPLACE FUNCTION public.lndlm_volunteer_lookup(p_dni TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
  a RECORD;
  s RECORD;
  clean TEXT := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
  r_status TEXT;
  team_assigned INT;
  team_checked_in INT;
  receiver_name TEXT;
BEGIN
  IF clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ATTENDANCE');
  END IF;

  SELECT * INTO v FROM lndlm_volunteers
   WHERE regexp_replace(dni, '\D', '', 'g') = clean AND attended_training = true
   ORDER BY updated_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ATTENDANCE');
  END IF;

  SELECT * INTO a FROM lndlm_assignments
   WHERE meeting_id = v.meeting_id AND attendee_id = v.dni
     AND status = 'ASIGNADO' AND space_id IS NOT NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'assigned', false,
      'volunteer', jsonb_build_object('first_name', v.first_name, 'last_name', v.last_name, 'dni', v.dni)
    );
  END IF;

  SELECT * INTO s FROM lndlm_cultural_spaces WHERE id = a.space_id;

  SELECT r.status INTO r_status FROM lndlm_delivery_routes r
   WHERE r.meeting_id = a.meeting_id
     AND r.itinerary @> jsonb_build_array(jsonb_build_object('space_id', a.space_id::text))
   ORDER BY CASE r.status WHEN 'DELIVERED' THEN 3 WHEN 'IN_TRANSIT' THEN 2 ELSE 1 END DESC
   LIMIT 1;

  SELECT count(*), count(check_in_time) INTO team_assigned, team_checked_in
    FROM lndlm_assignments
   WHERE meeting_id = a.meeting_id AND space_id = a.space_id AND status = 'ASIGNADO';

  SELECT coalesce(vv.first_name || ' ' || vv.last_name, x.attendee_id) INTO receiver_name
    FROM lndlm_assignments x
    LEFT JOIN lndlm_volunteers vv ON vv.meeting_id = x.meeting_id AND vv.dni = x.attendee_id
   WHERE x.meeting_id = a.meeting_id AND x.space_id = a.space_id
     AND x.status = 'ASIGNADO' AND x.is_food_receiver = true
   LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'assigned', true,
    'volunteer', jsonb_build_object('first_name', v.first_name, 'last_name', v.last_name, 'dni', v.dni),
    'space', jsonb_build_object(
      'id', s.id, 'name', s.name, 'address', s.address,
      'contact_name', s.contact_name, 'contact_phone', s.contact_phone
    ),
    'checkin', jsonb_build_object(
      'check_in_time', a.check_in_time,
      'is_food_receiver', a.is_food_receiver,
      'food_received_time', a.food_received_time
    ),
    'route_status', r_status,
    'team', jsonb_build_object(
      'assigned', team_assigned, 'checked_in', team_checked_in, 'receiver_name', receiver_name
    )
  );
END;
$$;

-- 5.2 Check-in con foto obligatoria. El primero del equipo en llegar queda como receptor de viandas.
CREATE OR REPLACE FUNCTION public.lndlm_checkin(p_dni TEXT, p_photo_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
  a RECORD;
  clean TEXT := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
  receivers INT;
BEGIN
  IF p_photo_url IS NULL OR length(trim(p_photo_url)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PHOTO_REQUIRED');
  END IF;

  SELECT * INTO v FROM lndlm_volunteers
   WHERE regexp_replace(dni, '\D', '', 'g') = clean AND attended_training = true
   ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ATTENDANCE');
  END IF;

  SELECT * INTO a FROM lndlm_assignments
   WHERE meeting_id = v.meeting_id AND attendee_id = v.dni
     AND status = 'ASIGNADO' AND space_id IS NOT NULL
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ASSIGNED');
  END IF;

  -- Serializa los check-ins de un mismo espacio para que solo UNO quede como receptor
  PERFORM pg_advisory_xact_lock(hashtext(a.space_id::text));

  SELECT * INTO a FROM lndlm_assignments WHERE id = a.id;
  IF a.check_in_time IS NOT NULL THEN
    RETURN public.lndlm_volunteer_lookup(p_dni); -- idempotente: ya había hecho check-in
  END IF;

  SELECT count(*) INTO receivers FROM lndlm_assignments
   WHERE meeting_id = a.meeting_id AND space_id = a.space_id
     AND status = 'ASIGNADO' AND is_food_receiver = true;

  UPDATE lndlm_assignments
     SET check_in_time = now(),
         check_in_photo_url = p_photo_url,
         is_food_receiver = (receivers = 0),
         updated_at = now()
   WHERE id = a.id;

  RETURN public.lndlm_volunteer_lookup(p_dni);
END;
$$;

-- 5.3 Confirmación de recepción de viandas (solo el receptor designado)
CREATE OR REPLACE FUNCTION public.lndlm_confirm_food(p_dni TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
  a RECORD;
  clean TEXT := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
BEGIN
  SELECT * INTO v FROM lndlm_volunteers
   WHERE regexp_replace(dni, '\D', '', 'g') = clean AND attended_training = true
   ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ATTENDANCE');
  END IF;

  SELECT * INTO a FROM lndlm_assignments
   WHERE meeting_id = v.meeting_id AND attendee_id = v.dni AND status = 'ASIGNADO' AND space_id IS NOT NULL
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ASSIGNED');
  END IF;
  IF a.check_in_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_CHECKED_IN');
  END IF;
  IF a.is_food_receiver IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_RECEIVER');
  END IF;

  UPDATE lndlm_assignments
     SET food_received_time = coalesce(food_received_time, now()), updated_at = now()
   WHERE id = a.id;

  RETURN public.lndlm_volunteer_lookup(p_dni);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lndlm_volunteer_lookup(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lndlm_checkin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lndlm_confirm_food(TEXT) TO anon, authenticated;
