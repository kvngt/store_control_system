-- ====================================================================================
-- RESTORIFY — Lo que la pantalla le prohíbe al técnico, ahora lo prohíbe la base
-- ====================================================================================
-- La interfaz ya aplica una regla simple: una orden la modifica un admin, o un
-- técnico ASIGNADO mientras la orden NO esté entregada (`canEdit` en
-- useWorkOrderDetail.ts). La base no la aplicaba completa, así que con su propia
-- sesión y la API cualquier técnico de la sede podía:
--
--   1. Cambiar estado, avance y firma de una orden en la que no está asignado.
--   2. SACAR UNA ORDEN DE "ENTREGADO". Solo se impedía marcarla, no quitarla, y
--      quitarla dispara la reversión: se deshace el cobro en Finanzas y se borran
--      las comisiones pendientes. Era un hueco de dinero, no solo de seguimiento.
--   3. Cambiar datos que la app nunca edita después del alta: cliente, vehículo,
--      millas, fecha de ingreso, creador…
--   4. Agregar avances a órdenes donde no está asignado o que ya se entregaron, y
--      borrar sus avances de una orden entregada (con eso se iban en cascada sus
--      archivos, saltándose la regla de multimedia).
--   5. Mover su propia asignación o su avance a otra orden con un UPDATE. Mover la
--      asignación de una orden entregada a otra re-repartía la bolsa de comisión de
--      la entregada, y salirse de una orden es decisión de administración.
--   6. Subir archivos al bucket `orden_media` de órdenes donde no está asignado
--      (quedaban huérfanos: la fila ya exigía asignación).
--
-- Y dos buckets del modelo anterior, que la app ya no usa, seguían abiertos:
--   - `vehiculos_fotos` era PÚBLICO: cualquiera con la URL veía las fotos, y
--     cualquier sesión podía subir.
--   - `firmas` tenía una política de lectura sin condición de rol: con la clave
--     anónima, sin iniciar sesión, se podían listar y descargar las firmas.
--
-- Qué NO cambia para nadie que use la app: el admin sigue pudiendo todo; el
-- técnico asignado sigue moviendo estado (excepto a/desde Entregado), avance y
-- firma, agregando y borrando sus avances y subiendo archivos. Unirse a una orden
-- sigue siendo un INSERT en orden_asignaciones, que no pasa por estas reglas.
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. ¿Está la persona asignada a la orden?
-- ------------------------------------------------------------------------------------
-- SECURITY DEFINER a propósito: las políticas de ordenes_trabajo no pueden leer
-- orden_asignaciones con los permisos del usuario, porque la política de
-- orden_asignaciones a su vez lee ordenes_trabajo — Postgres lo rechaza como
-- recursión infinita.
CREATE OR REPLACE FUNCTION public.is_assigned_to_order(p_orden_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM orden_asignaciones
    WHERE orden_id = p_orden_id AND usuario_id = auth.uid()
  );
$$;

-- La usan las políticas, que corren con el rol de quien consulta. Solo responde
-- por uno mismo (auth.uid()), así que exponerla no filtra nada.
REVOKE ALL ON FUNCTION public.is_assigned_to_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_order(UUID) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 2. La orden: quién la modifica y qué columnas
-- ------------------------------------------------------------------------------------
-- En un trigger y no en la política de UPDATE: una política que no deja pasar
-- la fila convierte el UPDATE en "0 filas, sin error", y el técnico vería que se
-- guardó algo que no se guardó. El trigger responde con un 42501 y un motivo.
CREATE OR REPLACE FUNCTION public.trg_guard_order_technician()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Lo único que un técnico cambia desde la app: estado (con su fecha de
  -- finalización), porcentaje de avance y firma. total_labor lo vigila
  -- trg_guard_order_money, que deja pasar el recálculo del sistema.
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'fecha_finalizacion', 'porcentaje_avance',
    'firma_ruta', 'firma_fecha', 'total_labor'
  ];
BEGIN
  -- La firma es un archivo de la carpeta de ESTA orden en el bucket privado. Vale
  -- para todos, admin incluido: apuntar a otra ruta mostraría en el reporte una
  -- firma que no es la de esta orden.
  IF NEW.firma_ruta IS DISTINCT FROM OLD.firma_ruta
     AND NEW.firma_ruta IS NOT NULL
     AND NEW.firma_ruta NOT LIKE NEW.sede_id::text || '/' || NEW.id::text || '/%' THEN
    RAISE EXCEPTION 'La firma debe guardarse en la carpeta de esta orden.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF OLD.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_assigned_to_order(OLD.id) THEN
    RAISE EXCEPTION 'Solo el personal asignado puede modificar esta orden. Únete a la orden primero.'
      USING ERRCODE = '42501';
  END IF;

  -- Comparar la fila completa menos lo permitido, en vez de listar lo prohibido:
  -- una columna que se agregue mañana queda protegida sin acordarse de este trigger.
  IF (to_jsonb(NEW) - v_permitidas) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar los datos de recepción de una orden.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_guard_order_technician() FROM PUBLIC, anon, authenticated;

-- BEFORE UPDATE, igual que trg_order_money_guard (que sigue impidiendo marcar
-- Entregado y tocar sede, número y totales). Si cualquiera de los dos rechaza, no
-- corre ningún trigger AFTER: ni reversión, ni comisiones, ni avisos.
DROP TRIGGER IF EXISTS trg_order_technician_guard ON ordenes_trabajo;
CREATE TRIGGER trg_order_technician_guard
  BEFORE UPDATE ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_order_technician();


-- ------------------------------------------------------------------------------------
-- 3. Avances
-- ------------------------------------------------------------------------------------
-- Escribir en la bitácora es trabajar la orden: asignado y sin entregar.
DROP POLICY IF EXISTS "orden_avances_insert" ON orden_avances;
CREATE POLICY "orden_avances_insert" ON orden_avances FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      usuario_id = auth.uid()
      AND public.is_assigned_to_order(orden_id)
      AND EXISTS (
        SELECT 1 FROM ordenes_trabajo o
        WHERE o.id = orden_avances.orden_id
          AND o.sede_id = public.current_user_sede_id()
          AND o.estatus <> 'entregado'
      )
    )
  );

-- Editar o borrar lo propio, mientras la orden no esté entregada. Borrar un avance
-- se lleva en cascada sus archivos, así que tiene que respetar la misma regla que
-- borrar un archivo (orden_media_rows_delete).
DROP POLICY IF EXISTS "orden_avances_update" ON orden_avances;
CREATE POLICY "orden_avances_update" ON orden_avances FOR UPDATE
  USING (
    public.is_admin()
    OR (
      usuario_id = auth.uid()
      AND EXISTS (SELECT 1 FROM ordenes_trabajo o WHERE o.id = orden_avances.orden_id AND o.estatus <> 'entregado')
    )
  )
  WITH CHECK (public.is_admin() OR usuario_id = auth.uid());

DROP POLICY IF EXISTS "orden_avances_delete" ON orden_avances;
CREATE POLICY "orden_avances_delete" ON orden_avances FOR DELETE
  USING (
    public.is_admin()
    OR (
      usuario_id = auth.uid()
      AND EXISTS (SELECT 1 FROM ordenes_trabajo o WHERE o.id = orden_avances.orden_id AND o.estatus <> 'entregado')
    )
  );


-- ------------------------------------------------------------------------------------
-- 4. Ni un avance ni una asignación cambian de orden o de persona
-- ------------------------------------------------------------------------------------
-- Ningún flujo de la app lo hace, y permitirlo rompe cosas: un avance movido deja
-- sus archivos apuntando a la orden anterior; una asignación movida desde una
-- orden entregada re-reparte su bolsa de comisión saltándose la regla de
-- "solo admin" para quitar a alguien. Para todos, admin incluido: la forma
-- correcta es borrar y crear, que pasa por sus propias reglas y sus avisos.
CREATE OR REPLACE FUNCTION public.trg_guard_row_owner_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.orden_id IS DISTINCT FROM OLD.orden_id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
    RAISE EXCEPTION 'No se puede mover a otra orden ni a otra persona. Elimínalo y créalo de nuevo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_guard_row_owner_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_avance_owner_immutable ON orden_avances;
CREATE TRIGGER trg_avance_owner_immutable
  BEFORE UPDATE ON orden_avances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_row_owner_immutable();

DROP TRIGGER IF EXISTS trg_assignment_owner_immutable ON orden_asignaciones;
CREATE TRIGGER trg_assignment_owner_immutable
  BEFORE UPDATE ON orden_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_row_owner_immutable();


-- ------------------------------------------------------------------------------------
-- 5. Archivos de la orden: subir exige la misma asignación que la fila
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "orden_media_insert" ON storage.objects;
CREATE POLICY "orden_media_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'orden_media'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM ordenes_trabajo o
    WHERE o.id::text = (storage.foldername(name))[2]
      AND o.sede_id::text = (storage.foldername(name))[1]
      AND (
        public.is_admin()
        OR (
          o.sede_id = public.current_user_sede_id()
          AND o.estatus <> 'entregado'
          AND public.is_assigned_to_order(o.id)
        )
      )
  )
);


-- ------------------------------------------------------------------------------------
-- 6. Cerrar los buckets del modelo anterior
-- ------------------------------------------------------------------------------------
-- La app ya no lee ni escribe en ellos (la multimedia y las firmas viven en
-- `orden_media`, privado). Se dejan legibles solo para admin por si hace falta
-- recuperar algo, y nadie puede subir.
UPDATE storage.buckets SET public = false WHERE id = 'vehiculos_fotos';

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "vehiculos_fotos_admin_select" ON storage.objects;
CREATE POLICY "vehiculos_fotos_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehiculos_fotos' AND public.is_admin());

DROP POLICY IF EXISTS "firmas_public_select" ON storage.objects;
DROP POLICY IF EXISTS "firmas_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "firmas_admin_select" ON storage.objects;
CREATE POLICY "firmas_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'firmas' AND public.is_admin());
