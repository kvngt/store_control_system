-- ====================================================================================
-- Decisiones del dueño del 04/11/2026 (docs/bitacora.md). Cada función se reescribe ENTERA
-- desde su versión vigente (npm run db:donde -- <nombre>) y conserva su REVOKE/GRANT.
--
-- 1. trg_guard_order_technician (vigente: 20261010000024): el técnico no pasa una orden a
--    en_proceso ni a finalizado si no hay ninguna línea (mano de obra o repuesto) aprobada.
--    Administración sí puede.
-- 2. trg_guard_order_delete_entregada (nueva): una orden entregada (también la retirada sin
--    reparar) no se borra por la API; se archiva. Lleva el cobro, el costo de repuestos y las
--    comisiones: borrarla borraba ese dinero de Finanzas. Sin sesión (scripts de mantenimiento,
--    service_role) no se frena, y borrar la sede entera tampoco.
-- 3. delete_sede_cascade (vigente: 20260913000000): marca su transacción para que (2) la deje
--    borrar las órdenes de la sede, como antes.
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. El técnico no empieza ni termina sin nada autorizado. Desde 20261010000024.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_guard_order_technician()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'fecha_finalizacion', 'porcentaje_avance',
    'total_labor', 'motivo_autorizacion'
  ];
  v_estados_tecnico CONSTANT order_status[] := ARRAY[
    'en_proceso', 'espera_autorizacion', 'finalizado'
  ]::order_status[];
BEGIN
  -- Normalización
  NEW.motivo_autorizacion := NULLIF(btrim(left(COALESCE(NEW.motivo_autorizacion, ''), 1000)), '');
  IF NEW.estatus IS DISTINCT FROM 'espera_autorizacion' THEN
    NEW.motivo_autorizacion := NULL;
  END IF;

  -- La firma es un archivo de la carpeta de ESTA orden en el bucket privado.
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
    RAISE EXCEPTION 'Solo el personal asignado puede modificar esta orden. Pide a administración que te asigne.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.estatus = 'finalizado' AND NEW.estatus IS DISTINCT FROM OLD.estatus THEN
    RAISE EXCEPTION 'La orden ya está finalizada. Solo un administrador puede reabrirla.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.estatus IS DISTINCT FROM OLD.estatus
     AND NOT (NEW.estatus = ANY (v_estados_tecnico)) THEN
    IF NEW.estatus = 'recepcion' THEN
      RAISE EXCEPTION 'Solo un administrador puede devolver una orden a Recepción.'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Solo un administrador puede poner la orden en ese estado.'
      USING ERRCODE = '42501';
  END IF;

  -- Decisión del dueño (04/11/2026): el técnico no empieza ni termina una orden hasta que el
  -- cliente autorice algo. Antes podía, y se terminaban órdenes que al entregarse cobraban $0
  -- (ORD-2026-005 y ORD-2026-010). La primera autorización la pasa sola a en_proceso
  -- (trg_quote_starts_order); administración sí puede mover una orden sin nada autorizado
  -- (garantía, cortesía), y para eso está el grupo sin_autorizar de requiere_atencion.
  IF NEW.estatus IS DISTINCT FROM OLD.estatus
     AND NEW.estatus IN ('en_proceso', 'finalizado')
     AND NOT EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = NEW.id AND estado = 'aprobado')
     AND NOT EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = NEW.id AND estado = 'aprobado') THEN
    RAISE EXCEPTION 'El cliente todavía no autoriza ningún trabajo de esta orden. No se puede empezar ni terminar hasta que administración registre la autorización.'
      USING ERRCODE = '42501';
  END IF;

  -- REGLAS NUEVAS DE ESPERA DE AUTORIZACIÓN (F6)
  IF NEW.estatus = 'espera_autorizacion' AND OLD.estatus IS DISTINCT FROM 'espera_autorizacion' THEN
    IF NOT EXISTS (SELECT 1 FROM orden_hallazgos WHERE orden_id = NEW.id AND estado = 'pendiente') THEN
      RAISE EXCEPTION 'Solo puedes pedir autorización reportando trabajo adicional.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.estatus = 'espera_autorizacion' AND NEW.estatus IS DISTINCT FROM 'espera_autorizacion' THEN
    IF EXISTS (
      SELECT 1 FROM orden_hallazgos WHERE orden_id = NEW.id AND (estado = 'pendiente' OR (estado = 'cotizado' AND presupuesto_id IS NULL))
    ) OR EXISTS (
      SELECT 1 FROM presupuestos WHERE orden_id = NEW.id AND estado = 'enviado'
    ) THEN
      RAISE EXCEPTION 'La orden no puede salir de espera de autorización mientras haya hallazgos pendientes o presupuestos enviados.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.estatus = 'espera_autorizacion' AND NEW.motivo_autorizacion IS NULL THEN
    RAISE EXCEPTION 'Escribe por qué la orden necesita autorización.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.firma_ruta IS DISTINCT FROM OLD.firma_ruta
     OR NEW.firma_fecha IS DISTINCT FROM OLD.firma_fecha THEN
    RAISE EXCEPTION 'La firma del cliente la toma administración en la recepción.'
      USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - v_permitidas) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar los datos de recepción de una orden.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_guard_order_technician() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 2. Una orden entregada no se borra: se archiva. Nueva.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_guard_order_delete_entregada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.estatus = 'entregado'
     AND auth.uid() IS NOT NULL
     AND COALESCE(current_setting('restorify.borrar_sede', true), '') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Una orden entregada no se borra: lleva el cobro, el costo de los repuestos y las comisiones. Archívala para sacarla de la lista.'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_guard_order_delete_entregada() FROM PUBLIC, anon, authenticated;

-- El nombre empieza con "trg_a" para correr antes que los demás BEFORE DELETE de la tabla (van en
-- orden alfabético): el motivo que ve administración es este, no el de las comisiones pagadas.
DROP TRIGGER IF EXISTS trg_a_orden_entregada_no_se_borra ON public.ordenes_trabajo;
CREATE TRIGGER trg_a_orden_entregada_no_se_borra
  BEFORE DELETE ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_order_delete_entregada();

-- ------------------------------------------------------------------------------------
-- 3. Borrar una sede sigue borrando sus órdenes, entregadas incluidas. Desde 20260913000000.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_sede_cascade(p_sede_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallback_sede UUID;
  v_impact        JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar una sede.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sedes WHERE id = p_sede_id) THEN
    RAISE EXCEPTION 'La sede ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  -- Where the staff of this sede end up. Preferring the caller's own sede keeps
  -- them somewhere the admin is already looking.
  SELECT id INTO v_fallback_sede
  FROM sedes
  WHERE id <> p_sede_id
  ORDER BY (id = (SELECT sede_id FROM perfiles WHERE id = auth.uid())) DESC, nombre
  LIMIT 1;

  IF v_fallback_sede IS NULL AND EXISTS (SELECT 1 FROM perfiles WHERE sede_id = p_sede_id) THEN
    RAISE EXCEPTION 'No puedes eliminar la última sede: los empleados quedarían sin taller. Crea otra sede primero.'
      USING ERRCODE = 'P0001';
  END IF;

  v_impact := public.sede_delete_impact(p_sede_id);

  -- Order matters: children before parents, and finance rows before the orders
  -- they point at so `referencia_orden_id` is never left dangling.
  DELETE FROM finanzas_movimientos WHERE sede_id = p_sede_id;

  DELETE FROM finanzas_movimientos
  WHERE referencia_orden_id IN (SELECT id FROM ordenes_trabajo WHERE sede_id = p_sede_id);

  -- comisiones / comision_pagos cascade from sedes and from ordenes_trabajo,
  -- but the payment rows reference perfiles with RESTRICT, so they go first.
  DELETE FROM comision_pagos WHERE sede_id = p_sede_id;
  DELETE FROM comisiones WHERE sede_id = p_sede_id;

  -- orden_labor / orden_repuestos / orden_asignaciones / orden_avances all
  -- cascade from ordenes_trabajo.
  -- Borrar la sede entera es lo único que borra órdenes entregadas
  -- (trg_guard_order_delete_entregada, 20261010000041): la bandera vive solo en esta transacción.
  PERFORM set_config('restorify.borrar_sede', 'on', true);
  DELETE FROM ordenes_trabajo WHERE sede_id = p_sede_id;
  PERFORM set_config('restorify.borrar_sede', 'off', true);

  -- vehiculos cascade from clientes.
  DELETE FROM clientes WHERE sede_id = p_sede_id;

  DELETE FROM finanzas_importaciones WHERE sede_id = p_sede_id;

  UPDATE perfiles SET sede_id = v_fallback_sede WHERE sede_id = p_sede_id;

  DELETE FROM sedes WHERE id = p_sede_id;

  RETURN v_impact || jsonb_build_object('empleados_reasignados', v_impact->'empleados');
END;
$$;
REVOKE ALL ON FUNCTION public.delete_sede_cascade(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_sede_cascade(UUID) TO authenticated;
