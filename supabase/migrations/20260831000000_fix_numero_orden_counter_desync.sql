-- ====================================================================================
-- RESTORIFY — Fix numero_orden counter desync
-- ====================================================================================
-- Bug: while the frontend was mid-deploy (old build still creating orders
-- with a client-computed numero_orden, after the DB-side counter had already
-- been seeded), an order was inserted with an explicit `numero_orden`
-- ('ORD-2026-005'). trg_set_numero_orden only touches
-- numero_orden_contadores when NEW.numero_orden is null/empty, so that
-- insert never advanced the counter — it stayed at 4 while a row numbered 5
-- already existed. Every order created since then collided on the unique
-- constraint (23505) trying to reuse 'ORD-2026-005', so createWorkOrder has
-- been failing on every single attempt.
--
-- Fix: 1) make the trigger self-healing — even when a numero_orden is
-- supplied directly, bump the counter to match so it can never fall behind
-- again; 2) resync the counter now from the actual max numero_orden in the
-- table so the very next order succeeds.

CREATE OR REPLACE FUNCTION public.trg_set_numero_orden()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year INT := EXTRACT(YEAR FROM NOW())::INT;
  next_seq INT;
  supplied_seq INT;
BEGIN
  IF NEW.numero_orden IS NULL OR NEW.numero_orden = '' THEN
    INSERT INTO numero_orden_contadores (anio, ultimo_numero)
    VALUES (current_year, 1)
    ON CONFLICT (anio) DO UPDATE SET ultimo_numero = numero_orden_contadores.ultimo_numero + 1
    RETURNING ultimo_numero INTO next_seq;

    NEW.numero_orden := 'ORD-' || current_year || '-' || LPAD(next_seq::TEXT, 3, '0');
  ELSIF NEW.numero_orden ~ '^ORD-\d{4}-\d+$' THEN
    -- A number was supplied directly instead of left for us to generate.
    -- Make sure the counter never falls behind it.
    supplied_seq := split_part(NEW.numero_orden, '-', 3)::INT;
    INSERT INTO numero_orden_contadores (anio, ultimo_numero)
    VALUES (split_part(NEW.numero_orden, '-', 2)::INT, supplied_seq)
    ON CONFLICT (anio) DO UPDATE
      SET ultimo_numero = GREATEST(numero_orden_contadores.ultimo_numero, supplied_seq);
  END IF;
  RETURN NEW;
END;
$$;

-- One-time resync: bring every year's counter up to the actual max already
-- used, in case more than just 2026 drifted.
INSERT INTO numero_orden_contadores (anio, ultimo_numero)
SELECT split_part(numero_orden, '-', 2)::INT AS anio,
       MAX(split_part(numero_orden, '-', 3)::INT) AS ultimo_numero
FROM ordenes_trabajo
WHERE numero_orden ~ '^ORD-\d{4}-\d+$'
GROUP BY split_part(numero_orden, '-', 2)::INT
ON CONFLICT (anio) DO UPDATE
  SET ultimo_numero = GREATEST(numero_orden_contadores.ultimo_numero, EXCLUDED.ultimo_numero);
