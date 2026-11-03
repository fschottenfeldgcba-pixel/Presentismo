-- ============================================================================
-- MIGRACIÓN: Módulo Especial "La Noche de los Museos (LNDLM 2026)"
-- Gestión y Asignación de Voluntarios a Espacios Culturales por Cercanía
-- ============================================================================

-- 1. Campo identificador opcional en la tabla de reuniones
ALTER TABLE IF EXISTS public.reuniones
ADD COLUMN IF NOT EXISTS is_lndlm_event BOOLEAN DEFAULT false;

-- 2. Tabla de Espacios Culturales (Sedes / Museos de CABA)
CREATE TABLE IF NOT EXISTS public.lndlm_cultural_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.reuniones(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  neighborhood TEXT NOT NULL, -- Normalizado en MAYÚSCULAS y sin tildes
  comuna INTEGER CHECK (comuna >= 1 AND comuna <= 15),
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  quota_required INTEGER NOT NULL DEFAULT 2 CHECK (quota_required >= 0),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lndlm_spaces_neighborhood ON public.lndlm_cultural_spaces(neighborhood);
CREATE INDEX IF NOT EXISTS idx_lndlm_spaces_comuna ON public.lndlm_cultural_spaces(comuna);
CREATE INDEX IF NOT EXISTS idx_lndlm_spaces_meeting ON public.lndlm_cultural_spaces(meeting_id);

-- 3. Tabla de Voluntarios LNDLM (Datos específicos y estado de asignación)
CREATE TABLE IF NOT EXISTS public.lndlm_volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.reuniones(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dni TEXT NOT NULL,
  cuil TEXT,
  birth_date TEXT,
  comuna INTEGER CHECK (comuna >= 1 AND comuna <= 15),
  neighborhood TEXT, -- Normalizado en MAYÚSCULAS y sin tildes
  email TEXT,
  phone TEXT,
  channel TEXT,
  attended_training BOOLEAN DEFAULT false,
  assigned_space_id UUID REFERENCES public.lndlm_cultural_spaces(id) ON DELETE SET NULL,
  assignment_score INTEGER, -- 100=Mismo Barrio, 80=Misma Comuna, 60=Comuna Limítrofe, 40=Resto CABA
  proximity_tier TEXT CHECK (proximity_tier IN ('MISMO_BARRIO', 'MISMA_COMUNA', 'COMUNA_LIMITROFE', 'RESTO_CABA')),
  distance_km DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'INSCRIPTO' CHECK (status IN ('INSCRIPTO', 'PRESENTE_CAPACITACION', 'ASIGNADO', 'SUPLENTE', 'BAJA')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, dni)
);

CREATE INDEX IF NOT EXISTS idx_lndlm_volunteers_meeting_dni ON public.lndlm_volunteers(meeting_id, dni);
CREATE INDEX IF NOT EXISTS idx_lndlm_volunteers_space ON public.lndlm_volunteers(assigned_space_id);
CREATE INDEX IF NOT EXISTS idx_lndlm_volunteers_status ON public.lndlm_volunteers(status);

-- 4. Tabla de Asignaciones vinculada a la reunión y asistentes acreditados
CREATE TABLE IF NOT EXISTS public.lndlm_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.reuniones(id) ON DELETE CASCADE,
  attendee_id TEXT NOT NULL, -- DNI / vecino_id del voluntario acreditado
  space_id UUID REFERENCES public.lndlm_cultural_spaces(id) ON DELETE SET NULL,
  proximity_tier TEXT CHECK (proximity_tier IN ('MISMO_BARRIO', 'MISMA_COMUNA', 'COMUNA_LIMITROFE', 'RESTO_CABA')),
  assignment_score INTEGER, -- 100 | 80 | 60 | 40
  distance_km DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'ASIGNADO' CHECK (status IN ('ASIGNADO', 'SUPLENTE', 'BAJA')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, attendee_id)
);

CREATE INDEX IF NOT EXISTS idx_lndlm_assignments_meeting ON public.lndlm_assignments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_lndlm_assignments_space ON public.lndlm_assignments(space_id);
