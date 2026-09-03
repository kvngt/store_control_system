-- ====================================================================================
-- RESTORIFY — Parts cost as a real expense, and vehicles without a plate
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. Vehicles bought at auction arrive with no plate.
-- ------------------------------------------------------------------------------------
-- `placa` was NOT NULL, so the only way to register such a unit was to invent a
-- placeholder ("SIN PLACA", "N/A", a made-up string), which then showed up in
-- search results and on the printed work order as if it were real. NULL says
-- "this vehicle has no plate" without pretending otherwise.
ALTER TABLE vehiculos ALTER COLUMN placa DROP NOT NULL;

-- Anything already stored as an empty string meant the same thing.
UPDATE vehiculos SET placa = NULL WHERE placa IS NOT NULL AND btrim(placa) = '';

-- A plate state with no plate is meaningless — keep the pair coherent so the
-- UI never has to render "TX · (nothing)".
UPDATE vehiculos SET placa_estado = NULL WHERE placa IS NULL;

ALTER TABLE vehiculos DROP CONSTRAINT IF EXISTS vehiculos_placa_estado_requiere_placa;
ALTER TABLE vehiculos
  ADD CONSTRAINT vehiculos_placa_estado_requiere_placa
  CHECK (placa_estado IS NULL OR placa IS NOT NULL);

-- ------------------------------------------------------------------------------------
-- 2. Closing an order recorded the income but never the parts cost.
-- ------------------------------------------------------------------------------------
-- Reported from the shop: on delivery, Finanzas showed the customer payment but
-- nothing for what the parts cost the business. That was accurate to the code —
-- the order automation only ever wrote `pago_cliente` income rows. The
-- `compra_repuesto` category existed but nothing wrote it, so every delivered
-- order overstated profit by the full cost of its parts.
--
-- The expense is recorded on delivery, alongside the final payment, so an
-- order's income and its cost land in the same period and the per-order margin
-- reads correctly.

CREATE OR REPLACE FUNCTION public.sync_order_parts_expense(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord           RECORD;
  cost_total    NUMERIC;
  already       NUMERIC;
  delta         NUMERIC;
BEGIN
  SELECT id, sede_id, numero_orden, estatus INTO ord
  FROM ordenes_trabajo WHERE id = target_order_id;

  -- Nothing to record until the order is actually closed out.
  IF ord.id IS NULL OR ord.estatus <> 'entregado' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(cantidad * costo_unitario), 0) INTO cost_total
  FROM orden_repuestos WHERE orden_id = target_order_id;

  -- What this order has already had booked against it, net of any correction.
  SELECT COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END), 0) INTO already
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id AND categoria = 'compra_repuesto';

  delta := cost_total - already;

  -- Idempotent by construction: re-running with nothing changed books nothing,
  -- and editing parts on a delivered order books only the difference rather
  -- than rewriting history.
  IF ABS(delta) > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id,
      -- The cast is required, not decorative. Both branches are untyped
      -- literals, so Postgres resolves the CASE to `text` before the column's
      -- assignment context applies, and text -> enum has no implicit cast:
      -- "column tipo is of type transaction_type but expression is of type
      -- text". A bare literal would have coerced fine; a CASE does not.
      (CASE WHEN delta > 0 THEN 'egreso' ELSE 'ingreso' END)::transaction_type,
      'compra_repuesto',
      ABS(delta),
      CASE WHEN delta > 0 THEN 'Costo de repuestos - ' ELSE 'Ajuste de costo de repuestos - ' END
        || ord.numero_orden,
      CURRENT_DATE,
      target_order_id
    );
  END IF;
END;
$$;

-- Fires when the order is delivered.
CREATE OR REPLACE FUNCTION public.trg_parts_expense_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estatus = 'entregado' AND OLD.estatus IS DISTINCT FROM 'entregado' THEN
    PERFORM public.sync_order_parts_expense(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_parts_expense ON ordenes_trabajo;
CREATE TRIGGER trg_order_parts_expense
  AFTER UPDATE ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_parts_expense_on_delivery();

-- And again whenever the parts themselves change, so a part added to an
-- already-delivered order corrects the expense the same way
-- trg_delivered_order_adjustment corrects the income.
CREATE OR REPLACE FUNCTION public.trg_parts_expense_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_order_parts_expense(COALESCE(NEW.orden_id, OLD.orden_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_parts_expense_sync ON orden_repuestos;
CREATE TRIGGER trg_parts_expense_sync
  AFTER INSERT OR UPDATE OR DELETE ON orden_repuestos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_parts_expense_on_change();

-- ------------------------------------------------------------------------------------
-- 3. Keep the final-payment calculation clear of the new expense rows.
-- ------------------------------------------------------------------------------------
-- handle_order_delivery_payment summed *every* income row on the order to work
-- out what the customer still owed. A `compra_repuesto` correction row (booked
-- as income when parts get cheaper) would have counted as a customer payment
-- and under-charged the final invoice. Excluding that category keeps the two
-- ledgers independent.
CREATE OR REPLACE FUNCTION public.handle_order_delivery_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  already_paid NUMERIC;
  remaining NUMERIC;
BEGIN
  IF NEW.estatus = 'entregado' AND (OLD.estatus IS DISTINCT FROM 'entregado') THEN
    SELECT COALESCE(SUM(monto), 0) INTO already_paid
    FROM finanzas_movimientos
    WHERE referencia_orden_id = NEW.id
      AND tipo = 'ingreso'
      AND categoria <> 'compra_repuesto';

    remaining := NEW.total_general - already_paid;

    IF remaining > 0.01 THEN
      INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
      VALUES (
        NEW.sede_id, 'ingreso', 'pago_cliente', remaining,
        'Pago final - ' || NEW.numero_orden, CURRENT_DATE, NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------------
-- 3b. The same defect, already shipped: handle_delivered_order_adjustment.
-- ------------------------------------------------------------------------------------
-- It builds its `tipo` with the identical untyped CASE. plpgsql bodies are not
-- type-checked when the function is created, so migration 20260904000000
-- applied cleanly and the error waits until the trigger actually fires — i.e.
-- the first time anyone edits the totals of an already-delivered order, which
-- is precisely the case that function exists to handle. Redefined here with
-- the cast; the logic is otherwise untouched.
CREATE OR REPLACE FUNCTION public.handle_delivered_order_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  already_recorded NUMERIC;
  delta NUMERIC;
BEGIN
  IF OLD.estatus = 'entregado' AND NEW.estatus = 'entregado'
     AND NEW.total_general IS DISTINCT FROM OLD.total_general THEN

    SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
    INTO already_recorded
    FROM finanzas_movimientos
    WHERE referencia_orden_id = NEW.id AND categoria = 'pago_cliente';

    delta := NEW.total_general - already_recorded;

    IF ABS(delta) > 0.01 THEN
      INSERT INTO finanzas_movimientos (
        sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
      )
      VALUES (
        NEW.sede_id,
        (CASE WHEN delta > 0 THEN 'ingreso' ELSE 'egreso' END)::transaction_type,
        'pago_cliente',
        ABS(delta),
        CASE WHEN delta > 0 THEN 'Ajuste por cargo adicional - ' ELSE 'Reembolso por ajuste - ' END
          || NEW.numero_orden,
        CURRENT_DATE,
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------------
-- 4. Backfill: delivered orders that never got their parts cost booked.
-- ------------------------------------------------------------------------------------
-- Only touches orders whose parts actually carry a cost. Orders whose parts were
-- captured before the UI had a cost field have costo_unitario = 0 throughout,
-- so they book nothing and stay untouched — their real cost has to be entered
-- by hand. Anything that does carry a cost gets its expense booked here.
DO $$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM ordenes_trabajo WHERE estatus = 'entregado' LOOP
    PERFORM public.sync_order_parts_expense(o.id);
  END LOOP;
END;
$$;
