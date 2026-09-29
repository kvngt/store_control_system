-- ------------------------------------------------------------------------------------
-- Entregar una orden pide cómo pagó el cliente, y registra la devolución
-- ------------------------------------------------------------------------------------
-- Acordado en la reunión con el taller (septiembre 2026). Hasta hoy, pasar una orden a
-- "Entregado" asentaba en Finanzas un "Pago final" por lo que faltaba cobrar, **sin decir
-- cómo** se cobró: efectivo, cheque o transferencia eran indistinguibles, y no había dónde
-- guardar la foto del cheque. Y si el depósito superaba el total (se cotizó de más, o el
-- cliente rechazó trabajos), **no se asentaba nada**: la devolución al cliente no quedaba en
-- ningún lado.
--
-- Cambios:
--   1. `finanzas_movimientos` suma `metodo_pago` y `comprobante_ruta`. `numero_cheque` ya
--      existía. El comprobante vive en el bucket privado `comprobantes`, igual que la foto
--      del cheque de un pago de comisiones.
--   2. `saldo_orden(orden)`: la base calcula lo que falta cobrar (o devolver). El navegador
--      no suma dinero.
--   3. `entregar_orden(orden, método, cheque, comprobante)`: en una sola transacción bloquea
--      la orden, asienta el pago final **con su método** (o la devolución), y la marca
--      entregada. Entregarla dos veces no cobra dos veces: la segunda llamada encuentra la
--      orden ya entregada y se rechaza.
--   4. `handle_order_delivery_payment` (la red para una entrega por otra vía, como un UPDATE
--      directo) también asienta la devolución, sin método. Cuando entrega la RPC, el pago ya
--      está asentado y el trigger calcula cero.
--   5. `reverse_order_delivery_finance` revierte también una devolución: sacar la orden de
--      Entregado deja lo cobrado igual al depósito, suba o baje. Antes solo sabía bajar.
-- ------------------------------------------------------------------------------------

ALTER TABLE finanzas_movimientos
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT,
  ADD COLUMN IF NOT EXISTS comprobante_ruta TEXT;

-- Los tres que usa el taller. Nulo en todo lo anterior y en lo que no es un cobro al cliente.
ALTER TABLE finanzas_movimientos
  DROP CONSTRAINT IF EXISTS finanzas_movimientos_metodo_pago_check;
ALTER TABLE finanzas_movimientos
  ADD CONSTRAINT finanzas_movimientos_metodo_pago_check
  CHECK (metodo_pago IS NULL OR metodo_pago IN ('efectivo', 'cheque', 'transferencia'));

COMMENT ON COLUMN finanzas_movimientos.metodo_pago IS
  'Cómo pagó (o cómo se le devolvió) el cliente al entregar: efectivo, cheque o transferencia.';
COMMENT ON COLUMN finanzas_movimientos.comprobante_ruta IS
  'Foto del cheque o de la transferencia, en el bucket privado comprobantes (<sede>/...).';


-- ----- lo que falta cobrar -----------------------------------------------------------
-- Una sola cuenta, la misma del trigger de entrega: total autorizado (orden_montos) menos lo
-- cobrado neto en `pago_cliente` (depósito, pagos, devoluciones, reversiones).
CREATE OR REPLACE FUNCTION public._saldo_orden(p_orden_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT total_general FROM orden_montos WHERE orden_id = p_orden_id), 0)
       - COALESCE((
           SELECT SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END)
           FROM finanzas_movimientos
           WHERE referencia_orden_id = p_orden_id AND categoria = 'pago_cliente'
         ), 0);
$$;

REVOKE ALL ON FUNCTION public._saldo_orden(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.saldo_orden(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_saldo NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el saldo de una orden.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(total_general, 0) INTO v_total FROM orden_montos WHERE orden_id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  v_saldo := round(public._saldo_orden(p_orden_id), 2);
  RETURN jsonb_build_object(
    'total', round(v_total, 2),
    'cobrado', round(v_total - v_saldo, 2),
    'saldo', v_saldo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.saldo_orden(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saldo_orden(UUID) TO authenticated;


-- ----- entregar ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entregar_orden(
  p_orden_id         UUID,
  p_metodo           TEXT DEFAULT NULL,
  p_numero_cheque    TEXT DEFAULT NULL,
  p_comprobante_ruta TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden   RECORD;
  v_saldo   NUMERIC;
  v_metodo  TEXT := NULLIF(btrim(COALESCE(p_metodo, '')), '');
  v_cheque  TEXT := NULLIF(btrim(COALESCE(p_numero_cheque, '')), '');
  v_ruta    TEXT := NULLIF(btrim(COALESCE(p_comprobante_ruta, '')), '');
  v_mov_id  UUID;
  v_tipo    TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede entregar una orden.' USING ERRCODE = '42501';
  END IF;

  -- Bloquea la orden: dos clics, o dos pestañas, no asientan dos pagos.
  SELECT id, sede_id, numero_orden, estatus INTO v_orden
  FROM ordenes_trabajo WHERE id = p_orden_id
  FOR UPDATE;

  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada.' USING ERRCODE = '42501';
  END IF;

  v_saldo := round(public._saldo_orden(p_orden_id), 2);

  IF abs(v_saldo) > 0.01 THEN
    IF v_metodo IS NULL OR v_metodo NOT IN ('efectivo', 'cheque', 'transferencia') THEN
      RAISE EXCEPTION 'Elige cómo pagó el cliente: efectivo, cheque o transferencia.' USING ERRCODE = '22023';
    END IF;
    IF v_metodo = 'cheque' AND v_cheque IS NULL AND v_ruta IS NULL THEN
      RAISE EXCEPTION 'Anota el número del cheque o sube su foto.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- El comprobante es un archivo del bucket privado, en la carpeta de la sede de la orden.
  IF v_ruta IS NOT NULL AND v_ruta NOT LIKE v_orden.sede_id::text || '/%' THEN
    RAISE EXCEPTION 'El comprobante debe guardarse en la carpeta de la sede de la orden.' USING ERRCODE = '42501';
  END IF;

  IF v_saldo > 0.01 THEN
    v_tipo := 'ingreso';
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id,
      registrado_por, metodo_pago, numero_cheque, comprobante_ruta
    ) VALUES (
      v_orden.sede_id, 'ingreso', 'pago_cliente', v_saldo,
      'Pago final - ' || v_orden.numero_orden, CURRENT_DATE, p_orden_id,
      auth.uid(), v_metodo, v_cheque, v_ruta
    ) RETURNING id INTO v_mov_id;
  ELSIF v_saldo < -0.01 THEN
    v_tipo := 'egreso';
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id,
      registrado_por, metodo_pago, numero_cheque, comprobante_ruta
    ) VALUES (
      v_orden.sede_id, 'egreso', 'pago_cliente', -v_saldo,
      'Devolución al cliente - ' || v_orden.numero_orden, CURRENT_DATE, p_orden_id,
      auth.uid(), v_metodo, v_cheque, v_ruta
    ) RETURNING id INTO v_mov_id;
  END IF;

  -- Lo mismo que hacía la pantalla. Con el pago ya asentado, `handle_order_delivery_payment`
  -- calcula un restante de cero. Si algo lo impide (un presupuesto esperando al cliente,
  -- `trg_guard_entrega_con_presupuesto`), la excepción deshace también el pago de arriba.
  UPDATE ordenes_trabajo
  SET estatus = 'entregado', fecha_finalizacion = NOW(), porcentaje_avance = 100
  WHERE id = p_orden_id;

  RETURN jsonb_build_object('saldo', v_saldo, 'tipo', v_tipo, 'movimiento_id', v_mov_id);
END;
$$;

REVOKE ALL ON FUNCTION public.entregar_orden(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entregar_orden(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ----- la red: una entrega por otra vía ----------------------------------------------
-- Igual que antes, más la devolución. Sin método: quien entrega por aquí no lo dijo.
CREATE OR REPLACE FUNCTION public.handle_order_delivery_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining NUMERIC;
BEGIN
  IF NEW.estatus = 'entregado' AND (OLD.estatus IS DISTINCT FROM 'entregado') THEN
    remaining := round(public._saldo_orden(NEW.id), 2);

    IF remaining > 0.01 THEN
      INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
      VALUES (
        NEW.sede_id, 'ingreso', 'pago_cliente', remaining,
        'Pago final - ' || NEW.numero_orden, CURRENT_DATE, NEW.id
      );
    ELSIF remaining < -0.01 THEN
      INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
      VALUES (
        NEW.sede_id, 'egreso', 'pago_cliente', -remaining,
        'Devolución al cliente - ' || NEW.numero_orden, CURRENT_DATE, NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_order_delivery_payment() FROM PUBLIC, anon, authenticated;


-- ----- sacar de Entregado ------------------------------------------------------------
-- Idéntica a la anterior salvo el cobro: si lo cobrado quedó por DEBAJO del depósito (hubo
-- una devolución), la reversión lo sube de nuevo al depósito.
CREATE OR REPLACE FUNCTION public.reverse_order_delivery_finance(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord            RECORD;
  v_deposito     NUMERIC;
  paid_recorded  NUMERIC;
  cost_recorded  NUMERIC;
  delta          NUMERIC;
BEGIN
  SELECT id, sede_id, numero_orden INTO ord
  FROM ordenes_trabajo WHERE id = target_order_id;

  IF ord.id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(deposito_inicial, 0) INTO v_deposito
  FROM orden_montos WHERE orden_id = target_order_id;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
    INTO paid_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id
    AND categoria = 'pago_cliente'
    AND importacion_id IS NULL;

  delta := paid_recorded - COALESCE(v_deposito, 0);

  IF delta > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'egreso', 'pago_cliente', delta,
      'Reversión de entrega - ' || ord.numero_orden, CURRENT_DATE, target_order_id
    );
  ELSIF delta < -0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'ingreso', 'pago_cliente', -delta,
      'Reversión de devolución - ' || ord.numero_orden, CURRENT_DATE, target_order_id
    );
  END IF;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END), 0)
    INTO cost_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id
    AND categoria = 'compra_repuesto'
    AND importacion_id IS NULL;

  IF cost_recorded > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'ingreso', 'compra_repuesto', cost_recorded,
      'Reversión de costo de repuestos - ' || ord.numero_orden, CURRENT_DATE, target_order_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_order_delivery_finance(UUID) FROM PUBLIC, anon, authenticated;
