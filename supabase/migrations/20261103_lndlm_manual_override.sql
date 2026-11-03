-- ============================================================================
-- LNDLM 2026 - Asignación manual ("a dedo") y blindaje al borrar espacios
-- Idempotente: se puede ejecutar más de una vez.
-- ============================================================================

-- 1. Flag anti-sobrescritura: el motor automático NUNCA reasigna filas con is_manual_override = true
ALTER TABLE public.lndlm_assignments ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.lndlm_volunteers  ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN NOT NULL DEFAULT false;

-- 2. Foreign Keys: al borrar un espacio, el voluntario NO se pierde (ON DELETE SET NULL)
ALTER TABLE public.lndlm_assignments DROP CONSTRAINT IF EXISTS lndlm_assignments_space_id_fkey;
ALTER TABLE public.lndlm_assignments
  ADD CONSTRAINT lndlm_assignments_space_id_fkey
  FOREIGN KEY (space_id) REFERENCES public.lndlm_cultural_spaces(id) ON DELETE SET NULL;

ALTER TABLE public.lndlm_volunteers DROP CONSTRAINT IF EXISTS lndlm_volunteers_assigned_space_id_fkey;
ALTER TABLE public.lndlm_volunteers
  ADD CONSTRAINT lndlm_volunteers_assigned_space_id_fkey
  FOREIGN KEY (assigned_space_id) REFERENCES public.lndlm_cultural_spaces(id) ON DELETE SET NULL;

-- 3. Trigger: antes de borrar el espacio, sus voluntarios pasan a SUPLENTE (sin cercanía, sin flag manual)
CREATE OR REPLACE FUNCTION public.lndlm_space_deleted_to_substitutes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.lndlm_assignments
     SET status = 'SUPLENTE', proximity_tier = NULL, assignment_score = NULL,
         distance_km = NULL, is_manual_override = false, updated_at = now()
   WHERE space_id = OLD.id AND status = 'ASIGNADO';

  UPDATE public.lndlm_volunteers
     SET status = 'SUPLENTE', proximity_tier = NULL, assignment_score = NULL,
         distance_km = NULL, is_manual_override = false, updated_at = now()
   WHERE assigned_space_id = OLD.id AND status = 'ASIGNADO';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_lndlm_space_deleted ON public.lndlm_cultural_spaces;
CREATE TRIGGER trg_lndlm_space_deleted
  BEFORE DELETE ON public.lndlm_cultural_spaces
  FOR EACH ROW EXECUTE FUNCTION public.lndlm_space_deleted_to_substitutes();
