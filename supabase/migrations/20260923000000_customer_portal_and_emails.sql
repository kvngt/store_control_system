-- ====================================================================================
-- RESTORIFY — Fase 4: enlace del cliente, portal web y correos automáticos
-- ====================================================================================
-- El cliente no tiene cuenta. Cada orden tiene un enlace personal
-- (reinventa.shop/r/<token>) que abre un reporte web con el estado del vehículo,
-- la recepción que firmó, los avances que el taller decidió mostrarle y su cuenta.
-- Los correos no llevan datos: avisan que hay algo nuevo y llevan ese enlace.
--
-- Piezas:
--   orden_enlaces ............ un token activo por orden. Solo admin lo lee.
--   datos_portal() ........... lo único que ve el cliente, armado campo por campo.
--                              Solo la edge function `portal` puede llamarla.
--   encolar_correo_cliente() . pone un correo en cola_envios (ya existía para push).
--   trg_order_portal ......... firma → enlace + correo de recepción;
--                              cambio de estatus → correo con espera de 3 minutos.
--   datos_correo() ........... lo que `process-outbox` necesita para redactarlo.
--
-- Qué NUNCA sale hacia el cliente: comisiones, técnicos, notas de los avances,
-- archivos internos, costos del taller, datos de otras órdenes.
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. Datos de contacto y preferencia de correo
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_correo_valido(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_email IS NOT NULL AND btrim(p_email) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
$$;

REVOKE ALL ON FUNCTION public.es_correo_valido(TEXT) FROM PUBLIC, anon, authenticated;

-- El cliente decide desde su enlace si quiere correos. Por defecto sí: dejó su
-- correo en el taller para eso.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS acepta_correos BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS correos_baja_en TIMESTAMP WITH TIME ZONE;

-- NOT VALID: se exige en lo nuevo y lo editado, sin bloquear la migración por un
-- correo mal escrito que ya exista en otro entorno. Vacío sigue siendo válido.
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_email_formato;
ALTER TABLE clientes ADD CONSTRAINT clientes_email_formato
  CHECK (email IS NULL OR btrim(email) = '' OR btrim(email) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  NOT VALID;

-- Hacia dónde responde el cliente (Reply-To) y el botón de WhatsApp del portal.
ALTER TABLE sedes ADD COLUMN IF NOT EXISTS email_contacto TEXT;
ALTER TABLE sedes ADD COLUMN IF NOT EXISTS whatsapp TEXT;

ALTER TABLE sedes DROP CONSTRAINT IF EXISTS sedes_email_contacto_formato;
ALTER TABLE sedes ADD CONSTRAINT sedes_email_contacto_formato
  CHECK (email_contacto IS NULL OR btrim(email_contacto) = '' OR btrim(email_contacto) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  NOT VALID;


-- ------------------------------------------------------------------------------------
-- 2. El enlace
-- ------------------------------------------------------------------------------------
-- El token se guarda tal cual (no un hash) porque el admin tiene que poder volver a
-- copiarlo y mandarlo por WhatsApp. Lo protege RLS: solo admin lee la tabla, y el
-- portal lo busca con la llave de servicio.
CREATE TABLE IF NOT EXISTS orden_enlaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id          UUID NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  sede_id           UUID NOT NULL REFERENCES sedes(id) ON DELETE CASCADE,
  -- 64 hexadecimales de dos gen_random_uuid(): 244 bits aleatorios de
  -- pg_strong_random. Imposible de adivinar, sin depender de pgcrypto.
  token             TEXT NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{64}$'),
  creado_en         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  creado_por        UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  -- Null mientras la orden no se entrega; al entregar, 90 días.
  expira_en         TIMESTAMP WITH TIME ZONE,
  revocado_en       TIMESTAMP WITH TIME ZONE,
  ultimo_acceso_en  TIMESTAMP WITH TIME ZONE,
  accesos           INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orden_enlaces_activo
  ON orden_enlaces (orden_id) WHERE revocado_en IS NULL;

ALTER TABLE orden_enlaces ENABLE ROW LEVEL SECURITY;

-- Solo lectura para admin. Nadie escribe desde la API: crear, regenerar y revocar
-- son funciones que verifican el rol.
DROP POLICY IF EXISTS "orden_enlaces_admin_select" ON orden_enlaces;
CREATE POLICY "orden_enlaces_admin_select" ON orden_enlaces FOR SELECT
  USING (public.is_admin());

-- El enlace activo de una orden; si no hay (o venció), uno nuevo.
CREATE OR REPLACE FUNCTION public.asegurar_enlace_orden(p_orden_id UUID)
RETURNS orden_enlaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.asegurar_enlace_orden(UUID) FROM PUBLIC, anon, authenticated;

-- Lo que usa la tarjeta "Enlace del cliente". Solo admin: el enlace abre precios
-- y totales, que un técnico no ve.
CREATE OR REPLACE FUNCTION public.crear_enlace_cliente(p_orden_id UUID)
RETURNS orden_enlaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede compartir el enlace del cliente.' USING ERRCODE = '42501';
  END IF;
  RETURN public.asegurar_enlace_orden(p_orden_id);
END;
$$;

-- Para cuando el enlace llegó a quien no debía: el anterior deja de abrir.
CREATE OR REPLACE FUNCTION public.regenerar_enlace_cliente(p_orden_id UUID)
RETURNS orden_enlaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el enlace del cliente.' USING ERRCODE = '42501';
  END IF;
  UPDATE orden_enlaces SET revocado_en = NOW() WHERE orden_id = p_orden_id AND revocado_en IS NULL;
  RETURN public.asegurar_enlace_orden(p_orden_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.revocar_enlace_cliente(p_orden_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede desactivar el enlace del cliente.' USING ERRCODE = '42501';
  END IF;
  UPDATE orden_enlaces SET revocado_en = NOW() WHERE orden_id = p_orden_id AND revocado_en IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_enlace_cliente(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.regenerar_enlace_cliente(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revocar_enlace_cliente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_enlace_cliente(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerar_enlace_cliente(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revocar_enlace_cliente(UUID) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 3. Encolar un correo al cliente
-- ------------------------------------------------------------------------------------
-- Devuelve el id encolado, o null si el cliente no tiene un correo válido o pidió
-- no recibir correos. La dirección se vuelve a leer al enviar: si alguien corrige
-- un correo mal escrito, el aviso pendiente llega a la dirección corregida.
--
-- `p_clave_dedupe` colapsa avisos mientras siguen pendientes: un segundo cambio de
-- estatus dentro de la espera reemplaza al primero y reinicia la espera.
CREATE OR REPLACE FUNCTION public.encolar_correo_cliente(
  p_orden_id     UUID,
  p_plantilla    TEXT,
  p_datos        JSONB DEFAULT '{}'::jsonb,
  p_clave_dedupe TEXT DEFAULT NULL,
  p_espera       INTERVAL DEFAULT INTERVAL '0 seconds'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  PERFORM public.asegurar_enlace_orden(p_orden_id);

  INSERT INTO cola_envios (canal, destinatario, plantilla, datos, orden_id, enviar_despues_de, clave_dedupe)
  VALUES ('email', lower(v_email), p_plantilla, COALESCE(p_datos, '{}'::jsonb), p_orden_id, NOW() + p_espera, p_clave_dedupe)
  ON CONFLICT (clave_dedupe) WHERE clave_dedupe IS NOT NULL AND estado = 'pendiente'
  DO UPDATE SET
    datos = EXCLUDED.datos,
    destinatario = EXCLUDED.destinatario,
    enviar_despues_de = EXCLUDED.enviar_despues_de
  RETURNING id INTO v_id;

  -- Sin espera, al instante. Con espera, lo toma el cron de cada minuto.
  IF p_espera <= INTERVAL '0 seconds' THEN
    PERFORM public.invoke_edge_function('process-outbox');
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.encolar_correo_cliente(UUID, TEXT, JSONB, TEXT, INTERVAL) FROM PUBLIC, anon, authenticated;

-- "Avisar al cliente": el admin publicó fotos o videos de un avance y quiere que el
-- cliente se entere. Un minuto de espera con clave única: dos toques seguidos son
-- un solo correo.
CREATE OR REPLACE FUNCTION public.notificar_cliente_avance(p_orden_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede avisar al cliente.' USING ERRCODE = '42501';
  END IF;

  v_id := public.encolar_correo_cliente(p_orden_id, 'avance', '{}'::jsonb, 'avance:' || p_orden_id, INTERVAL '1 minute');
  RETURN CASE WHEN v_id IS NULL THEN 'sin_correo' ELSE 'encolado' END;
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_cliente_avance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificar_cliente_avance(UUID) TO authenticated;

-- El historial "Correos al cliente" de la orden. Solo los de canal email: las filas
-- de push llevan ids de personas del equipo.
DROP POLICY IF EXISTS "cola_envios_admin_select_email" ON cola_envios;
CREATE POLICY "cola_envios_admin_select_email" ON cola_envios FOR SELECT
  USING (canal = 'email' AND public.is_admin());


-- ------------------------------------------------------------------------------------
-- 4. Lo que dispara correos y mueve el vencimiento del enlace
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_portal_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    -- La firma de recepción: nace el enlace y, si hay correo, el aviso de ingreso.
    -- Dos minutos de espera para que terminen de subir las fotos que el cliente
    -- verá al abrirlo. Solo una vez por orden: volver a firmar no lo reenvía.
    IF NEW.firma_ruta IS NOT NULL AND OLD.firma_ruta IS NULL THEN
      PERFORM public.asegurar_enlace_orden(NEW.id);
      IF NOT EXISTS (
        SELECT 1 FROM cola_envios
        WHERE orden_id = NEW.id AND canal = 'email' AND plantilla = 'recepcion'
          AND estado IN ('pendiente', 'procesando', 'enviado')
      ) THEN
        PERFORM public.encolar_correo_cliente(NEW.id, 'recepcion', '{}'::jsonb, 'recepcion:' || NEW.id, INTERVAL '2 minutes');
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
      IF NEW.estatus IN ('en_proceso', 'espera_repuestos', 'finalizado', 'entregado') THEN
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

DROP TRIGGER IF EXISTS trg_order_portal ON ordenes_trabajo;
CREATE TRIGGER trg_order_portal
  AFTER UPDATE OF firma_ruta, estatus ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_portal_on_order_change();


-- ------------------------------------------------------------------------------------
-- 5. El portal: lo que ve el cliente
-- ------------------------------------------------------------------------------------
-- Armado campo por campo, nunca `to_jsonb(fila)`: una columna nueva en una tabla no
-- debe aparecer sola en una página pública.
--
-- Las rutas de archivos salen tal cual; la edge function las cambia por URLs
-- firmadas de 2 horas antes de responder.
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

  -- Un enlace que ya no abre igual dice de qué taller es: el cliente necesita saber
  -- a quién llamar.
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

  -- Lo cobrado con signo, igual que el resto del sistema: un reembolso o una
  -- reversión de entrega restan.
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
        -- Los últimos 6 bastan para reconocer el vehículo.
        'vin_final', right(v.vin, 6)
      )
      FROM vehiculos v WHERE v.id = v_orden.vehiculo_id
    ),
    -- Solo lo que un admin marcó visible. Sin autor ni texto del avance: las notas
    -- del técnico son internas.
    'multimedia', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'tipo', m.tipo,
          'origen', m.origen,
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
    -- Precios de venta, nunca el costo del taller. (Fase 5: solo líneas aprobadas.)
    'cuenta', jsonb_build_object(
      'mano_obra', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('descripcion', l.descripcion, 'monto', l.costo) ORDER BY l.descripcion)
        FROM orden_labor l WHERE l.orden_id = v_orden.id
      ), '[]'::jsonb),
      'repuestos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'descripcion', r.descripcion,
          'cantidad', r.cantidad,
          'precio_unitario', r.precio_venta_unitario,
          'subtotal', r.subtotal
        ) ORDER BY r.descripcion)
        FROM orden_repuestos r WHERE r.orden_id = v_orden.id
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
GRANT EXECUTE ON FUNCTION public.datos_portal(TEXT) TO service_role;

-- El cliente acepta o deja de recibir correos desde su enlace. Con un botón en la
-- página (POST), nunca con un enlace directo en el correo: los filtros de correo
-- abren los enlaces y darían de baja a todos.
CREATE OR REPLACE FUNCTION public.preferencia_correos_portal(p_token TEXT, p_acepta BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace  orden_enlaces;
  v_cliente UUID;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_acepta IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  -- Vale con un enlace vencido: darse de baja no debería depender de eso.
  SELECT * INTO v_enlace FROM orden_enlaces WHERE token = p_token AND revocado_en IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT cliente_id INTO v_cliente FROM ordenes_trabajo WHERE id = v_enlace.orden_id;

  UPDATE clientes
  SET acepta_correos = p_acepta,
      correos_baja_en = CASE WHEN p_acepta THEN NULL ELSE NOW() END
  WHERE id = v_cliente;

  IF NOT p_acepta THEN
    UPDATE cola_envios
    SET estado = 'omitido', ultimo_error = 'El cliente pidió no recibir correos.'
    WHERE canal = 'email' AND estado = 'pendiente'
      AND orden_id IN (SELECT id FROM ordenes_trabajo WHERE cliente_id = v_cliente);
  END IF;

  RETURN jsonb_build_object('ok', true, 'acepta_correos', p_acepta);
END;
$$;

REVOKE ALL ON FUNCTION public.preferencia_correos_portal(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preferencia_correos_portal(TEXT, BOOLEAN) TO service_role;


-- ------------------------------------------------------------------------------------
-- 6. Lo que `process-outbox` necesita para redactar un correo
-- ------------------------------------------------------------------------------------
-- Se lee al enviar, no al encolar: el nombre del taller, el correo del cliente o el
-- estatus pueden haber cambiado mientras el aviso esperaba.
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
      'estatus', v_orden.estatus,
      'fecha_ingreso', v_orden.fecha_ingreso,
      'fecha_estimada_entrega', v_orden.fecha_estimada_entrega
    ),
    'vehiculo', (
      SELECT btrim(concat_ws(' ', v.anio::text, v.marca, v.modelo))
      FROM vehiculos v WHERE v.id = v_orden.vehiculo_id
    ),
    -- Para no anunciar dos veces el mismo estado (en proceso → espera → en proceso).
    'ultimo_estatus_enviado', (
      SELECT datos->>'estatus_enviado'
      FROM cola_envios
      WHERE orden_id = v_orden.id AND canal = 'email' AND plantilla = 'estatus' AND estado = 'enviado'
      ORDER BY enviado_en DESC NULLS LAST
      LIMIT 1
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.datos_correo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_correo(UUID) TO service_role;

-- Marca qué estado se anunció de verdad. `datos` es de la fila y solo lo toca el
-- procesador; finish_outbox no lo modifica.
CREATE OR REPLACE FUNCTION public.marcar_estatus_enviado(p_cola_id UUID, p_estatus TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE cola_envios
  SET datos = datos || jsonb_build_object('estatus_enviado', p_estatus)
  WHERE id = p_cola_id;
$$;

REVOKE ALL ON FUNCTION public.marcar_estatus_enviado(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_estatus_enviado(UUID, TEXT) TO service_role;
