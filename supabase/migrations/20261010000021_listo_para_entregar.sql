-- ------------------------------------------------------------------------------------
-- "Listo para entregar": lo confirma administración, y solo entonces se avisa al cliente
-- ------------------------------------------------------------------------------------
-- Pedido del taller (05/10/2026):
--   * Un técnico que finaliza una orden NO puede devolverla a "En proceso": solo administración
--     la reabre. Tampoco por la puerta de atrás de `reportar_hallazgo` (pausa → vuelve a
--     "En proceso").
--   * Que el técnico finalice NO es "vehículo listo": administración lo revisa y marca "Listo
--     para entregar" (`marcar_lista_para_entregar`). Hasta ese momento el cliente no recibe
--     correo y su enlace dice "En revisión final".
-- Es una marca sobre el estado Finalizado (`lista_para_entregar_en`), no un estado nuevo. Se
-- borra sola si la orden deja de estar finalizada o entregada. El `process-outbox` no cambia:
-- `datos_correo` entrega al correo el "estatus del cliente" (finalizado sin marca = en proceso).
-- Todas las funciones se reescriben enteras desde su versión vigente.
-- ------------------------------------------------------------------------------------

ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS lista_para_entregar_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lista_para_entregar_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL;

-- Lo que el cliente debe ver: finalizado sin confirmar todavía es "en proceso".
CREATE OR REPLACE FUNCTION public._estatus_cliente(p_estatus order_status, p_lista TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_estatus = 'finalizado' AND p_lista IS NULL THEN 'en_proceso' ELSE p_estatus::text END;
$$;
REVOKE ALL ON FUNCTION public._estatus_cliente(order_status, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- La marca la escribe solo `marcar_lista_para_entregar`; si la orden ya no está finalizada ni
-- entregada, se borra.
CREATE OR REPLACE FUNCTION public.trg_guard_lista_para_entregar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.lista_para_entregar_en := NULL;
    NEW.lista_para_entregar_por := NULL;
    RETURN NEW;
  END IF;

  IF NEW.estatus NOT IN ('finalizado', 'entregado') THEN
    NEW.lista_para_entregar_en := NULL;
    NEW.lista_para_entregar_por := NULL;
  ELSIF (NEW.lista_para_entregar_en IS DISTINCT FROM OLD.lista_para_entregar_en
         OR NEW.lista_para_entregar_por IS DISTINCT FROM OLD.lista_para_entregar_por)
        AND COALESCE(current_setting('restorify.lista', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Una orden queda lista para entregar solo con "Marcar listo para entregar".'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_guard_lista_para_entregar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_lista_guard ON public.ordenes_trabajo;
CREATE TRIGGER trg_order_lista_guard
  BEFORE INSERT OR UPDATE ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_lista_para_entregar();

-- Desde 20261006000000. Cambia: un técnico no saca una orden de Finalizado.
CREATE OR REPLACE FUNCTION public.trg_guard_order_technician()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Lo único que un técnico cambia desde la app: estado (con su fecha de
  -- finalización y, si pide autorización, su motivo) y porcentaje de avance.
  -- total_labor lo vigila trg_guard_order_money, que deja pasar el recálculo del sistema.
  -- La firma ya no está: la toma administración (20261006000000).
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'fecha_finalizacion', 'porcentaje_avance',
    'total_labor', 'motivo_autorizacion'
  ];
  -- Los estados a los que el taller mueve una orden por su cuenta. `recepcion` no
  -- está: se sale de ahí, no se vuelve. `entregado` tampoco, y además lo para
  -- trg_guard_order_money.
  v_estados_tecnico CONSTANT order_status[] := ARRAY[
    'en_proceso', 'espera_autorizacion', 'finalizado'
  ]::order_status[];
BEGIN
  -- Normalización, antes de la salida del admin porque vale para todos: un motivo en
  -- blanco es no tener motivo, y el motivo solo significa algo mientras la orden espera
  -- autorización. Dejarlo puesto después mostraría un banner que ya no es cierto.
  NEW.motivo_autorizacion := NULLIF(btrim(left(COALESCE(NEW.motivo_autorizacion, ''), 1000)), '');
  IF NEW.estatus IS DISTINCT FROM 'espera_autorizacion' THEN
    NEW.motivo_autorizacion := NULL;
  END IF;

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
    RAISE EXCEPTION 'Solo el personal asignado puede modificar esta orden. Pide a administración que te asigne.'
      USING ERRCODE = '42501';
  END IF;

  -- Una orden finalizada solo la reabre administración (pedido del taller, 05/10/2026).
  IF OLD.estatus = 'finalizado' AND NEW.estatus IS DISTINCT FROM OLD.estatus THEN
    RAISE EXCEPTION 'La orden ya está finalizada. Solo un administrador puede reabrirla.'
      USING ERRCODE = '42501';
  END IF;

  -- A dónde puede llevarla.
  IF NEW.estatus IS DISTINCT FROM OLD.estatus
     AND NOT (NEW.estatus = ANY (v_estados_tecnico)) THEN
    IF NEW.estatus = 'recepcion' THEN
      RAISE EXCEPTION 'Solo un administrador puede devolver una orden a Recepción.'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Solo un administrador puede poner la orden en ese estado.'
      USING ERRCODE = '42501';
  END IF;

  -- Pedir autorización sin decir por qué deja al admin adivinando qué cotizar.
  IF NEW.estatus = 'espera_autorizacion' AND NEW.motivo_autorizacion IS NULL THEN
    RAISE EXCEPTION 'Escribe por qué la orden necesita autorización.'
      USING ERRCODE = '42501';
  END IF;

  -- La primera firma aprueba lo cotizado y cualquier cambio rehace el respaldo de lo que
  -- el cliente aceptó. La comparación de abajo ya lo rechazaría; esto es para que el
  -- mensaje diga de qué se trata.
  IF NEW.firma_ruta IS DISTINCT FROM OLD.firma_ruta
     OR NEW.firma_fecha IS DISTINCT FROM OLD.firma_fecha THEN
    RAISE EXCEPTION 'La firma del cliente la toma administración en la recepción.'
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

-- Desde 20261010000011. Cambia: un técnico no reporta trabajo adicional en una orden finalizada.
CREATE OR REPLACE FUNCTION public.reportar_hallazgo(p_orden_id UUID, p_descripcion TEXT)
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
  -- Pausar una orden finalizada sería reabrirla por la puerta de atrás.
  IF v_orden.estatus = 'finalizado' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'La orden ya está finalizada. Solo un administrador puede reabrirla.'
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

-- Administración confirma que el vehículo está listo: queda la marca y se le avisa al cliente.
CREATE OR REPLACE FUNCTION public.marcar_lista_para_entregar(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden ordenes_trabajo;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede marcar una orden lista para entregar.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estatus <> 'finalizado' THEN
    RAISE EXCEPTION 'Solo una orden finalizada se marca lista para entregar.' USING ERRCODE = '22023';
  END IF;
  -- Marcarla dos veces no avisa dos veces.
  IF v_orden.lista_para_entregar_en IS NOT NULL THEN
    RETURN jsonb_build_object('lista_para_entregar_en', v_orden.lista_para_entregar_en, 'ya_estaba', true);
  END IF;

  PERFORM set_config('restorify.lista', 'on', true);
  UPDATE ordenes_trabajo
  SET lista_para_entregar_en = NOW(), lista_para_entregar_por = auth.uid()
  WHERE id = p_orden_id
  RETURNING lista_para_entregar_en INTO v_orden.lista_para_entregar_en;
  PERFORM set_config('restorify.lista', 'off', true);

  -- El correo "Su vehículo está listo": al momento (el taller ya lo revisó).
  BEGIN
    PERFORM public.encolar_correo_cliente(
      p_orden_id, 'estatus', jsonb_build_object('estatus', 'finalizado'), 'estatus:' || p_orden_id, INTERVAL '0 seconds'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'marcar_lista_para_entregar (correo): %', SQLERRM;
  END;

  RETURN jsonb_build_object('lista_para_entregar_en', v_orden.lista_para_entregar_en, 'ya_estaba', false);
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_lista_para_entregar(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_lista_para_entregar(UUID) TO authenticated;

-- Desde 20261010000011. Cambia: finalizar ya no avisa al cliente.
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

      -- 'finalizado' ya no encola: que el técnico finalice no es "listo para entregar". El correo
      -- de "listo" lo encola `marcar_lista_para_entregar`.
      -- Tres minutos de espera: quien mueve una orden de un lado a otro en el
      -- tablero no le manda tres correos al cliente. Qué estado se anuncia se
      -- decide al enviar, con el estatus de ese momento (ver datos_correo).
      IF NEW.estatus IN ('en_proceso', 'entregado')
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

-- Desde 20260924000000. Cambia: el correo recibe el estatus del cliente (finalizado sin confirmar = en proceso).
CREATE OR REPLACE FUNCTION public.datos_correo(p_cola_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job    cola_envios;
  v_orden  ordenes_trabajo;
  v_enlace orden_enlaces;
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

  RETURN jsonb_build_object(
    'token', v_enlace.token,
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre,
        'email', lower(btrim(c.email)),
        'email_valido', public.es_correo_valido(c.email),
        'acepta_correos', c.acepta_correos
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
    'taller', (
      SELECT jsonb_build_object(
        'nombre', s.nombre,
        'direccion', s.direccion,
        'telefono', s.telefono,
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
$$;
REVOKE ALL ON FUNCTION public.datos_correo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_correo(UUID) TO service_role;

-- Desde 20261010000018. Cambia: `orden.lista_para_entregar` (el portal decide "En revisión final" o "Listo para recoger").
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
  WHERE referencia_orden_id = v_orden.id AND categoria = 'pago_cliente' AND importacion_id IS NULL;

  RETURN jsonb_build_object(
    'estado_enlace', 'ok',
    'taller', v_taller,
    'enlace', jsonb_build_object('expira_en', v_enlace.expira_en),
    'orden', jsonb_build_object(
      'numero', v_orden.numero_orden,
      'estatus', v_orden.estatus,
      'retirada_sin_reparar', v_orden.retirada_sin_reparar,
      'lista_para_entregar', v_orden.lista_para_entregar_en IS NOT NULL,
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
    -- Las piezas que el taller pidió y no han llegado: por qué la orden no avanza. Solo el
    -- nombre, sin precio ni proveedor.
    'esperando_repuestos', CASE WHEN v_orden.estatus = 'entregado' THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('descripcion', r.descripcion, 'desde', r.pedido_en) ORDER BY r.pedido_en, r.descripcion)
      FROM orden_repuestos r
      WHERE r.orden_id = v_orden.id AND r.estado_pedido = 'pedido' AND r.estado <> 'rechazado'
    ), '[]'::jsonb) END,
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
    -- Lo que se cobra: solo lo aprobado, a precio de venta, menos el descuento.
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
      'subtotal', COALESCE(v_orden.total_labor, 0) + COALESCE(v_montos.total_repuestos, 0),
      'descuento', COALESCE(v_montos.descuento, 0),
      'total', COALESCE(v_montos.total_general, 0),
      'deposito', COALESCE(v_montos.deposito_inicial, 0),
      'pagado', v_pagado,
      'otros_pagos', round(v_pagado - COALESCE(v_montos.deposito_inicial, 0), 2),
      'saldo', round(COALESCE(v_montos.total_general, 0) - v_pagado, 2)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.datos_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_portal(TEXT) TO service_role;

-- Desde 20260920000000. Cambia: el aviso a administración dice que el trabajo terminó; falta revisarlo.
CREATE OR REPLACE FUNCTION public.trg_notify_order_finished()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d JSONB;
BEGIN
  BEGIN
    IF NEW.estatus = 'finalizado' AND OLD.estatus IS DISTINCT FROM 'finalizado' THEN
      d := public.datos_orden_aviso(NEW.id);
      PERFORM public.notificar(
        public.admins_de_sede(NEW.sede_id),
        'orden_finalizada',
        'Trabajo terminado · ' || NEW.numero_orden,
        concat_ws(' — ', NULLIF(d->>'vehiculo', ''), NULLIF(d->>'cliente', ''), 'revísala y márcala lista para entregar'),
        d,
        NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_order_finished: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_notify_order_finished() FROM PUBLIC, anon, authenticated;

-- Desde 20261010000012. Cambia: grupo `por_revisar` (finalizadas sin marcar).
CREATE OR REPLACE FUNCTION public.requiere_atencion(p_sede_id UUID DEFAULT NULL, p_hoy DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_hoy      DATE := COALESCE(p_hoy, CURRENT_DATE);
  v_grupos   JSONB;
  v_correos  INTEGER;
  v_vacio    CONSTANT JSONB := jsonb_build_object('total', 0, 'ordenes', '[]'::jsonb);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración ve lo que requiere atención.' USING ERRCODE = '42501';
  END IF;

  WITH abiertas AS (
    SELECT o.id, o.numero_orden, o.estatus, o.fecha_estimada_entrega, o.fecha_finalizacion, o.lista_para_entregar_en
    FROM ordenes_trabajo o
    WHERE o.estatus <> 'entregado'
      AND (p_sede_id IS NULL OR o.sede_id = p_sede_id)
  ),
  -- Una fila por orden y grupo: cuántas cosas tiene esa orden y desde cuándo espera.
  por_orden AS (
    SELECT 'hallazgos'::text AS grupo, a.id, a.numero_orden, MIN(h.creado_en) AS desde, COUNT(*)::int AS n
    FROM abiertas a
    JOIN orden_hallazgos h ON h.orden_id = a.id
    WHERE h.estado = 'pendiente' OR (h.estado = 'cotizado' AND h.presupuesto_id IS NULL)
    GROUP BY a.id, a.numero_orden

    UNION ALL
    SELECT 'presupuestos', a.id, a.numero_orden, MIN(p.creado_en), COUNT(*)::int
    FROM abiertas a
    JOIN presupuestos p ON p.orden_id = a.id
    WHERE p.estado = 'enviado'
    GROUP BY a.id, a.numero_orden

    UNION ALL
    SELECT 'sin_tecnico', a.id, a.numero_orden, MIN(l.creado_en), COUNT(*)::int
    FROM abiertas a
    JOIN orden_labor l ON l.orden_id = a.id
    WHERE l.asignado_a IS NULL
      AND NOT l.reparto_heredado
      AND l.estado <> 'rechazado'
    GROUP BY a.id, a.numero_orden

    UNION ALL
    -- El técnico terminó y administración todavía no lo marca listo para entregar.
    SELECT 'por_revisar', a.id, a.numero_orden, COALESCE(a.fecha_finalizacion, NOW()), 1
    FROM abiertas a
    WHERE a.estatus = 'finalizado' AND a.lista_para_entregar_en IS NULL

    UNION ALL
    SELECT 'vencidas', a.id, a.numero_orden, a.fecha_estimada_entrega::timestamptz, 1
    FROM abiertas a
    WHERE a.estatus <> 'finalizado'
      AND a.fecha_estimada_entrega < v_hoy
  ),
  ordenadas AS (
    SELECT po.*, row_number() OVER (PARTITION BY po.grupo ORDER BY po.desde, po.numero_orden) AS rk
    FROM por_orden po
  )
  SELECT jsonb_object_agg(
           x.grupo,
           jsonb_build_object('total', x.total, 'ordenes', x.ordenes)
         )
  INTO v_grupos
  FROM (
    SELECT grupo,
           SUM(n)::int AS total,
           COALESCE(
             jsonb_agg(jsonb_build_object('id', id, 'numero_orden', numero_orden) ORDER BY rk)
               FILTER (WHERE rk <= 5),
             '[]'::jsonb
           ) AS ordenes
    FROM ordenadas
    GROUP BY grupo
  ) x;

  SELECT COUNT(*)::int INTO v_correos
  FROM (
    SELECT DISTINCT COALESCE(c.clave_dedupe, c.id::text)
    FROM cola_envios c
    LEFT JOIN ordenes_trabajo o ON o.id = c.orden_id
    WHERE c.canal = 'email'
      AND c.estado = 'error'
      AND c.creado_en >= NOW() - INTERVAL '72 hours'
      AND (p_sede_id IS NULL OR o.sede_id = p_sede_id)
      AND (c.clave_dedupe IS NULL OR NOT EXISTS (
        SELECT 1 FROM cola_envios p
        WHERE p.clave_dedupe = c.clave_dedupe AND p.estado = 'pendiente'
      ))
  ) e;

  v_grupos := COALESCE(v_grupos, '{}'::jsonb);
  RETURN jsonb_build_object(
    'hallazgos',    COALESCE(v_grupos->'hallazgos', v_vacio),
    'presupuestos', COALESCE(v_grupos->'presupuestos', v_vacio),
    'sin_tecnico',  COALESCE(v_grupos->'sin_tecnico', v_vacio),
    'vencidas',     COALESCE(v_grupos->'vencidas', v_vacio),
    'por_revisar',  COALESCE(v_grupos->'por_revisar', v_vacio),
    'correos',      jsonb_build_object('total', v_correos)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.requiere_atencion(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requiere_atencion(UUID, DATE) TO authenticated;

-- Desde 20261010000018. Cambia: se registra la marca de listo para entregar (quién y cuándo).
CREATE OR REPLACE FUNCTION public.trg_historial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes   JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_despues JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_fila    JSONB := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
  v_accion  TEXT := CASE TG_OP WHEN 'INSERT' THEN 'crear' WHEN 'UPDATE' THEN 'cambiar' ELSE 'borrar' END;
  v_entidad TEXT;
  v_campos  TEXT[];
  v_orden   UUID;
  v_resumen TEXT;
  v_cambios JSONB;
  v_numero  TEXT;
  v_sede    UUID;
  v_actor   UUID := auth.uid();
  v_nombre  TEXT;
BEGIN
  BEGIN
    v_orden := COALESCE(v_fila ->> 'orden_id', v_fila ->> 'id')::uuid;

    CASE TG_TABLE_NAME
      WHEN 'ordenes_trabajo' THEN
        v_entidad := 'orden';
        v_orden := (v_fila ->> 'id')::uuid;
        v_resumen := v_fila ->> 'numero_orden';
        v_campos := ARRAY[
          'estatus', 'porcentaje_avance', 'tipo_trabajo', 'fecha_estimada_entrega',
          'millas_ingreso', 'nivel_gasolina', 'inspeccion_360_notas', 'cliente_id',
          'vehiculo_id', 'firma_fecha', 'motivo_autorizacion', 'archivada_en',
          'retirada_sin_reparar', 'lista_para_entregar_en'];
      WHEN 'orden_labor' THEN
        v_entidad := 'mano_obra';
        v_resumen := v_fila ->> 'descripcion';
        v_campos := ARRAY['descripcion', 'costo', 'especialidad', 'estado', 'completado_en', 'tecnico'];
        -- El técnico, por nombre: un uuid no le dice nada a quien lee el historial.
        IF v_antes IS NOT NULL THEN
          v_antes := v_antes || jsonb_build_object('tecnico',
            (SELECT nombre_completo FROM perfiles WHERE id = (v_antes ->> 'asignado_a')::uuid));
        END IF;
        IF v_despues IS NOT NULL THEN
          v_despues := v_despues || jsonb_build_object('tecnico',
            (SELECT nombre_completo FROM perfiles WHERE id = (v_despues ->> 'asignado_a')::uuid));
        END IF;
      WHEN 'orden_repuestos' THEN
        v_entidad := 'repuesto';
        v_resumen := v_fila ->> 'descripcion';
        v_campos := ARRAY['descripcion', 'cantidad', 'precio_venta_unitario', 'costo_unitario', 'estado', 'estado_pedido'];
      WHEN 'orden_asignaciones' THEN
        v_entidad := 'asignacion';
        SELECT nombre_completo INTO v_resumen FROM perfiles WHERE id = (v_fila ->> 'usuario_id')::uuid;
        -- `reparto`: si entra al reparto heredado (origen 'manual') o cobra solo sus tareas
        -- ('tarea'). Es dinero que decide administración, así que se registra.
        v_campos := ARRAY['tipo_tarea', 'reparto'];
        IF v_antes IS NOT NULL THEN
          v_antes := v_antes || jsonb_build_object('reparto', (v_antes ->> 'origen') = 'manual');
        END IF;
        IF v_despues IS NOT NULL THEN
          v_despues := v_despues || jsonb_build_object('reparto', (v_despues ->> 'origen') = 'manual');
        END IF;
      WHEN 'orden_montos' THEN
        -- Un cambio del depósito o un descuento: cada uno se lee como su propia acción.
        IF TG_OP = 'UPDATE'
           AND (v_antes ->> 'deposito_inicial') IS NOT DISTINCT FROM (v_despues ->> 'deposito_inicial') THEN
          v_entidad := 'descuento';
          v_campos := ARRAY['descuento', 'descuento_motivo'];
        ELSE
          v_entidad := 'deposito';
          v_campos := ARRAY['deposito_inicial'];
        END IF;
      WHEN 'presupuestos' THEN
        v_entidad := 'presupuesto';
        v_resumen := v_fila ->> 'numero';
        v_campos := ARRAY['estado', 'total_propuesto', 'total_aprobado', 'respondido_via', 'respondido_por_nombre'];
      WHEN 'orden_media' THEN
        v_entidad := 'archivo';
        v_resumen := concat_ws(' · ', v_fila ->> 'tipo', v_fila ->> 'origen', v_fila ->> 'zona');
        v_campos := ARRAY['tipo', 'origen', 'zona', 'visible_cliente'];
      WHEN 'orden_avances' THEN
        v_entidad := 'avance';
        v_resumen := left(v_fila ->> 'descripcion', 120);
        v_campos := ARRAY['descripcion', 'visible_cliente'];
      ELSE
        RETURN NULL;
    END CASE;

    v_cambios := CASE TG_OP
      WHEN 'UPDATE' THEN public._historial_diferencias(v_antes, v_despues, v_campos)
      WHEN 'INSERT' THEN public._historial_valores(v_despues, v_campos, 'despues')
      ELSE public._historial_valores(v_antes, v_campos, 'antes')
    END;

    -- Un UPDATE que no cambió nada de lo que se registra no deja fila.
    IF TG_OP = 'UPDATE' AND v_cambios = '{}'::jsonb THEN
      RETURN NULL;
    END IF;

    IF TG_TABLE_NAME = 'ordenes_trabajo' THEN
      v_numero := v_fila ->> 'numero_orden';
      v_sede := (v_fila ->> 'sede_id')::uuid;
    ELSE
      SELECT numero_orden, sede_id INTO v_numero, v_sede FROM ordenes_trabajo WHERE id = v_orden;
      -- La orden ya no existe: es una hija que se va en cascada con ella. Su borrado ya quedó
      -- registrado como el de la orden.
      IF NOT FOUND THEN
        RETURN NULL;
      END IF;
    END IF;

    IF v_actor IS NOT NULL THEN
      SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = v_actor;
    END IF;

    INSERT INTO historial_orden (
      orden_id, numero_orden, sede_id, actor_id, actor_nombre, origen,
      entidad, entidad_id, accion, resumen, cambios
    ) VALUES (
      v_orden, v_numero, v_sede, v_actor, v_nombre,
      CASE auth.role() WHEN 'authenticated' THEN 'app' WHEN 'service_role' THEN 'portal' ELSE 'sistema' END,
      v_entidad,
      CASE WHEN TG_TABLE_NAME = 'orden_montos' THEN v_orden ELSE (v_fila ->> 'id')::uuid END,
      v_accion, v_resumen, v_cambios
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'historial_orden (%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_historial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_historial ON public.ordenes_trabajo;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF
    estatus, porcentaje_avance, tipo_trabajo, fecha_estimada_entrega, millas_ingreso,
    nivel_gasolina, inspeccion_360_notas, cliente_id, vehiculo_id, firma_fecha,
    motivo_autorizacion, archivada_en, retirada_sin_reparar, lista_para_entregar_en
  ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();
