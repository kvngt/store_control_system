-- ====================================================================================
-- RESTORIFY — Strict per-sede isolation, customer signature, check number
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. Vehicles get their own sede_id.
-- ------------------------------------------------------------------------------------
-- Until now a vehicle only belonged to a sede *indirectly*, through its customer.
-- That made isolation fragile (an admin's query returned every sede's vehicles)
-- and meant moving a customer silently moved their cars too. Storing sede_id on
-- the row makes the boundary explicit, indexable and enforceable by RLS.

ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS sede_id UUID REFERENCES sedes(id) ON DELETE RESTRICT;

-- Backfill from the owning customer before making it required.
UPDATE vehiculos v
SET sede_id = c.sede_id
FROM clientes c
WHERE v.cliente_id = c.id AND v.sede_id IS NULL;

ALTER TABLE vehiculos ALTER COLUMN sede_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehiculos_sede_id ON vehiculos(sede_id);

-- The client never sends sede_id: it is always derived from the customer, so a
-- vehicle can never end up in a different sede than its owner.
CREATE OR REPLACE FUNCTION public.trg_set_vehiculo_sede()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT sede_id INTO NEW.sede_id FROM clientes WHERE id = NEW.cliente_id;
  IF NEW.sede_id IS NULL THEN
    RAISE EXCEPTION 'El cliente % no existe o no tiene sede asignada.', NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehiculo_sede ON vehiculos;
CREATE TRIGGER trg_vehiculo_sede
  BEFORE INSERT OR UPDATE OF cliente_id ON vehiculos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_vehiculo_sede();

-- RLS now reads the column directly instead of joining through clientes.
DROP POLICY IF EXISTS "vehiculos_all" ON vehiculos;
CREATE POLICY "vehiculos_all" ON vehiculos FOR ALL
  USING (public.current_user_role() = 'admin' OR sede_id = public.current_user_sede_id())
  WITH CHECK (public.current_user_role() = 'admin' OR sede_id = public.current_user_sede_id());

-- ------------------------------------------------------------------------------------
-- 2. A work order must never mix sedes.
-- ------------------------------------------------------------------------------------
-- Belt and braces for the app-level filtering: refuse an order whose customer or
-- vehicle belongs to a different sede than the order itself.
CREATE OR REPLACE FUNCTION public.trg_check_orden_sede()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cliente_sede UUID;
  vehiculo_sede UUID;
BEGIN
  SELECT sede_id INTO cliente_sede FROM clientes WHERE id = NEW.cliente_id;
  SELECT sede_id INTO vehiculo_sede FROM vehiculos WHERE id = NEW.vehiculo_id;

  IF cliente_sede IS DISTINCT FROM NEW.sede_id THEN
    RAISE EXCEPTION 'El cliente pertenece a otra sede.';
  END IF;
  IF vehiculo_sede IS DISTINCT FROM NEW.sede_id THEN
    RAISE EXCEPTION 'El vehículo pertenece a otra sede.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orden_sede_coherente ON ordenes_trabajo;
CREATE TRIGGER trg_orden_sede_coherente
  BEFORE INSERT OR UPDATE OF cliente_id, vehiculo_id, sede_id ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_orden_sede();

-- ------------------------------------------------------------------------------------
-- 3. Customer signature on the work order.
-- ------------------------------------------------------------------------------------
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS firma_cliente_url TEXT;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS firma_fecha TIMESTAMP WITH TIME ZONE;

-- Public bucket so the generated PDF can embed the image by URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('firmas', 'firmas', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "firmas_public_select" ON storage.objects;
CREATE POLICY "firmas_public_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'firmas');

DROP POLICY IF EXISTS "firmas_auth_insert" ON storage.objects;
CREATE POLICY "firmas_auth_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'firmas' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "firmas_auth_update" ON storage.objects;
CREATE POLICY "firmas_auth_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'firmas' AND auth.role() = 'authenticated');

-- ------------------------------------------------------------------------------------
-- 4. Check number on imported bank transactions.
-- ------------------------------------------------------------------------------------
ALTER TABLE finanzas_movimientos ADD COLUMN IF NOT EXISTS numero_cheque TEXT;
