-- ====================================================================================
-- RESTORIFY — Auditoría de septiembre 2026: lo que la base todavía dejaba pasar
-- ====================================================================================
-- Revisión completa de funciones, políticas y triggers vigentes (no de las
-- migraciones por separado). Detalle y cómo se probó cada punto en
-- docs/auditoria-2026-09.md.
--
--   1. Funciones internas de dinero ejecutables por cualquiera. Postgres da EXECUTE a
--      PUBLIC al crear una función y Supabase además a anon y authenticated. Nadie
--      las revocó en `reverse_order_delivery_finance`, `sync_order_commissions`,
--      `sync_order_parts_expense` ni `recalculate_order_totals`: con la clave
--      pública y el id de una orden entregada, `POST /rest/v1/rpc/reverse_order_
--      delivery_finance` asentaba la reversión del cobro y del costo de repuestos
--      sin que la orden dejara de estar entregada.
--   2. Un técnico podía insertar una orden directo por la API (sin
--      `create_work_order`) ya "entregada", con avance, total de mano de obra,
--      firma de otra orden, otro autor o un número de orden que adelantaba el
--      contador. Los guardas de la orden solo miraban UPDATE.
--   3. Limpiar la firma y volver a firmar aprobaba todo lo que estuviera en
--      borrador: un trabajo que el admin agregó después de la recepción quedaba
--      autorizado y cobrado sin que el cliente lo viera. Solo la primera firma de la
--      orden autoriza.
--   4. El dueño de un archivo podía borrarlo de Storage en una orden ya entregada
--      (la fila estaba protegida, el archivo no): la galería quedaba rota.
--   5. Montos negativos y cantidades en cero en líneas de la orden: la pantalla los
--      corrige, la base no los rechazaba.
--   6. Un aviso que tumba la función de envío (por tiempo) volvía a la cola cada 5
--      minutos para siempre: nunca llegaba a "error".
--   7. Borrar una orden con comisiones ya pagadas borraba esas comisiones y dejaba
--      el pago (y su egreso) sin el detalle de qué pagaba.
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. Funciones internas: solo las llaman triggers (que corren como su dueño)
-- ------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reverse_order_delivery_finance(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_order_commissions(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_order_parts_expense(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_order_totals(UUID) FROM PUBLIC, anon, authenticated;

-- Estas sí las llama la app, pero nunca sin sesión. Ya validan el rol por dentro;
-- quitarle la llamada a anon es no depender de una sola capa.
REVOKE EXECUTE ON FUNCTION public.delete_sede_cascade(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sede_delete_impact(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pay_commissions(UUID, UUID[], DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_work_order(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;


-- ------------------------------------------------------------------------------------
-- 2. Una orden nueva de un técnico nace como recepción, siempre
-- ------------------------------------------------------------------------------------
-- Se corrige en vez de rechazar, igual que una línea nueva nace en borrador: la app
-- (vía create_work_order) ya manda estos valores, así que solo cambia algo para quien
-- escribe directo a la API. El nombre ordena este trigger antes de trg_numero_orden,
-- que genera el número que aquí se vacía.
CREATE OR REPLACE FUNCTION public.trg_guard_order_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  NEW.numero_orden       := NULL;
  NEW.estatus            := 'recepcion';
  NEW.porcentaje_avance  := 0;
  NEW.total_labor        := 0;
  NEW.fecha_finalizacion := NULL;
  NEW.firma_ruta         := NULL;
  NEW.firma_fecha        := NULL;
  NEW.fecha_ingreso      := NOW();
  NEW.creado_en          := NOW();
  NEW.creado_por         := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_guard_order_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_order_insert ON ordenes_trabajo;
CREATE TRIGGER trg_guard_order_insert
  BEFORE INSERT ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_order_insert();


-- ------------------------------------------------------------------------------------
-- 3. Solo la primera firma de la orden autoriza lo cotizado
-- ------------------------------------------------------------------------------------
-- "Primera" se sabe por dos lados, porque cada uno falla en un caso:
--   - ya hubo un presupuesto "firma de recepción" (la primera firma encontró algo
--     que aprobar);
--   - ya hay otro archivo de firma en la carpeta de la orden (la primera firma no
--     encontró nada, y limpiar la firma no borra su archivo).
-- Si la duda es al revés (un archivo de un intento fallido), la firma no aprueba y
-- el admin registra la autorización: se equivoca hacia no cobrar.
CREATE OR REPLACE FUNCTION public.trg_quote_on_signature()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p      presupuestos;
  v_nombre TEXT;
BEGIN
  IF NEW.firma_ruta IS NULL OR OLD.firma_ruta IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM presupuestos WHERE orden_id = NEW.id AND estado = 'enviado') THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM presupuestos WHERE orden_id = NEW.id AND respondido_via = 'firma_recepcion') THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'orden_media'
      AND name LIKE NEW.sede_id::text || '/' || NEW.id::text || '/firma-%'
      AND name <> NEW.firma_ruta
  ) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = NEW.id AND estado = 'borrador')
     AND NOT EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = NEW.id AND estado = 'borrador') THEN
    RETURN NULL;
  END IF;

  SELECT nombre INTO v_nombre FROM clientes WHERE id = NEW.cliente_id;
  v_p := public._crear_presupuesto(NEW.id);
  PERFORM public._resolver_presupuesto(
    v_p.id, public._lineas_pendientes(v_p.id), 'firma_recepcion',
    v_nombre, auth.uid(), NULL, 'Aprobado con la firma de recepción.', NULL, NULL
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_quote_on_signature() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- 4. Archivos de una orden entregada: solo un admin los borra
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "orden_media_delete" ON storage.objects;
CREATE POLICY "orden_media_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'orden_media'
  AND (
    public.is_admin()
    OR (
      owner = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.ordenes_trabajo o
        WHERE o.id::text = (storage.foldername(name))[2]
          AND o.estatus = 'entregado'
      )
    )
  )
);


-- ------------------------------------------------------------------------------------
-- 5. Montos de las líneas
-- ------------------------------------------------------------------------------------
-- NOT VALID: se exige en lo nuevo y lo editado sin bloquear la migración por datos
-- viejos de otro entorno.
ALTER TABLE orden_labor DROP CONSTRAINT IF EXISTS orden_labor_costo_no_negativo;
ALTER TABLE orden_labor ADD CONSTRAINT orden_labor_costo_no_negativo
  CHECK (costo >= 0) NOT VALID;

ALTER TABLE orden_repuestos DROP CONSTRAINT IF EXISTS orden_repuestos_cantidad_positiva;
ALTER TABLE orden_repuestos ADD CONSTRAINT orden_repuestos_cantidad_positiva
  CHECK (cantidad >= 1) NOT VALID;

ALTER TABLE orden_repuestos DROP CONSTRAINT IF EXISTS orden_repuestos_precio_no_negativo;
ALTER TABLE orden_repuestos ADD CONSTRAINT orden_repuestos_precio_no_negativo
  CHECK (precio_venta_unitario >= 0) NOT VALID;


-- ------------------------------------------------------------------------------------
-- 6. Un aviso que tumba la función no se reintenta para siempre
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_outbox(p_limit INTEGER DEFAULT 25)
RETURNS SETOF cola_envios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Una invocación que murió a mitad (timeout, despliegue) deja filas tomadas;
  -- después de 5 minutos vuelven a estar disponibles. Al quinto intento que muere
  -- así, la fila queda en error: algo en ella rompe la función y reintentar no lo
  -- arregla.
  UPDATE cola_envios
  SET estado = CASE WHEN intentos >= 5 THEN 'error' ELSE 'pendiente' END,
      ultimo_error = CASE
        WHEN intentos >= 5 THEN left(COALESCE(ultimo_error || ' · ', '') || 'El envío se interrumpió 5 veces.', 1000)
        ELSE ultimo_error
      END,
      bloqueado_en = NULL
  WHERE estado = 'procesando' AND bloqueado_en < NOW() - INTERVAL '5 minutes';

  RETURN QUERY
  UPDATE cola_envios c
  SET estado = 'procesando', intentos = c.intentos + 1, bloqueado_en = NOW()
  WHERE c.id IN (
    SELECT id FROM cola_envios
    WHERE estado = 'pendiente' AND enviar_despues_de <= NOW()
    ORDER BY enviar_despues_de, creado_en
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_outbox(INTEGER) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- 7. No se borra una orden cuyas comisiones ya se pagaron
-- ------------------------------------------------------------------------------------
-- Borrar la sede entera sigue funcionando: delete_sede_cascade borra antes los pagos
-- y las comisiones de la sede.
CREATE OR REPLACE FUNCTION public.trg_guard_order_delete_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM comisiones WHERE orden_id = OLD.id AND pago_id IS NOT NULL) THEN
    RAISE EXCEPTION 'La orden % tiene comisiones que ya se pagaron. Deshaz ese pago en Comisiones antes de borrarla.', OLD.numero_orden
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_guard_order_delete_paid() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_delete_paid_guard ON ordenes_trabajo;
CREATE TRIGGER trg_order_delete_paid_guard
  BEFORE DELETE ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_order_delete_paid();
