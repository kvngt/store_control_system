-- ====================================================================================
-- RESTORIFY — Fingerprint each bank statement import
-- ====================================================================================
-- Importing the same statement twice doubles every income and expense in it.
-- The review dialog already flags rows that look like duplicates and unticks
-- them, but "select all" swept them straight back in — and that is exactly the
-- gesture someone reaches for when they open the dialog and find everything
-- unticked. It happened three times with the same June statement before anyone
-- noticed.
--
-- A hash of the file contents is the one check that cannot be fooled by a
-- rename, so the dialog can say "this exact file was already imported on
-- <date>" before a single row is written.

ALTER TABLE finanzas_importaciones ADD COLUMN IF NOT EXISTS hash_archivo TEXT;

-- Deliberately not UNIQUE: re-importing on purpose is legitimate (a first
-- import that was miscategorised and reverted, for instance). The point is to
-- warn loudly, not to make it impossible.
CREATE INDEX IF NOT EXISTS idx_finanzas_importaciones_hash
  ON finanzas_importaciones (sede_id, hash_archivo)
  WHERE hash_archivo IS NOT NULL;

COMMENT ON COLUMN finanzas_importaciones.hash_archivo IS
  'SHA-256 of the imported PDF, computed in the browser. Null on batches
   imported before this column existed.';
