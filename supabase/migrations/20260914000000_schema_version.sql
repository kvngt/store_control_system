-- ====================================================================================
-- RESTORIFY — Telling the app which schema it is actually talking to
-- ====================================================================================
-- Reported from the shop as three separate bugs on the same day:
--
--   "Could not find the table 'public.comisiones' in the schema cache"
--   "Could not find the function public.sede_delete_impact in the schema cache"
--   "Bucket not found"
--
-- All three had one cause: the front-end had been built and shipped, and the
-- migrations it depended on had never been pushed. Nothing anywhere said so.
-- The application assumed tables, functions and storage buckets that did not
-- exist, and each one failed only at the moment somebody pressed the button —
-- which for the person using it is indistinguishable from a broken feature.
--
-- This function closes that gap: it lets the running app ask the database which
-- migration it is on, so a mismatch can be reported as a mismatch instead of as
-- a pile of unrelated errors.
--
-- SECURITY DEFINER because `supabase_migrations` is not in the API schema and
-- should not be — the caller gets one version string, not read access to the
-- migration history.
CREATE OR REPLACE FUNCTION public.app_schema_version()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(MAX(version), '') FROM supabase_migrations.schema_migrations;
$$;

COMMENT ON FUNCTION public.app_schema_version() IS
  'The newest migration version applied to this database, so a deployed client
   can detect that it is running against a schema older than the one it was
   built for. Returns an empty string when no migrations are recorded.';

REVOKE ALL ON FUNCTION public.app_schema_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_schema_version() TO authenticated;
