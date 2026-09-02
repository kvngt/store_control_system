-- ====================================================================================
-- RESTORIFY — Categorization rule coverage
-- ====================================================================================
-- Running a real June statement through the importer showed the gap: of 253
-- transactions selected for import, 146 got no suggested category, which left
-- the "Importar seleccionadas" button permanently disabled — the reviewer had
-- to open 146 dropdowns by hand before importing anything.
--
-- These rules cover the merchants that actually appear on this shop's account.
-- They are only *suggestions*: every row stays editable in the review table,
-- and an admin can deactivate or replace any rule.

-- A pattern is a lookup key, so it should have been unique from the start.
-- Without this, ON CONFLICT below has no target and re-running the migration
-- would duplicate every rule.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reglas_patron_unico
  ON finanzas_reglas_categorizacion (lower(patron));

INSERT INTO finanzas_reglas_categorizacion (patron, categoria, activo) VALUES
  -- Income: cash and card deposits from customers.
  ('atm cash deposit',      'pago_cliente',    true),

  -- Parts and materials suppliers seen on the statement.
  ('colliflower',           'compra_repuesto', true),
  ('beltway used autop',    'compra_repuesto', true),
  ('general auto servi',    'compra_repuesto', true),
  ('advance auto',          'compra_repuesto', true),

  -- Fuel.
  ('sunoco',                'gasto_operativo', true),
  ('wawa',                  'gasto_operativo', true),
  ('7-eleven',              'gasto_operativo', true),
  ('citg',                  'gasto_operativo', true),

  -- Shop supplies and general operating costs.
  ('amazon',                'gasto_operativo', true),
  ('costco',                'gasto_operativo', true),
  ('u-haul',                'gasto_operativo', true),
  ('megamart',              'gasto_operativo', true),
  ('giant ',                'gasto_operativo', true),
  ('bath and body',         'gasto_operativo', true),
  ('atm withdrawal author', 'gasto_operativo', true),

  -- Outsourced services: towing and sublet work.
  ('towing',                'gasto_operativo', true),
  ('tow',                   'gasto_operativo', true),

  -- Payments sent to people are payroll by default. Vendor payments sent the
  -- same way (towing, glass) are caught by the longer, more specific patterns
  -- above, because rules are now evaluated longest-pattern-first.
  ('zelle to',              'planilla',        true),

  -- Vendors that are also paid by Zelle. These patterns are longer than
  -- 'zelle to', so the specificity ordering picks them first — without them a
  -- real statement filed tow trucks, glass and transmission work as payroll.
  ('zelle to dnd towing',   'gasto_operativo', true),
  ('zelle to transport',    'gasto_operativo', true),
  ('zelle to rouge',        'gasto_operativo', true),
  ('zelle to glass',        'compra_repuesto', true),
  ('zelle to seats',        'compra_repuesto', true)
ON CONFLICT (lower(patron)) DO NOTHING;
