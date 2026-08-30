-- ====================================================================================
-- RESTORIFY — Atomic Order Numbers + Automatic Payroll Expense
-- ====================================================================================
-- 1. `numero_orden` was previously computed client-side (SELECT MAX + 1), which is
--    not atomic: two orders created at nearly the same time can compute the same
--    number and the second insert fails on the UNIQUE constraint. This moves
--    generation into a BEFORE INSERT trigger backed by a per-year counter row,
--    whose UPDATE takes a row lock so concurrent inserts are serialized safely.

CREATE TABLE IF NOT EXISTS numero_orden_contadores (
  anio INTEGER PRIMARY KEY,
  ultimo_numero INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE numero_orden_contadores ENABLE ROW LEVEL SECURITY;
-- No policies: only ever touched by the SECURITY DEFINER trigger function below,
-- never directly by client queries.

-- Seed counters from whatever orders already exist so newly generated numbers
-- never collide with historical data.
INSERT INTO numero_orden_contadores (anio, ultimo_numero)
SELECT split_part(numero_orden, '-', 2)::INT AS anio,
       MAX(split_part(numero_orden, '-', 3)::INT) AS ultimo_numero
FROM ordenes_trabajo
WHERE numero_orden ~ '^ORD-\d{4}-\d+$'
GROUP BY split_part(numero_orden, '-', 2)::INT
ON CONFLICT (anio) DO UPDATE
  SET ultimo_numero = GREATEST(numero_orden_contadores.ultimo_numero, EXCLUDED.ultimo_numero);

CREATE OR REPLACE FUNCTION public.trg_set_numero_orden()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year INT := EXTRACT(YEAR FROM NOW())::INT;
  next_seq INT;
BEGIN
  IF NEW.numero_orden IS NULL OR NEW.numero_orden = '' THEN
    INSERT INTO numero_orden_contadores (anio, ultimo_numero)
    VALUES (current_year, 1)
    ON CONFLICT (anio) DO UPDATE SET ultimo_numero = numero_orden_contadores.ultimo_numero + 1
    RETURNING ultimo_numero INTO next_seq;

    NEW.numero_orden := 'ORD-' || current_year || '-' || LPAD(next_seq::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_numero_orden ON ordenes_trabajo;
CREATE TRIGGER trg_numero_orden
  BEFORE INSERT ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_numero_orden();

-- 2. Payroll payments never showed up in Finanzas — order deposits/deliveries are
--    recorded as income automatically, but a payroll entry never created the
--    matching expense, so the Finance/Dashboard balance was always overstated by
--    however much payroll had been paid out. Mirrors the pattern already used for
--    order income triggers.
CREATE OR REPLACE FUNCTION public.handle_payroll_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  employee_name TEXT;
BEGIN
  SELECT nombre_completo INTO employee_name FROM perfiles WHERE id = NEW.usuario_id;

  INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, registrado_por)
  VALUES (
    NEW.sede_id, 'egreso', 'planilla', NEW.total_pagado,
    'Nómina - ' || COALESCE(employee_name, 'N/A') || ' (' || NEW.periodo_inicio || ' a ' || NEW.periodo_fin || ')',
    NEW.fecha_pago, NEW.procesado_por
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_expense ON nomina_pagos;
CREATE TRIGGER trg_payroll_expense
  AFTER INSERT ON nomina_pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_payroll_expense();
