-- ====================================================================================
-- RESTORIFY — Create a work order and its children in one transaction
-- ====================================================================================
-- Creating an order is four writes: the order itself, its labor lines, its
-- parts and its assignments. Over PostgREST those are four separate requests
-- with no transaction around them, so a failure on any of the last three left
-- a half-built order behind: it had already taken a number from the
-- trg_numero_orden counter, it showed up on the board with no labor, no parts
-- and nobody assigned, and the person who created it had seen an error and had
-- no reason to think anything had been saved at all.
--
-- The client compensates by deleting the order when a child insert fails, but
-- that is a best-effort cleanup that a dropped connection defeats. A function
-- makes the whole thing one statement, so it either all lands or none of it
-- does.
--
-- SECURITY INVOKER (the default) is deliberate: the function must run as the
-- caller so every RLS policy on ordenes_trabajo, orden_labor, orden_repuestos
-- and orden_asignaciones applies exactly as it does today. A SECURITY DEFINER
-- version here would quietly become a way for a technician to write rows into
-- another sede.

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
    p_order->>'tipo_trabajo',
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
  -- whether it matches quantity × price.
  INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal)
  SELECT
    v_order.id,
    item->>'descripcion',
    COALESCE((item->>'cantidad')::int, 1),
    COALESCE((item->>'costo_unitario')::numeric, 0),
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

COMMENT ON FUNCTION public.create_work_order(jsonb, jsonb, jsonb, jsonb) IS
  'Creates a work order together with its labor, parts and assignments in a
   single transaction. Runs as the caller (SECURITY INVOKER) so RLS applies
   unchanged. Returns the order with its trigger-computed totals.';

REVOKE ALL ON FUNCTION public.create_work_order(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_work_order(jsonb, jsonb, jsonb, jsonb) TO authenticated;
