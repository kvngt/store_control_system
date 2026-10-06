-- ====================================================================================
-- Pedidos del taller del 06/10/2026 (revisión desde el teléfono)
-- ====================================================================================
-- 1. **La firma de recepción ya no autoriza el presupuesto.** Firmar es estar de acuerdo con
--    cómo se recibió el vehículo (millas, gasolina, fotos). Hasta ahora la primera firma pasaba
--    a "aprobado" todo lo cotizado (`trg_quote_on_signature`, 20260924/20260926). Desde aquí lo
--    cotizado se autoriza solo con un presupuesto (`enviar_presupuesto` + la respuesta del
--    cliente) o con "Registrar autorización" (`registrar_autorizacion`). Lo que ya se aprobó
--    con una firma anterior se queda como está.
-- 2. **"Requiere atención" cuenta lo que falta autorizar** (grupo `por_autorizar`): órdenes
--    abiertas con líneas en borrador y sin un presupuesto enviado. Sin la firma, es el paso
--    que la oficina tiene que dar en cada orden nueva.
-- 3. **El técnico se entera cuando el cliente no autoriza.** `_resolver_presupuesto` solo
--    avisaba a los asignados si algo se aprobaba; si el cliente rechazaba todo, el mecánico no
--    sabía nada y seguía viendo la tarea "esperando autorización".
-- 4. **Idioma del cliente** (`clientes.idioma`, 'en' por defecto): los correos salen en inglés
--    salvo que el cliente elija español en su enlace (`preferencia_idioma_portal`). El portal y
--    `process-outbox` lo reciben en `datos_portal` / `datos_correo`.
-- 5. **Las traducciones llegan al enlace del cliente.** Solo el PDF las usaba: el portal nunca
--    pidió `traducciones_portal`. Ahora `datos_portal` trae el diccionario (`traducciones`) y
--    `datos_correo` también (líneas del presupuesto en inglés). Las observaciones que
--    administración manda al reporte también se traducen.
-- 6. **"Mis comisiones" del técnico:** `resumen_mis_comisiones()` da sus totales (por cobrar,
--    pagado en el mes y en total). La lista la lee por la API: la política de `comisiones` ya
--    le deja ver solo lo suyo aceptado o pagado, y la de `comision_pagos`, solo sus pagos.
--
-- Todo es compatible con la app publicada: no se quita ni se renombra ninguna columna, y las
-- claves nuevas de los JSON las ignora quien no las conoce. `process-outbox` y `portal`
-- cambian (idioma y traducciones): hay que desplegarlas después del `db push`.
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. La firma ya no aprueba lo cotizado
-- ------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_order_quote_signature ON public.ordenes_trabajo;
DROP FUNCTION IF EXISTS public.trg_quote_on_signature();


-- ------------------------------------------------------------------------------------
-- 4. El idioma del cliente
-- ------------------------------------------------------------------------------------
-- En inglés por defecto (pedido del taller): la mayoría de sus clientes lo habla. Los que ya
-- existen pasan a inglés; el cliente lo cambia desde su enlace y administración en su ficha.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS idioma TEXT NOT NULL DEFAULT 'en';
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_idioma_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_idioma_check CHECK (idioma IN ('es', 'en'));

COMMENT ON COLUMN public.clientes.idioma IS
  'Idioma de los correos y, si no eligió otro en el navegador, del enlace: es | en.';

-- El cliente elige el idioma de su reporte. Como la preferencia de correos: por POST a la
-- edge function `portal`, con un enlace no revocado (vencido sirve: el idioma no da acceso a
-- nada).
CREATE OR REPLACE FUNCTION public.preferencia_idioma_portal(p_token TEXT, p_idioma TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace  orden_enlaces;
  v_cliente UUID;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_idioma IS NULL OR p_idioma NOT IN ('es', 'en') THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO v_enlace FROM orden_enlaces WHERE token = p_token AND revocado_en IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT cliente_id INTO v_cliente FROM ordenes_trabajo WHERE id = v_enlace.orden_id;
  UPDATE clientes SET idioma = p_idioma WHERE id = v_cliente AND idioma IS DISTINCT FROM p_idioma;

  RETURN jsonb_build_object('ok', true, 'idioma', p_idioma);
END;
$$;
REVOKE ALL ON FUNCTION public.preferencia_idioma_portal(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preferencia_idioma_portal(TEXT, TEXT) TO service_role;


-- ------------------------------------------------------------------------------------
-- 5. Traducciones: también las observaciones, y un diccionario para el portal y los correos
-- ------------------------------------------------------------------------------------
-- Desde 20261010000013. Cambia: entra el texto que administración manda al reporte
-- (hallazgos descartados con `en_reporte`).
CREATE OR REPLACE FUNCTION public._textos_cliente(p_orden_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_textos text[];
BEGIN
  SELECT array_agg(DISTINCT nullif(trim(t.texto), '')) INTO v_textos
  FROM (
    SELECT descripcion AS texto FROM orden_labor WHERE orden_id = p_orden_id
    UNION ALL
    SELECT descripcion FROM orden_repuestos WHERE orden_id = p_orden_id
    UNION ALL
    SELECT descripcion FROM orden_avances WHERE orden_id = p_orden_id AND visible_cliente = true
    UNION ALL
    SELECT inspeccion_360_notas FROM ordenes_trabajo WHERE id = p_orden_id
    UNION ALL
    SELECT texto_cliente FROM orden_hallazgos
    WHERE orden_id = p_orden_id AND estado = 'descartado' AND en_reporte
  ) t
  WHERE nullif(trim(t.texto), '') IS NOT NULL;

  RETURN COALESCE(v_textos, ARRAY[]::text[]);
END;
$$;
REVOKE ALL ON FUNCTION public._textos_cliente(uuid) FROM PUBLIC, anon, authenticated;

-- El diccionario texto original → inglés de una orden. Interna: la usan `datos_portal`,
-- `datos_correo`, `traducciones_orden` y `traducciones_portal` (que hacen sus propias
-- comprobaciones de acceso). Las claves van recortadas, como las guarda `_textos_cliente`.
CREATE OR REPLACE FUNCTION public._diccionario_traducciones(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sede_id UUID;
  v_textos  TEXT[];
  v_dict    JSONB;
BEGIN
  SELECT sede_id INTO v_sede_id FROM ordenes_trabajo WHERE id = p_orden_id;
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  v_textos := public._textos_cliente(p_orden_id);
  IF array_length(v_textos, 1) IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_object_agg(texto_original, traduccion) INTO v_dict
  FROM traducciones
  WHERE sede_id = v_sede_id
    AND idioma_destino = 'en'
    AND md5_hash = ANY (ARRAY(SELECT md5(t) FROM unnest(v_textos) t));

  RETURN COALESCE(v_dict, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public._diccionario_traducciones(UUID) FROM PUBLIC, anon, authenticated;

-- Desde 20261010000015. Cambia: también encola al cambiar el texto de una observación que va al
-- reporte (`orden_hallazgos`). Cada tabla en su rama: en PL/pgSQL `OLD.columna` se resuelve en
-- toda la expresión, y leer una columna que la tabla no tiene tumbó producción (013).
CREATE OR REPLACE FUNCTION public.trg_encolar_traduccion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'ordenes_trabajo' THEN
    IF NEW.inspeccion_360_notas IS NOT DISTINCT FROM OLD.inspeccion_360_notas THEN
      RETURN NULL;
    END IF;
    v_orden_id := NEW.id;

  ELSIF TG_TABLE_NAME = 'orden_avances' THEN
    IF NOT COALESCE(NEW.visible_cliente, false) THEN
      RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.visible_cliente
       AND NEW.descripcion IS NOT DISTINCT FROM OLD.descripcion THEN
      RETURN NULL;
    END IF;
    v_orden_id := NEW.orden_id;

  ELSIF TG_TABLE_NAME = 'orden_hallazgos' THEN
    IF NOT (NEW.en_reporte AND NULLIF(btrim(NEW.texto_cliente), '') IS NOT NULL) THEN
      RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.en_reporte
       AND NEW.texto_cliente IS NOT DISTINCT FROM OLD.texto_cliente THEN
      RETURN NULL;
    END IF;
    v_orden_id := NEW.orden_id;

  ELSE
    -- orden_labor y orden_repuestos: al crearse, o si cambia la descripción.
    IF TG_OP = 'UPDATE' AND NEW.descripcion IS NOT DISTINCT FROM OLD.descripcion THEN
      RETURN NULL;
    END IF;
    v_orden_id := NEW.orden_id;
  END IF;

  BEGIN
    INSERT INTO cola_envios (canal, destinatario, plantilla, orden_id, enviar_despues_de)
    VALUES ('traduccion', 'gemini', 'auto', v_orden_id, now() + interval '10 seconds')
    ON CONFLICT (orden_id) WHERE canal = 'traduccion' AND estado = 'pendiente'
    DO UPDATE SET enviar_despues_de = EXCLUDED.enviar_despues_de;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_encolar_traduccion (orden %): %', v_orden_id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_encolar_traduccion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orden_hallazgos_traducir ON public.orden_hallazgos;
CREATE TRIGGER trg_orden_hallazgos_traducir
  AFTER INSERT OR UPDATE OF texto_cliente, en_reporte ON public.orden_hallazgos
  FOR EACH ROW EXECUTE FUNCTION public.trg_encolar_traduccion();

-- Desde 20261010000015. Cambia: el diccionario sale de `_diccionario_traducciones`.
CREATE OR REPLACE FUNCTION public.traducciones_orden(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() AND NOT (p_orden_id = ANY (public.mis_ordenes_asignadas())) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN public._diccionario_traducciones(p_orden_id);
END;
$$;
REVOKE ALL ON FUNCTION public.traducciones_orden(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traducciones_orden(UUID) TO authenticated;

-- Desde 20261010000015. Cambia: el diccionario sale de `_diccionario_traducciones`.
CREATE OR REPLACE FUNCTION public.traducciones_portal(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden_id UUID;
BEGIN
  SELECT orden_id INTO v_orden_id
  FROM orden_enlaces
  WHERE token = p_token
    AND revocado_en IS NULL
    AND (expira_en IS NULL OR expira_en > now());
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN public._diccionario_traducciones(v_orden_id);
END;
$$;
REVOKE ALL ON FUNCTION public.traducciones_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traducciones_portal(TEXT) TO anon;


-- ------------------------------------------------------------------------------------
-- 4 y 5. Lo que reciben los correos y el portal
-- ------------------------------------------------------------------------------------
-- Desde 20261010000021. Cambia: `cliente.idioma` y `traducciones`.
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

-- Desde 20261010000021. Cambia: `cliente.idioma` y `traducciones`.
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
        'acepta_correos', c.acepta_correos,
        'idioma', c.idioma
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
    -- Texto original → inglés de lo que el taller escribió a mano. Antes solo el PDF lo
    -- usaba y el enlace mostraba todo en español (06/10/2026).
    'traducciones', public._diccionario_traducciones(v_orden.id),
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

-- ------------------------------------------------------------------------------------
-- 3. El técnico se entera cuando el cliente no autoriza
-- ------------------------------------------------------------------------------------
-- Desde 20261010000010. Cambia: el aviso a los técnicos sale también si no se autorizó nada.
CREATE OR REPLACE FUNCTION public._resolver_presupuesto(
  p_presupuesto_id UUID,
  p_aprobadas      UUID[],
  p_via            TEXT,
  p_nombre         TEXT,
  p_perfil         UUID,
  p_comentario     TEXT,
  p_nota           TEXT,
  p_ip             TEXT,
  p_user_agent     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p           presupuestos;
  v_prev        TEXT := current_setting('restorify.presupuesto', true);
  v_aprobadas   UUID[] := COALESCE(p_aprobadas, '{}');
  v_autorizadas TEXT;
  v_rechazadas  TEXT;
  v_n_aprob     INTEGER;
  v_n_rech      INTEGER;
  v_total       NUMERIC;
  v_comentario  TEXT := NULLIF(btrim(left(COALESCE(p_comentario, ''), 1000)), '');
  d             JSONB;
BEGIN
  SELECT * INTO v_p FROM presupuestos WHERE id = p_presupuesto_id FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado <> 'enviado' THEN
    RAISE EXCEPTION 'Este presupuesto ya fue respondido o cancelado.';
  END IF;

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor
  SET estado = CASE WHEN id = ANY (v_aprobadas) THEN 'aprobado' ELSE 'rechazado' END,
      decidido_en = NOW()
  WHERE presupuesto_id = v_p.id AND estado = 'pendiente';
  UPDATE orden_repuestos
  SET estado = CASE WHEN id = ANY (v_aprobadas) THEN 'aprobado' ELSE 'rechazado' END,
      decidido_en = NOW()
  WHERE presupuesto_id = v_p.id AND estado = 'pendiente';
  PERFORM set_config('restorify.presupuesto', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  SELECT
    string_agg(descripcion, ', ' ORDER BY creado_en, descripcion) FILTER (WHERE estado = 'aprobado'),
    string_agg(descripcion, ', ' ORDER BY creado_en, descripcion) FILTER (WHERE estado = 'rechazado'),
    COUNT(*) FILTER (WHERE estado = 'aprobado'),
    COUNT(*) FILTER (WHERE estado = 'rechazado'),
    COALESCE(SUM(monto) FILTER (WHERE estado = 'aprobado'), 0)
  INTO v_autorizadas, v_rechazadas, v_n_aprob, v_n_rech, v_total
  FROM (
    SELECT descripcion, estado, creado_en, costo AS monto FROM orden_labor WHERE presupuesto_id = v_p.id
    UNION ALL
    SELECT descripcion, estado, creado_en, subtotal FROM orden_repuestos WHERE presupuesto_id = v_p.id
  ) l;

  UPDATE presupuestos
  SET estado = 'respondido',
      respondido_en = NOW(),
      respondido_via = p_via,
      respondido_por_nombre = NULLIF(btrim(left(COALESCE(p_nombre, ''), 120)), ''),
      respondido_por_perfil = (SELECT id FROM perfiles WHERE id = p_perfil),
      total_aprobado = v_total,
      comentario_cliente = v_comentario,
      nota_admin = NULLIF(btrim(left(COALESCE(p_nota, ''), 1000)), ''),
      ip = left(p_ip, 64),
      user_agent = left(p_user_agent, 400)
  WHERE id = v_p.id;

  -- El correo del presupuesto que no alcanzó a salir ya no hace falta.
  UPDATE cola_envios
  SET estado = 'omitido', ultimo_error = 'El presupuesto ya fue respondido.'
  WHERE canal = 'email' AND plantilla = 'presupuesto' AND estado = 'pendiente'
    AND datos->>'presupuesto_id' = v_p.id::text;

  -- F6: Salir de espera de autorización incluso si rechazó todo, para que la orden no quede trabada.
  BEGIN
    PERFORM public._salir_de_espera(v_p.orden_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_resolver_presupuesto estatus (%): %', v_p.id, SQLERRM;
  END;

  BEGIN
    d := public.datos_orden_aviso(v_p.orden_id);

    -- A los técnicos de la orden, también si no se autorizó nada: el mecánico que reportó el
    -- trabajo tiene que saber que no se hace (06/10/2026).
    IF v_n_aprob + v_n_rech > 0 THEN
      PERFORM public.notificar(
        ARRAY(SELECT DISTINCT usuario_id FROM orden_asignaciones WHERE orden_id = v_p.orden_id),
        'presupuesto_respondido',
        CASE WHEN v_n_aprob > 0 THEN 'Trabajos autorizados · ' ELSE 'Trabajo no autorizado · ' END
          || (d->>'numero_orden'),
        concat_ws(' ',
          CASE WHEN v_autorizadas IS NOT NULL THEN 'Autorizado: ' || v_autorizadas || '.' END,
          CASE WHEN v_rechazadas IS NOT NULL THEN 'No realizar: ' || v_rechazadas || '.' END
        ),
        d || jsonb_build_object('presupuesto_id', v_p.id, 'autorizados', v_n_aprob, 'rechazados', v_n_rech, 'via', p_via),
        v_p.orden_id
      );
    END IF;

    IF p_via = 'cliente_portal' THEN
      PERFORM public.notificar(
        public.admins_de_sede(v_p.sede_id),
        'presupuesto_respondido_cliente',
        CASE WHEN v_n_aprob > 0
          THEN 'El cliente respondió el presupuesto · '
          ELSE 'El cliente no autorizó el presupuesto · '
        END || (d->>'numero_orden'),
        format('Autorizó %s de %s (%s).', v_n_aprob, v_n_aprob + v_n_rech, to_char(v_total, 'FM$999,999,990.00'))
          || COALESCE(' Comentario: ' || left(v_comentario, 200), ''),
        d || jsonb_build_object('presupuesto_id', v_p.id, 'autorizados', v_n_aprob, 'rechazados', v_n_rech),
        v_p.orden_id
      );
    END IF;

    IF p_via <> 'firma_recepcion' THEN
      PERFORM public.encolar_correo_cliente(
        v_p.orden_id, 'presupuesto_confirmacion', jsonb_build_object('presupuesto_id', v_p.id),
        'presupuesto_confirmacion:' || v_p.id, INTERVAL '0 seconds'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_resolver_presupuesto avisos (%): %', v_p.id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'presupuesto_id', v_p.id,
    'numero', v_p.numero,
    'autorizados', v_n_aprob,
    'rechazados', v_n_rech,
    'total_autorizado', v_total
  );
END;
$$;
REVOKE ALL ON FUNCTION public._resolver_presupuesto(UUID, UUID[], TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 2. "Requiere atención": lo cotizado sin autorizar
-- ------------------------------------------------------------------------------------
-- Desde 20261010000021. Cambia: grupo `por_autorizar`.
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
    -- Sin la firma, lo cotizado espera a que la oficina mande el presupuesto o registre la
    -- autorización (06/10/2026). Mientras hay un presupuesto enviado, ya lo cuenta su grupo.
    SELECT 'por_autorizar', a.id, a.numero_orden, MIN(x.creado_en), COUNT(*)::int
    FROM abiertas a
    JOIN (
      SELECT orden_id, creado_en FROM orden_labor WHERE estado = 'borrador'
      UNION ALL
      SELECT orden_id, creado_en FROM orden_repuestos WHERE estado = 'borrador'
    ) x ON x.orden_id = a.id
    WHERE NOT EXISTS (SELECT 1 FROM presupuestos p WHERE p.orden_id = a.id AND p.estado = 'enviado')
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
    'por_autorizar', COALESCE(v_grupos->'por_autorizar', v_vacio),
    'sin_tecnico',  COALESCE(v_grupos->'sin_tecnico', v_vacio),
    'vencidas',     COALESCE(v_grupos->'vencidas', v_vacio),
    'por_revisar',  COALESCE(v_grupos->'por_revisar', v_vacio),
    'correos',      jsonb_build_object('total', v_correos)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.requiere_atencion(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requiere_atencion(UUID, DATE) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 6. "Mis comisiones": los totales del técnico
-- ------------------------------------------------------------------------------------
-- Lo de quien la llama y nada más: las mismas condiciones que las políticas de `comisiones`
-- (lo suyo aceptado o pagado) y `comision_pagos` (sus pagos). DEFINER porque usa
-- `hoy_taller`, que no se concede a los técnicos. El dinero se suma en la base, nunca en el
-- navegador.
CREATE OR REPLACE FUNCTION public.resumen_mis_comisiones()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'por_cobrar', COALESCE((
      SELECT SUM(monto) FROM comisiones
      WHERE usuario_id = auth.uid() AND estado = 'aceptada' AND pago_id IS NULL
    ), 0),
    'pagado_mes', COALESCE((
      SELECT SUM(p.monto) FROM comision_pagos p
      WHERE p.usuario_id = auth.uid()
        AND date_trunc('month', p.fecha_pago) = date_trunc('month', public.hoy_taller(p.sede_id))
    ), 0),
    'pagado_total', COALESCE((
      SELECT SUM(monto) FROM comision_pagos WHERE usuario_id = auth.uid()
    ), 0),
    'pagos', (SELECT COUNT(*) FROM comision_pagos WHERE usuario_id = auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.resumen_mis_comisiones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumen_mis_comisiones() TO authenticated;
