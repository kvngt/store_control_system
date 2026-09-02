-- Vehicle registration: remember which US state issued the plate.
--
-- A plate number only means something together with its issuing state: "ABC1234"
-- is a different car in Texas than in Florida, and the format that counts as
-- valid is decided per state. The intake form now validates the plate against
-- the selected state, so the state has to be stored alongside it — otherwise
-- reopening the vehicle to edit it would lose the context the check was made
-- with and the same plate would suddenly read as unusual.
--
-- Nullable on purpose: vehicles registered before this migration have no state
-- on file, and out-of-country plates legitimately have none.

ALTER TABLE vehiculos
  ADD COLUMN IF NOT EXISTS placa_estado TEXT;

COMMENT ON COLUMN vehiculos.placa_estado IS
  'Two-letter US state/territory code that issued the plate (NULL when unknown).';
