-- ------------------------------------------------------------------------------------
-- Crear una orden y asignar a alguien pasan a ser solo de administración
-- ------------------------------------------------------------------------------------
-- Dos políticas dejaban a un mecánico o pintor hacer por su cuenta cosas que son decisiones
-- del taller, y la segunda además es dinero.
--
-- 1. `ordenes_trabajo_insert` permitía `is_admin() OR sede_id = current_user_sede_id()`, así
--    que cualquier técnico podía abrir órdenes en su sede. Abrir una orden es recibir un
--    vehículo y comprometer al taller; se queda en administración.
--
-- 2. `orden_asignaciones_insert` permitía `is_admin() OR (usuario_id = auth.uid() AND la orden
--    es de su sede)` — es decir, **auto-asignarse**. Y asignar no es una etiqueta: el trigger
--    `trg_assignment_commissions` llama a `sync_order_commissions(orden_id)`, que reparte la
--    mano de obra entre quienes están asignados. Auto-asignarse era, literalmente,
--    concederse una comisión sobre una orden que nadie autorizó que trabajaras, y de paso
--    diluir la de quien sí estaba asignado. Asignar se queda en administración.
--
-- Esto cierra también el camino por RPC sin tocarla: `create_work_order` es SECURITY INVOKER,
-- así que la RLS se aplica dentro de ella y su INSERT pasa por la política nueva.
--
-- Lo que NO cambia, para que quede escrito:
--   * Un técnico sigue **viendo** las órdenes de su sede y las asignaciones de esas órdenes
--     (las políticas de SELECT no se tocan).
--   * Sigue moviendo estado, avance y firma de las órdenes donde está asignado
--     (`trg_guard_order_technician`).
--   * Sigue actualizando el `estatus_tarea` de **su propia** asignación
--     (`orden_asignaciones_update`, que no se toca). Eso no mueve dinero: el reparto de
--     `sync_order_commissions` cuenta asignaciones, no mira `tipo_tarea` ni `estatus_tarea`,
--     y `trg_assignment_owner_immutable` le impide repuntar la fila a otra orden u otra
--     persona.
--   * `orden_asignaciones_delete` ya era solo de admin: un técnico tampoco puede quitarse de
--     una orden para escapar de ella.
--
-- `trg_guard_order_insert` se deja puesto aunque su cuerpo quede fuera de alcance para todo
-- `authenticated` que no sea admin. No sobra: es la red por si alguna vez se vuelve a abrir la
-- política, y no cuesta nada tenerla.
--
-- Las dos políticas se reescriben enteras (DROP + CREATE) en vez de con `ALTER POLICY`, para
-- que el cuerpo vigente esté escrito aquí y no haya que reconstruirlo leyendo dos migraciones.
-- La llamada va envuelta en `(SELECT …)` como en `20261002000000`: así Postgres la resuelve
-- una vez por consulta (InitPlan) y no una vez por fila.

-- ------------------------------------------------------------------------------------
-- 1. Abrir una orden
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS ordenes_trabajo_insert ON ordenes_trabajo;
CREATE POLICY ordenes_trabajo_insert ON ordenes_trabajo
  FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));

-- ------------------------------------------------------------------------------------
-- 2. Asignar a alguien a una orden
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS orden_asignaciones_insert ON orden_asignaciones;
CREATE POLICY orden_asignaciones_insert ON orden_asignaciones
  FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));
