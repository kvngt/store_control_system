-- =====================================================================================
-- Correcciones de auditoría de base de datos y correos (11/2026)
-- =====================================================================================
-- Qué se encontró y qué cambia:
-- 1.  Totales sin candado y orden de candados (regla del proyecto desde ahora: toda función
--     que escribe dinero de una orden toma primero el candado de la fila de
--     `ordenes_trabajo` con `FOR UPDATE`):
--     - `recalculate_order_totals` toma `PERFORM 1 FROM ordenes_trabajo WHERE id =
--       target_order_id FOR UPDATE;` antes de leer líneas, descuento y parqueo.
--       Reescrita entera desde _esquema-vigente.sql:6914-6958 (mismos permisos: service_role).
--     - `aplicar_descuento` toma `PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR
--       UPDATE;` antes de bloquear `orden_montos`.
--       Reescrita entera desde _esquema-vigente.sql:2720-2777 (mismos permisos: authenticated, service_role).
--     - `_recalcular_parqueo` toma `FOR UPDATE` en su lectura inicial de `ordenes_trabajo`.
--       Reescrita entera desde _esquema-vigente.sql:2044-2101 (mismos permisos: service_role).
--     - `ajustar_parqueo_orden` toma `PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id
--       FOR UPDATE;` al inicio (tras `is_admin()`), antes de leer o escribir `orden_parqueo`.
--       Reescrita entera desde _esquema-vigente.sql:2633-2718 (mismos permisos: authenticated, service_role).
-- 2.  Correo del perfil: `trg_guard_perfil_privilegios` rechaza (42501) que quien no es
--     admin cambie `email` desde la API autenticada; la ruta de servicio (`auth.role() <>
--     'authenticated'`, usada por update-employee) sigue pudiendo.
--     Reescrita entera desde _esquema-vigente.sql:9373-9410 (mismos permisos: service_role).
-- 3.  Fotos de inspección publicada: la política `orden_media_delete` en `storage.objects`
--     impide a quien no es admin borrar archivos (`ruta` o `ruta_miniatura`) ligados a un
--     punto de una inspección con `publicada_en IS NOT NULL`.
--     Política copiada desde _esquema-vigente.sql:1383-1387.
-- 4.  Fecha de finalización: se quita `fecha_finalizacion` de `v_permitidas` en
--     `trg_guard_order_technician` porque el frontend no la envía ni ningún trigger BEFORE
--     UPDATE la modifica; el técnico no puede alterarla por API.
--     Reescrita entera desde _esquema-vigente.sql:9261-9371 (mismos permisos: service_role).
-- 5.  Avance ligado a hallazgo: `orden_avances_delete` impide a quien no es admin borrar
--     un avance propio que tenga un hallazgo ligado (`orden_hallazgos.avance_id`),
--     conservando la edición del avance.
--     Política copiada desde _esquema-vigente.sql:1106-1110.
-- 6.  Orden con dinero registrado en Finanzas: `trg_guard_order_delete_entregada` rechaza (42501) con
--     sesión (`auth.uid() IS NOT NULL`) y sin `restorify.borrar_sede = 'on'` borrar una
--     orden que tenga movimientos en `finanzas_movimientos` (`referencia_orden_id = orden`
--     y `importacion_id IS NULL`).
--     Reescrita entera desde _esquema-vigente.sql:9119-9136 (mismos permisos: service_role).
-- 7.  `descartar_hallazgo`: rechaza (42501) si la orden ya está `entregado`.
--     Reescrita entera desde _esquema-vigente.sql:4425-4465 (mismos permisos: authenticated).
-- 8.  `iniciar_reloj`: rechaza (42501) para quien no es admin cuando la orden ya está en
--     `finalizado`.
--     Reescrita entera desde _esquema-vigente.sql:5686-5753 (mismos permisos: authenticated).
-- 9.  Enlace desactivado a mano: se agrega `orden_enlaces.revocado_por` (con índice) que
--     solo escribe `revocar_enlace_cliente` con `auth.uid()`. Los caminos automáticos
--     (`asegurar_enlace_orden` sin bandera manual `restorify.crear_enlace_manual`,
--     `encolar_correo_cliente`, `datos_correo` y triggers) no recrean el enlace y dejan
--     constancia en `cola_envios` (`estado = 'omitido'` con `ultimo_error`); los botones
--     manuales «Crear enlace» (`crear_enlace_cliente`) y «Cambiar enlace»
--     (`regenerar_enlace_cliente`) sí crean uno nuevo.
--     Reescritas enteras desde _esquema-vigente.sql:
--       - `asegurar_enlace_orden` (2959-3004, service_role)
--       - `crear_enlace_cliente` (3538-3552, authenticated)
--       - `regenerar_enlace_cliente` (7043-7058, authenticated)
--       - `revocar_enlace_cliente` (7925-7939, authenticated)
--       - `encolar_correo_cliente` (4574-4615, service_role)
--       - `datos_correo` (3782-3889, service_role)
-- 10. Retirada sin reparar: `datos_correo` expone `orden.retirada_sin_reparar`.
-- 12. `traducciones`: las políticas `traducciones_admin_select` y `traducciones_admin_update`
--     quedan globales para administración (sin restricción por `sede_id`).
--     Políticas copiadas desde _esquema-vigente.sql:1305-1311.
-- 13. `is_assigned_to_order`: exige `o.sede_id = public.current_user_sede_id()`, igual que
--     `mis_ordenes_asignadas()`.
--     Reescrita entera desde _esquema-vigente.sql:5800-5812 (mismos permisos: authenticated).
-- 14. `datos_servicio`: devuelve siempre el diccionario de traducciones hacia `'en'` como
--     `_diccionario_traducciones`.
--     Reescrita entera desde _esquema-vigente.sql:4282-4354 (mismos permisos: service_role).
-- 15. `traducciones_portal`: se revoca EXECUTE de `PUBLIC, anon, authenticated` (ningún
--     archivo en `src/` ni `supabase/functions/` la llama con clave anónima).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. recalculate_order_totals: candado FOR UPDATE sobre ordenes_trabajo antes de leer
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_order_totals(target_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  labor_total NUMERIC;
  parts_total NUMERIC;
  v_descuento NUMERIC;
  v_parqueo   NUMERIC;
  v_total     NUMERIC;
BEGIN
  PERFORM 1 FROM ordenes_trabajo WHERE id = target_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(costo), 0) INTO labor_total
  FROM orden_labor WHERE orden_id = target_order_id AND estado = 'aprobado';
  SELECT COALESCE(SUM(subtotal), 0) INTO parts_total
  FROM orden_repuestos WHERE orden_id = target_order_id AND estado = 'aprobado';
  SELECT COALESCE(descuento, 0) INTO v_descuento
  FROM orden_montos WHERE orden_id = target_order_id;
  SELECT COALESCE(monto, 0) INTO v_parqueo
  FROM orden_parqueo WHERE orden_id = target_order_id;

  v_total := GREATEST(labor_total + parts_total - COALESCE(v_descuento, 0), 0) + COALESCE(v_parqueo, 0);

  PERFORM set_config('restorify.recalc', 'on', true);

  UPDATE ordenes_trabajo
  SET total_labor = labor_total
  WHERE id = target_order_id
    AND total_labor IS DISTINCT FROM labor_total;

  UPDATE orden_montos
  SET total_repuestos = parts_total,
      total_general   = v_total,
      actualizado_en  = NOW()
  WHERE orden_id = target_order_id
    AND (total_repuestos IS DISTINCT FROM parts_total
      OR total_general   IS DISTINCT FROM v_total);

  PERFORM set_config('restorify.recalc', 'off', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.recalculate_order_totals(uuid) FROM PUBLIC, anon, authenticated;

-- Regla de orden de candados: aplicar_descuento, _recalcular_parqueo y ajustar_parqueo_orden
-- toman primero FOR UPDATE sobre la fila de ordenes_trabajo.
CREATE OR REPLACE FUNCTION public._recalcular_parqueo(p_orden_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sede_id UUID;
  v_res     JSONB;
BEGIN
  SELECT sede_id INTO v_sede_id FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_res := public._parqueo_calcular(p_orden_id, NULL);
  IF v_res IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO orden_parqueo (
    orden_id, perfil, estado, inicio_cobro, dias_cobrados,
    monto, detalle, tope_aplicado, calculado_hasta, calculado_en
  ) VALUES (
    p_orden_id,
    v_res->>'perfil',
    v_res->>'estado',
    NULLIF(v_res->>'inicio', '')::date,
    COALESCE((v_res->>'dias')::int, 0),
    COALESCE((v_res->>'monto')::numeric, 0),
    COALESCE(v_res->'detalle', '[]'::jsonb),
    COALESCE((v_res->>'tope_aplicado')::boolean, false),
    public.hoy_taller(v_sede_id),
    NOW()
  )
  ON CONFLICT (orden_id) DO UPDATE SET
    perfil          = EXCLUDED.perfil,
    estado          = EXCLUDED.estado,
    inicio_cobro    = EXCLUDED.inicio_cobro,
    dias_cobrados   = EXCLUDED.dias_cobrados,
    monto           = EXCLUDED.monto,
    detalle         = EXCLUDED.detalle,
    tope_aplicado   = EXCLUDED.tope_aplicado,
    calculado_hasta = EXCLUDED.calculado_hasta,
    calculado_en    = EXCLUDED.calculado_en
  WHERE orden_parqueo.perfil IS DISTINCT FROM EXCLUDED.perfil
     OR orden_parqueo.estado IS DISTINCT FROM EXCLUDED.estado
     OR orden_parqueo.inicio_cobro IS DISTINCT FROM EXCLUDED.inicio_cobro
     OR orden_parqueo.dias_cobrados IS DISTINCT FROM EXCLUDED.dias_cobrados
     OR orden_parqueo.monto IS DISTINCT FROM EXCLUDED.monto
     OR orden_parqueo.detalle IS DISTINCT FROM EXCLUDED.detalle
     OR orden_parqueo.tope_aplicado IS DISTINCT FROM EXCLUDED.tope_aplicado;

  PERFORM public.recalculate_order_totals(p_orden_id);
END;
$function$;
REVOKE ALL ON FUNCTION public._recalcular_parqueo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ajustar_parqueo_orden(p_orden_id uuid, p_ajustes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tarifa_man NUMERIC;
  v_dias_exon  INT;
  v_ini_man    DATE;
  v_nota       TEXT;
  v_cobrar     BOOLEAN;
  v_actual     orden_parqueo;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ajustar el parqueo de una orden.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_actual FROM orden_parqueo WHERE orden_id = p_orden_id;

  IF p_ajustes ? 'tarifa_manual' THEN
    IF p_ajustes->>'tarifa_manual' IS NULL OR btrim(p_ajustes->>'tarifa_manual') = '' THEN
      v_tarifa_man := NULL;
    ELSE
      v_tarifa_man := (p_ajustes->>'tarifa_manual')::numeric;
      IF v_tarifa_man < 0 THEN
        RAISE EXCEPTION 'La tarifa manual no puede ser negativa.' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    v_tarifa_man := v_actual.tarifa_manual;
  END IF;

  IF p_ajustes ? 'dias_exonerados' THEN
    IF p_ajustes->>'dias_exonerados' IS NULL OR btrim(p_ajustes->>'dias_exonerados') = '' THEN
      v_dias_exon := 0;
    ELSE
      v_dias_exon := (p_ajustes->>'dias_exonerados')::int;
      IF v_dias_exon < 0 THEN
        RAISE EXCEPTION 'Los días exonerados no pueden ser negativos.' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    v_dias_exon := COALESCE(v_actual.dias_exonerados, 0);
  END IF;

  IF p_ajustes ? 'inicio_manual' THEN
    v_ini_man := NULLIF(btrim(p_ajustes->>'inicio_manual'), '')::date;
  ELSE
    v_ini_man := v_actual.inicio_manual;
  END IF;

  IF p_ajustes ? 'nota' THEN
    v_nota := NULLIF(btrim(p_ajustes->>'nota'), '');
  ELSE
    v_nota := v_actual.nota;
  END IF;

  IF p_ajustes ? 'cobrar' THEN
    v_cobrar := COALESCE((p_ajustes->>'cobrar')::boolean, true);
  ELSE
    v_cobrar := COALESCE(v_actual.cobrar, true);
  END IF;

  INSERT INTO orden_parqueo (
    orden_id, cobrar, tarifa_manual, inicio_manual, dias_exonerados, nota
  ) VALUES (
    p_orden_id, v_cobrar, v_tarifa_man, v_ini_man, v_dias_exon, v_nota
  )
  ON CONFLICT (orden_id) DO UPDATE SET
    cobrar          = EXCLUDED.cobrar,
    tarifa_manual   = EXCLUDED.tarifa_manual,
    inicio_manual   = EXCLUDED.inicio_manual,
    dias_exonerados = EXCLUDED.dias_exonerados,
    nota            = EXCLUDED.nota;

  PERFORM public._recalcular_parqueo(p_orden_id);

  RETURN public.parqueo_de_orden(p_orden_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.ajustar_parqueo_orden(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_parqueo_orden(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.aplicar_descuento(p_orden_id uuid, p_monto numeric DEFAULT NULL::numeric, p_motivo text DEFAULT NULL::text, p_porcentaje numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_montos   orden_montos;
  v_subtotal NUMERIC;
  v_monto    NUMERIC;
  v_motivo   TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aplicar descuentos.' USING ERRCODE = '42501';
  END IF;
  IF p_porcentaje IS NOT NULL AND (p_porcentaje < 0 OR p_porcentaje > 100) THEN
    RAISE EXCEPTION 'El porcentaje tiene que estar entre 0 y 100.' USING ERRCODE = '22023';
  END IF;
  IF p_porcentaje IS NULL AND COALESCE(p_monto, 0) < 0 THEN
    RAISE EXCEPTION 'El descuento no puede ser negativo.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  SELECT * INTO v_montos FROM orden_montos WHERE orden_id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE((SELECT SUM(costo) FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'aprobado'), 0)
       + COALESCE((SELECT SUM(subtotal) FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'aprobado'), 0)
    INTO v_subtotal;

  v_monto := round(
    CASE WHEN p_porcentaje IS NOT NULL THEN v_subtotal * p_porcentaje / 100 ELSE COALESCE(p_monto, 0) END,
    2
  );

  IF v_monto > v_subtotal THEN
    RAISE EXCEPTION 'El descuento no puede ser mayor que lo autorizado (%).', to_char(v_subtotal, 'FM$999,999,990.00')
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('restorify.descuento', 'on', true);
  UPDATE orden_montos
  SET descuento = v_monto,
      descuento_motivo = CASE WHEN v_monto > 0 THEN v_motivo END
  WHERE orden_id = p_orden_id;
  PERFORM set_config('restorify.descuento', 'off', true);

  PERFORM public.recalculate_order_totals(p_orden_id);

  RETURN jsonb_build_object(
    'descuento', v_monto,
    'total', (SELECT total_general FROM orden_montos WHERE orden_id = p_orden_id)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.aplicar_descuento(uuid, numeric, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_descuento(uuid, numeric, text, numeric) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 2. trg_guard_perfil_privilegios: no permitir cambiar email a quien no es admin
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_guard_perfil_privilegios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- No end-user JWT on the request means this is a trusted maintenance path:
  -- the service-role key (create-employee / delete-employee) or plain SQL run
  -- by a migration or seed. Those must stay able to fix up a profile.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'No puedes cambiar el identificador de un perfil.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de un usuario.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.sede_id IS DISTINCT FROM OLD.sede_id THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la sede de un usuario.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el correo de un usuario.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_guard_perfil_privilegios() FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 3. orden_media_delete (storage.objects): proteger fotos de inspección publicada
-- -------------------------------------------------------------------------------------
DROP POLICY IF EXISTS orden_media_delete ON storage.objects;
CREATE POLICY orden_media_delete ON storage.objects
  FOR DELETE TO public
  USING (
    bucket_id = 'orden_media'::text
    AND (
      (SELECT public.is_admin())
      OR (
        owner = (SELECT auth.uid())
        AND NOT EXISTS (
          SELECT 1
          FROM public.ordenes_trabajo o
          WHERE o.id::text = (storage.foldername(objects.name))[2]
            AND o.estatus = 'entregado'::public.order_status
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.orden_media m
          JOIN public.orden_inspeccion_puntos p ON p.id = m.inspeccion_punto_id
          JOIN public.orden_inspecciones i ON i.id = p.inspeccion_id
          WHERE i.publicada_en IS NOT NULL
            AND (m.ruta = objects.name OR m.ruta_miniatura = objects.name)
        )
      )
    )
  );

-- -------------------------------------------------------------------------------------
-- 4. trg_guard_order_technician: quitar fecha_finalizacion de v_permitidas
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_guard_order_technician()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'porcentaje_avance',
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
$function$;
REVOKE ALL ON FUNCTION public.trg_guard_order_technician() FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 5. orden_avances_delete: no borrar avances ligados a un hallazgo (si no es admin)
-- -------------------------------------------------------------------------------------
DROP POLICY IF EXISTS orden_avances_delete ON public.orden_avances;
CREATE POLICY orden_avances_delete ON public.orden_avances
  FOR DELETE TO public
  USING (
    (SELECT public.is_admin())
    OR (
      usuario_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.ordenes_trabajo o
        WHERE o.id = orden_avances.orden_id
          AND o.estatus <> 'entregado'::public.order_status
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.orden_hallazgos h
        WHERE h.avance_id = orden_avances.id
      )
    )
  );

-- -------------------------------------------------------------------------------------
-- 6. trg_guard_order_delete_entregada: impedir borrar orden con movimientos en finanzas
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_guard_order_delete_entregada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.estatus = 'entregado'
     AND auth.uid() IS NOT NULL
     AND COALESCE(current_setting('restorify.borrar_sede', true), '') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Una orden entregada no se borra: lleva el cobro, el costo de los repuestos y las comisiones. Archívala para sacarla de la lista.'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL
     AND COALESCE(current_setting('restorify.borrar_sede', true), '') IS DISTINCT FROM 'on'
     AND EXISTS (
       SELECT 1
       FROM public.finanzas_movimientos
       WHERE referencia_orden_id = OLD.id
         AND importacion_id IS NULL
     ) THEN
    RAISE EXCEPTION 'Esta orden ya tiene dinero registrado en Finanzas. Para cancelarla usa «Retirada sin reparar», que registra la devolución.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_guard_order_delete_entregada() FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 7. descartar_hallazgo: rechazar si la orden ya fue entregada
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.descartar_hallazgo(p_hallazgo_id uuid, p_en_reporte boolean, p_texto text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h     orden_hallazgos;
  v_texto TEXT := NULLIF(btrim(COALESCE(p_texto, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede descartar un trabajo adicional.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_h FROM orden_hallazgos WHERE id = p_hallazgo_id FOR UPDATE;
  IF v_h.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ese trabajo adicional.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = v_h.orden_id AND estatus = 'entregado'
  ) THEN
    RAISE EXCEPTION 'La orden ya fue entregada: su reporte ya no se cambia.' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_h.estado = 'pendiente' OR (v_h.estado = 'cotizado' AND v_h.presupuesto_id IS NULL)) THEN
    RAISE EXCEPTION 'Este trabajo adicional ya se resolvió.' USING ERRCODE = '42501';
  END IF;
  IF length(v_texto) > 1000 THEN
    RAISE EXCEPTION 'El texto para el cliente es demasiado largo (máximo 1000 caracteres).' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_en_reporte, false) AND v_texto IS NULL THEN
    RAISE EXCEPTION 'Escribe el texto que verá el cliente en su reporte.' USING ERRCODE = '42501';
  END IF;

  UPDATE orden_hallazgos
  SET estado = 'descartado',
      en_reporte = COALESCE(p_en_reporte, false),
      texto_cliente = v_texto,
      resuelto_por = auth.uid(),
      resuelto_en = NOW()
  WHERE id = v_h.id;

  PERFORM public._salir_de_espera(v_h.orden_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.descartar_hallazgo(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descartar_hallazgo(uuid, boolean, text) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 8. iniciar_reloj: rechazar orden finalizado para quien no es admin
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_reloj(p_labor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_labor     orden_labor;
  v_orden     ordenes_trabajo;
  v_tiempo_id UUID;
  v_ahora     TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para usar el reloj.' USING ERRCODE = '42501';
  END IF;

  -- Una persona abre un reloj a la vez: dos toques seguidos esperan su turno en vez de chocar con
  -- el índice único (23505).
  PERFORM pg_advisory_xact_lock(hashtextextended('reloj:' || auth.uid()::text, 0));

  -- Bloquea la tarea: si al mismo tiempo la marcan hecha, uno espera al otro y no queda un reloj
  -- abierto sobre una tarea cerrada.
  SELECT * INTO v_labor FROM public.orden_labor WHERE id = p_labor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea no encontrada.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_trabajo WHERE id = v_labor.orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_admin() OR v_labor.asignado_a = auth.uid()) THEN
    RAISE EXCEPTION 'Solo administración o el técnico asignado pueden iniciar el reloj.'
      USING ERRCODE = '42501';
  END IF;

  IF v_labor.estado <> 'aprobado' THEN
    RAISE EXCEPTION 'Solo se puede iniciar el reloj en tareas aprobadas.'
      USING ERRCODE = '42501';
  END IF;

  IF v_labor.completado_en IS NOT NULL THEN
    RAISE EXCEPTION 'La tarea ya está completada.'
      USING ERRCODE = '42501';
  END IF;

  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'No se puede iniciar el reloj en una orden entregada.'
      USING ERRCODE = '42501';
  END IF;

  IF v_orden.estatus = 'finalizado' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'La orden ya está terminada. Si falta algo, pide a administración que la reabra.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orden_labor_tiempos
  SET fin = LEAST(v_ahora, inicio + public._reloj_tope())
  WHERE usuario_id = auth.uid() AND fin IS NULL;

  INSERT INTO public.orden_labor_tiempos (
    labor_id, orden_id, usuario_id, inicio
  ) VALUES (
    v_labor.id, v_orden.id, auth.uid(), v_ahora
  )
  RETURNING id INTO v_tiempo_id;

  RETURN v_tiempo_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.iniciar_reloj(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_reloj(uuid) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 9 y 10. Enlace desactivado a mano + datos_correo (enlace revocado y retirada_sin_reparar)
-- -------------------------------------------------------------------------------------
ALTER TABLE public.orden_enlaces
  ADD COLUMN IF NOT EXISTS revocado_por UUID NULL REFERENCES public.perfiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orden_enlaces_revocado_por
  ON public.orden_enlaces (revocado_por);

CREATE OR REPLACE FUNCTION public.revocar_enlace_cliente(p_orden_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede desactivar el enlace del cliente.' USING ERRCODE = '42501';
  END IF;

  UPDATE orden_enlaces
  SET revocado_en = NOW(),
      revocado_por = auth.uid()
  WHERE orden_id = p_orden_id
    AND revocado_en IS NULL;

  -- Si había correos pendientes en ráfaga para esta orden, se omiten de una vez.
  UPDATE cola_envios
  SET estado = 'omitido',
      ultimo_error = 'El enlace del cliente fue desactivado manualmente.'
  WHERE orden_id = p_orden_id
    AND canal = 'email'
    AND estado = 'pendiente';
END;
$function$;
REVOKE ALL ON FUNCTION public.revocar_enlace_cliente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revocar_enlace_cliente(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.asegurar_enlace_orden(p_orden_id uuid)
 RETURNS orden_enlaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enlace  orden_enlaces;
  v_sede    UUID;
  v_estatus order_status;
BEGIN
  SELECT * INTO v_enlace FROM orden_enlaces WHERE orden_id = p_orden_id AND revocado_en IS NULL;
  IF FOUND THEN
    IF v_enlace.expira_en IS NULL OR v_enlace.expira_en > NOW() THEN
      RETURN v_enlace;
    END IF;
    -- Vencido: se retira para que no quede un enlace muerto como el activo.
    UPDATE orden_enlaces SET revocado_en = NOW() WHERE id = v_enlace.id;
  END IF;

  -- Los caminos automáticos no recrean un enlace que administración desactivó a mano.
  IF COALESCE(current_setting('restorify.crear_enlace_manual', true), 'off') <> 'on'
     AND NOT EXISTS (
       SELECT 1 FROM orden_enlaces WHERE orden_id = p_orden_id AND revocado_en IS NULL
     )
     AND COALESCE((
       SELECT e.revocado_por IS NOT NULL
       FROM orden_enlaces e
       WHERE e.orden_id = p_orden_id
       ORDER BY COALESCE(e.revocado_en, e.creado_en) DESC, e.creado_en DESC, e.id DESC
       LIMIT 1
     ), false) THEN
    RETURN NULL;
  END IF;

  SELECT sede_id, estatus INTO v_sede, v_estatus FROM ordenes_trabajo WHERE id = p_orden_id;
  IF v_sede IS NULL THEN
    RAISE EXCEPTION 'La orden % no existe.', p_orden_id;
  END IF;

  INSERT INTO orden_enlaces (orden_id, sede_id, token, creado_por, expira_en)
  VALUES (
    p_orden_id,
    v_sede,
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    (SELECT id FROM perfiles WHERE id = auth.uid()),
    CASE WHEN v_estatus = 'entregado' THEN NOW() + INTERVAL '90 days' END
  )
  ON CONFLICT (orden_id) WHERE revocado_en IS NULL DO NOTHING
  RETURNING * INTO v_enlace;

  -- Otra transacción lo creó en el mismo instante: se usa ese.
  IF v_enlace.id IS NULL THEN
    SELECT * INTO v_enlace FROM orden_enlaces WHERE orden_id = p_orden_id AND revocado_en IS NULL;
  END IF;

  RETURN v_enlace;
END;
$function$;
REVOKE ALL ON FUNCTION public.asegurar_enlace_orden(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crear_enlace_cliente(p_orden_id uuid)
 RETURNS orden_enlaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enlace orden_enlaces;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede compartir el enlace del cliente.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('restorify.crear_enlace_manual', 'on', true);
  v_enlace := public.asegurar_enlace_orden(p_orden_id);
  PERFORM set_config('restorify.crear_enlace_manual', 'off', true);

  RETURN v_enlace;
END;
$function$;
REVOKE ALL ON FUNCTION public.crear_enlace_cliente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_enlace_cliente(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.regenerar_enlace_cliente(p_orden_id uuid)
 RETURNS orden_enlaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enlace orden_enlaces;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el enlace del cliente.' USING ERRCODE = '42501';
  END IF;

  UPDATE orden_enlaces SET revocado_en = NOW() WHERE orden_id = p_orden_id AND revocado_en IS NULL;

  PERFORM set_config('restorify.crear_enlace_manual', 'on', true);
  v_enlace := public.asegurar_enlace_orden(p_orden_id);
  PERFORM set_config('restorify.crear_enlace_manual', 'off', true);

  RETURN v_enlace;
END;
$function$;
REVOKE ALL ON FUNCTION public.regenerar_enlace_cliente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerar_enlace_cliente(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.encolar_correo_cliente(p_orden_id uuid, p_plantilla text, p_datos jsonb DEFAULT '{}'::jsonb, p_clave_dedupe text DEFAULT NULL::text, p_espera interval DEFAULT '00:00:00'::interval)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email  TEXT;
  v_acepta BOOLEAN;
  v_id     UUID;
BEGIN
  SELECT btrim(c.email), c.acepta_correos INTO v_email, v_acepta
  FROM ordenes_trabajo o
  JOIN clientes c ON c.id = o.cliente_id
  WHERE o.id = p_orden_id;

  IF NOT public.es_correo_valido(v_email) OR NOT COALESCE(v_acepta, false) THEN
    RETURN NULL;
  END IF;

  -- Si el enlace más reciente fue desactivado a mano, no se crea uno nuevo ni se manda el correo.
  IF NOT EXISTS (
       SELECT 1 FROM orden_enlaces WHERE orden_id = p_orden_id AND revocado_en IS NULL
     )
     AND COALESCE((
       SELECT e.revocado_por IS NOT NULL
       FROM orden_enlaces e
       WHERE e.orden_id = p_orden_id
       ORDER BY COALESCE(e.revocado_en, e.creado_en) DESC, e.creado_en DESC, e.id DESC
       LIMIT 1
     ), false) THEN
    INSERT INTO cola_envios (
      canal, destinatario, plantilla, datos, orden_id, estado, ultimo_error, enviar_despues_de, clave_dedupe
    )
    VALUES (
      'email', lower(v_email), p_plantilla, COALESCE(p_datos, '{}'::jsonb), p_orden_id,
      'omitido', 'El enlace del cliente fue desactivado manualmente.', NOW() + p_espera, p_clave_dedupe
    );
    RETURN NULL;
  END IF;

  PERFORM public.asegurar_enlace_orden(p_orden_id);

  INSERT INTO cola_envios (canal, destinatario, plantilla, datos, orden_id, enviar_despues_de, clave_dedupe)
  VALUES ('email', lower(v_email), p_plantilla, COALESCE(p_datos, '{}'::jsonb), p_orden_id, NOW() + p_espera, p_clave_dedupe)
  ON CONFLICT (clave_dedupe) WHERE clave_dedupe IS NOT NULL AND estado = 'pendiente'
  DO UPDATE SET
    datos = EXCLUDED.datos,
    destinatario = EXCLUDED.destinatario,
    -- Nunca hacia adelante: el aviso se manda a la hora del primero de la ráfaga.
    enviar_despues_de = LEAST(cola_envios.enviar_despues_de, EXCLUDED.enviar_despues_de)
  RETURNING id INTO v_id;

  -- Sin espera, al instante. Con espera, lo toma el cron de cada minuto.
  IF p_espera <= INTERVAL '0 seconds' THEN
    PERFORM public.invoke_edge_function('process-outbox');
  END IF;

  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.encolar_correo_cliente(uuid, text, jsonb, text, interval) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.datos_correo(p_cola_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job            cola_envios;
  v_orden          ordenes_trabajo;
  v_enlace         orden_enlaces;
  v_parq_json      JSONB;
  v_parqueo_correo JSONB := NULL;
BEGIN
  SELECT * INTO v_job FROM cola_envios WHERE id = p_cola_id AND canal = 'email';
  IF NOT FOUND OR v_job.orden_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = v_job.orden_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_enlace := public.asegurar_enlace_orden(v_orden.id);
  IF v_enlace.id IS NULL THEN
    UPDATE cola_envios
    SET estado = 'omitido',
        ultimo_error = 'El enlace del cliente fue desactivado manualmente.'
    WHERE id = p_cola_id;
    RETURN NULL;
  END IF;

  BEGIN
    v_parq_json := public._parqueo_calcular(v_orden.id, NULL);
    IF (SELECT avisar_cliente FROM parqueo_config WHERE sede_id = v_orden.sede_id) IS TRUE
       AND v_parq_json->>'estado' IN ('por_empezar', 'acumulando') THEN
      v_parqueo_correo := jsonb_build_object(
        'estado', v_parq_json->>'estado',
        'inicio', v_parq_json->>'inicio',
        'tarifa_inicial', (v_parq_json->>'tarifa_inicial')::numeric
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_parqueo_correo := NULL;
  END;

  RETURN jsonb_build_object(
    'token', v_enlace.token,
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre,
        'email', lower(btrim(c.email)),
        'email_valido', public.es_correo_valido(c.email),
        'acepta_correos', c.acepta_correos,
        'idioma', c.idioma
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
    -- Texto original → inglés (las líneas del presupuesto en un correo en inglés).
    'traducciones', public._diccionario_traducciones(v_orden.id),
    'taller', (
      SELECT jsonb_build_object(
        'nombre', s.nombre,
        'direccion', s.direccion,
        'telefono', s.telefono,
        'telefonos', public._telefonos_sede(s.telefonos),
        'email', CASE WHEN public.es_correo_valido(s.email_contacto) THEN lower(btrim(s.email_contacto)) END,
        'whatsapp', NULLIF(btrim(s.whatsapp), ''),
        'logo_url', s.logo_url,
        'color', s.color_tema
      )
      FROM sedes s WHERE s.id = v_orden.sede_id
    ),
    'orden', jsonb_build_object(
      'numero', v_orden.numero_orden,
      'estatus', public._estatus_cliente(v_orden.estatus, v_orden.lista_para_entregar_en),
      'retirada_sin_reparar', v_orden.retirada_sin_reparar,
      'fecha_ingreso', v_orden.fecha_ingreso,
      'fecha_estimada_entrega', v_orden.fecha_estimada_entrega
    ),
    'vehiculo', (
      SELECT btrim(concat_ws(' ', v.anio::text, v.marca, v.modelo))
      FROM vehiculos v WHERE v.id = v_orden.vehiculo_id
    ),
    'ultimo_estatus_enviado', (
      SELECT datos->>'estatus_enviado'
      FROM cola_envios
      WHERE orden_id = v_orden.id AND canal = 'email' AND plantilla = 'estatus' AND estado = 'enviado'
      ORDER BY enviado_en DESC NULLS LAST
      LIMIT 1
    ),
    'parqueo', v_parqueo_correo,
    'presupuesto', CASE WHEN v_job.datos ? 'presupuesto_id' THEN (
      SELECT jsonb_build_object(
        'numero', p.numero,
        'estado', p.estado,
        'via', p.respondido_via,
        'total_propuesto', p.total_propuesto,
        'total_aprobado', p.total_aprobado,
        'lineas', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('descripcion', l.descripcion, 'monto', l.monto, 'estado', l.estado) ORDER BY l.creado_en)
          FROM (
            SELECT descripcion, costo AS monto, estado, creado_en FROM orden_labor WHERE presupuesto_id = p.id
            UNION ALL
            SELECT descripcion, subtotal, estado, creado_en FROM orden_repuestos WHERE presupuesto_id = p.id
          ) l
        ), '[]'::jsonb)
      )
      FROM presupuestos p
      WHERE p.id = (v_job.datos->>'presupuesto_id')::uuid
    ) END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.datos_correo(uuid) FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 12. traducciones: políticas globales para administración (todas las sedes)
-- -------------------------------------------------------------------------------------
DROP POLICY IF EXISTS traducciones_admin_select ON public.traducciones;
CREATE POLICY traducciones_admin_select ON public.traducciones
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS traducciones_admin_update ON public.traducciones;
CREATE POLICY traducciones_admin_update ON public.traducciones
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- -------------------------------------------------------------------------------------
-- 13. is_assigned_to_order: exigir sede actual como mis_ordenes_asignadas()
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_assigned_to_order(p_orden_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM orden_asignaciones a
    JOIN ordenes_trabajo o ON o.id = a.orden_id
    WHERE a.orden_id = p_orden_id
      AND a.usuario_id = auth.uid()
      AND o.sede_id = public.current_user_sede_id()
  );
$function$;
REVOKE ALL ON FUNCTION public.is_assigned_to_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_order(uuid) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 14. datos_servicio: devolver siempre diccionario de traducciones hacia 'en'
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.datos_servicio(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ps             public.orden_proximo_servicio;
  v_orden          public.ordenes_trabajo;
  v_sede           public.sedes;
  v_veh            public.vehiculos;
  v_idioma         TEXT;
  v_idioma_destino TEXT;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_ps
  FROM public.orden_proximo_servicio
  WHERE token = p_token
    AND (fecha IS NOT NULL OR millas IS NOT NULL);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_trabajo WHERE id = v_ps.orden_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_sede FROM public.sedes WHERE id = v_ps.sede_id;
  SELECT * INTO v_veh FROM public.vehiculos WHERE id = v_orden.vehiculo_id;
  SELECT idioma INTO v_idioma FROM public.clientes WHERE id = v_orden.cliente_id;

  v_idioma_destino := COALESCE(v_ps.idioma, v_idioma, 'en');

  RETURN jsonb_build_object(
    'estado', 'ok',
    'taller', jsonb_build_object(
      'nombre', v_sede.nombre,
      'logo_url', v_sede.logo_url,
      'color', v_sede.color_tema,
      'telefonos', public._telefonos_sede(v_sede.telefonos)
    ),
    'vehiculo', jsonb_build_object(
      'anio', v_veh.anio,
      'marca', v_veh.marca,
      'modelo', v_veh.modelo,
      'color', v_veh.color
    ),
    'servicio', jsonb_build_object(
      'fecha', v_ps.fecha,
      'millas', v_ps.millas,
      'nota', v_ps.nota
    ),
    'idioma', v_idioma_destino,
    -- El diccionario siempre traduce hacia 'en' (como _diccionario_traducciones) para que
    -- el cliente pueda cambiar el sticker a inglés aunque el idioma inicial sea 'es'.
    'traducciones', COALESCE((
      SELECT jsonb_object_agg(t.texto_original, t.traduccion)
      FROM public.traducciones t
      WHERE t.sede_id = v_ps.sede_id
        AND t.idioma_destino = 'en'
        AND NULLIF(trim(v_ps.nota), '') IS NOT NULL
        AND t.md5_hash = md5(trim(v_ps.nota))
    ), '{}'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.datos_servicio(text) FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 15. traducciones_portal: revocar permiso EXECUTE a anon (queda solo service_role)
-- -------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.traducciones_portal(text) FROM PUBLIC, anon, authenticated;
