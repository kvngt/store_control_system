-- ====================================================================================
-- RESTORIFY — Índices de claves foráneas y políticas con InitPlan (17/10/2026)
-- ====================================================================================
-- Hallazgos de la auditoría con la guía de Supabase (docs/plan-saas-2026-10.md §3.1). No
-- cambia qué ve cada quien: solo la velocidad.
--
-- 1. B1 (schema-foreign-key-indexes): diez claves foráneas no tenían índice. Las tres que se
--    usan en uniones y borrados en cascada (`orden_avances.labor_id`,
--    `orden_hallazgos.presupuesto_id`, `orden_proximo_servicio.sede_id`) y las siete de "quién
--    lo hizo", que se recorren al borrar a un empleado (ON DELETE SET NULL).
-- 2. B2 (security-rls-performance): siete políticas llamaban `is_admin()` y
--    `current_user_sede_id()` una vez por fila. Se reescriben enteras, como las demás desde
--    20261002000000, con la llamada envuelta en `(SELECT …)`: Postgres la resuelve una vez por
--    consulta (InitPlan). La condición es la misma.
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. Índices
-- ------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orden_avances_labor_id ON public.orden_avances (labor_id);
CREATE INDEX IF NOT EXISTS idx_orden_hallazgos_presupuesto_id ON public.orden_hallazgos (presupuesto_id);
CREATE INDEX IF NOT EXISTS idx_orden_hallazgos_reportado_por ON public.orden_hallazgos (reportado_por);
CREATE INDEX IF NOT EXISTS idx_orden_hallazgos_resuelto_por ON public.orden_hallazgos (resuelto_por);
CREATE INDEX IF NOT EXISTS idx_orden_proximo_servicio_sede_id ON public.orden_proximo_servicio (sede_id);
CREATE INDEX IF NOT EXISTS idx_orden_proximo_servicio_programado_por ON public.orden_proximo_servicio (programado_por);
CREATE INDEX IF NOT EXISTS idx_orden_proximo_servicio_sugerido_por ON public.orden_proximo_servicio (sugerido_por);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_lista_para_entregar_por ON public.ordenes_trabajo (lista_para_entregar_por);
CREATE INDEX IF NOT EXISTS idx_perfiles_pago_actualizado_por ON public.perfiles_pago (actualizado_por);
CREATE INDEX IF NOT EXISTS idx_parqueo_config_actualizado_por ON public.parqueo_config (actualizado_por);

-- ------------------------------------------------------------------------------------
-- 2. Políticas (desde 20261010000028, 20261010000029 y 20261010000013)
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS parqueo_config_select_admin ON public.parqueo_config;
CREATE POLICY parqueo_config_select_admin ON public.parqueo_config
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS parqueo_perfiles_select_admin ON public.parqueo_perfiles;
CREATE POLICY parqueo_perfiles_select_admin ON public.parqueo_perfiles
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS parqueo_tramos_select_admin ON public.parqueo_tramos;
CREATE POLICY parqueo_tramos_select_admin ON public.parqueo_tramos
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS orden_parqueo_select_admin ON public.orden_parqueo;
CREATE POLICY orden_parqueo_select_admin ON public.orden_parqueo
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS orden_proximo_servicio_select ON public.orden_proximo_servicio;
CREATE POLICY orden_proximo_servicio_select ON public.orden_proximo_servicio
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));

-- Las traducciones son de la sede del admin (no de todas): se conserva esa condición.
DROP POLICY IF EXISTS traducciones_admin_select ON public.traducciones;
CREATE POLICY traducciones_admin_select ON public.traducciones
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) AND sede_id = (SELECT public.current_user_sede_id()));

DROP POLICY IF EXISTS traducciones_admin_update ON public.traducciones;
CREATE POLICY traducciones_admin_update ON public.traducciones
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()) AND sede_id = (SELECT public.current_user_sede_id()))
  WITH CHECK ((SELECT public.is_admin()) AND sede_id = (SELECT public.current_user_sede_id()));
