-- ====================================================================================
-- RESTORIFY — Autorizar en recepción (A0)
-- ====================================================================================
-- Plan de adopción, aprobado por la persona responsable el 14/10/2026: el alta puede dejar autorizado lo cotizado cuando el
-- cliente lo acepta en persona en el mostrador.
--
-- Regla («solo lo autorizado se cobra»):
-- - La casilla viene desmarcada por defecto.
-- - Solo un administrador puede crear órdenes con líneas cotizadas.
-- - Si la casilla viene marcada (autorizado_en_recepcion = true) y hay líneas en borrador,
--   se registran como autorizadas en persona (admin_presencial) a nombre del cliente.
-- - La firma de recepción sigue sin autorizar nada: firmar es estar de acuerdo con cómo
--   se recibió el vehículo (inspección y daños).
--
-- create_work_order: reescrita entera desde 20261010000027.
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.create_work_order(
  p_order       JSONB,
  p_labor       JSONB DEFAULT '[]'::jsonb,
  p_parts       JSONB DEFAULT '[]'::jsonb,
  p_assignments JSONB DEFAULT '[]'::jsonb
)
RETURNS ordenes_trabajo
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order      ordenes_trabajo;
  v_admin      BOOLEAN := public.is_admin();
  v_deposito   NUMERIC := GREATEST(COALESCE((p_order->>'deposito_inicial')::numeric, 0), 0);
  -- Opcionales (la app anterior no los manda).
  v_metodo     TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_metodo', '')), '');
  v_cheque     TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_numero_cheque', '')), '');
  v_ruta       TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_comprobante_ruta', '')), '');
  v_borradores UUID[];
BEGIN
  INSERT INTO ordenes_trabajo (
    sede_id,
    cliente_id,
    vehiculo_id,
    tipo_trabajo,
    estatus,
    millas_ingreso,
    nivel_gasolina,
    inspeccion_360_notas,
    fecha_estimada_entrega,
    porcentaje_avance,
    creado_por,
    con_seguro,
    aseguradora,
    numero_reclamo
  )
  VALUES (
    (p_order->>'sede_id')::uuid,
    (p_order->>'cliente_id')::uuid,
    (p_order->>'vehiculo_id')::uuid,
    (p_order->>'tipo_trabajo')::work_type,
    'recepcion',
    COALESCE((p_order->>'millas_ingreso')::int, 0),
    p_order->>'nivel_gasolina',
    COALESCE(p_order->>'inspeccion_360_notas', ''),
    (p_order->>'fecha_estimada_entrega')::date,
    0,
    (p_order->>'creado_por')::uuid,
    COALESCE((p_order->>'con_seguro')::boolean, false),
    NULLIF(btrim(COALESCE(p_order->>'aseguradora', '')), ''),
    NULLIF(btrim(COALESCE(p_order->>'numero_reclamo', '')), '')
  )
  RETURNING * INTO v_order;
  -- trg_order_montos_create ya dejó la fila de montos en cero.

  IF v_admin THEN
    -- El depósito, validado como en `entregar_orden` (después del INSERT: a quien no puede
    -- abrir órdenes lo rechaza primero la política). Con monto, el método es opcional mientras
    -- la app anterior siga publicada; el cheque y el comprobante, siempre.
    IF v_deposito > 0 THEN
      IF v_metodo IS NOT NULL AND v_metodo NOT IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque') THEN
        RAISE EXCEPTION 'Elige cómo dejó el depósito el cliente: efectivo, tarjeta, Zelle, transferencia o cheque.'
          USING ERRCODE = '22023';
      END IF;
      IF v_metodo IS NULL AND (v_cheque IS NOT NULL OR v_ruta IS NOT NULL) THEN
        RAISE EXCEPTION 'Elige cómo dejó el depósito el cliente: efectivo, tarjeta, Zelle, transferencia o cheque.'
          USING ERRCODE = '22023';
      END IF;
      -- El comprobante es un archivo del bucket privado, en la carpeta de la sede de la orden.
      IF v_ruta IS NOT NULL AND v_ruta NOT LIKE v_order.sede_id::text || '/%' THEN
        RAISE EXCEPTION 'El comprobante debe guardarse en la carpeta de la sede de la orden.'
          USING ERRCODE = '42501';
      END IF;
      -- Un número de cheque solo tiene sentido en un cheque.
      IF v_metodo IS DISTINCT FROM 'cheque' THEN
        v_cheque := NULL;
      END IF;

      -- `trg_order_deposit_sync` lo usa para el movimiento "Depósito inicial" de ESTA orden
      -- y lo limpia; se limpia también aquí por si el UPDATE no llegara a asentarlo.
      PERFORM set_config(
        'restorify.deposito',
        jsonb_build_object(
          'orden_id', v_order.id,
          'metodo', v_metodo,
          'numero_cheque', v_cheque,
          'comprobante_ruta', v_ruta
        )::text,
        true
      );
      UPDATE orden_montos SET deposito_inicial = v_deposito WHERE orden_id = v_order.id;
      PERFORM set_config('restorify.deposito', '', true);
    END IF;

    -- Cada línea puede traer su técnico. Sin `reparto_heredado`: con técnico, fuera del
    -- reparto (como `setLaborTechnician`); sin técnico, el reparto heredado de siempre.
    INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, reparto_heredado)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'costo')::numeric, 0), 0),
      CASE WHEN item->>'especialidad' IN ('mecanica', 'pintura') THEN item->>'especialidad' END,
      t.tecnico,
      COALESCE((item->>'reparto_heredado')::boolean, t.tecnico IS NULL)
    FROM jsonb_array_elements(COALESCE(p_labor, '[]'::jsonb)) AS item
    CROSS JOIN LATERAL (
      SELECT NULLIF(btrim(COALESCE(item->>'asignado_a', '')), '')::uuid AS tecnico
    ) AS t;

    -- El costo, si lo mandan y no es negativo; si no, el precio.
    INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1),
      COALESCE(
        NULLIF(GREATEST(COALESCE((item->>'costo_unitario')::numeric, -1), -1), -1),
        COALESCE((item->>'precio_venta_unitario')::numeric, 0)
      ),
      COALESCE((item->>'precio_venta_unitario')::numeric, 0),
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1) * COALESCE((item->>'precio_venta_unitario')::numeric, 0)
    FROM jsonb_array_elements(COALESCE(p_parts, '[]'::jsonb)) AS item;

    -- Quien ya entró por una tarea de arriba (origen 'tarea') no se vuelve a agregar: una
    -- segunda fila 'manual' lo metería al reparto heredado sin que nadie lo decidiera.
    INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, estatus_tarea)
    SELECT DISTINCT v_order.id, a.usuario_id, a.tipo_tarea, 'pendiente'::task_status
    FROM (
      SELECT (item->>'usuario_id')::uuid AS usuario_id, item->>'tipo_tarea' AS tipo_tarea
      FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) AS item
    ) AS a
    WHERE NOT EXISTS (
      SELECT 1 FROM orden_asignaciones x
      WHERE x.orden_id = v_order.id AND x.usuario_id = a.usuario_id
    );

    -- Si se solicitó autorizar en recepción y la orden tiene líneas en borrador,
    -- se autorizan en el acto en persona a nombre del cliente.
    IF COALESCE((p_order->>'autorizado_en_recepcion')::boolean, false) THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_borradores
      FROM (
        SELECT id FROM orden_labor WHERE orden_id = v_order.id AND estado = 'borrador'
        UNION ALL
        SELECT id FROM orden_repuestos WHERE orden_id = v_order.id AND estado = 'borrador'
      ) AS b;

      IF cardinality(v_borradores) > 0 THEN
        PERFORM public.registrar_autorizacion(
          v_order.id,
          v_borradores,
          v_borradores,
          'admin_presencial',
          NULL,
          'Autorizado al recibir el vehículo.'
        );
      END IF;
    END IF;
  ELSE
    INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, estatus_tarea)
    VALUES (
      v_order.id,
      auth.uid(),
      CASE WHEN public.current_user_role() = 'pintor' THEN 'pintura' ELSE 'mecanica' END,
      'pendiente'
    );
  END IF;

  SELECT * INTO v_order FROM ordenes_trabajo WHERE id = v_order.id;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_work_order(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_work_order(JSONB, JSONB, JSONB, JSONB) TO authenticated;
