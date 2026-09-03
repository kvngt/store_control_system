-- ====================================================================================
-- RESTORIFY — Destructive-action hardening & privilege-escalation fixes
-- ====================================================================================
-- Threat model: a mechanic/painter who is about to be (or has just been) let go
-- still holds a valid session. The anon key and every table endpoint are public
-- in the browser bundle, so hiding a button in React proves nothing — the only
-- boundary that actually holds is RLS. This migration moves every destructive
-- operation on customer/vehicle/order data behind the admin role, and closes
-- the two paths that let a technician become an admin in the first place.

-- ------------------------------------------------------------------------------------
-- 0. Helper: "is the caller an admin?"
-- ------------------------------------------------------------------------------------
-- SECURITY DEFINER so policies on `perfiles` can consult `perfiles` without
-- recursing through its own RLS, matching current_user_role()/current_user_sede_id().
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT rol FROM perfiles WHERE id = auth.uid()) = 'admin', false);
$$;

-- ------------------------------------------------------------------------------------
-- 1. PRIVILEGE ESCALATION — a user could promote themselves to admin.
-- ------------------------------------------------------------------------------------
-- The previous policy was:
--     FOR UPDATE USING (id = auth.uid() OR current_user_role() = 'admin')
-- With no WITH CHECK, Postgres reuses USING for the new row — and `id = auth.uid()`
-- is still true after the row is edited. So any technician could PATCH their own
-- perfiles row with {"rol":"admin"} straight against the REST API and obtain
-- finances, payroll, every sede and every delete permission in the system.
-- Changing sede_id the same way let them walk into another workshop's data.
--
-- RLS alone cannot express "you may edit this row but not these two columns"
-- (WITH CHECK never sees OLD), so the column-level rule is a trigger.

CREATE OR REPLACE FUNCTION public.trg_guard_perfil_privilegios()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- No end-user JWT on the request means this is a trusted maintenance path:
  -- the service-role key (create-employee / delete-employee) or plain SQL run
  -- by a migration or seed. Those must stay able to fix up a profile.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'No puedes cambiar el identificador de un perfil.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de un usuario.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.sede_id IS DISTINCT FROM OLD.sede_id THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la sede de un usuario.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perfil_privilegios ON perfiles;
CREATE TRIGGER trg_perfil_privilegios
  BEFORE UPDATE ON perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_perfil_privilegios();

-- Make the row-level rule explicit as well, so USING is never silently reused
-- as WITH CHECK again.
DROP POLICY IF EXISTS "perfiles_update" ON perfiles;
CREATE POLICY "perfiles_update" ON perfiles FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------------------------------
-- 2. PRIVILEGE ESCALATION — self-signup could mint an admin profile.
-- ------------------------------------------------------------------------------------
-- `enable_signup = true` with `enable_confirmations = false` means anybody on the
-- internet can create an auth user. The old insert policy then allowed
--     WITH CHECK (id = auth.uid() OR current_user_role() = 'admin')
-- so that brand-new stranger could insert their own perfiles row with
-- rol = 'admin' and any sede_id — going from anonymous to full administrator in
-- two requests, without ever having worked at the shop.
--
-- Employees are only ever created through the `create-employee` edge function,
-- which runs on the service-role key and therefore bypasses RLS entirely. So
-- nothing legitimate needs the self-insert path.
DROP POLICY IF EXISTS "perfiles_insert" ON perfiles;
CREATE POLICY "perfiles_insert" ON perfiles FOR INSERT
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------------
-- 3. Customers — deleting is admin-only.
-- ------------------------------------------------------------------------------------
-- `clientes` had a single FOR ALL policy, so every mechanic and painter in the
-- sede could DELETE. Worse, vehiculos.cliente_id is ON DELETE CASCADE: removing
-- one customer silently takes their whole vehicle history with it. Read/create/
-- edit stay open to the sede (day-to-day intake work needs them); DELETE is
-- reserved for admins.
DROP POLICY IF EXISTS "clientes_all" ON clientes;

CREATE POLICY "clientes_select" ON clientes FOR SELECT
  USING (public.is_admin() OR sede_id = public.current_user_sede_id());

CREATE POLICY "clientes_insert" ON clientes FOR INSERT
  WITH CHECK (public.is_admin() OR sede_id = public.current_user_sede_id());

CREATE POLICY "clientes_update" ON clientes FOR UPDATE
  USING (public.is_admin() OR sede_id = public.current_user_sede_id())
  WITH CHECK (public.is_admin() OR sede_id = public.current_user_sede_id());

CREATE POLICY "clientes_delete" ON clientes FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------------------------------
-- 4. Vehicles — deleting is admin-only.
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "vehiculos_all" ON vehiculos;

CREATE POLICY "vehiculos_select" ON vehiculos FOR SELECT
  USING (public.is_admin() OR sede_id = public.current_user_sede_id());

CREATE POLICY "vehiculos_insert" ON vehiculos FOR INSERT
  WITH CHECK (public.is_admin() OR sede_id = public.current_user_sede_id());

CREATE POLICY "vehiculos_update" ON vehiculos FOR UPDATE
  USING (public.is_admin() OR sede_id = public.current_user_sede_id())
  WITH CHECK (public.is_admin() OR sede_id = public.current_user_sede_id());

CREATE POLICY "vehiculos_delete" ON vehiculos FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------------------------------
-- 5. Work orders — deleting is admin-only.
-- ------------------------------------------------------------------------------------
-- The UI already hid the delete button from technicians, but the policy allowed
-- it, so that button was the only thing standing between a technician and
-- `DELETE /rest/v1/ordenes_trabajo?sede_id=eq.<their sede>`.
DROP POLICY IF EXISTS "ordenes_trabajo_all" ON ordenes_trabajo;

CREATE POLICY "ordenes_trabajo_select" ON ordenes_trabajo FOR SELECT
  USING (public.is_admin() OR sede_id = public.current_user_sede_id());

CREATE POLICY "ordenes_trabajo_insert" ON ordenes_trabajo FOR INSERT
  WITH CHECK (public.is_admin() OR sede_id = public.current_user_sede_id());

CREATE POLICY "ordenes_trabajo_update" ON ordenes_trabajo FOR UPDATE
  USING (public.is_admin() OR sede_id = public.current_user_sede_id())
  WITH CHECK (public.is_admin() OR sede_id = public.current_user_sede_id());

CREATE POLICY "ordenes_trabajo_delete" ON ordenes_trabajo FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------------------------------
-- 6. Progress log — an audit trail, so only its author or an admin may remove one.
-- ------------------------------------------------------------------------------------
-- Previously anyone in the sede could erase anyone else's documented progress,
-- which is exactly the record you want intact when a job is disputed.
DROP POLICY IF EXISTS "orden_avances_all" ON orden_avances;

CREATE POLICY "orden_avances_select" ON orden_avances FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_avances.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  );

CREATE POLICY "orden_avances_insert" ON orden_avances FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      usuario_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM ordenes_trabajo o
        WHERE o.id = orden_avances.orden_id AND o.sede_id = public.current_user_sede_id()
      )
    )
  );

CREATE POLICY "orden_avances_update" ON orden_avances FOR UPDATE
  USING (public.is_admin() OR usuario_id = auth.uid())
  WITH CHECK (public.is_admin() OR usuario_id = auth.uid());

CREATE POLICY "orden_avances_delete" ON orden_avances FOR DELETE
  USING (public.is_admin() OR usuario_id = auth.uid());

-- ------------------------------------------------------------------------------------
-- 7. Storage — photos and signatures could be wiped or overwritten by anyone.
-- ------------------------------------------------------------------------------------
-- `vehiculos_fotos` allowed DELETE and UPDATE to any authenticated user, over the
-- entire bucket. One request per object and every intake photo backing a damage
-- dispute is gone. Uploads (INSERT) stay open — that is the daily job — but
-- destroying or overwriting an existing object is now admin-only. Upload paths
-- always carry a Date.now() suffix, so normal uploads never hit the UPDATE path.
DROP POLICY IF EXISTS "Authenticated users can delete photos" ON storage.objects;
CREATE POLICY "vehiculos_fotos_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehiculos_fotos' AND public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can update photos" ON storage.objects;
CREATE POLICY "vehiculos_fotos_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vehiculos_fotos' AND public.is_admin());

-- Same reasoning for the customer signatures backing each order.
DROP POLICY IF EXISTS "firmas_auth_update" ON storage.objects;
CREATE POLICY "firmas_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'firmas' AND public.is_admin());

-- ------------------------------------------------------------------------------------
-- 8. Intake mileage can never be negative.
-- ------------------------------------------------------------------------------------
-- An odometer reading below zero is meaningless and silently corrupts the PDF
-- report and any mileage-based history. Clean up anything already stored that
-- way, then enforce it at the column so no client — form, script or raw REST
-- call — can reintroduce it.
UPDATE ordenes_trabajo SET millas_ingreso = 0 WHERE millas_ingreso < 0;

ALTER TABLE ordenes_trabajo DROP CONSTRAINT IF EXISTS ordenes_trabajo_millas_ingreso_no_negativa;
ALTER TABLE ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_millas_ingreso_no_negativa
  CHECK (millas_ingreso >= 0);
