-- ====================================================================================
-- RESTORIFY — Deleting a workshop, and parts as a pass-through cost
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. A sede could not be deleted once it had been used.
-- ------------------------------------------------------------------------------------
-- Every domain table references `sedes` with ON DELETE RESTRICT, which is the
-- right default — you do not want a mis-click to take a workshop's whole
-- history with it. But it left the admin with a dead button and this message:
--
--   "No se puede completar la acción porque este registro está relacionado con
--    otros datos (por ejemplo, órdenes o vehículos existentes)."
--
-- ...and no way at all to act on it, because "reassign those first" was not
-- something the UI could do either. Reported from the shop as simply "no puedo
-- borrar una sede".
--
-- The fix is a deliberate, admin-only cascade: the caller is shown exactly what
-- will be destroyed, and then asks for it by name. Two functions, because
-- counting and deleting are different questions and the dialog needs the first
-- one before the user can answer the second.

-- What deleting this sede would destroy. Read-only; safe to call from a dialog.
CREATE OR REPLACE FUNCTION public.sede_delete_impact(p_sede_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar esta información.'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'ordenes',      (SELECT COUNT(*) FROM ordenes_trabajo WHERE sede_id = p_sede_id),
    'clientes',     (SELECT COUNT(*) FROM clientes WHERE sede_id = p_sede_id),
    'vehiculos',    (SELECT COUNT(*) FROM vehiculos v
                       JOIN clientes c ON c.id = v.cliente_id
                      WHERE c.sede_id = p_sede_id),
    'movimientos',  (SELECT COUNT(*) FROM finanzas_movimientos WHERE sede_id = p_sede_id),
    'empleados',    (SELECT COUNT(*) FROM perfiles WHERE sede_id = p_sede_id),
    'otras_sedes',  (SELECT COUNT(*) FROM sedes WHERE id <> p_sede_id)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.sede_delete_impact(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sede_delete_impact(UUID) TO authenticated;

-- The cascade itself.
--
-- Employees are moved, never deleted. A profile is a person's login: wiping a
-- workshop should not silently destroy the accounts of everyone who worked
-- there — including, if the admin happens to belong to that sede, their own.
-- They are reassigned to another sede, which is why deleting the last remaining
-- sede is refused outright.
CREATE OR REPLACE FUNCTION public.delete_sede_cascade(p_sede_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallback_sede UUID;
  v_impact        JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar una sede.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sedes WHERE id = p_sede_id) THEN
    RAISE EXCEPTION 'La sede ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  -- Where the staff of this sede end up. Preferring the caller's own sede keeps
  -- them somewhere the admin is already looking.
  SELECT id INTO v_fallback_sede
  FROM sedes
  WHERE id <> p_sede_id
  ORDER BY (id = (SELECT sede_id FROM perfiles WHERE id = auth.uid())) DESC, nombre
  LIMIT 1;

  IF v_fallback_sede IS NULL AND EXISTS (SELECT 1 FROM perfiles WHERE sede_id = p_sede_id) THEN
    RAISE EXCEPTION 'No puedes eliminar la última sede: los empleados quedarían sin taller. Crea otra sede primero.'
      USING ERRCODE = 'P0001';
  END IF;

  v_impact := public.sede_delete_impact(p_sede_id);

  -- Order matters: children before parents, and finance rows before the orders
  -- they point at so `referencia_orden_id` is never left dangling.
  DELETE FROM finanzas_movimientos WHERE sede_id = p_sede_id;

  DELETE FROM finanzas_movimientos
  WHERE referencia_orden_id IN (SELECT id FROM ordenes_trabajo WHERE sede_id = p_sede_id);

  -- comisiones / comision_pagos cascade from sedes and from ordenes_trabajo,
  -- but the payment rows reference perfiles with RESTRICT, so they go first.
  DELETE FROM comision_pagos WHERE sede_id = p_sede_id;
  DELETE FROM comisiones WHERE sede_id = p_sede_id;

  -- orden_labor / orden_repuestos / orden_asignaciones / orden_avances all
  -- cascade from ordenes_trabajo.
  DELETE FROM ordenes_trabajo WHERE sede_id = p_sede_id;

  -- vehiculos cascade from clientes.
  DELETE FROM clientes WHERE sede_id = p_sede_id;

  DELETE FROM finanzas_importaciones WHERE sede_id = p_sede_id;

  UPDATE perfiles SET sede_id = v_fallback_sede WHERE sede_id = p_sede_id;

  DELETE FROM sedes WHERE id = p_sede_id;

  RETURN v_impact || jsonb_build_object('empleados_reasignados', v_impact->'empleados');
END;
$$;

COMMENT ON FUNCTION public.delete_sede_cascade(UUID) IS
  'Deletes a workshop together with its customers, vehicles, orders, finance
   movements and commissions. Employees are moved to another workshop rather
   than deleted. Admin-only; refuses when it would leave staff with no sede.';

REVOKE ALL ON FUNCTION public.delete_sede_cascade(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_sede_cascade(UUID) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 2. Parts are a pass-through: what the customer pays is what they cost.
-- ------------------------------------------------------------------------------------
-- The intake form and the order detail carried two money columns per part —
-- "costo unitario" (what the shop paid) and "precio" (what the customer is
-- charged) — and the shop only ever filled in one of them. In practice a part
-- is billed on at what it cost, so the second column was a field nobody used
-- that still had to be tabbed through on every line, on a tablet, on the
-- busiest screen in the building. It has been removed from the UI.
--
-- The column stays, because Finanzas books the parts expense from it and the
-- commission base subtracts it. Keeping the two in step is now the database's
-- job rather than a rule each caller has to remember: whatever is charged is
-- what is recorded as having been paid.
CREATE OR REPLACE FUNCTION public.trg_part_cost_follows_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.costo_unitario := COALESCE(NEW.precio_venta_unitario, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_part_cost_passthrough ON orden_repuestos;
CREATE TRIGGER trg_part_cost_passthrough
  BEFORE INSERT OR UPDATE ON orden_repuestos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_part_cost_follows_price();

-- Existing rows are deliberately left alone. Their `costo_unitario` is mostly
-- 0 because the field was never filled in, and rewriting it would make
-- `sync_order_parts_expense` book a correcting entry against every delivered
-- order — restating months the shop has already closed. New and edited parts
-- follow the rule from here on.

-- ------------------------------------------------------------------------------------
-- 3. A bucket for shared work-order reports.
-- ------------------------------------------------------------------------------------
-- The shop asked to be able to send a customer their report. Private rather
-- than public: the PDF carries the customer's name, their vehicle and its VIN,
-- and a public bucket puts all of that on a guessable URL. Sharing is done with
-- a signed link, so the customer (and anyone they forward it to) can open it
-- without an account, and it expires.
INSERT INTO storage.buckets (id, name, public)
VALUES ('reportes', 'reportes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "reportes_sede_select" ON storage.objects;
CREATE POLICY "reportes_sede_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'reportes'
  AND (
    public.is_admin()
    OR (storage.foldername(name))[1] = public.current_user_sede_id()::text
  )
);

DROP POLICY IF EXISTS "reportes_sede_insert" ON storage.objects;
CREATE POLICY "reportes_sede_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'reportes'
  AND (
    public.is_admin()
    OR (storage.foldername(name))[1] = public.current_user_sede_id()::text
  )
);

DROP POLICY IF EXISTS "reportes_sede_update" ON storage.objects;
CREATE POLICY "reportes_sede_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'reportes'
  AND (
    public.is_admin()
    OR (storage.foldername(name))[1] = public.current_user_sede_id()::text
  )
);

DROP POLICY IF EXISTS "reportes_admin_delete" ON storage.objects;
CREATE POLICY "reportes_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'reportes' AND public.is_admin());
