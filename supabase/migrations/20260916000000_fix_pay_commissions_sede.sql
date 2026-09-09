-- ====================================================================================
-- RESTORIFY — pay_commissions could never record a payment
-- ====================================================================================
-- The function picked the sede to book the expense against with:
--
--     SELECT COALESCE(SUM(monto), 0), MIN(sede_id) INTO v_total, v_sede
--
-- Postgres has no `min(uuid)`, so every call died with:
--
--     42883: function min(uuid) does not exist
--
-- Like the enum cast in create_work_order, a plpgsql body is not checked when
-- the function is created, so the migration applied cleanly and the failure
-- waited for the first real click on "Pagar saldo".
--
-- Replaced with something that is also a correctness improvement rather than
-- just a working expression: the sede is read from the rows themselves, and
-- settling commissions from two different workshops with a single cheque is
-- now refused outright instead of silently booking the whole expense against
-- whichever sede happened to sort first.
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
  v_total  NUMERIC;
  v_sedes  UUID[];
  v_sede   UUID;
  v_pago   comision_pagos;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar pagos de comisiones.'
      USING ERRCODE = '42501';
  END IF;

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

  RETURN v_pago;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_commissions(UUID, UUID[], DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_commissions(UUID, UUID[], DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;
