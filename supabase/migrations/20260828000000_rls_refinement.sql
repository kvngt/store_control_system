-- ====================================================================================
-- RESTORIFY — RLS Refinement by Sede/Rol + Configurable Workshop Capacity
-- ====================================================================================

-- 1. Configurable capacity per sede (used for occupancy rate on the dashboard)
ALTER TABLE sedes ADD COLUMN IF NOT EXISTS capacidad INTEGER NOT NULL DEFAULT 10;

-- 2. Helper functions (SECURITY DEFINER to avoid RLS recursion when policies
--    on `perfiles` need to read from `perfiles` itself).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT rol FROM perfiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_sede_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT sede_id FROM perfiles WHERE id = auth.uid();
$$;

-- 3. Drop the previous "allow everything to any authenticated user" policies.
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON sedes;
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON perfiles;
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON clientes;
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON vehiculos;
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON ordenes_trabajo;
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON orden_labor;
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON orden_repuestos;
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON orden_asignaciones;
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON finanzas_movimientos;
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON nomina_pagos;

-- 4. Sedes — every authenticated user can see the list (needed for the sede
--    switcher and dropdowns); only admins can create/edit/delete a sede.
CREATE POLICY "sedes_select" ON sedes FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "sedes_write" ON sedes FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- 5. Perfiles — a user can see/update their own row, everyone at the same
--    sede (needed to display coworkers/assignees), and admins see everyone.
CREATE POLICY "perfiles_select" ON perfiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.current_user_role() = 'admin'
    OR sede_id = public.current_user_sede_id()
  );
CREATE POLICY "perfiles_insert" ON perfiles FOR INSERT
  WITH CHECK (id = auth.uid() OR public.current_user_role() = 'admin');
CREATE POLICY "perfiles_update" ON perfiles FOR UPDATE
  USING (id = auth.uid() OR public.current_user_role() = 'admin');
CREATE POLICY "perfiles_delete" ON perfiles FOR DELETE
  USING (public.current_user_role() = 'admin');

-- 6. Clientes — scoped to the user's own sede; admins see every sede.
CREATE POLICY "clientes_all" ON clientes FOR ALL
  USING (public.current_user_role() = 'admin' OR sede_id = public.current_user_sede_id())
  WITH CHECK (public.current_user_role() = 'admin' OR sede_id = public.current_user_sede_id());

-- 7. Vehiculos — scoped via the owning customer's sede.
CREATE POLICY "vehiculos_all" ON vehiculos FOR ALL
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = vehiculos.cliente_id AND c.sede_id = public.current_user_sede_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = vehiculos.cliente_id AND c.sede_id = public.current_user_sede_id()
    )
  );

-- 8. Ordenes de trabajo — scoped to the order's own sede.
CREATE POLICY "ordenes_trabajo_all" ON ordenes_trabajo FOR ALL
  USING (public.current_user_role() = 'admin' OR sede_id = public.current_user_sede_id())
  WITH CHECK (public.current_user_role() = 'admin' OR sede_id = public.current_user_sede_id());

-- 9. Labor / parts / assignments — scoped via the parent order's sede.
CREATE POLICY "orden_labor_all" ON orden_labor FOR ALL
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_labor.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_labor.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  );

CREATE POLICY "orden_repuestos_all" ON orden_repuestos FOR ALL
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_repuestos.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_repuestos.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  );

CREATE POLICY "orden_asignaciones_all" ON orden_asignaciones FOR ALL
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_asignaciones.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_asignaciones.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  );

-- 10. Finance & payroll — admin only, regardless of sede (mechanics/painters
--     never see money data, matching the app's adminOnly routes).
CREATE POLICY "finanzas_movimientos_admin" ON finanzas_movimientos FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "nomina_pagos_admin" ON nomina_pagos FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- 11. Clean up the broken auth.users rows left behind by a previous raw SQL
--     seed (they were inserted without the fields GoTrue requires, so they
--     were unusable for login and have since been replaced). Only removes
--     the exact known orphaned demo rows, never anything referenced by a
--     live perfiles row.
DELETE FROM auth.users
WHERE id IN (
  '04f98d2a-1c85-447c-8141-207fd69ad52e',
  '77338b7c-1aa0-49d7-8f2f-7d013af33cea',
  '388f9040-c4e7-4df5-990c-a7d7365a1cf1',
  '7e308fc8-1afa-4156-ac98-5eea92141cdf',
  'fecc7434-567d-42ce-8bfe-b6311e432707',
  '92c330e9-6601-41d9-8947-411d928ec4a3',
  'b188608a-53dc-43df-b214-3d7a14307027'
)
AND NOT EXISTS (SELECT 1 FROM perfiles WHERE perfiles.id = auth.users.id);
