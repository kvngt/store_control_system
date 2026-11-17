-- =====================================================================================
-- 20261010000045 — El egreso de un pago de comisiones lleva su método de pago
-- =====================================================================================
-- Qué se pidió y por qué: el 16/11/2026, la prueba e2e nueva de comisiones (COM-01,
-- `e2e/qa-comisiones.spec.ts`, plan de acción del 16/11 pedido por la persona responsable)
-- pagó una comisión en efectivo y encontró que el egreso que `pay_commissions` asienta en
-- `finanzas_movimientos` quedaba con `metodo_pago` vacío. El pago (`comision_pagos`) sí guarda
-- su método, pero el egreso solo copiaba el número de cheque. Finanzas y el CSV para el contador
-- muestran el método de cada movimiento, así que todos los pagos de comisiones salían sin él.
--
-- Qué cambia:
-- 1. `pay_commissions` se reemite entera desde su versión vigente (20261010000038): el único
--    cambio es que el egreso lleva `metodo_pago` (el del pago, si es uno de los cinco que
--    admite `finanzas_movimientos`).
-- 2. Se rellenan los egresos de pagos ya hechos con el método de su pago.
--
-- No cambia el esquema, los permisos ni ningún monto.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.pay_commissions(
  p_usuario_id      UUID,
  p_comision_ids    UUID[],
  p_fecha_pago      DATE DEFAULT NULL,
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
  -- El método del pago va también en el egreso (20261010000045): Finanzas y el CSV del contador
  -- muestran el método de cada movimiento, y estos salían sin él. `comision_pagos.metodo` es texto
  -- libre; aquí solo entra si es uno de los que admite `finanzas_movimientos` (si no, queda vacío:
  -- el espejo en Finanzas nunca tumba el pago).
  INSERT INTO finanzas_movimientos (
    sede_id, tipo, categoria, monto, descripcion, fecha, metodo_pago, numero_cheque,
    registrado_por, comision_pago_id, referencia_orden_id
  )
  SELECT
    v_sede, 'egreso', 'planilla', SUM(c.monto),
    'Comisión ' || COALESCE(v_nombre, 'empleado') || ' - ' || o.numero_orden,
    v_pago.fecha_pago,
    CASE WHEN v_pago.metodo IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque') THEN v_pago.metodo END,
    v_pago.numero_cheque, auth.uid(), v_pago.id, c.orden_id
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

-- Los egresos de pagos ya hechos: el método de su pago. Solo los que no lo tienen, y solo si el
-- método del pago es uno de los que admite el CHECK de finanzas_movimientos.
UPDATE public.finanzas_movimientos m
SET metodo_pago = p.metodo
FROM public.comision_pagos p
WHERE m.comision_pago_id = p.id
  AND m.metodo_pago IS NULL
  AND p.metodo IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque');
