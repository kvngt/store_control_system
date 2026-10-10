-- ------------------------------------------------------------------------------------
-- Teléfonos de contacto de la sede, con su descripción, para el cliente
-- ------------------------------------------------------------------------------------
-- Pedido del taller (09/10/2026): poder capturar varios teléfonos por sede, cada uno con su
-- descripción ("English", "Spanish", "Restorify office"), al crearla y al editarla en
-- Configuración, y que el cliente los vea en su enlace. Salen también en el PDF y en el pie de
-- los correos, que muestran lo mismo que el enlace.
--
-- `sedes.telefono` se queda como respaldo heredado: la app lo mantiene igual al primer número
-- de la lista (`sedesService`), para lo que todavía lea un solo teléfono.
--
-- Los números del taller NO van aquí: se capturan en Configuración después de aplicar esta
-- migración. Lo único que se copia es el `telefono` que ya tenía cada sede, sin descripción.
--
-- `datos_portal` y `datos_correo` se reescriben enteras desde su versión vigente
-- (20261010000022). Cambia solo `taller.telefonos`.
-- ------------------------------------------------------------------------------------

ALTER TABLE public.sedes
  ADD COLUMN IF NOT EXISTS telefonos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- El portal recorre la lista: algo que no sea un arreglo le rompería la página al cliente.
ALTER TABLE public.sedes
  ADD CONSTRAINT sedes_telefonos_es_arreglo CHECK (jsonb_typeof(telefonos) = 'array');

-- El teléfono que ya tenía cada sede pasa a la lista, sin descripción (no hay una que sirva en
-- los dos idiomas del cliente).
UPDATE public.sedes
SET telefonos = jsonb_build_array(jsonb_build_object('label', '', 'numero', btrim(telefono)))
WHERE telefonos = '[]'::jsonb AND btrim(COALESCE(telefono, '')) <> '';

-- Lo que sale al cliente, campo por campo: solo descripción y número, sin espacios de más, sin
-- filas vacías y en el orden en que los puso el taller. Nunca la columna tal cual.
CREATE OR REPLACE FUNCTION public._telefonos_sede(p_telefonos JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'label', COALESCE(btrim(e.v->>'label'), ''),
      'numero', btrim(e.v->>'numero')
    ) ORDER BY e.n
  ), '[]'::jsonb)
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_telefonos) = 'array' THEN p_telefonos ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(v, n)
  WHERE jsonb_typeof(e.v) = 'object'
    AND NULLIF(btrim(e.v->>'numero'), '') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public._telefonos_sede(JSONB) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- Lo que reciben los correos y el portal
-- ------------------------------------------------------------------------------------
-- Desde 20261010000022. Cambia: `taller.telefonos`.
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

-- Desde 20261010000022. Cambia: `taller.telefonos` (también en un enlace revocado o vencido,
-- para que el cliente sepa a quién llamar).
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
    'telefonos', public._telefonos_sede(s.telefonos),
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
