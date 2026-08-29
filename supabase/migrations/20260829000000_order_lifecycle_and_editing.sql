-- ====================================================================================
-- RESTORIFY — Order Lifecycle Automation
-- ====================================================================================
-- Business rule: a work order's money movements should never require manual
-- double-entry in Finanzas. These triggers run as SECURITY DEFINER so they work
-- regardless of which role touches the order (mecanico/pintor included), while
-- the finanzas_movimientos RLS policy itself stays admin-only for direct access.

-- 1. Recording the initial deposit as income the moment a work order is created.
CREATE OR REPLACE FUNCTION public.handle_order_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deposito_inicial > 0 THEN
    INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id, registrado_por)
    VALUES (
      NEW.sede_id, 'ingreso', 'pago_cliente', NEW.deposito_inicial,
      'Depósito inicial - ' || NEW.numero_orden, CURRENT_DATE, NEW.id, NEW.creado_por
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_deposit ON ordenes_trabajo;
CREATE TRIGGER trg_order_deposit
  AFTER INSERT ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_deposit();

-- 2. Recording the remaining balance as income the moment an order is marked
--    "entregado" (delivered). Idempotent: it looks at what's already been
--    recorded for that order so re-triggering doesn't double-charge.
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
    WHERE referencia_orden_id = NEW.id AND tipo = 'ingreso';

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

DROP TRIGGER IF EXISTS trg_order_delivery_payment ON ordenes_trabajo;
CREATE TRIGGER trg_order_delivery_payment
  AFTER UPDATE ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_delivery_payment();

-- 3. Keep total_labor / total_repuestos / total_general correct whenever labor
--    or part line items are added/edited/removed on an order that already
--    exists (previously totals were only computed once, at creation time).
CREATE OR REPLACE FUNCTION public.recalculate_order_totals(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  labor_total NUMERIC;
  parts_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(costo), 0) INTO labor_total FROM orden_labor WHERE orden_id = target_order_id;
  SELECT COALESCE(SUM(subtotal), 0) INTO parts_total FROM orden_repuestos WHERE orden_id = target_order_id;

  UPDATE ordenes_trabajo
  SET total_labor = labor_total,
      total_repuestos = parts_total,
      total_general = labor_total + parts_total
  WHERE id = target_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_labor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_order_totals(COALESCE(NEW.orden_id, OLD.orden_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Runs BEFORE the row is written, so it can compute the stored value.
CREATE OR REPLACE FUNCTION public.trg_set_part_subtotal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.subtotal := NEW.cantidad * NEW.precio_venta_unitario;
  RETURN NEW;
END;
$$;

-- Runs AFTER the row is committed, so the SUM() below actually sees it.
CREATE OR REPLACE FUNCTION public.trg_recalc_parts_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_order_totals(COALESCE(NEW.orden_id, OLD.orden_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_totals ON orden_labor;
CREATE TRIGGER trg_labor_totals
  AFTER INSERT OR UPDATE OR DELETE ON orden_labor
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recalc_labor();

DROP TRIGGER IF EXISTS trg_parts_subtotal ON orden_repuestos;
CREATE TRIGGER trg_parts_subtotal
  BEFORE INSERT OR UPDATE ON orden_repuestos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_part_subtotal();

DROP TRIGGER IF EXISTS trg_parts_totals ON orden_repuestos;
CREATE TRIGGER trg_parts_totals
  AFTER INSERT OR UPDATE OR DELETE ON orden_repuestos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recalc_parts_totals();
