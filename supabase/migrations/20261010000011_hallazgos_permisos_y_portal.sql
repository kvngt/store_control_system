-- ------------------------------------------------------------------------------------
-- F6 (2/2 de la expansión): hallazgos con permisos, avance interno y observaciones
-- ------------------------------------------------------------------------------------
-- `20261010000010` creó `orden_hallazgos` y sus RPC, pero dejó huecos que esta migración
-- cierra. No se edita aquella porque el código que la usa ya está en `main` y no se sabe
-- si se aplicó: todo lo de aquí se reescribe entero y sirve en los dos casos.
--
-- 1. `cotizar_hallazgo` y `descartar_hallazgo` no verificaban el rol: cualquier usuario con
--    sesión podía resolver el hallazgo de cualquier orden y, al descartarlo, sacarla de
--    espera. Ahora son solo de administración (42501).
-- 2. `_salir_de_espera` buscaba presupuestos en estado 'esperando', que no existe (son
--    'enviado' | 'respondido' | 'cancelado'): sacaba la orden de espera con un presupuesto
--    abierto. Y le faltaba `SET search_path`, como a las demás.
-- 3. `reportar_hallazgo` no revisaba si la orden estaba entregada, aceptaba un texto vacío
--    y no creaba el avance interno que pide el plan (para las fotos). Ahora devuelve
--    `{hallazgo_id, avance_id}`: la app sube las fotos a ese avance con la cola que ya
--    existe. Avisa a administración UNA vez ("Trabajo adicional reportado"): el avance y el
--    cambio de estado callan sus propios avisos con la bandera `restorify.hallazgo`.
-- 4. El técnico no puede publicar el avance de un hallazgo (trigger en `orden_avances`).
-- 5. `enviar_presupuesto` contaba un hallazgo cotizado como "algo que enviar" y creaba un
--    presupuesto sin líneas. Un hallazgo cotizado es una nota: lo que se envía es la tarea
--    que el admin agregó con él.
-- 6. La política de lectura usa `mis_ordenes_asignadas()` como las demás hijas de la orden.
-- 7. Al volver de espera a "en proceso" no sale otro correo de estado si el cliente ya
--    supo que su vehículo estaba en proceso (plan F6).
-- 8. `datos_portal` agrega `observaciones`: solo `texto_cliente` de los descartados que el
--    admin mandó al reporte. Nunca la descripción del mecánico.
--
-- La CONTRACCIÓN del plan (el guardia del técnico acepta espera solo con un hallazgo
-- pendiente y deja de exigir `motivo_autorizacion`) va en otra migración, cuando esta app
-- ya esté publicada y nadie use la anterior.

-- ------------------------------------------------------------------------------------
-- 1. La tabla: límites, índice y lectura
-- ------------------------------------------------------------------------------------
-- NOT VALID: valen para las filas nuevas sin revisar las que pudo dejar la versión anterior.
ALTER TABLE orden_hallazgos DROP CONSTRAINT IF EXISTS orden_hallazgos_descripcion_largo;
ALTER TABLE orden_hallazgos ADD CONSTRAINT orden_hallazgos_descripcion_largo
  CHECK (length(btrim(descripcion)) BETWEEN 1 AND 1000) NOT VALID;
ALTER TABLE orden_hallazgos DROP CONSTRAINT IF EXISTS orden_hallazgos_texto_cliente;
ALTER TABLE orden_hallazgos ADD CONSTRAINT orden_hallazgos_texto_cliente
  CHECK (
    (texto_cliente IS NULL OR length(texto_cliente) <= 1000)
    AND (NOT en_reporte OR NULLIF(btrim(texto_cliente), '') IS NOT NULL)
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_orden_hallazgos_avance_id
  ON orden_hallazgos(avance_id) WHERE avance_id IS NOT NULL;

DROP POLICY IF EXISTS orden_hallazgos_select ON orden_hallazgos;
CREATE POLICY orden_hallazgos_select ON orden_hallazgos
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));

-- Solo lectura por la API; todo lo demás pasa por las RPC de abajo.
REVOKE ALL ON orden_hallazgos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON orden_hallazgos TO authenticated;


-- ------------------------------------------------------------------------------------
-- 2. Salir de espera
-- ------------------------------------------------------------------------------------
-- Vuelve a "en proceso" solo si la orden espera, no queda ningún hallazgo sin resolver y
-- no hay un presupuesto enviado sin respuesta. Lo llaman `descartar_hallazgo`,
-- `cancelar_presupuesto` y `_resolver_presupuesto` (las dos últimas ya desde la 010).
CREATE OR REPLACE FUNCTION public._salir_de_espera(p_orden_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ordenes_trabajo
  SET estatus = 'en_proceso'
  WHERE id = p_orden_id
    AND estatus = 'espera_autorizacion'
    AND NOT EXISTS (
      SELECT 1 FROM orden_hallazgos WHERE orden_id = p_orden_id AND estado = 'pendiente'
    )
    AND NOT EXISTS (
      SELECT 1 FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'enviado'
    );
END;
$$;

REVOKE ALL ON FUNCTION public._salir_de_espera(UUID) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- 3. Reportar un hallazgo (técnico asignado)
-- ------------------------------------------------------------------------------------
-- Cambia el tipo de retorno (uuid → jsonb), así que se suelta y se vuelve a crear. La app
-- anterior ignoraba lo que devolvía.
DROP FUNCTION IF EXISTS public.reportar_hallazgo(UUID, TEXT);
CREATE FUNCTION public.reportar_hallazgo(p_orden_id UUID, p_descripcion TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden   ordenes_trabajo;
  v_desc    TEXT := NULLIF(btrim(left(COALESCE(p_descripcion, ''), 1000)), '');
  v_id      UUID;
  v_avance  UUID;
  v_prev    TEXT := current_setting('restorify.hallazgo', true);
  v_quien   TEXT;
  d         JSONB;
BEGIN
  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  -- Para un técnico, una orden ajena no existe: el mismo mensaje en los dos casos.
  IF v_orden.id IS NULL OR NOT public.is_assigned_to_order(p_orden_id) THEN
    RAISE EXCEPTION 'Solo el personal asignado a la orden puede reportar trabajo adicional.'
      USING ERRCODE = '42501';
  END IF;
  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Escribe qué encontraste y qué hay que hacer.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('restorify.hallazgo', 'on', true);

  -- El avance interno donde caen las fotos. Nace sin publicar y el técnico no lo puede
  -- publicar (trg_avance_hallazgo_interno).
  INSERT INTO orden_avances (orden_id, usuario_id, descripcion, visible_cliente)
  VALUES (p_orden_id, auth.uid(), v_desc, false)
  RETURNING id INTO v_avance;

  INSERT INTO orden_hallazgos (orden_id, sede_id, reportado_por, descripcion, avance_id)
  VALUES (p_orden_id, v_orden.sede_id, auth.uid(), v_desc, v_avance)
  RETURNING id INTO v_id;

  -- La pausa. Si ya esperaba (otro hallazgo, un presupuesto enviado), no se toca: el
  -- motivo que ya tiene sigue siendo cierto.
  UPDATE ordenes_trabajo
  SET estatus = 'espera_autorizacion', motivo_autorizacion = v_desc
  WHERE id = p_orden_id AND estatus <> 'espera_autorizacion';

  PERFORM set_config('restorify.hallazgo', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  BEGIN
    d := public.datos_orden_aviso(p_orden_id);
    SELECT nombre_completo INTO v_quien FROM perfiles WHERE id = auth.uid();
    PERFORM public.notificar(
      public.admins_de_sede(v_orden.sede_id),
      'hallazgo_reportado',
      'Trabajo adicional reportado · ' || v_orden.numero_orden,
      COALESCE(v_quien, 'Un técnico') || ': ' || left(v_desc, 200),
      d || jsonb_build_object('actor', v_quien, 'hallazgo_id', v_id, 'descripcion', left(v_desc, 200)),
      p_orden_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'reportar_hallazgo aviso (%): %', v_id, SQLERRM;
  END;

  RETURN jsonb_build_object('hallazgo_id', v_id, 'avance_id', v_avance);
END;
$$;

REVOKE ALL ON FUNCTION public.reportar_hallazgo(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reportar_hallazgo(UUID, TEXT) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 4. Cotizar (admin)
-- ------------------------------------------------------------------------------------
-- Lo marca cotizado y devuelve el texto para precargar la tarea. La orden sigue en espera:
-- `enviar_presupuesto` lo vincula y la respuesta del cliente la saca.
DROP FUNCTION IF EXISTS public.cotizar_hallazgo(UUID);
CREATE FUNCTION public.cotizar_hallazgo(p_hallazgo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_h orden_hallazgos;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cotizar un trabajo adicional.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_h FROM orden_hallazgos WHERE id = p_hallazgo_id FOR UPDATE;
  IF v_h.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ese trabajo adicional.' USING ERRCODE = 'P0002';
  END IF;
  IF v_h.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'Este trabajo adicional ya se resolvió.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = v_h.orden_id AND estatus = 'entregado') THEN
    RAISE EXCEPTION 'La orden ya fue entregada.' USING ERRCODE = '42501';
  END IF;

  UPDATE orden_hallazgos
  SET estado = 'cotizado', resuelto_por = auth.uid(), resuelto_en = NOW()
  WHERE id = v_h.id;

  RETURN jsonb_build_object('hallazgo_id', v_h.id, 'orden_id', v_h.orden_id, 'descripcion', v_h.descripcion);
END;
$$;

REVOKE ALL ON FUNCTION public.cotizar_hallazgo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cotizar_hallazgo(UUID) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 5. Descartar (admin)
-- ------------------------------------------------------------------------------------
-- El admin edita o amplía el texto y decide si va al reporte del cliente. También se puede
-- descartar uno cotizado que todavía no salió en un presupuesto (el cliente dijo que no
-- por teléfono). Misma firma que en la 010.
CREATE OR REPLACE FUNCTION public.descartar_hallazgo(p_hallazgo_id UUID, p_en_reporte BOOLEAN, p_texto TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.descartar_hallazgo(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descartar_hallazgo(UUID, BOOLEAN, TEXT) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 6. El avance de un hallazgo es interno
-- ------------------------------------------------------------------------------------
-- El técnico puede publicar sus avances (`visible_cliente`), pero no el de un hallazgo: lo
-- que llega al cliente de un hallazgo lo decide administración (presupuesto u observación).
CREATE OR REPLACE FUNCTION public.trg_avance_hallazgo_interno()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.visible_cliente AND NOT COALESCE(OLD.visible_cliente, false)
     AND auth.role() = 'authenticated' AND NOT public.is_admin()
     AND EXISTS (SELECT 1 FROM orden_hallazgos WHERE avance_id = NEW.id) THEN
    RAISE EXCEPTION 'Lo que reportaste como trabajo adicional es interno: administración decide qué ve el cliente.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_avance_hallazgo_interno() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_avance_hallazgo_interno ON orden_avances;
CREATE TRIGGER trg_avance_hallazgo_interno
  BEFORE UPDATE OF visible_cliente ON orden_avances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_avance_hallazgo_interno();


-- ------------------------------------------------------------------------------------
-- 7. Enviar presupuesto
-- ------------------------------------------------------------------------------------
-- Transcrita de la 010 con un cambio: un hallazgo cotizado ya no cuenta como borrador.
CREATE OR REPLACE FUNCTION public.enviar_presupuesto(p_orden_id UUID, p_notificar BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p       presupuestos;
  v_drafts  BOOLEAN;
  v_correo  TEXT := 'no_solicitado';
  v_id      UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede enviar presupuestos.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;

  SELECT * INTO v_p FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'enviado' FOR UPDATE;
  v_drafts := EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'borrador')
           OR EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'borrador');

  IF v_p.id IS NULL THEN
    IF NOT v_drafts THEN
      RAISE EXCEPTION 'No hay trabajos sin autorizar para enviar al cliente.';
    END IF;
    v_p := public._crear_presupuesto(p_orden_id);
  ELSIF v_drafts THEN
    PERFORM public._agregar_borradores(v_p.id);
    SELECT * INTO v_p FROM presupuestos WHERE id = v_p.id;
  END IF;

  -- F6: los hallazgos cotizados salen con este presupuesto.
  UPDATE orden_hallazgos SET presupuesto_id = v_p.id
  WHERE orden_id = p_orden_id AND estado = 'cotizado' AND presupuesto_id IS NULL;

  -- F6: mientras el cliente decide, la orden está en pausa. Solo desde "en proceso": una
  -- orden en recepción o terminada no se mueve por enviar un presupuesto.
  UPDATE ordenes_trabajo SET estatus = 'espera_autorizacion'
  WHERE id = p_orden_id AND estatus = 'en_proceso';

  PERFORM public.asegurar_enlace_orden(p_orden_id);

  IF p_notificar THEN
    -- Un minuto con clave única: si el admin agrega otra línea y vuelve a enviar,
    -- el cliente recibe un solo correo con todo.
    v_id := public.encolar_correo_cliente(
      p_orden_id, 'presupuesto', jsonb_build_object('presupuesto_id', v_p.id),
      'presupuesto:' || v_p.id, INTERVAL '1 minute'
    );
    v_correo := CASE WHEN v_id IS NULL THEN 'sin_correo' ELSE 'encolado' END;
  END IF;

  RETURN jsonb_build_object(
    'presupuesto_id', v_p.id,
    'numero', v_p.numero,
    'lineas', array_length(public._lineas_pendientes(v_p.id), 1),
    'total', v_p.total_propuesto,
    'correo', v_correo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_presupuesto(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_presupuesto(UUID, BOOLEAN) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 8. Avisos: uno solo por hallazgo
-- ------------------------------------------------------------------------------------
-- Transcrita de la 010 con un cambio: calla mientras corre `reportar_hallazgo`, que manda
-- su propio aviso con más contexto.
CREATE OR REPLACE FUNCTION public.trg_notify_auth_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d JSONB;
BEGIN
  BEGIN
    IF NEW.estatus = 'espera_autorizacion'
       AND NEW.motivo_autorizacion IS NOT NULL -- F6: un presupuesto del admin no trae motivo
       AND COALESCE(current_setting('restorify.hallazgo', true), '') <> 'on'
       AND (OLD.estatus IS DISTINCT FROM NEW.estatus
            OR OLD.motivo_autorizacion IS DISTINCT FROM NEW.motivo_autorizacion) THEN
      d := public.datos_orden_aviso(NEW.id);
      PERFORM public.notificar(
        public.admins_de_sede(NEW.sede_id),
        'autorizacion_solicitada',
        'Requiere autorización · ' || NEW.numero_orden,
        left(COALESCE(NEW.motivo_autorizacion, ''), 200),
        d || jsonb_build_object('motivo', NEW.motivo_autorizacion),
        NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_auth_request: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_auth_request() FROM PUBLIC, anon, authenticated;

-- Transcrita de 20260920000000 con el mismo cambio: el avance de un hallazgo no avisa
-- "Nuevo avance".
CREATE OR REPLACE FUNCTION public.trg_notify_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       JSONB;
  v_quien TEXT;
  v_texto TEXT;
BEGIN
  BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin()
       AND COALESCE(current_setting('restorify.hallazgo', true), '') <> 'on' THEN
      d := public.datos_orden_aviso(NEW.orden_id);
      SELECT nombre_completo INTO v_quien FROM perfiles WHERE id = NEW.usuario_id;
      v_texto := NULLIF(btrim(NEW.descripcion), '');
      PERFORM public.notificar(
        public.admins_de_sede((d->>'sede_id')::uuid),
        'avance_tecnico',
        'Nuevo avance · ' || (d->>'numero_orden'),
        COALESCE(v_quien, 'Un técnico') || ': ' ||
          COALESCE(left(v_texto, 120), 'agregó archivos. Revisa si hay algo para mostrar al cliente.'),
        d || jsonb_build_object('actor', v_quien, 'avance_id', NEW.id),
        NEW.orden_id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_progress: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_progress() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- 9. Correos al cliente
-- ------------------------------------------------------------------------------------
-- Transcrita de 20260929000000 con un cambio: de "espera de autorización" a "en proceso"
-- no se vuelve a anunciar "en proceso" si el cliente ya lo supo. La pausa nunca se le
-- anunció, y tras autorizar ya recibió la constancia del presupuesto.
CREATE OR REPLACE FUNCTION public.trg_portal_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_espera INTERVAL;
BEGIN
  BEGIN
    -- La firma de recepción: nace el enlace y, si hay correo, el aviso de ingreso.
    -- Sale al instante cuando ya hay fotos de recepción registradas; si todavía no
    -- ha llegado ninguna, un piso corto para no mandar a un reporte vacío. Solo una
    -- vez por orden: volver a firmar no lo reenvía.
    IF NEW.firma_ruta IS NOT NULL AND OLD.firma_ruta IS NULL THEN
      PERFORM public.asegurar_enlace_orden(NEW.id);
      IF NOT EXISTS (
        SELECT 1 FROM cola_envios
        WHERE orden_id = NEW.id AND canal = 'email' AND plantilla = 'recepcion'
          AND estado IN ('pendiente', 'procesando', 'enviado')
      ) THEN
        v_espera := CASE
          WHEN EXISTS (
            SELECT 1 FROM orden_media m
            WHERE m.orden_id = NEW.id AND m.origen = 'recepcion'
          ) THEN INTERVAL '0 seconds'
          ELSE INTERVAL '30 seconds'
        END;
        PERFORM public.encolar_correo_cliente(NEW.id, 'recepcion', '{}'::jsonb, 'recepcion:' || NEW.id, v_espera);
      END IF;
    END IF;

    IF NEW.estatus IS DISTINCT FROM OLD.estatus THEN
      -- El enlace vive mientras el vehículo está en el taller y 90 días después.
      IF NEW.estatus = 'entregado' THEN
        UPDATE orden_enlaces SET expira_en = NOW() + INTERVAL '90 days'
        WHERE orden_id = NEW.id AND revocado_en IS NULL;
      ELSIF OLD.estatus = 'entregado' THEN
        UPDATE orden_enlaces SET expira_en = NULL
        WHERE orden_id = NEW.id AND revocado_en IS NULL;
      END IF;

      -- Tres minutos de espera: quien mueve una orden de un lado a otro en el
      -- tablero no le manda tres correos al cliente. Qué estado se anuncia se
      -- decide al enviar, con el estatus de ese momento (ver datos_correo).
      IF NEW.estatus IN ('en_proceso', 'finalizado', 'entregado')
         AND NOT (
           OLD.estatus = 'espera_autorizacion' AND NEW.estatus = 'en_proceso'
           AND EXISTS (
             SELECT 1 FROM cola_envios
             WHERE orden_id = NEW.id AND canal = 'email' AND plantilla = 'estatus'
               AND estado IN ('pendiente', 'procesando', 'enviado')
           )
         ) THEN
        PERFORM public.encolar_correo_cliente(
          NEW.id, 'estatus', jsonb_build_object('estatus', NEW.estatus), 'estatus:' || NEW.id, INTERVAL '3 minutes'
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Un aviso al cliente nunca debe impedir firmar o mover una orden.
    RAISE WARNING 'trg_portal_on_order_change(%): %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_portal_on_order_change() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- 10. El portal: observaciones del taller
-- ------------------------------------------------------------------------------------
-- Transcrita de 20260930000001 con un añadido escrito campo por campo: `observaciones`.
-- Solo el texto que el admin escribió para el cliente; la descripción del mecánico es
-- interna y nunca sale.
CREATE OR REPLACE FUNCTION public.datos_portal(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace orden_enlaces;
  v_orden  ordenes_trabajo;
  v_taller JSONB;
  v_pagado NUMERIC;
  v_montos orden_montos;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado_enlace', 'no_encontrado');
  END IF;

  SELECT * INTO v_enlace FROM orden_enlaces WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado_enlace', 'no_encontrado');
  END IF;

  SELECT jsonb_build_object(
    'nombre', s.nombre,
    'direccion', s.direccion,
    'telefono', s.telefono,
    'email', NULLIF(btrim(s.email_contacto), ''),
    'whatsapp', NULLIF(btrim(s.whatsapp), ''),
    'logo_url', s.logo_url,
    'color', s.color_tema
  ) INTO v_taller
  FROM sedes s WHERE s.id = v_enlace.sede_id;

  IF v_enlace.revocado_en IS NOT NULL THEN
    RETURN jsonb_build_object('estado_enlace', 'revocado', 'taller', v_taller);
  END IF;
  IF v_enlace.expira_en IS NOT NULL AND v_enlace.expira_en <= NOW() THEN
    RETURN jsonb_build_object('estado_enlace', 'vencido', 'taller', v_taller);
  END IF;

  UPDATE orden_enlaces
  SET accesos = accesos + 1, ultimo_acceso_en = NOW()
  WHERE id = v_enlace.id;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = v_enlace.orden_id;
  SELECT * INTO v_montos FROM orden_montos WHERE orden_id = v_orden.id;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
  INTO v_pagado
  FROM finanzas_movimientos
  WHERE referencia_orden_id = v_orden.id AND categoria = 'pago_cliente';

  RETURN jsonb_build_object(
    'estado_enlace', 'ok',
    'taller', v_taller,
    'enlace', jsonb_build_object('expira_en', v_enlace.expira_en),
    'orden', jsonb_build_object(
      'numero', v_orden.numero_orden,
      'estatus', v_orden.estatus,
      'tipo_trabajo', v_orden.tipo_trabajo,
      'porcentaje_avance', v_orden.porcentaje_avance,
      'fecha_ingreso', v_orden.fecha_ingreso,
      'fecha_estimada_entrega', v_orden.fecha_estimada_entrega,
      'fecha_finalizacion', v_orden.fecha_finalizacion,
      'millas_ingreso', v_orden.millas_ingreso,
      'nivel_gasolina', v_orden.nivel_gasolina,
      'notas_recepcion', v_orden.inspeccion_360_notas,
      'firma_ruta', v_orden.firma_ruta,
      'firma_fecha', v_orden.firma_fecha
    ),
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre,
        'tiene_correo', public.es_correo_valido(c.email),
        'acepta_correos', c.acepta_correos
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
    'vehiculo', (
      SELECT jsonb_build_object(
        'marca', v.marca,
        'modelo', v.modelo,
        'anio', v.anio,
        'color', v.color,
        'placa', v.placa,
        'vin_final', right(v.vin, 6)
      )
      FROM vehiculos v WHERE v.id = v_orden.vehiculo_id
    ),
    'multimedia', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'tipo', m.tipo,
          'origen', m.origen,
          'avance_id', m.avance_id,
          'zona', m.zona,
          'ruta', m.ruta,
          'ruta_miniatura', m.ruta_miniatura,
          'mime', m.mime,
          'duracion_seg', m.duracion_seg,
          'ancho', m.ancho,
          'alto', m.alto,
          'creado_en', m.creado_en
        ) ORDER BY m.creado_en
      )
      FROM orden_media m
      WHERE m.orden_id = v_orden.id AND m.visible_cliente
    ), '[]'::jsonb),
    -- Los avances que el técnico decidió mostrar. Sin autor, y solo si tienen algo que
    -- contar: un avance publicado sin texto ni archivos visibles sería una tarjeta en blanco.
    'avances', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'fecha', a.creado_en,
        'mensaje', NULLIF(btrim(a.descripcion), '')
      ) ORDER BY a.creado_en DESC)
      FROM orden_avances a
      WHERE a.orden_id = v_orden.id
        AND a.visible_cliente
        AND (
          NULLIF(btrim(a.descripcion), '') IS NOT NULL
          OR EXISTS (SELECT 1 FROM orden_media m WHERE m.avance_id = a.id AND m.visible_cliente)
        )
    ), '[]'::jsonb),
    -- F6: lo que el taller vio y el cliente no tiene que autorizar ahora ("las llantas
    -- traseras están a la mitad"). Solo el texto del admin, nunca el del mecánico.
    'observaciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id,
        'fecha', h.resuelto_en,
        'texto', btrim(h.texto_cliente)
      ) ORDER BY h.resuelto_en, h.id)
      FROM orden_hallazgos h
      WHERE h.orden_id = v_orden.id
        AND h.estado = 'descartado'
        AND h.en_reporte
        AND NULLIF(btrim(h.texto_cliente), '') IS NOT NULL
    ), '[]'::jsonb),
    -- El presupuesto que espera su respuesta. Los ids de las líneas viajan porque el
    -- cliente responde línea por línea.
    'presupuesto', (
      SELECT jsonb_build_object(
        'id', p.id,
        'numero', p.numero,
        'enviado_en', p.creado_en,
        'total', p.total_propuesto,
        'lineas', COALESCE((
          SELECT jsonb_agg(l.linea ORDER BY l.creado_en, l.descripcion)
          FROM (
            SELECT lb.creado_en, lb.descripcion, jsonb_build_object(
              'id', lb.id, 'tipo', 'mano_obra', 'descripcion', lb.descripcion,
              'cantidad', 1, 'precio_unitario', lb.costo, 'monto', lb.costo
            ) AS linea
            FROM orden_labor lb WHERE lb.presupuesto_id = p.id AND lb.estado = 'pendiente'
            UNION ALL
            SELECT r.creado_en, r.descripcion, jsonb_build_object(
              'id', r.id, 'tipo', 'repuesto', 'descripcion', r.descripcion,
              'cantidad', r.cantidad, 'precio_unitario', r.precio_venta_unitario, 'monto', r.subtotal
            )
            FROM orden_repuestos r WHERE r.presupuesto_id = p.id AND r.estado = 'pendiente'
          ) l
        ), '[]'::jsonb)
      )
      FROM presupuestos p
      WHERE p.orden_id = v_orden.id AND p.estado = 'enviado'
    ),
    -- Constancia de lo que ya respondió (o firmó).
    'presupuestos_respondidos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', p.numero,
        'respondido_en', p.respondido_en,
        'via', p.respondido_via,
        'nombre', p.respondido_por_nombre,
        'total_aprobado', p.total_aprobado,
        'autorizados', (SELECT COUNT(*) FROM orden_labor WHERE presupuesto_id = p.id AND estado = 'aprobado')
                     + (SELECT COUNT(*) FROM orden_repuestos WHERE presupuesto_id = p.id AND estado = 'aprobado'),
        'rechazados', (SELECT COUNT(*) FROM orden_labor WHERE presupuesto_id = p.id AND estado = 'rechazado')
                    + (SELECT COUNT(*) FROM orden_repuestos WHERE presupuesto_id = p.id AND estado = 'rechazado')
      ) ORDER BY p.numero DESC)
      FROM presupuestos p
      WHERE p.orden_id = v_orden.id AND p.estado = 'respondido'
    ), '[]'::jsonb),
    -- Lo que se cobra: solo lo aprobado, a precio de venta.
    'cuenta', jsonb_build_object(
      'mano_obra', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('descripcion', l.descripcion, 'monto', l.costo) ORDER BY l.creado_en, l.descripcion)
        FROM orden_labor l WHERE l.orden_id = v_orden.id AND l.estado = 'aprobado'
      ), '[]'::jsonb),
      'repuestos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'descripcion', r.descripcion,
          'cantidad', r.cantidad,
          'precio_unitario', r.precio_venta_unitario,
          'subtotal', r.subtotal
        ) ORDER BY r.creado_en, r.descripcion)
        FROM orden_repuestos r WHERE r.orden_id = v_orden.id AND r.estado = 'aprobado'
      ), '[]'::jsonb),
      'no_autorizados', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('descripcion', x.descripcion, 'monto', x.monto) ORDER BY x.creado_en)
        FROM (
          SELECT descripcion, costo AS monto, creado_en FROM orden_labor WHERE orden_id = v_orden.id AND estado = 'rechazado'
          UNION ALL
          SELECT descripcion, subtotal, creado_en FROM orden_repuestos WHERE orden_id = v_orden.id AND estado = 'rechazado'
        ) x
      ), '[]'::jsonb),
      'total_mano_obra', v_orden.total_labor,
      'total_repuestos', COALESCE(v_montos.total_repuestos, 0),
      'total', COALESCE(v_montos.total_general, 0),
      'deposito', COALESCE(v_montos.deposito_inicial, 0),
      'pagado', v_pagado,
      'saldo', GREATEST(COALESCE(v_montos.total_general, 0) - v_pagado, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.datos_portal(TEXT) FROM PUBLIC, anon, authenticated;
