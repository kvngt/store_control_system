-- ------------------------------------------------------------------------------------
-- Afinado de la base antes de atender clientes reales
-- ------------------------------------------------------------------------------------
-- Cuatro cosas que hoy no se notan y que con un año de historia sí se notarían. Se hacen
-- ahora porque con 5 órdenes cambiar una política cuesta nada. Ninguna cambia permisos ni
-- comportamiento: lo que cambia es cuánto trabajo hace el motor para llegar al mismo sitio.
--
-- Diagnóstico completo en docs/historico/revision-base-2026-09-19.md.


-- ------------------------------------------------------------------------------------
-- 1. Índices para las claves foráneas que no tenían
-- ------------------------------------------------------------------------------------
-- Postgres no indexa el lado hijo de una clave foránea. Sin el índice, borrar una fila del
-- padre obliga a recorrer entera la tabla hija para comprobar que nadie la referencia.
--
-- Donde se va a notar: borrar un empleado. `delete-employee` ya comprueba órdenes asignadas
-- y pagos de comisiones, pero la base igual tiene que recorrer `finanzas_movimientos`,
-- `orden_media`, `orden_avances` y `presupuestos` enteras por cada `ON DELETE SET NULL`.
CREATE INDEX IF NOT EXISTS idx_comision_pagos_pagado_por ON comision_pagos (pagado_por);
CREATE INDEX IF NOT EXISTS idx_finanzas_importaciones_importado_por ON finanzas_importaciones (importado_por);
CREATE INDEX IF NOT EXISTS idx_finanzas_movimientos_registrado_por ON finanzas_movimientos (registrado_por);
CREATE INDEX IF NOT EXISTS idx_notificaciones_sede ON notificaciones (sede_id);
CREATE INDEX IF NOT EXISTS idx_orden_avances_usuario ON orden_avances (usuario_id);
CREATE INDEX IF NOT EXISTS idx_orden_enlaces_creado_por ON orden_enlaces (creado_por);
CREATE INDEX IF NOT EXISTS idx_orden_enlaces_sede ON orden_enlaces (sede_id);
CREATE INDEX IF NOT EXISTS idx_orden_labor_completado_por ON orden_labor (completado_por);
CREATE INDEX IF NOT EXISTS idx_orden_media_subido_por ON orden_media (subido_por);
CREATE INDEX IF NOT EXISTS idx_orden_media_sede ON orden_media (sede_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_creado_por ON ordenes_trabajo (creado_por);
CREATE INDEX IF NOT EXISTS idx_presupuestos_enviado_por ON presupuestos (enviado_por);
CREATE INDEX IF NOT EXISTS idx_presupuestos_respondido_por ON presupuestos (respondido_por_perfil);
CREATE INDEX IF NOT EXISTS idx_presupuestos_sede ON presupuestos (sede_id);


-- ------------------------------------------------------------------------------------
-- 2. Validar las restricciones que se crearon NOT VALID
-- ------------------------------------------------------------------------------------
-- Se crearon así a propósito: NOT VALID no falla por filas viejas que no cumplían, y desde
-- entonces se aplica a todo lo que entra. Lo que falta es comprobar las filas anteriores y
-- que el planificador pueda confiar en ellas.
--
-- Con las tablas de hoy tarda milisegundos y no bloquea escrituras. Si alguna falla, es una
-- noticia: significaría que hay un correo mal formado, un costo negativo o un avance fuera
-- de 0–100 guardado desde antes.
ALTER TABLE clientes VALIDATE CONSTRAINT clientes_email_formato;
ALTER TABLE orden_labor VALIDATE CONSTRAINT orden_labor_costo_no_negativo;
ALTER TABLE orden_repuestos VALIDATE CONSTRAINT orden_repuestos_cantidad_positiva;
ALTER TABLE orden_repuestos VALIDATE CONSTRAINT orden_repuestos_precio_no_negativo;
ALTER TABLE ordenes_trabajo VALIDATE CONSTRAINT ordenes_trabajo_porcentaje_avance_rango;
ALTER TABLE sedes VALIDATE CONSTRAINT sedes_email_contacto_formato;


-- ------------------------------------------------------------------------------------
-- 3. Políticas que se solapaban
-- ------------------------------------------------------------------------------------
-- Dos políticas PERMISSIVE para la misma acción obligan a Postgres a evaluar las dos y
-- unirlas con OR; no puede parar en la primera que dice que sí.
--
-- `comision_pagos_write`, `comisiones_write` y `sedes_write` eran `FOR ALL`, así que también
-- cubrían SELECT — donde no aportaban nada, porque la política de lectura de cada tabla ya
-- incluye a los admins. Se parten en INSERT/UPDATE/DELETE y la lectura queda con una sola.
-- El resultado lógico es idéntico.
-- ------------------------------------------------------------------------------------
-- La RLS deja de evaluarse una vez por fila
-- ------------------------------------------------------------------------------------
-- `perfiles` tiene 5 filas y el motor la había recorrido entera 149.654 veces. La causa es
-- que `is_admin()`, `current_user_role()` y `current_user_sede_id()` viven dentro de 52
-- políticas, y cada una hace un `SELECT ... FROM perfiles`. Dentro del filtro de una
-- política, Postgres las ejecuta **por cada fila examinada**.
--
-- Envolverlas en una subconsulta escalar — `(SELECT public.is_admin())` — las convierte en
-- un InitPlan: se resuelven UNA vez por consulta. Los permisos no cambian; lo único que
-- cambia es cuántas veces se preguntan. Con 5 órdenes no se nota; con 2.000 es la
-- diferencia entre un tablero que abre y uno que se arrastra.
--
-- `is_assigned_to_order(orden_id)` NO se envuelve: recibe la fila como argumento, así que
-- tiene que evaluarse por fila. Es correcto que así sea.
--
-- Las políticas se transcriben del catálogo, no a mano: el cuerpo es exactamente el que
-- tenía cada una, con las llamadas envueltas y nada más.

DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_delete" ON clientes
  FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "clientes_insert" ON clientes;
CREATE POLICY "clientes_insert" ON clientes
  FOR INSERT
  WITH CHECK (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes
  FOR SELECT
  USING (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "clientes_update" ON clientes;
CREATE POLICY "clientes_update" ON clientes
  FOR UPDATE
  USING (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))))
  WITH CHECK (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "cola_envios_admin_select" ON cola_envios;
CREATE POLICY "cola_envios_admin_select" ON cola_envios
  FOR SELECT
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "comision_pagos_write_insert" ON comision_pagos;
CREATE POLICY "comision_pagos_write_insert" ON comision_pagos
  FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "comision_pagos_write_update" ON comision_pagos;
CREATE POLICY "comision_pagos_write_update" ON comision_pagos
  FOR UPDATE
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "comision_pagos_write_delete" ON comision_pagos;
CREATE POLICY "comision_pagos_write_delete" ON comision_pagos
  FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "comision_pagos_write" ON comision_pagos;

DROP POLICY IF EXISTS "comision_pagos_select" ON comision_pagos;
CREATE POLICY "comision_pagos_select" ON comision_pagos
  FOR SELECT
  USING (((SELECT public.is_admin()) OR (usuario_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "comisiones_write_insert" ON comisiones;
CREATE POLICY "comisiones_write_insert" ON comisiones
  FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "comisiones_write_update" ON comisiones;
CREATE POLICY "comisiones_write_update" ON comisiones
  FOR UPDATE
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "comisiones_write_delete" ON comisiones;
CREATE POLICY "comisiones_write_delete" ON comisiones
  FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "comisiones_write" ON comisiones;

DROP POLICY IF EXISTS "comisiones_select" ON comisiones;
CREATE POLICY "comisiones_select" ON comisiones
  FOR SELECT
  USING (((SELECT public.is_admin()) OR (usuario_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "finanzas_importaciones_admin" ON finanzas_importaciones;
CREATE POLICY "finanzas_importaciones_admin" ON finanzas_importaciones
  FOR ALL
  USING (((SELECT public.current_user_role()) = 'admin'::user_role))
  WITH CHECK (((SELECT public.current_user_role()) = 'admin'::user_role));

DROP POLICY IF EXISTS "finanzas_movimientos_admin" ON finanzas_movimientos;
CREATE POLICY "finanzas_movimientos_admin" ON finanzas_movimientos
  FOR ALL
  USING (((SELECT public.current_user_role()) = 'admin'::user_role))
  WITH CHECK (((SELECT public.current_user_role()) = 'admin'::user_role));

DROP POLICY IF EXISTS "finanzas_reglas_admin" ON finanzas_reglas_categorizacion;
CREATE POLICY "finanzas_reglas_admin" ON finanzas_reglas_categorizacion
  FOR ALL
  USING (((SELECT public.current_user_role()) = 'admin'::user_role))
  WITH CHECK (((SELECT public.current_user_role()) = 'admin'::user_role));

DROP POLICY IF EXISTS "notificaciones_delete" ON notificaciones;
CREATE POLICY "notificaciones_delete" ON notificaciones
  FOR DELETE
  USING ((usuario_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "notificaciones_select" ON notificaciones;
CREATE POLICY "notificaciones_select" ON notificaciones
  FOR SELECT
  USING ((usuario_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "notificaciones_update" ON notificaciones;
CREATE POLICY "notificaciones_update" ON notificaciones
  FOR UPDATE
  USING ((usuario_id = (SELECT auth.uid())))
  WITH CHECK ((usuario_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "orden_asignaciones_delete" ON orden_asignaciones;
CREATE POLICY "orden_asignaciones_delete" ON orden_asignaciones
  FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "orden_asignaciones_insert" ON orden_asignaciones;
CREATE POLICY "orden_asignaciones_insert" ON orden_asignaciones
  FOR INSERT
  WITH CHECK (((SELECT public.is_admin()) OR ((usuario_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_asignaciones.orden_id) AND (o.sede_id = (SELECT public.current_user_sede_id()))))))));

DROP POLICY IF EXISTS "orden_asignaciones_select" ON orden_asignaciones;
CREATE POLICY "orden_asignaciones_select" ON orden_asignaciones
  FOR SELECT
  USING (((SELECT public.is_admin()) OR (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_asignaciones.orden_id) AND (o.sede_id = (SELECT public.current_user_sede_id())))))));

DROP POLICY IF EXISTS "orden_asignaciones_update" ON orden_asignaciones;
CREATE POLICY "orden_asignaciones_update" ON orden_asignaciones
  FOR UPDATE
  USING (((SELECT public.is_admin()) OR (usuario_id = (SELECT auth.uid()))))
  WITH CHECK (((SELECT public.is_admin()) OR ((usuario_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_asignaciones.orden_id) AND (o.sede_id = (SELECT public.current_user_sede_id()))))))));

DROP POLICY IF EXISTS "orden_avances_delete" ON orden_avances;
CREATE POLICY "orden_avances_delete" ON orden_avances
  FOR DELETE
  USING (((SELECT public.is_admin()) OR ((usuario_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_avances.orden_id) AND (o.estatus <> 'entregado'::order_status)))))));

DROP POLICY IF EXISTS "orden_avances_insert" ON orden_avances;
CREATE POLICY "orden_avances_insert" ON orden_avances
  FOR INSERT
  WITH CHECK (((SELECT public.is_admin()) OR ((usuario_id = (SELECT auth.uid())) AND is_assigned_to_order(orden_id) AND (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_avances.orden_id) AND (o.sede_id = (SELECT public.current_user_sede_id())) AND (o.estatus <> 'entregado'::order_status)))))));

DROP POLICY IF EXISTS "orden_avances_select" ON orden_avances;
CREATE POLICY "orden_avances_select" ON orden_avances
  FOR SELECT
  USING (((SELECT public.is_admin()) OR (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_avances.orden_id) AND (o.sede_id = (SELECT public.current_user_sede_id())))))));

DROP POLICY IF EXISTS "orden_avances_update" ON orden_avances;
CREATE POLICY "orden_avances_update" ON orden_avances
  FOR UPDATE
  USING (((SELECT public.is_admin()) OR ((usuario_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_avances.orden_id) AND (o.estatus <> 'entregado'::order_status)))))))
  WITH CHECK (((SELECT public.is_admin()) OR (usuario_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "orden_enlaces_admin_select" ON orden_enlaces;
CREATE POLICY "orden_enlaces_admin_select" ON orden_enlaces
  FOR SELECT
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "orden_labor_admin_delete" ON orden_labor;
CREATE POLICY "orden_labor_admin_delete" ON orden_labor
  FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "orden_labor_admin_write" ON orden_labor;
CREATE POLICY "orden_labor_admin_write" ON orden_labor
  FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "orden_labor_select" ON orden_labor;
CREATE POLICY "orden_labor_select" ON orden_labor
  FOR SELECT
  USING (((SELECT public.is_admin()) OR (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_labor.orden_id) AND (o.sede_id = (SELECT public.current_user_sede_id())))))));

DROP POLICY IF EXISTS "orden_labor_admin_update" ON orden_labor;
CREATE POLICY "orden_labor_admin_update" ON orden_labor
  FOR UPDATE
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "orden_media_rows_delete" ON orden_media;
CREATE POLICY "orden_media_rows_delete" ON orden_media
  FOR DELETE
  USING (((SELECT public.is_admin()) OR ((subido_por = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_media.orden_id) AND (o.estatus <> 'entregado'::order_status)))))));

DROP POLICY IF EXISTS "orden_media_rows_insert" ON orden_media;
CREATE POLICY "orden_media_rows_insert" ON orden_media
  FOR INSERT
  WITH CHECK (((SELECT public.is_admin()) OR (EXISTS ( SELECT 1
   FROM (ordenes_trabajo o
     JOIN orden_asignaciones a ON (((a.orden_id = o.id) AND (a.usuario_id = (SELECT auth.uid())))))
  WHERE ((o.id = orden_media.orden_id) AND (o.sede_id = (SELECT public.current_user_sede_id())) AND (o.estatus <> 'entregado'::order_status))))));

DROP POLICY IF EXISTS "orden_media_rows_select" ON orden_media;
CREATE POLICY "orden_media_rows_select" ON orden_media
  FOR SELECT
  USING (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "orden_media_rows_update" ON orden_media;
CREATE POLICY "orden_media_rows_update" ON orden_media
  FOR UPDATE
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "orden_montos_admin" ON orden_montos;
CREATE POLICY "orden_montos_admin" ON orden_montos
  FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "orden_repuestos_admin" ON orden_repuestos;
CREATE POLICY "orden_repuestos_admin" ON orden_repuestos
  FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "ordenes_trabajo_delete" ON ordenes_trabajo;
CREATE POLICY "ordenes_trabajo_delete" ON ordenes_trabajo
  FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "ordenes_trabajo_insert" ON ordenes_trabajo;
CREATE POLICY "ordenes_trabajo_insert" ON ordenes_trabajo
  FOR INSERT
  WITH CHECK (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "ordenes_trabajo_select" ON ordenes_trabajo;
CREATE POLICY "ordenes_trabajo_select" ON ordenes_trabajo
  FOR SELECT
  USING (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "ordenes_trabajo_update" ON ordenes_trabajo;
CREATE POLICY "ordenes_trabajo_update" ON ordenes_trabajo
  FOR UPDATE
  USING (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))))
  WITH CHECK (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "perfiles_delete" ON perfiles;
CREATE POLICY "perfiles_delete" ON perfiles
  FOR DELETE
  USING (((SELECT public.current_user_role()) = 'admin'::user_role));

DROP POLICY IF EXISTS "perfiles_insert" ON perfiles;
CREATE POLICY "perfiles_insert" ON perfiles
  FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "perfiles_select" ON perfiles;
CREATE POLICY "perfiles_select" ON perfiles
  FOR SELECT
  USING (((id = (SELECT auth.uid())) OR ((SELECT public.current_user_role()) = 'admin'::user_role) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "perfiles_update" ON perfiles;
CREATE POLICY "perfiles_update" ON perfiles
  FOR UPDATE
  USING (((id = (SELECT auth.uid())) OR (SELECT public.is_admin())))
  WITH CHECK (((id = (SELECT auth.uid())) OR (SELECT public.is_admin())));

DROP POLICY IF EXISTS "presupuestos_admin_select" ON presupuestos;
CREATE POLICY "presupuestos_admin_select" ON presupuestos
  FOR SELECT
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "push_suscripciones_delete" ON push_suscripciones;
CREATE POLICY "push_suscripciones_delete" ON push_suscripciones
  FOR DELETE
  USING ((usuario_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "push_suscripciones_select" ON push_suscripciones;
CREATE POLICY "push_suscripciones_select" ON push_suscripciones
  FOR SELECT
  USING ((usuario_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "sedes_write_insert" ON sedes;
CREATE POLICY "sedes_write_insert" ON sedes
  FOR INSERT
  WITH CHECK (((SELECT public.current_user_role()) = 'admin'::user_role));

DROP POLICY IF EXISTS "sedes_write_update" ON sedes;
CREATE POLICY "sedes_write_update" ON sedes
  FOR UPDATE
  USING (((SELECT public.current_user_role()) = 'admin'::user_role))
  WITH CHECK (((SELECT public.current_user_role()) = 'admin'::user_role));

DROP POLICY IF EXISTS "sedes_write_delete" ON sedes;
CREATE POLICY "sedes_write_delete" ON sedes
  FOR DELETE
  USING (((SELECT public.current_user_role()) = 'admin'::user_role));

DROP POLICY IF EXISTS "sedes_write" ON sedes;

DROP POLICY IF EXISTS "sedes_select" ON sedes;
CREATE POLICY "sedes_select" ON sedes
  FOR SELECT
  USING (((SELECT public.current_user_role()) IS NOT NULL));

DROP POLICY IF EXISTS "vehiculos_delete" ON vehiculos;
CREATE POLICY "vehiculos_delete" ON vehiculos
  FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "vehiculos_insert" ON vehiculos;
CREATE POLICY "vehiculos_insert" ON vehiculos
  FOR INSERT
  WITH CHECK (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "vehiculos_select" ON vehiculos;
CREATE POLICY "vehiculos_select" ON vehiculos
  FOR SELECT
  USING (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

DROP POLICY IF EXISTS "vehiculos_update" ON vehiculos;
CREATE POLICY "vehiculos_update" ON vehiculos
  FOR UPDATE
  USING (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))))
  WITH CHECK (((SELECT public.is_admin()) OR (sede_id = (SELECT public.current_user_sede_id()))));

-- `cola_envios_admin_select_email` era `canal = 'email' AND is_admin()`, un subconjunto
-- estricto de `cola_envios_admin_select` (`is_admin()`): un admin ya veía todo por la
-- primera. Dos políticas permisivas obligan a Postgres a evaluar las dos y unirlas con OR.
DROP POLICY IF EXISTS "cola_envios_admin_select_email" ON cola_envios;
