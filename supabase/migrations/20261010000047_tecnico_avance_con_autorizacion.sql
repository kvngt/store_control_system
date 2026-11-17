-- =====================================================================================
-- 20261010000047 - El técnico no mueve el avance sin nada autorizado
--
-- Qué se pidió: resolver el hallazgo B-02 de la Tanda 1 de Q2: un técnico podía mover
-- `porcentaje_avance` en una orden donde el cliente todavía no había autorizado ningún
-- trabajo, aunque no pudiera pasarla a «en_proceso» ni a «finalizado».
-- Quién lo pidió: el arquitecto del proyecto (plan de Q2).
-- Por qué: cuando el cliente no autoriza nada, el técnico no debe reportar avance de obra
-- sobre trabajo sin autorización. Administración conserva el control completo (garantías,
-- cortesías o ajustes internos) igual que para los estados de la orden.
--
-- Qué cambia: UNA cosa en `trg_guard_order_technician` (versión vigente: 046).
-- En la rama del técnico (después de comprobar que no está entregada y que está asignado),
-- la guarda que ya exige al menos una línea `aprobado` en `orden_labor` u `orden_repuestos`
-- para pasar a `en_proceso` o `finalizado` ahora exige lo mismo cuando
-- `NEW.porcentaje_avance IS DISTINCT FROM OLD.porcentaje_avance`, usando la misma razón en
-- español. El trigger de tareas (`trg_avance_por_tareas` / `marcar_labor_completada`) solo
-- recalcula desde líneas `aprobado`, así que no choca con esta guarda.
-- Administración y la ruta de servicio (`auth.role() IS DISTINCT FROM 'authenticated'`) no
-- cambian.
--
-- Orden de publicación: esta migración antes que la app (`OrderHeader` / `permissions.ts`
-- apagan el deslizador en pantalla).
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

  -- Decisión del dueño (04/11/2026) y B-02 (Q2): el técnico no empieza, mueve el avance ni
  -- termina una orden hasta que el cliente autorice algo (mano de obra o repuesto aprobado).
  -- Administración sí puede mover una orden sin nada autorizado (garantía, cortesía).
  IF (
       (NEW.estatus IS DISTINCT FROM OLD.estatus AND NEW.estatus IN ('en_proceso', 'finalizado'))
       OR NEW.porcentaje_avance IS DISTINCT FROM OLD.porcentaje_avance
     )
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
