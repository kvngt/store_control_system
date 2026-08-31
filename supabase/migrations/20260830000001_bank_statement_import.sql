-- ====================================================================================
-- RESTORIFY — Bank Statement Import (no AI: local PDF parsing + keyword rules)
-- ====================================================================================
-- Lets an admin upload a bank statement PDF, have it parsed client-side, and
-- review/confirm which lines get inserted into finanzas_movimientos. Nothing
-- here writes financial rows automatically — this only adds the supporting
-- schema (import batches, categorization rules, traceability column, private
-- storage for the source PDF).

-- 1. Track each uploaded statement as an import batch.
CREATE TABLE finanzas_importaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sede_id UUID REFERENCES sedes(id) ON DELETE RESTRICT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,
  fecha_importacion TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  importado_por UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  total_transacciones INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE finanzas_importaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finanzas_importaciones_admin" ON finanzas_importaciones FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- 2. Tag finanzas_movimientos rows that came from an import, so a whole batch
--    can be audited or undone (delete-by-batch) without touching organic rows.
ALTER TABLE finanzas_movimientos
  ADD COLUMN importacion_id UUID REFERENCES finanzas_importaciones(id) ON DELETE SET NULL;

-- 3. Keyword-based categorization rules — editable over time as new vendors
--    show up, instead of hardcoding them in the frontend. Seeded below from
--    the vendors observed in the sample Wells Fargo statements.
CREATE TABLE finanzas_reglas_categorizacion (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patron TEXT NOT NULL,
  categoria transaction_category NOT NULL,
  activo BOOLEAN DEFAULT true NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE finanzas_reglas_categorizacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finanzas_reglas_admin" ON finanzas_reglas_categorizacion FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

INSERT INTO finanzas_reglas_categorizacion (patron, categoria) VALUES
  ('autozone', 'compra_repuesto'),
  ('parts authority', 'compra_repuesto'),
  ('sherwin-williams', 'compra_repuesto'),
  ('impactpro parts', 'compra_repuesto'),
  ('roberts oxygen', 'compra_repuesto'),
  ('missco', 'compra_repuesto'),
  ('vcd auto repair', 'compra_repuesto'),
  ('napa', 'compra_repuesto'),
  ('o''reilly', 'compra_repuesto'),
  ('monthly service fee', 'gasto_operativo'),
  ('transactions fee', 'gasto_operativo'),
  ('cash deposit processing fee', 'gasto_operativo'),
  ('bankcard fee', 'gasto_operativo'),
  ('bankcard discount fee', 'gasto_operativo'),
  ('clover fee', 'gasto_operativo'),
  ('atm withdrawal', 'gasto_operativo'),
  ('harbor freight', 'gasto_operativo'),
  ('the home depot', 'gasto_operativo'),
  ('zelle from', 'pago_cliente'),
  ('bankcard deposit', 'pago_cliente'),
  ('mobile deposit', 'pago_cliente'),
  ('edeposit', 'pago_cliente');

-- 4. Private storage for the original PDF — audit trail only, never sent to
--    any third-party service. Unlike vehiculos_fotos this bucket is NOT
--    public, and only admins may read/write it.
INSERT INTO storage.buckets (id, name, public)
VALUES ('estados_cuenta_bancarios', 'estados_cuenta_bancarios', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "estados_cuenta_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'estados_cuenta_bancarios' AND public.current_user_role() = 'admin');

CREATE POLICY "estados_cuenta_admin_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'estados_cuenta_bancarios' AND public.current_user_role() = 'admin');

CREATE POLICY "estados_cuenta_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'estados_cuenta_bancarios' AND public.current_user_role() = 'admin');
