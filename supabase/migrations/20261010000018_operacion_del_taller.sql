-- ====================================================================================
-- La operación del taller, como la decidió el taller (05/10/2026)
-- ====================================================================================
-- Sigue a 20261010000017 (docs/analisis-del-proceso-2026-10.md):
--
--   G. El avance de la orden sale de las tareas: al marcar (o desmarcar) una tarea, o cuando
--      cambia lo autorizado, el porcentaje se recalcula con el peso de cada tarea (su precio:
--      un cambio de amortiguadores pesa más que un cambio de aceite; si todas valen cero,
--      cuentan igual). El técnico lo puede seguir corrigiendo a mano; la próxima tarea que
--      marque lo vuelve a calcular. Finalizada o entregada, 100 % (como hasta hoy).
--   I. Comisiones: administración las revisa y las acepta en bloque desde Comisiones
--      (`aprobar_comisiones`) y solo se paga lo aceptado (`pay_commissions`). Antes se pagaba
--      también lo sugerido, y aceptar orden por orden no cambiaba el pago.
--   E. El enlace del cliente: el depósito ya no aparece también dentro de "Pagado" (se lee
--      como si hubiera pagado dos veces); lo cobrado después va aparte ("otros pagos" o lo
--      devuelto), el saldo a favor del cliente se dice como tal, y se ven el descuento, las
--      piezas que se esperan y la retirada sin reparar.
--   Historial: registra el costo de un repuesto, si se pidió o llegó, el descuento y la
--      retirada sin reparar.
--   Pendientes del vehículo: lo que el cliente no autorizó (o no se hizo) en visitas
--      anteriores, para ofrecérselo de nuevo (`trabajos_pendientes_vehiculo`), como hacen los
--      programas comerciales con los "trabajos declinados".
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. El avance sale de las tareas (G)
-- ------------------------------------------------------------------------------------
-- El porcentaje de lo autorizado que está hecho, pesado por el precio de cada tarea. Nulo si
-- no hay nada autorizado: entonces no se toca lo que puso el técnico.
CREATE OR REPLACE FUNCTION public._avance_por_tareas(p_orden_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COUNT(*) = 0 THEN NULL
    WHEN COALESCE(SUM(costo), 0) > 0 THEN
      round(100 * COALESCE(SUM(costo) FILTER (WHERE completado_en IS NOT NULL), 0) / SUM(costo))::int
    ELSE
      round(100.0 * COUNT(*) FILTER (WHERE completado_en IS NOT NULL) / COUNT(*))::int
  END
  FROM orden_labor
  WHERE orden_id = p_orden_id AND estado = 'aprobado';
$$;
REVOKE ALL ON FUNCTION public._avance_por_tareas(UUID) FROM PUBLIC, anon, authenticated;

-- Corre como su dueño, pero el UPDATE pasa por los guardias de la orden con la sesión de
-- quien marcó la tarea: un técnico asignado puede escribir el avance (es lo mismo que hace con
-- el control), y una orden cerrada no se toca. Nunca bloquea marcar una tarea.
CREATE OR REPLACE FUNCTION public.trg_avance_por_tareas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden UUID := COALESCE(NEW.orden_id, OLD.orden_id);
  v_avance INTEGER;
BEGIN
  BEGIN
    v_avance := public._avance_por_tareas(v_orden);
    IF v_avance IS NOT NULL THEN
      UPDATE ordenes_trabajo
      SET porcentaje_avance = v_avance
      WHERE id = v_orden
        AND estatus NOT IN ('finalizado', 'entregado')
        AND porcentaje_avance IS DISTINCT FROM v_avance;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_avance_por_tareas: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_avance_por_tareas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_labor_avance ON orden_labor;
CREATE TRIGGER trg_labor_avance
  AFTER INSERT OR DELETE OR UPDATE OF completado_en, estado, costo ON orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_avance_por_tareas();


-- ------------------------------------------------------------------------------------
-- 2. Comisiones: aceptar en bloque y pagar solo lo aceptado (I)
-- ------------------------------------------------------------------------------------
-- Acepta tal cual las comisiones elegidas que sigan sugeridas y sin pagar. Un solo aviso por
-- técnico y orden, con lo aceptado. Devuelve cuántas aceptó. Para cambiar el porcentaje o el
-- monto de una, `aprobar_comision`.
CREATE OR REPLACE FUNCTION public.aprobar_comisiones(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n      INTEGER;
  v_grupos JSONB;
  r        RECORD;
  d        JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aprobar comisiones.' USING ERRCODE = '42501';
  END IF;

  -- Bloqueadas, en orden: un pago que entre al mismo tiempo espera.
  PERFORM 1 FROM comisiones WHERE id = ANY(COALESCE(p_ids, '{}')) ORDER BY id FOR UPDATE;

  WITH a AS (
    UPDATE comisiones
    SET estado = 'aceptada'
    WHERE id = ANY(COALESCE(p_ids, '{}'))
      AND pago_id IS NULL
      AND estado = 'sugerida'
    RETURNING orden_id, usuario_id, monto
  ),
  g AS (
    SELECT orden_id, usuario_id, SUM(monto) AS monto, COUNT(*) AS n
    FROM a GROUP BY orden_id, usuario_id
  )
  SELECT COALESCE(SUM(n), 0)::int,
         COALESCE(jsonb_agg(jsonb_build_object('orden_id', orden_id, 'usuario_id', usuario_id, 'monto', monto)), '[]'::jsonb)
    INTO v_n, v_grupos
  FROM g;

  FOR r IN
    SELECT * FROM jsonb_to_recordset(v_grupos) AS x(orden_id UUID, usuario_id UUID, monto NUMERIC)
  LOOP
    BEGIN
      d := public.datos_orden_aviso(r.orden_id);
      PERFORM public.notificar(
        ARRAY[r.usuario_id],
        'comision_generada',
        'Comisión aprobada · ' || (d->>'numero_orden'),
        '$' || to_char(r.monto, 'FM999,999,990.00') || ' por la mano de obra de ' ||
          COALESCE(NULLIF(d->>'vehiculo', ''), 'la orden'),
        d || jsonb_build_object('monto', r.monto),
        r.orden_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'aprobar_comisiones (aviso): %', SQLERRM;
    END;
  END LOOP;

  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.aprobar_comisiones(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_comisiones(UUID[]) TO authenticated;

-- Parte de 20261010000000. Cambia: solo paga comisiones aceptadas, y la fecha por defecto es
-- la del taller.
CREATE OR REPLACE FUNCTION public.pay_commissions(
  p_usuario_id      UUID,
  p_comision_ids    UUID[],
  p_fecha_pago      DATE DEFAULT CURRENT_DATE,
  p_metodo          TEXT DEFAULT 'cheque',
  p_numero_cheque   TEXT DEFAULT NULL,
  p_comprobante_url TEXT DEFAULT NULL,
  p_notas           TEXT DEFAULT NULL
)
RETURNS comision_pagos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total    NUMERIC;
  v_sedes    UUID[];
  v_sede     UUID;
  v_pago     comision_pagos;
  v_nombre   TEXT;
  v_asentado NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar pagos de comisiones.'
      USING ERRCODE = '42501';
  END IF;

  -- Dos administradores (o dos pestañas) pagando lo mismo: el segundo espera aquí y
  -- después no encuentra nada pendiente.
  PERFORM 1 FROM comisiones
  WHERE id = ANY(p_comision_ids) AND usuario_id = p_usuario_id
  ORDER BY id
  FOR UPDATE;

  SELECT COALESCE(SUM(monto), 0), array_agg(DISTINCT sede_id)
    INTO v_total, v_sedes
  FROM comisiones
  WHERE id = ANY(p_comision_ids)
    AND usuario_id = p_usuario_id
    AND pago_id IS NULL
    AND estado = 'aceptada';

  IF v_total <= 0 THEN
    IF EXISTS (
      SELECT 1 FROM comisiones
      WHERE id = ANY(p_comision_ids) AND usuario_id = p_usuario_id
        AND pago_id IS NULL AND estado = 'sugerida'
    ) THEN
      RAISE EXCEPTION 'Esas comisiones todavía no están aceptadas. Revísalas y acéptalas antes de pagarlas.'
        USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'No hay comisiones pendientes para pagar en esta selección.'
      USING ERRCODE = 'P0001';
  END IF;

  IF array_length(v_sedes, 1) > 1 THEN
    RAISE EXCEPTION 'No se pueden pagar en un solo cheque comisiones de sedes distintas.'
      USING ERRCODE = 'P0001';
  END IF;

  v_sede := v_sedes[1];

  INSERT INTO comision_pagos (
    sede_id, usuario_id, monto, fecha_pago, metodo, numero_cheque, comprobante_url, notas, pagado_por
  )
  VALUES (
    v_sede, p_usuario_id, v_total, COALESCE(p_fecha_pago, public.hoy_taller(v_sede)),
    COALESCE(NULLIF(btrim(p_metodo), ''), 'cheque'),
    NULLIF(btrim(p_numero_cheque), ''),
    NULLIF(btrim(p_comprobante_url), ''),
    NULLIF(btrim(p_notas), ''),
    auth.uid()
  )
  RETURNING * INTO v_pago;

  UPDATE comisiones
  SET pago_id = v_pago.id
  WHERE id = ANY(p_comision_ids)
    AND usuario_id = p_usuario_id
    AND pago_id IS NULL
    AND estado = 'aceptada';

  SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = p_usuario_id;

  -- Un egreso por orden: lo que este pago cubre de cada una (las dos bolsas de una misma
  -- persona en una orden van juntas).
  INSERT INTO finanzas_movimientos (
    sede_id, tipo, categoria, monto, descripcion, fecha, numero_cheque,
    registrado_por, comision_pago_id, referencia_orden_id
  )
  SELECT
    v_sede, 'egreso', 'planilla', SUM(c.monto),
    'Comisión ' || COALESCE(v_nombre, 'empleado') || ' - ' || o.numero_orden,
    v_pago.fecha_pago, v_pago.numero_cheque, auth.uid(), v_pago.id, c.orden_id
  FROM comisiones c
  JOIN ordenes_trabajo o ON o.id = c.orden_id
  WHERE c.pago_id = v_pago.id
  GROUP BY c.orden_id, o.numero_orden;

  -- Lo asentado tiene que ser exactamente lo pagado.
  SELECT COALESCE(SUM(monto), 0) INTO v_asentado
  FROM finanzas_movimientos WHERE comision_pago_id = v_pago.id;

  IF v_asentado <> v_total THEN
    RAISE EXCEPTION 'Los egresos del pago (%) no cuadran con el pago (%).', v_asentado, v_total
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_pago;
END;
$$;
REVOKE ALL ON FUNCTION public.pay_commissions(UUID, UUID[], DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_commissions(UUID, UUID[], DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 2b. Lo pendiente de visitas anteriores
-- ------------------------------------------------------------------------------------
-- Lo no autorizado (o no hecho, en una retirada) de las órdenes de un vehículo: las 20 líneas
-- más recientes, sin la orden que se está viendo. Solo administración (la RLS de las líneas ya
-- es suya; SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.trabajos_pendientes_vehiculo(p_vehiculo_id UUID, p_excluir_orden UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración ve los trabajos pendientes de un vehículo.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.fecha DESC, x.descripcion)
    FROM (
      SELECT * FROM (
        SELECT 'mano_obra'::text AS tipo, l.descripcion, l.costo AS monto, o.id AS orden_id, o.numero_orden,
               COALESCE(l.decidido_en, l.creado_en) AS fecha, o.retirada_sin_reparar AS retirada
        FROM orden_labor l JOIN ordenes_trabajo o ON o.id = l.orden_id
        WHERE o.vehiculo_id = p_vehiculo_id AND l.estado = 'rechazado'
          AND (p_excluir_orden IS NULL OR o.id <> p_excluir_orden)
        UNION ALL
        SELECT 'repuesto', r.descripcion, r.subtotal, o.id, o.numero_orden,
               COALESCE(r.decidido_en, r.creado_en), o.retirada_sin_reparar
        FROM orden_repuestos r JOIN ordenes_trabajo o ON o.id = r.orden_id
        WHERE o.vehiculo_id = p_vehiculo_id AND r.estado = 'rechazado'
          AND (p_excluir_orden IS NULL OR o.id <> p_excluir_orden)
      ) t
      ORDER BY fecha DESC, descripcion
      LIMIT 20
    ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.trabajos_pendientes_vehiculo(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trabajos_pendientes_vehiculo(UUID, UUID) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 3. Lo que ve el cliente (E)
-- ------------------------------------------------------------------------------------
-- Parte de 20261010000011. Cambia:
--   * `cuenta.pagado` sin lo importado del banco (el estado de cuenta es contabilidad aparte);
--   * `cuenta.otros_pagos`: lo cobrado después del depósito (negativo = devuelto al cliente).
--     El enlace ya no pone el depósito dentro de "Pagado";
--   * `cuenta.saldo` con signo: negativo es saldo a favor del cliente (la versión publicada
--     del enlace lo sigue leyendo como "pagado en su totalidad", como antes);
--   * `cuenta.subtotal` y `cuenta.descuento`;
--   * `orden.retirada_sin_reparar` y `esperando_repuestos` (las piezas pedidas que no han
--     llegado, solo su nombre).
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


-- ------------------------------------------------------------------------------------
-- 4. El historial registra lo nuevo
-- ------------------------------------------------------------------------------------
-- Reescrita entera desde 20261010000006. Cambios: en la orden, `retirada_sin_reparar`; en los
-- repuestos, `costo_unitario` y `estado_pedido`; en los montos, el descuento (entidad
-- 'descuento') además del depósito. La tabla solo acepta las entidades que conoce: se suma
-- 'descuento' (sin esto el trigger fallaría y, como no bloquea, el cambio no quedaría en el
-- historial sin que nadie lo notara).
ALTER TABLE historial_orden DROP CONSTRAINT IF EXISTS historial_orden_entidad_check;
ALTER TABLE historial_orden ADD CONSTRAINT historial_orden_entidad_check
  CHECK (entidad IN ('orden', 'mano_obra', 'repuesto', 'asignacion', 'deposito', 'descuento',
                     'presupuesto', 'archivo', 'avance'));

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
          'retirada_sin_reparar'];
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

DROP TRIGGER IF EXISTS trg_historial ON ordenes_trabajo;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF
    estatus, porcentaje_avance, tipo_trabajo, fecha_estimada_entrega, millas_ingreso,
    nivel_gasolina, inspeccion_360_notas, cliente_id, vehiculo_id, firma_fecha,
    motivo_autorizacion, archivada_en, retirada_sin_reparar
  ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

DROP TRIGGER IF EXISTS trg_historial ON orden_repuestos;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF descripcion, cantidad, precio_venta_unitario, costo_unitario, estado, estado_pedido
  ON orden_repuestos
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

DROP TRIGGER IF EXISTS trg_historial ON orden_montos;
CREATE TRIGGER trg_historial
  AFTER UPDATE OF deposito_inicial, descuento, descuento_motivo
  ON orden_montos
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();
