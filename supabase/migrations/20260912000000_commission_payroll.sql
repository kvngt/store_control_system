-- ====================================================================================
-- RESTORIFY — Payroll as commissions on delivered work
-- ====================================================================================
-- Reported from the shop: nobody there is on a salary. A mechanic is paid a
-- share of what the shop actually made on the jobs they worked, and that share
-- is settled periodically by cheque. The old `nomina_pagos` model (base salary
-- + bonuses - deductions, entered by hand for a date range) described a payroll
-- this business does not run, so every figure in it had to be worked out on
-- paper first and then retyped. It is removed here, as agreed, together with
-- its historical rows.
--
-- The model that replaces it:
--
--   base de ganancia = total_general - total_repuestos
--   bolsa            = base * (sedes.comision_porcentaje / 100)
--   por técnico      = bolsa / (número de técnicos asignados)
--
-- Worked example from the shop: a customer is invoiced $1,200, of which $200 is
-- parts. The shop's profit on the job is $1,000; at 35% the commission pool is
-- $350. One mechanic takes all $350; two take $175 each; three take $116.67
-- each.
--
-- Commissions accrue when the order is marked `entregado` — that is the moment
-- the job is finished and paid for — and sit as a pending balance against each
-- technician until an admin settles them.

-- ------------------------------------------------------------------------------------
-- 1. The commission rate, per workshop, configurable by an admin.
-- ------------------------------------------------------------------------------------
-- Per sede rather than global: the shop expects to open more locations and the
-- split is a local arrangement, not a company-wide constant. 35% is what the
-- shop runs today, so existing rows land on the right number.
ALTER TABLE sedes ADD COLUMN IF NOT EXISTS comision_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 35;

ALTER TABLE sedes DROP CONSTRAINT IF EXISTS sedes_comision_porcentaje_rango;
ALTER TABLE sedes ADD CONSTRAINT sedes_comision_porcentaje_rango
  CHECK (comision_porcentaje >= 0 AND comision_porcentaje <= 100);

-- ------------------------------------------------------------------------------------
-- 2. Settlements — the cheque (or cash) that clears a technician's balance.
-- ------------------------------------------------------------------------------------
-- Created before `comisiones` because each accrual points at the payment that
-- settled it.
CREATE TABLE IF NOT EXISTS comision_pagos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sede_id UUID REFERENCES sedes(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES perfiles(id) ON DELETE RESTRICT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
  -- 'cheque' | 'efectivo' | 'transferencia'. Free text rather than an enum so
  -- adding a method later is a UI change, not a migration.
  metodo TEXT NOT NULL DEFAULT 'cheque',
  numero_cheque TEXT,
  -- Photo of the cheque, in the `comprobantes` bucket. The shop wanted the
  -- image itself and not just the number, because the number alone does not
  -- prove the cheque was written for this amount.
  comprobante_url TEXT,
  notas TEXT,
  pagado_por UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS comision_pagos_usuario_idx ON comision_pagos (usuario_id, fecha_pago DESC);
CREATE INDEX IF NOT EXISTS comision_pagos_sede_idx ON comision_pagos (sede_id, fecha_pago DESC);

-- ------------------------------------------------------------------------------------
-- 3. Accruals — one row per technician per delivered order.
-- ------------------------------------------------------------------------------------
-- `base_ganancia`, `porcentaje` and `tecnicos` are stored rather than derived
-- on read on purpose: they are the arithmetic the technician is being shown,
-- and re-deriving them later would silently rewrite what somebody was already
-- told they had earned when the rate or the crew changes.
CREATE TABLE IF NOT EXISTS comisiones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id UUID REFERENCES ordenes_trabajo(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES perfiles(id) ON DELETE CASCADE NOT NULL,
  sede_id UUID REFERENCES sedes(id) ON DELETE CASCADE NOT NULL,
  base_ganancia NUMERIC(12,2) NOT NULL,
  porcentaje NUMERIC(5,2) NOT NULL,
  tecnicos INTEGER NOT NULL CHECK (tecnicos > 0),
  monto NUMERIC(12,2) NOT NULL,
  -- NULL = still owed. Set when a settlement clears it.
  pago_id UUID REFERENCES comision_pagos(id) ON DELETE SET NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  -- A technician earns one share of one order, however many times the order is
  -- re-synced. This is also what makes the recompute below safe to re-run.
  UNIQUE (orden_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS comisiones_usuario_pendiente_idx
  ON comisiones (usuario_id) WHERE pago_id IS NULL;
CREATE INDEX IF NOT EXISTS comisiones_sede_idx ON comisiones (sede_id, creado_en DESC);

-- ------------------------------------------------------------------------------------
-- 4. Computing an order's commissions.
-- ------------------------------------------------------------------------------------
-- Idempotent by design, because it runs again every time the order's totals or
-- its crew change. Already-settled rows are never touched — a paid commission
-- is history, and re-splitting it would mean the shop had paid the wrong person
-- the wrong amount with no record of it.
CREATE OR REPLACE FUNCTION public.sync_order_commissions(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord          RECORD;
  rate         NUMERIC;
  base         NUMERIC;
  pool         NUMERIC;
  crew         INTEGER;
  share        NUMERIC;
BEGIN
  SELECT id, sede_id, estatus, total_general, total_repuestos
    INTO ord
  FROM ordenes_trabajo
  WHERE id = target_order_id;

  IF ord.id IS NULL THEN
    RETURN;
  END IF;

  -- Nothing is earned until the car leaves. If an order is moved back out of
  -- `entregado` (a delivery entered by mistake), the unpaid accruals go with
  -- it rather than lingering as a balance nobody can explain.
  IF ord.estatus <> 'entregado' THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  SELECT COALESCE(comision_porcentaje, 0) INTO rate FROM sedes WHERE id = ord.sede_id;

  -- Parts are a pass-through: what the customer is charged for them is what
  -- they cost the shop (see the 20260913000000 migration), so subtracting the
  -- parts line leaves the shop's own margin on the job.
  base := GREATEST(COALESCE(ord.total_general, 0) - COALESCE(ord.total_repuestos, 0), 0);
  pool := ROUND(base * COALESCE(rate, 0) / 100.0, 2);

  SELECT COUNT(DISTINCT usuario_id) INTO crew
  FROM orden_asignaciones
  WHERE orden_id = target_order_id;

  -- An order with nobody on it earns nobody anything; clear any stale unpaid
  -- rows and stop rather than dividing by zero.
  IF crew IS NULL OR crew = 0 THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  share := ROUND(pool / crew, 2);

  -- Drop unpaid accruals for people no longer on the order.
  DELETE FROM comisiones c
  WHERE c.orden_id = target_order_id
    AND c.pago_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM orden_asignaciones a
      WHERE a.orden_id = target_order_id AND a.usuario_id = c.usuario_id
    );

  INSERT INTO comisiones (orden_id, usuario_id, sede_id, base_ganancia, porcentaje, tecnicos, monto)
  SELECT target_order_id, a.usuario_id, ord.sede_id, base, rate, crew, share
  FROM (SELECT DISTINCT usuario_id FROM orden_asignaciones WHERE orden_id = target_order_id) a
  ON CONFLICT (orden_id, usuario_id) DO UPDATE
    SET base_ganancia = EXCLUDED.base_ganancia,
        porcentaje    = EXCLUDED.porcentaje,
        tecnicos      = EXCLUDED.tecnicos,
        monto         = EXCLUDED.monto,
        sede_id       = EXCLUDED.sede_id
    -- Settled rows are history. Only what is still owed gets recalculated.
    WHERE comisiones.pago_id IS NULL;
END;
$$;

-- ------------------------------------------------------------------------------------
-- 5. When to recompute.
-- ------------------------------------------------------------------------------------
-- Delivery, and any later edit that moves the numbers the split is based on.
CREATE OR REPLACE FUNCTION public.trg_commissions_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estatus IS DISTINCT FROM OLD.estatus
     OR NEW.total_general IS DISTINCT FROM OLD.total_general
     OR NEW.total_repuestos IS DISTINCT FROM OLD.total_repuestos THEN
    PERFORM public.sync_order_commissions(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_commissions ON ordenes_trabajo;
CREATE TRIGGER trg_order_commissions
  AFTER UPDATE ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_commissions_on_order();

-- A technician added to or removed from a delivered order changes everyone
-- else's share, so the whole order is re-split.
CREATE OR REPLACE FUNCTION public.trg_commissions_on_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_order_commissions(COALESCE(NEW.orden_id, OLD.orden_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_commissions ON orden_asignaciones;
CREATE TRIGGER trg_assignment_commissions
  AFTER INSERT OR UPDATE OR DELETE ON orden_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_commissions_on_assignment();

-- Changing a sede's rate re-prices every unpaid commission in that sede. What
-- has already been paid keeps the rate it was paid at.
CREATE OR REPLACE FUNCTION public.trg_commissions_on_rate_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
BEGIN
  IF NEW.comision_porcentaje IS DISTINCT FROM OLD.comision_porcentaje THEN
    FOR o IN
      SELECT DISTINCT orden_id FROM comisiones
      WHERE sede_id = NEW.id AND pago_id IS NULL
    LOOP
      PERFORM public.sync_order_commissions(o.orden_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sede_commission_rate ON sedes;
CREATE TRIGGER trg_sede_commission_rate
  AFTER UPDATE ON sedes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_commissions_on_rate_change();

-- ------------------------------------------------------------------------------------
-- 6. Settling a balance, in one transaction.
-- ------------------------------------------------------------------------------------
-- Recording the cheque and marking the accruals it covers have to happen
-- together: a payment that clears nothing leaves a technician looking unpaid,
-- and accruals cleared without a payment lose the cheque they were settled by.
-- The amount is summed from the accruals rather than taken from the client, so
-- the figure on the cheque is the figure the shop actually owed.
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
  v_sede   UUID;
  v_pago   comision_pagos;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar pagos de comisiones.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(monto), 0), MIN(sede_id)
    INTO v_total, v_sede
  FROM comisiones
  WHERE id = ANY(p_comision_ids)
    AND usuario_id = p_usuario_id
    AND pago_id IS NULL;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'No hay comisiones pendientes para pagar en esta selección.'
      USING ERRCODE = 'P0001';
  END IF;

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

-- ------------------------------------------------------------------------------------
-- 7. A settlement is money leaving the shop, so Finanzas has to see it.
-- ------------------------------------------------------------------------------------
-- Booked when the cheque is written, not when the commission accrues: the
-- accrual is a liability, the payment is the cash movement, and the rest of
-- Finanzas is kept on a cash basis.
CREATE OR REPLACE FUNCTION public.trg_commission_payment_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = NEW.usuario_id;
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, numero_cheque, registrado_por
    )
    VALUES (
      NEW.sede_id, 'egreso', 'planilla', NEW.monto,
      'Pago de comisiones - ' || COALESCE(v_nombre, 'empleado'),
      NEW.fecha_pago, NEW.numero_cheque, NEW.pagado_por
    );
    RETURN NEW;
  END IF;

  -- Undoing a payment has to take its ledger entry with it, or Finanzas keeps
  -- reporting an expense the shop never incurred.
  DELETE FROM finanzas_movimientos
  WHERE sede_id = OLD.sede_id
    AND categoria = 'planilla'
    AND tipo = 'egreso'
    AND fecha = OLD.fecha_pago
    AND ABS(monto - OLD.monto) < 0.01
    AND descripcion LIKE 'Pago de comisiones -%';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_payment_finance ON comision_pagos;
CREATE TRIGGER trg_commission_payment_finance
  AFTER INSERT OR DELETE ON comision_pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_commission_payment_expense();

-- ------------------------------------------------------------------------------------
-- 8. Cheque photos.
-- ------------------------------------------------------------------------------------
-- Private, unlike the vehicle photos: a scanned cheque carries an account
-- number. The app reads it back through a signed URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "comprobantes_admin_select" ON storage.objects;
CREATE POLICY "comprobantes_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'comprobantes' AND public.is_admin());

DROP POLICY IF EXISTS "comprobantes_admin_insert" ON storage.objects;
CREATE POLICY "comprobantes_admin_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'comprobantes' AND public.is_admin());

DROP POLICY IF EXISTS "comprobantes_admin_update" ON storage.objects;
CREATE POLICY "comprobantes_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'comprobantes' AND public.is_admin());

DROP POLICY IF EXISTS "comprobantes_admin_delete" ON storage.objects;
CREATE POLICY "comprobantes_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'comprobantes' AND public.is_admin());

-- ------------------------------------------------------------------------------------
-- 9. RLS.
-- ------------------------------------------------------------------------------------
-- A technician may see what they have earned and what they have been paid —
-- that is the point of the screen — but only an admin writes either table. The
-- triggers above are SECURITY DEFINER, so accruals still land for technicians
-- who cannot insert into `comisiones` themselves.
ALTER TABLE comisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE comision_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comisiones_select" ON comisiones;
CREATE POLICY "comisiones_select" ON comisiones FOR SELECT
  USING (public.is_admin() OR usuario_id = auth.uid());

DROP POLICY IF EXISTS "comisiones_write" ON comisiones;
CREATE POLICY "comisiones_write" ON comisiones FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "comision_pagos_select" ON comision_pagos;
CREATE POLICY "comision_pagos_select" ON comision_pagos FOR SELECT
  USING (public.is_admin() OR usuario_id = auth.uid());

DROP POLICY IF EXISTS "comision_pagos_write" ON comision_pagos;
CREATE POLICY "comision_pagos_write" ON comision_pagos FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------------
-- 10. Backfill: every order already delivered gets its commissions computed.
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM ordenes_trabajo WHERE estatus = 'entregado' LOOP
    PERFORM public.sync_order_commissions(o.id);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------------
-- 11. Retire the salary-based payroll.
-- ------------------------------------------------------------------------------------
-- Removed at the shop's explicit request: the salary/bonus/deduction model was
-- never how anybody there is paid, and leaving a second, contradictory payroll
-- screen in place is worse than removing it. This drops the historical rows
-- with it and cannot be undone — take a database backup before applying.
DROP TABLE IF EXISTS nomina_pagos CASCADE;

-- CASCADE takes the trigger with the table; the function it called is left
-- behind pointing at a relation that no longer exists, so it goes too.
DROP FUNCTION IF EXISTS public.handle_payroll_expense() CASCADE;
