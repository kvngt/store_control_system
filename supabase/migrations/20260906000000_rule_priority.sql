-- ====================================================================================
-- RESTORIFY — Rule priority
-- ====================================================================================
-- Checking two real statements (June and July) against each other showed that
-- ordering rules by pattern length is not enough. "Zelle to" (8 chars) is a
-- decent payroll guess, but the memo the sender typed is the real signal:
--
--   Zelle to Israel  on 07/06 Ref # ... Tire        -> a part, not payroll
--   Zelle to Rosa    on 07/28 Ref # ... Spray Gun   -> a tool, not payroll
--   Zelle to Jesslyng on 07/08 Ref # ... Chairs     -> furniture, not payroll
--
-- Those memo keywords are SHORTER than "zelle to", so length ordering let the
-- broad rule win and filed seven July vendor payments as payroll. An explicit
-- priority lets a rule be marked "more specific" regardless of its length, and
-- gives the shop a knob to tune its own rules later.

ALTER TABLE finanzas_reglas_categorizacion
  ADD COLUMN IF NOT EXISTS prioridad INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN finanzas_reglas_categorizacion.prioridad IS
  'Higher wins. Ties are broken by the longer (more specific) pattern.';

-- Memo keywords: what the money was actually for. These beat the payee-based
-- guesses above them.
INSERT INTO finanzas_reglas_categorizacion (patron, categoria, prioridad, activo) VALUES
  ('transmission',  'compra_repuesto', 10, true),
  ('upholstery',    'compra_repuesto', 10, true),
  ('spray gun',     'gasto_operativo', 10, true),
  ('glass',         'compra_repuesto', 10, true),
  ('wheel',         'compra_repuesto', 10, true),
  ('tire',          'compra_repuesto', 10, true),
  ('chairs',        'gasto_operativo', 10, true),
  ('sofa',          'gasto_operativo', 10, true),
  ('signs',         'gasto_operativo', 10, true),
  ('car wash',      'gasto_operativo', 10, true),
  ('tow',           'gasto_operativo', 10, true)
ON CONFLICT (lower(patron)) DO UPDATE
  SET categoria = EXCLUDED.categoria,
      prioridad = EXCLUDED.prioridad;
