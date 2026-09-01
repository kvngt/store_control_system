-- ====================================================================================
-- RESTORIFY — Per-sede branding + user avatars
-- ====================================================================================
-- Each workshop location can carry its own logo and accent colour, which the
-- app injects at runtime when a sede is selected. Employees only ever see
-- their own sede's branding; admins see whichever sede they switch to.

-- 1. Branding columns on sedes.
--    color_tema: accent colour as a hex string (e.g. '#D4A017'). NULL means
--    "use the default Restorify gold", so existing rows keep working untouched.
ALTER TABLE sedes ADD COLUMN IF NOT EXISTS color_tema TEXT;
ALTER TABLE sedes ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Guard against a malformed colour breaking the whole UI theme.
ALTER TABLE sedes DROP CONSTRAINT IF EXISTS sedes_color_tema_hex;
ALTER TABLE sedes ADD CONSTRAINT sedes_color_tema_hex
  CHECK (color_tema IS NULL OR color_tema ~* '^#[0-9a-f]{6}$');

-- 2. Public bucket for sede logos. Readable by anyone (the logo shows on the
--    login screen before a session exists); only admins can upload/replace.
INSERT INTO storage.buckets (id, name, public)
VALUES ('sede_logos', 'sede_logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "sede_logos_public_select" ON storage.objects;
CREATE POLICY "sede_logos_public_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'sede_logos');

DROP POLICY IF EXISTS "sede_logos_admin_insert" ON storage.objects;
CREATE POLICY "sede_logos_admin_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sede_logos' AND public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "sede_logos_admin_update" ON storage.objects;
CREATE POLICY "sede_logos_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'sede_logos' AND public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "sede_logos_admin_delete" ON storage.objects;
CREATE POLICY "sede_logos_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'sede_logos' AND public.current_user_role() = 'admin');

-- 3. Public bucket for profile photos. Each user writes only inside a folder
--    named after their own auth uid: avatares/<uid>/<file>.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatares', 'avatares', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatares_public_select" ON storage.objects;
CREATE POLICY "avatares_public_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatares');

DROP POLICY IF EXISTS "avatares_own_insert" ON storage.objects;
CREATE POLICY "avatares_own_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatares'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "avatares_own_update" ON storage.objects;
CREATE POLICY "avatares_own_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatares'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "avatares_own_delete" ON storage.objects;
CREATE POLICY "avatares_own_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatares'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. The parts form no longer captures a cost — only the sale price. The
--    column stays (it's useful for future margin reporting) but must not block
--    an insert that omits it.
ALTER TABLE orden_repuestos ALTER COLUMN costo_unitario SET DEFAULT 0;

-- 5. A profile's own name/email/photo must be editable by its owner. The
--    existing perfiles_update policy already allows `id = auth.uid()`, but
--    email uniqueness needs enforcing at the DB level so two employees can't
--    end up sharing one (the UI validates too, this is the real guarantee).
CREATE UNIQUE INDEX IF NOT EXISTS perfiles_email_unique_idx
  ON perfiles (lower(email));
