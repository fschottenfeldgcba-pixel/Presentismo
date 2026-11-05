-- ============================================================================
-- FIX DEFINITIVO DE POLÍTICAS RLS PARA LNDLM 2026
-- Resuelve: "new row violates row-level security policy for table lndlm_logistic_hubs"
-- Ejecutar en el SQL Editor de Supabase (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- 1. NODRIZAS LOGÍSTICAS (lndlm_logistic_hubs)
ALTER TABLE public.lndlm_logistic_hubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_logistic_hubs_all" ON public.lndlm_logistic_hubs;
CREATE POLICY "lndlm_logistic_hubs_all" ON public.lndlm_logistic_hubs
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 2. RUTAS DE REPARTO (lndlm_delivery_routes)
ALTER TABLE public.lndlm_delivery_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_delivery_routes_all" ON public.lndlm_delivery_routes;
CREATE POLICY "lndlm_delivery_routes_all" ON public.lndlm_delivery_routes
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. ESPACIOS CULTURALES (lndlm_cultural_spaces)
ALTER TABLE public.lndlm_cultural_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_cultural_spaces_all" ON public.lndlm_cultural_spaces;
CREATE POLICY "lndlm_cultural_spaces_all" ON public.lndlm_cultural_spaces
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. ASIGNACIONES (lndlm_assignments)
ALTER TABLE public.lndlm_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_assignments_all" ON public.lndlm_assignments;
CREATE POLICY "lndlm_assignments_all" ON public.lndlm_assignments
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 5. VOLUNTARIOS (lndlm_volunteers)
ALTER TABLE public.lndlm_volunteers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lndlm_volunteers_all" ON public.lndlm_volunteers;
CREATE POLICY "lndlm_volunteers_all" ON public.lndlm_volunteers
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 6. PERMISOS DE EJECUCIÓN RPC
GRANT ALL ON TABLE public.lndlm_logistic_hubs TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.lndlm_delivery_routes TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.lndlm_cultural_spaces TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.lndlm_assignments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.lndlm_volunteers TO anon, authenticated, service_role;
