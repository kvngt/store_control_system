-- ------------------------------------------------------------------------------------
-- El egreso de un pago de comisiones, por orden; y el margen de cada orden
-- ------------------------------------------------------------------------------------
-- Acordado en la reunión con el taller (septiembre 2026), cambio 7: ver cuánto dejó cada
-- trabajo. Hasta hoy un pago de comisiones asentaba UN egreso "Pago de comisiones - nombre"
-- sin orden (`trg_commission_payment_expense`): el cheque de la quincena de un mecánico no
-- decía de qué órdenes era, y el margen de una orden no se podía sacar de Finanzas.
--
-- Cambios:
--   1. `pay_commissions` asienta un egreso `planilla` POR ORDEN (la suma de lo que se paga
--      de esa orden en ese pago), con `referencia_orden_id` y `comision_pago_id`. La suma de
--      esos egresos tiene que dar exactamente el monto del pago: se comprueba por dentro. El
--      trigger del egreso único se retira. Deshacer el pago los borra todos (la llave
--      `comision_pago_id` ya era ON DELETE CASCADE).
--   2. Los pagos que ya existen se vuelven a asentar por orden (hoy son datos de prueba).
--   3. `balance_orden(orden)`: lo cobrado, el costo de repuestos, las comisiones devengadas
--      y el margen de una orden (decisión D10: comisiones devengadas, no pagadas). El costo
--      de repuestos es el automático de las líneas; una compra del banco o un movimiento
--      manual vinculados a la orden se muestran aparte, sin restarlos, para no contar dos
--      veces la misma pieza (D11).
--   4. `margen_ordenes(sede, desde, hasta, límite, desplazamiento)`: las órdenes entregadas
--      de un periodo con su margen, paginadas, y las sumas del periodo. En la base, porque
--      el navegador no suma dinero y la lista crece.
-- ------------------------------------------------------------------------------------


-- ----- 1. Pagar comisiones: un egreso por orden ---------------------------------------------
DROP TRIGGER IF EXISTS trg_commission_payment_finance ON comision_pagos;
DROP FUNCTION IF EXISTS public.trg_commission_payment_expense();

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
    AND pago_id IS NULL;

  IF v_total <= 0 THEN
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
    v_sede, p_usuario_id, v_total, COALESCE(p_fecha_pago, CURRENT_DATE),
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
    AND pago_id IS NULL;

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


-- ----- 2. Los pagos que ya existen, por orden -----------------------------------------------
DELETE FROM finanzas_movimientos
WHERE comision_pago_id IS NOT NULL AND importacion_id IS NULL;

INSERT INTO finanzas_movimientos (
  sede_id, tipo, categoria, monto, descripcion, fecha, numero_cheque,
  registrado_por, comision_pago_id, referencia_orden_id
)
SELECT
  p.sede_id, 'egreso', 'planilla', SUM(c.monto),
  'Comisión ' || COALESCE(pf.nombre_completo, 'empleado') || ' - ' || o.numero_orden,
  p.fecha_pago, p.numero_cheque, p.pagado_por, p.id, c.orden_id
FROM comision_pagos p
JOIN comisiones c ON c.pago_id = p.id
JOIN ordenes_trabajo o ON o.id = c.orden_id
LEFT JOIN perfiles pf ON pf.id = p.usuario_id
GROUP BY p.id, p.sede_id, p.fecha_pago, p.numero_cheque, p.pagado_por, pf.nombre_completo, c.orden_id, o.numero_orden;


-- ----- 3. El balance de una orden -----------------------------------------------------------
-- Una sola cuenta, que usan el detalle de la orden y la lista de Finanzas.
CREATE OR REPLACE FUNCTION public._balance_orden(p_orden_id UUID)
RETURNS TABLE (
  total_orden        NUMERIC,
  cobrado            NUMERIC,
  costo_repuestos    NUMERIC,
  comisiones         NUMERIC,
  comisiones_pagadas NUMERIC,
  margen             NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (
    SELECT
      COALESCE((SELECT total_general FROM orden_montos WHERE orden_id = p_orden_id), 0) AS total_orden,
      -- Todo lo cobrado al cliente, como lo cuenta el saldo: depósito, pagos, devoluciones.
      COALESCE((
        SELECT SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END)
        FROM finanzas_movimientos
        WHERE referencia_orden_id = p_orden_id AND categoria = 'pago_cliente'
      ), 0) AS cobrado,
      -- El costo automático de las líneas: lo asientan los triggers, sin quién ni lote.
      COALESCE((
        SELECT SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END)
        FROM finanzas_movimientos
        WHERE referencia_orden_id = p_orden_id AND categoria = 'compra_repuesto'
          AND importacion_id IS NULL AND registrado_por IS NULL
      ), 0) AS costo_repuestos,
      COALESCE((SELECT SUM(monto) FROM comisiones WHERE orden_id = p_orden_id), 0) AS comisiones,
      COALESCE((SELECT SUM(monto) FROM comisiones WHERE orden_id = p_orden_id AND pago_id IS NOT NULL), 0) AS comisiones_pagadas
  )
  SELECT round(total_orden, 2), round(cobrado, 2), round(costo_repuestos, 2), round(comisiones, 2),
         round(comisiones_pagadas, 2), round(cobrado - costo_repuestos - comisiones, 2)
  FROM v;
$$;
REVOKE ALL ON FUNCTION public._balance_orden(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.balance_orden(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el balance de una orden.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO b FROM public._balance_orden(p_orden_id);

  RETURN jsonb_build_object(
    'total_orden', b.total_orden,
    'cobrado', b.cobrado,
    'costo_repuestos', b.costo_repuestos,
    'comisiones', b.comisiones,
    'comisiones_pagadas', b.comisiones_pagadas,
    'margen', b.margen,
    -- Lo vinculado a la orden que el margen no cuenta: compras del banco, movimientos a mano,
    -- gastos. Se muestra para no perderlo de vista, sin restarlo dos veces.
    'otros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', f.id, 'fecha', f.fecha, 'tipo', f.tipo, 'categoria', f.categoria,
               'descripcion', f.descripcion, 'monto', f.monto, 'importado', f.importacion_id IS NOT NULL
             ) ORDER BY f.fecha, f.creado_en)
      FROM finanzas_movimientos f
      WHERE f.referencia_orden_id = p_orden_id
        AND f.categoria <> 'pago_cliente'
        AND f.comision_pago_id IS NULL
        AND NOT (f.categoria = 'compra_repuesto' AND f.importacion_id IS NULL AND f.registrado_por IS NULL)
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.balance_orden(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.balance_orden(UUID) TO authenticated;


-- ----- 4. El margen de las órdenes de un periodo --------------------------------------------
-- Las entregadas con fecha de finalización en [desde, hasta), en la zona del taller. Nula la
-- sede = todas (un admin sin sede elegida).
CREATE OR REPLACE FUNCTION public.margen_ordenes(
  p_sede_id        UUID,
  p_desde          DATE,
  p_hasta          DATE,
  p_limite         INTEGER DEFAULT 25,
  p_desplazamiento INTEGER DEFAULT 0,
  p_tz             TEXT DEFAULT 'America/Chicago'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(btrim(p_tz), ''), 'America/Chicago');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el margen de las órdenes.' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH o AS (
      SELECT o.id, o.numero_orden, o.fecha_finalizacion, c.nombre AS cliente
      FROM ordenes_trabajo o
      LEFT JOIN clientes c ON c.id = o.cliente_id
      WHERE o.estatus = 'entregado'
        AND (p_sede_id IS NULL OR o.sede_id = p_sede_id)
        AND (o.fecha_finalizacion AT TIME ZONE v_tz)::date >= p_desde
        AND (o.fecha_finalizacion AT TIME ZONE v_tz)::date < p_hasta
    ),
    b AS (
      SELECT o.*, x.*
      FROM o CROSS JOIN LATERAL public._balance_orden(o.id) x
    )
    SELECT jsonb_build_object(
      'total_filas', (SELECT COUNT(*) FROM b),
      'sumas', (
        SELECT jsonb_build_object(
          'cobrado', COALESCE(SUM(cobrado), 0),
          'costo_repuestos', COALESCE(SUM(costo_repuestos), 0),
          'comisiones', COALESCE(SUM(comisiones), 0),
          'margen', COALESCE(SUM(margen), 0)
        ) FROM b
      ),
      'filas', COALESCE((
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.fecha_finalizacion DESC, p.id)
        FROM (
          SELECT id, numero_orden, cliente, fecha_finalizacion, total_orden, cobrado,
                 costo_repuestos, comisiones, margen
          FROM b
          ORDER BY fecha_finalizacion DESC, id
          LIMIT GREATEST(LEAST(COALESCE(p_limite, 25), 100), 1)
          OFFSET GREATEST(COALESCE(p_desplazamiento, 0), 0)
        ) p
      ), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.margen_ordenes(UUID, DATE, DATE, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.margen_ordenes(UUID, DATE, DATE, INTEGER, INTEGER, TEXT) TO authenticated;
