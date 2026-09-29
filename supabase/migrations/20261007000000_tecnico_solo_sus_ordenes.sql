-- ------------------------------------------------------------------------------------
-- Un técnico ve solo las órdenes que tiene asignadas
-- ------------------------------------------------------------------------------------
-- Acordado en la reunión con el taller (septiembre 2026): un mecánico o pintor entraba a
-- cualquier orden de su sede, con el cliente, el teléfono, el vehículo y las fotos, y además
-- creaba y editaba clientes y vehículos. El taller quiere que cada técnico vea su trabajo y
-- nada más.
--
-- Hasta hoy "ver" era por sede y "modificar" por asignación (`trg_guard_order_technician`).
-- Esta migración lleva también la lectura a la asignación:
--
--   * `ordenes_trabajo` y sus hijas (`orden_labor`, `orden_avances`, `orden_media`,
--     `orden_asignaciones`): un técnico lee solo las filas de sus órdenes. Un admin, todo.
--   * Storage, bucket `orden_media`: lo mismo por la carpeta `<sede>/<orden>/`. Sin esto las
--     fotos de una orden ajena se seguirían pudiendo pedir por su ruta.
--   * `clientes` y `vehiculos`: el técnico lee solo los que cuelgan de una orden suya (la orden
--     tiene que poder mostrar su cliente y su vehículo) y ya no crea ni edita ninguno. Alta y
--     edición quedan en administración, como abrir la orden (`20261004000000`).
--   * `repuestos_de_orden` y `ordenes_esperando_autorizacion`, que son SECURITY DEFINER y no
--     pasan por la RLS: la misma regla por dentro.
--   * `resumen_panel` es SECURITY INVOKER: sigue la RLS sola y el panel del técnico cuenta sus
--     órdenes.
--
-- Una sola definición de "mis órdenes": `mis_ordenes_asignadas()`, SECURITY DEFINER para leer
-- `orden_asignaciones` sin pasar por su propia RLS (que ahora depende de esta función: sin eso
-- las políticas se llamarían entre sí). Devuelve un arreglo y las políticas la envuelven en
-- `(SELECT …)::uuid[]`: el `SELECT` hace que Postgres la calcule una vez por consulta y no una
-- vez por fila, y el cast es necesario porque `= ANY ((SELECT …))` a secas se lee como
-- `ANY (subconsulta)` y compara uuid con uuid[].
--
-- La sede se sigue exigiendo: si un técnico cambia de sede, las órdenes de la anterior dejan
-- de ser suyas para leer, igual que ya lo eran para escribir.
--
-- Lo que un técnico NO asignado ve ahora de una orden de su sede: nada. Antes la veía en
-- solo lectura. Un UPDATE sobre ella ya no llega al guardia (que lanzaba 42501): la RLS la
-- esconde y la actualización afecta cero filas. El frontend ya lo trata como error con
-- `assertAffected`.
--
-- Base y `dist` van juntos: con la base nueva y el sitio viejo, el técnico vería vacías las
-- secciones "Otras órdenes", Clientes y Vehículos, y un error al guardar un cliente.
-- ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mis_ordenes_asignadas()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT a.orden_id), '{}'::uuid[])
  FROM orden_asignaciones a
  JOIN ordenes_trabajo o ON o.id = a.orden_id
  WHERE a.usuario_id = auth.uid()
    AND o.sede_id = public.current_user_sede_id();
$$;

-- La usan las políticas, así que `authenticated` la ejecuta. Llamada como RPC solo devuelve
-- las órdenes propias, que el técnico ya ve en `orden_asignaciones`.
REVOKE ALL ON FUNCTION public.mis_ordenes_asignadas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mis_ordenes_asignadas() TO authenticated;


-- ----- ordenes_trabajo ---------------------------------------------------------------
DROP POLICY IF EXISTS ordenes_trabajo_select ON ordenes_trabajo;
CREATE POLICY ordenes_trabajo_select ON ordenes_trabajo
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));

-- El guardia del técnico sigue decidiendo qué columnas cambia; esto decide sobre qué filas.
DROP POLICY IF EXISTS ordenes_trabajo_update ON ordenes_trabajo;
CREATE POLICY ordenes_trabajo_update ON ordenes_trabajo
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()) OR id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]))
  WITH CHECK ((SELECT public.is_admin()) OR id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));


-- ----- hijas de la orden -------------------------------------------------------------
-- Las compañeras de equipo de una orden propia sí se ven: la tarjeta de técnicos y la
-- comisión estimada (mano de obra ÷ asignados) las necesitan.
DROP POLICY IF EXISTS orden_asignaciones_select ON orden_asignaciones;
CREATE POLICY orden_asignaciones_select ON orden_asignaciones
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));

DROP POLICY IF EXISTS orden_labor_select ON orden_labor;
CREATE POLICY orden_labor_select ON orden_labor
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));

DROP POLICY IF EXISTS orden_avances_select ON orden_avances;
CREATE POLICY orden_avances_select ON orden_avances
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));

DROP POLICY IF EXISTS orden_media_rows_select ON orden_media;
CREATE POLICY orden_media_rows_select ON orden_media
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));


-- ----- archivos de la orden (Storage) ------------------------------------------------
-- La ruta es `<sede>/<orden>/<archivo>`: fotos, videos, miniaturas y la firma. Se compara
-- como texto para que un nombre raro no rompa la consulta con un cast a uuid.
DROP POLICY IF EXISTS "orden_media_select" ON storage.objects;
CREATE POLICY "orden_media_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'orden_media'
    AND (
      (SELECT public.is_admin())
      OR (
        (storage.foldername(name))[1] = (SELECT public.current_user_sede_id())::text
        AND (storage.foldername(name))[2] = ANY ((SELECT public.mis_ordenes_asignadas())::text[])
      )
    )
  );


-- ----- clientes y vehículos ----------------------------------------------------------
DROP POLICY IF EXISTS clientes_select ON clientes;
CREATE POLICY clientes_select ON clientes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.cliente_id = clientes.id
        AND o.id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[])
    )
  );

DROP POLICY IF EXISTS clientes_insert ON clientes;
CREATE POLICY clientes_insert ON clientes
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS clientes_update ON clientes;
CREATE POLICY clientes_update ON clientes
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS vehiculos_select ON vehiculos;
CREATE POLICY vehiculos_select ON vehiculos
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.vehiculo_id = vehiculos.id
        AND o.id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[])
    )
  );

DROP POLICY IF EXISTS vehiculos_insert ON vehiculos;
CREATE POLICY vehiculos_insert ON vehiculos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS vehiculos_update ON vehiculos;
CREATE POLICY vehiculos_update ON vehiculos
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));


-- ----- funciones que no pasan por la RLS ---------------------------------------------
-- Las piezas de una orden, sin precio, para el técnico. Antes bastaba con que la orden fuera
-- de su sede.
CREATE OR REPLACE FUNCTION public.repuestos_de_orden(p_orden_id UUID)
RETURNS TABLE(id UUID, descripcion TEXT, cantidad INTEGER, estado TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.descripcion, r.cantidad, r.estado
  FROM orden_repuestos r
  WHERE r.orden_id = p_orden_id
    AND (public.is_admin() OR r.orden_id = ANY (public.mis_ordenes_asignadas()))
  ORDER BY r.creado_en, r.descripcion;
$$;

REVOKE ALL ON FUNCTION public.repuestos_de_orden(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_de_orden(UUID) TO authenticated;

-- Qué órdenes tienen un presupuesto esperando al cliente (el aviso de la lista y el tablero).
CREATE OR REPLACE FUNCTION public.ordenes_esperando_autorizacion()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.orden_id
  FROM presupuestos p
  WHERE p.estado = 'enviado'
    AND (public.is_admin() OR p.orden_id = ANY (public.mis_ordenes_asignadas()));
$$;

REVOKE ALL ON FUNCTION public.ordenes_esperando_autorizacion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ordenes_esperando_autorizacion() TO authenticated;
