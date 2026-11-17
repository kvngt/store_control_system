-- =====================================================================================
-- 20261010000046 - El técnico asignado vuelve a poder terminar su orden
--
-- Qué se pidió: corregir el hallazgo B-01 del recorrido de calidad del 16/11/2026
-- (docs/ordenes/q1-informe-tecnico-y-cliente.md): un técnico no podía terminar una orden.
-- Quién lo pidió: el arquitecto del proyecto, tras verificar el error en la base local.
-- Por qué: la 043 quitó fecha_finalizacion de las columnas que el técnico puede cambiar,
-- pero la app la manda al pasar a «finalizado» (updateWorkOrderStatus), así que la base
-- respondía «Solo un administrador puede cambiar los datos de recepción de una orden.»
-- Roto en producción desde el 15/11/2026.
--
-- Qué cambia: UNA cosa en trg_guard_order_technician (versión vigente: 043, sección 4).
-- En la rama del técnico, antes de comparar las columnas permitidas, la base normaliza
-- fecha_finalizacion: al pasar a «finalizado» queda en NOW(); en cualquier otro caso se
-- conserva la anterior. El técnico no puede fijar una fecha a su gusto (lo que quería la 043),
-- lo que mande se ignora sin error y terminar funciona también con la app ya publicada.
-- Como la columna ya queda decidida por la base, vuelve a la lista de columnas permitidas de la
-- comparación final (si no, la fecha que pone la base se vería como un cambio del técnico).
-- Administración no cambia.
--
-- Orden de publicación: esta migración antes que cualquier cambio de la app (la app no cambia).
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.trg_guard_order_technician()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'porcentaje_avance',
    'total_labor', 'motivo_autorizacion', 'fecha_finalizacion'
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

  -- La fecha de finalización la pone la base, no el técnico (hallazgo B-01 del 16/11/2026): al
  -- terminar la orden queda en NOW(); en cualquier otro caso se conserva la de antes. Un valor que
  -- el técnico mande se ignora sin error.
  IF NEW.estatus = 'finalizado' AND OLD.estatus IS DISTINCT FROM 'finalizado' THEN
    NEW.fecha_finalizacion := NOW();
  ELSE
    NEW.fecha_finalizacion := OLD.fecha_finalizacion;
  END IF;

  IF (to_jsonb(NEW) - v_permitidas) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar los datos de recepción de una orden.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_guard_order_technician() FROM PUBLIC, anon, authenticated;
