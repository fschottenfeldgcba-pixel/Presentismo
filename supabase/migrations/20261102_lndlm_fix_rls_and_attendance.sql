-- ============================================================================
-- FIX RLS, ASISTENCIA Y ASIGNACIONES - LNDLM 2026
-- Este script resuelve:
-- 1. Políticas RLS permisivas en todas las tablas LNDLM (para que el frontend y anon puedan leer/escribir).
-- 2. Actualización de las funciones RPC para consultar la asistencia real en `inscripciones_asistencias` + `vecinos`.
-- 3. Sincronización de Espacios Culturales y Voluntarios desde los datos de la reunión.
-- ============================================================================

-- 1. POLÍTICAS RLS EN TODAS LAS TABLAS LNDLM
ALTER TABLE public.lndlm_cultural_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_cultural_spaces_all" ON public.lndlm_cultural_spaces;
CREATE POLICY "lndlm_cultural_spaces_all" ON public.lndlm_cultural_spaces
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.lndlm_volunteers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_volunteers_all" ON public.lndlm_volunteers;
CREATE POLICY "lndlm_volunteers_all" ON public.lndlm_volunteers
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.lndlm_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_assignments_all" ON public.lndlm_assignments;
CREATE POLICY "lndlm_assignments_all" ON public.lndlm_assignments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.lndlm_logistic_hubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_logistic_hubs_all" ON public.lndlm_logistic_hubs;
CREATE POLICY "lndlm_logistic_hubs_all" ON public.lndlm_logistic_hubs
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.lndlm_delivery_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_delivery_routes_all" ON public.lndlm_delivery_routes;
CREATE POLICY "lndlm_delivery_routes_all" ON public.lndlm_delivery_routes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. RPC: CONSULTA DEL VOLUNTARIO (Verifica asistencia en inscripciones_asistencias o lndlm_volunteers)
CREATE OR REPLACE FUNCTION public.lndlm_volunteer_lookup(p_dni TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
  v_last_name TEXT;
  v_dni TEXT;
  v_meeting_id UUID;
  v_attended BOOLEAN := false;
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

  -- 1. Buscar primero en lndlm_volunteers
  SELECT first_name, last_name, dni, meeting_id, attended_training
    INTO v_first_name, v_last_name, v_dni, v_meeting_id, v_attended
    FROM lndlm_volunteers
   WHERE regexp_replace(dni, '\D', '', 'g') = clean AND attended_training = true
   ORDER BY updated_at DESC LIMIT 1;

  -- 2. Si no se encontró en lndlm_volunteers, buscar en inscripciones_asistencias de la reunión NDLM
  IF v_dni IS NULL THEN
    SELECT vec.nombre, vec.apellido, ia.vecino_id, ia.reunion_id, ia.asistio
      INTO v_first_name, v_last_name, v_dni, v_meeting_id, v_attended
      FROM inscripciones_asistencias ia
      JOIN reuniones r ON r.id = ia.reunion_id
      LEFT JOIN vecinos vec ON regexp_replace(vec.dni, '\D', '', 'g') = regexp_replace(ia.vecino_id, '\D', '', 'g')
     WHERE regexp_replace(ia.vecino_id, '\D', '', 'g') = clean
       AND ia.asistio = true
       AND (r.is_lndlm_event = true OR r.nombre ILIKE '%NDLM%' OR r.nombre ILIKE '%Museos%' OR r.nombre ILIKE '%LNDLM%')
     ORDER BY r.fecha DESC NULLS LAST, ia.created_at DESC
     LIMIT 1;
  END IF;

  -- Si no registra asistencia confirmada a la capacitación
  IF v_dni IS NULL OR v_attended IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ATTENDANCE');
  END IF;

  -- 3. Buscar asignación en lndlm_assignments
  SELECT * INTO a FROM lndlm_assignments
   WHERE regexp_replace(attendee_id, '\D', '', 'g') = clean
     AND status = 'ASIGNADO' AND space_id IS NOT NULL
   ORDER BY updated_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'assigned', false,
      'volunteer', jsonb_build_object(
        'first_name', coalesce(v_first_name, 'Voluntario'),
        'last_name', coalesce(v_last_name, ''),
        'dni', v_dni
      )
    );
  END IF;

  -- 4. Cargar datos del espacio cultural
  SELECT * INTO s FROM lndlm_cultural_spaces WHERE id = a.space_id;

  -- 5. Estado de entrega
  SELECT r.status INTO r_status FROM lndlm_delivery_routes r
   WHERE r.meeting_id = a.meeting_id
     AND r.itinerary @> jsonb_build_array(jsonb_build_object('space_id', a.space_id::text))
   ORDER BY CASE r.status WHEN 'DELIVERED' THEN 3 WHEN 'IN_TRANSIT' THEN 2 ELSE 1 END DESC
   LIMIT 1;

  -- 6. Equipo y receptor
  SELECT count(*), count(check_in_time) INTO team_assigned, team_checked_in
    FROM lndlm_assignments
   WHERE meeting_id = a.meeting_id AND space_id = a.space_id AND status = 'ASIGNADO';

  SELECT coalesce(vv.first_name || ' ' || vv.last_name, vec.nombre || ' ' || vec.apellido, x.attendee_id) INTO receiver_name
    FROM lndlm_assignments x
    LEFT JOIN lndlm_volunteers vv ON vv.meeting_id = x.meeting_id AND regexp_replace(vv.dni, '\D', '', 'g') = regexp_replace(x.attendee_id, '\D', '', 'g')
    LEFT JOIN vecinos vec ON regexp_replace(vec.dni, '\D', '', 'g') = regexp_replace(x.attendee_id, '\D', '', 'g')
   WHERE x.meeting_id = a.meeting_id AND x.space_id = a.space_id
     AND x.status = 'ASIGNADO' AND x.is_food_receiver = true
   LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'assigned', true,
    'volunteer', jsonb_build_object(
      'first_name', coalesce(v_first_name, 'Voluntario'),
      'last_name', coalesce(v_last_name, ''),
      'dni', v_dni
    ),
    'space', jsonb_build_object(
      'id', s.id,
      'name', coalesce(s.name, 'Espacio Cultural'),
      'address', coalesce(s.address, ''),
      'contact_name', coalesce(s.contact_name, ''),
      'contact_phone', coalesce(s.contact_phone, '')
    ),
    'checkin', jsonb_build_object(
      'check_in_time', a.check_in_time,
      'is_food_receiver', a.is_food_receiver,
      'food_received_time', a.food_received_time
    ),
    'route_status', r_status,
    'team', jsonb_build_object(
      'assigned', team_assigned,
      'checked_in', team_checked_in,
      'receiver_name', receiver_name
    )
  );
END;
$$;

-- 3. RPC: CHECK-IN CON FOTO
CREATE OR REPLACE FUNCTION public.lndlm_checkin(p_dni TEXT, p_photo_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attended BOOLEAN := false;
  a RECORD;
  clean TEXT := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
  receivers INT;
BEGIN
  IF p_photo_url IS NULL OR length(trim(p_photo_url)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PHOTO_REQUIRED');
  END IF;

  SELECT true INTO v_attended FROM lndlm_volunteers
   WHERE regexp_replace(dni, '\D', '', 'g') = clean AND attended_training = true
   ORDER BY updated_at DESC LIMIT 1;

  IF NOT coalesce(v_attended, false) THEN
    SELECT true INTO v_attended FROM inscripciones_asistencias ia
      JOIN reuniones r ON r.id = ia.reunion_id
     WHERE regexp_replace(ia.vecino_id, '\D', '', 'g') = clean
       AND ia.asistio = true
       AND (r.is_lndlm_event = true OR r.nombre ILIKE '%NDLM%' OR r.nombre ILIKE '%Museos%' OR r.nombre ILIKE '%LNDLM%')
     LIMIT 1;
  END IF;

  IF NOT coalesce(v_attended, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ATTENDANCE');
  END IF;

  SELECT * INTO a FROM lndlm_assignments
   WHERE regexp_replace(attendee_id, '\D', '', 'g') = clean
     AND status = 'ASIGNADO' AND space_id IS NOT NULL
   ORDER BY updated_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ASSIGNED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(a.space_id::text));

  SELECT * INTO a FROM lndlm_assignments WHERE id = a.id;
  IF a.check_in_time IS NOT NULL THEN
    RETURN public.lndlm_volunteer_lookup(p_dni);
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

-- 4. RPC: CONFIRMACIÓN DE VIANDAS
CREATE OR REPLACE FUNCTION public.lndlm_confirm_food(p_dni TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attended BOOLEAN := false;
  a RECORD;
  clean TEXT := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
BEGIN
  SELECT true INTO v_attended FROM lndlm_volunteers
   WHERE regexp_replace(dni, '\D', '', 'g') = clean AND attended_training = true
   ORDER BY updated_at DESC LIMIT 1;

  IF NOT coalesce(v_attended, false) THEN
    SELECT true INTO v_attended FROM inscripciones_asistencias ia
      JOIN reuniones r ON r.id = ia.reunion_id
     WHERE regexp_replace(ia.vecino_id, '\D', '', 'g') = clean
       AND ia.asistio = true
       AND (r.is_lndlm_event = true OR r.nombre ILIKE '%NDLM%' OR r.nombre ILIKE '%Museos%' OR r.nombre ILIKE '%LNDLM%')
     LIMIT 1;
  END IF;

  IF NOT coalesce(v_attended, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ATTENDANCE');
  END IF;

  SELECT * INTO a FROM lndlm_assignments
   WHERE regexp_replace(attendee_id, '\D', '', 'g') = clean
     AND status = 'ASIGNADO' AND space_id IS NOT NULL
   ORDER BY updated_at DESC LIMIT 1;

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
