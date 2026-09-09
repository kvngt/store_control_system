-- ====================================================================================
-- RESTORIFY — create_work_order could never insert a single order
-- ====================================================================================
-- `create_work_order` read the work type straight out of the JSON payload:
--
--     p_order->>'tipo_trabajo',
--
-- `->>` returns `text`, and `ordenes_trabajo.tipo_trabajo` is the `work_type`
-- enum. Postgres has no implicit cast from text to an enum, so every call died
-- with:
--
--     42804: column "tipo_trabajo" is of type work_type but expression is of
--            type text
--
-- This is the same trap migration 20260909000000 documented for a CASE
-- expression, and for the same reason it stayed invisible: a plpgsql body is
-- not type-checked when the function is created, so the migration applied
-- cleanly and the error waited for the first actual call.
--
-- It waited a long time. The function was written but never pushed, so the
-- client kept silently using its no-RPC fallback and orders got created. The
-- moment the migration was applied, the fallback stopped running — it only
-- triggers on "function not found" (PGRST202 / 42883), and 42804 is neither —
-- and creating a work order broke outright.
--
-- The neighbouring literals are fine and are left alone: `'recepcion'` and
-- `'pendiente'` are untyped literals, which Postgres resolves against the
-- target column. Only a value that already carries the `text` type needs the
-- cast. `orden_asignaciones.tipo_tarea` is a real TEXT column, so it does not.

CREATE OR REPLACE FUNCTION public.create_work_order(
  p_order        jsonb,
  p_labor        jsonb DEFAULT '[]'::jsonb,
  p_parts        jsonb DEFAULT '[]'::jsonb,
  p_assignments  jsonb DEFAULT '[]'::jsonb
)
RETURNS ordenes_trabajo
LANGUAGE plpgsql
AS $$
DECLARE
  v_order ordenes_trabajo;
BEGIN
  INSERT INTO ordenes_trabajo (
    sede_id,
    cliente_id,
    vehiculo_id,
    tipo_trabajo,
    estatus,
    millas_ingreso,
    nivel_gasolina,
    deposito_inicial,
    inspeccion_360_notas,
    fecha_estimada_entrega,
    porcentaje_avance,
    creado_por
  )
  VALUES (
    (p_order->>'sede_id')::uuid,
    (p_order->>'cliente_id')::uuid,
    (p_order->>'vehiculo_id')::uuid,
    (p_order->>'tipo_trabajo')::work_type,
    'recepcion',
    COALESCE((p_order->>'millas_ingreso')::int, 0),
    p_order->>'nivel_gasolina',
    COALESCE((p_order->>'deposito_inicial')::numeric, 0),
    COALESCE(p_order->>'inspeccion_360_notas', ''),
    (p_order->>'fecha_estimada_entrega')::date,
    0,
    (p_order->>'creado_por')::uuid
  )
  RETURNING * INTO v_order;

  INSERT INTO orden_labor (orden_id, descripcion, costo)
  SELECT v_order.id, item->>'descripcion', COALESCE((item->>'costo')::numeric, 0)
  FROM jsonb_array_elements(COALESCE(p_labor, '[]'::jsonb)) AS item;

  -- `subtotal` is computed here rather than trusted from the client: it is the
  -- figure the customer is invoiced, and the browser has no business deciding
  -- whether it matches quantity × price. `costo_unitario` is likewise not read
  -- from the payload — trg_part_cost_passthrough mirrors the price into it.
  INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal)
  SELECT
    v_order.id,
    item->>'descripcion',
    COALESCE((item->>'cantidad')::int, 1),
    COALESCE((item->>'precio_venta_unitario')::numeric, 0),
    COALESCE((item->>'precio_venta_unitario')::numeric, 0),
    COALESCE((item->>'cantidad')::int, 1) * COALESCE((item->>'precio_venta_unitario')::numeric, 0)
  FROM jsonb_array_elements(COALESCE(p_parts, '[]'::jsonb)) AS item;

  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, estatus_tarea)
  SELECT v_order.id, (item->>'usuario_id')::uuid, item->>'tipo_tarea', 'pendiente'
  FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) AS item;

  -- The child inserts fire the totals triggers, so re-read the row to return
  -- the recomputed total_labor / total_repuestos / total_general instead of the
  -- zeroes it was inserted with.
  SELECT * INTO v_order FROM ordenes_trabajo WHERE id = v_order.id;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_work_order(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_work_order(jsonb, jsonb, jsonb, jsonb) TO authenticated;
