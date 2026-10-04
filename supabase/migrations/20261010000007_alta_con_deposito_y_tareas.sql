-- ------------------------------------------------------------------------------------
-- Nueva orden en 4 secciones: depósito con método y tareas con técnico desde el alta
-- (plan-mejoras-2026-10, F4)
-- ------------------------------------------------------------------------------------
-- Pedido del taller (03/10/2026): la sección 3 del alta es el depósito, "si el cliente dejó
-- algo introducir la cantidad y si fue efectivo, transferencia o cheque, que permita opcional
-- agregar número de cheque, foto o desde la galería para comprobante de transferencia". Y la
-- sección 4 son las tareas, cada una con su técnico (el editor de F3).
--
-- Hasta hoy el depósito inicial se asentaba en Finanzas SIN método: `trg_order_deposit_sync`
-- solo conoce el monto (lo escribe un UPDATE de `orden_montos`). Y las líneas del alta nacían
-- heredadas (`reparto_heredado = true`, sin técnico), porque `create_work_order` no conocía
-- las columnas de F3.
--
-- Cambios:
--   1. `create_work_order` (misma firma: dos versiones harían fallar a PostgREST con PGRST203)
--      lee de `p_order` las claves opcionales `deposito_metodo`, `deposito_numero_cheque` y
--      `deposito_comprobante_ruta`, las valida como `entregar_orden` y las pasa al trigger
--      del depósito por la configuración de la transacción `restorify.deposito` (jsonb con
--      la orden, para que no se aplique a otra). El número de cheque y el comprobante son
--      opcionales (lo pidió el taller); el método también, mientras la app vieja siga
--      publicada (no lo manda).
--   2. `p_labor` acepta por línea `asignado_a` y `reparto_heredado`. Sin ellas, lo de hoy
--      (sin técnico, reparto heredado). Con técnico y sin `reparto_heredado`, la línea queda
--      fuera del reparto (igual que `setLaborTechnician` en el detalle). Las validaciones de
--      F3 (`trg_guard_labor_tecnico`: mecánico o pintor de la sede de la orden) aplican igual,
--      y `trg_labor_tecnico_asignado` mete al técnico en la orden con origen 'tarea'.
--   3. `p_assignments`: quien ya entró a la orden por una tarea de `p_labor` se omite. Sin
--      esto quedaba dos veces (una 'tarea' y otra 'manual'), y la 'manual' lo metía al reparto
--      heredado sin que nadie lo decidiera. Para meterlo al reparto, administración usa "Sumar
--      al reparto" en el detalle. Quien no tiene tareas entra como hoy ('manual'). Los
--      repetidos dentro de `p_assignments` se insertan una sola vez. La app vieja no manda
--      técnicos en las líneas, así que para ella nada cambia.
--   4. `trg_order_deposit_sync` usa `restorify.deposito` solo para el DEPÓSITO INICIAL (de 0
--      a más de 0, en la transacción del alta) y llena `metodo_pago`, `numero_cheque` y
--      `comprobante_ruta` del movimiento "Depósito inicial". Después la limpia. Un ajuste
--      posterior del depósito sigue sin método, como hoy.
--
-- Expandir y contraer: solo agrega comportamiento opcional. La app publicada sigue llamando a
-- `create_work_order` sin las claves nuevas y obtiene exactamente lo de antes (pgTAP 20).
-- Orden de publicación: db push → push a `main`.
-- ------------------------------------------------------------------------------------


-- ----- 1. El alta ---------------------------------------------------------------------------
-- Parte de la versión vigente (20261009000000). Cambia: el método del depósito, el técnico de
-- cada línea y las asignaciones que ya trajeron las tareas.
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
  v_order    ordenes_trabajo;
  v_admin    BOOLEAN := public.is_admin();
  v_deposito NUMERIC := GREATEST(COALESCE((p_order->>'deposito_inicial')::numeric, 0), 0);
  -- Opcionales (la app anterior no los manda).
  v_metodo   TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_metodo', '')), '');
  v_cheque   TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_numero_cheque', '')), '');
  v_ruta     TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_comprobante_ruta', '')), '');
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
    COALESCE(p_order->>'inspeccion_360_notas', ''),
    (p_order->>'fecha_estimada_entrega')::date,
    0,
    (p_order->>'creado_por')::uuid
  )
  RETURNING * INTO v_order;
  -- trg_order_montos_create ya dejó la fila de montos en cero.

  IF v_admin THEN
    -- El depósito, validado como en `entregar_orden` (después del INSERT: a quien no puede
    -- abrir órdenes lo rechaza primero la política). Con monto, el método es opcional mientras
    -- la app anterior siga publicada; el cheque y el comprobante, siempre.
    IF v_deposito > 0 THEN
      IF v_metodo IS NOT NULL AND v_metodo NOT IN ('efectivo', 'cheque', 'transferencia') THEN
        RAISE EXCEPTION 'Elige cómo dejó el depósito el cliente: efectivo, cheque o transferencia.'
          USING ERRCODE = '22023';
      END IF;
      IF v_metodo IS NULL AND (v_cheque IS NOT NULL OR v_ruta IS NOT NULL) THEN
        RAISE EXCEPTION 'Elige cómo dejó el depósito el cliente: efectivo, cheque o transferencia.'
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

    INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1),
      COALESCE((item->>'precio_venta_unitario')::numeric, 0),
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


-- ----- 2. El movimiento del depósito --------------------------------------------------------
-- Parte de la versión vigente (20260918000000). Cambia: el depósito inicial lleva el método,
-- el número de cheque y el comprobante que dejó `create_work_order` en `restorify.deposito`.
CREATE OR REPLACE FUNCTION public.trg_order_deposit_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord      RECORD;
  previo   NUMERIC;
  delta    NUMERIC;
  v_cfg    JSONB;
  v_metodo TEXT;
  v_cheque TEXT;
  v_ruta   TEXT;
BEGIN
  previo := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.deposito_inicial, 0) ELSE 0 END;
  delta := COALESCE(NEW.deposito_inicial, 0) - previo;

  IF ABS(delta) <= 0.01 THEN
    RETURN NEW;
  END IF;

  SELECT id, sede_id, numero_orden, creado_por INTO ord
  FROM ordenes_trabajo WHERE id = NEW.orden_id;

  -- Solo el depósito inicial, y solo con los datos de esta misma orden. Un ajuste posterior
  -- (o un depósito puesto después desde el detalle) queda sin método, como antes.
  IF previo = 0 AND delta > 0 THEN
    v_cfg := NULLIF(current_setting('restorify.deposito', true), '')::jsonb;
    IF v_cfg IS NOT NULL AND v_cfg->>'orden_id' = NEW.orden_id::text THEN
      v_metodo := NULLIF(v_cfg->>'metodo', '');
      v_cheque := NULLIF(v_cfg->>'numero_cheque', '');
      v_ruta   := NULLIF(v_cfg->>'comprobante_ruta', '');
      -- Segunda capa: `create_work_order` ya lo validó.
      IF v_ruta IS NOT NULL AND v_ruta NOT LIKE ord.sede_id::text || '/%' THEN
        RAISE EXCEPTION 'El comprobante debe guardarse en la carpeta de la sede de la orden.'
          USING ERRCODE = '42501';
      END IF;
      PERFORM set_config('restorify.deposito', '', true);
    END IF;
  END IF;

  INSERT INTO finanzas_movimientos (
    sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id, registrado_por,
    metodo_pago, numero_cheque, comprobante_ruta
  )
  VALUES (
    ord.sede_id,
    (CASE WHEN delta > 0 THEN 'ingreso' ELSE 'egreso' END)::transaction_type,
    'pago_cliente',
    ABS(delta),
    CASE WHEN previo = 0 THEN 'Depósito inicial - ' ELSE 'Ajuste de depósito - ' END || ord.numero_orden,
    CURRENT_DATE,
    ord.id,
    COALESCE(auth.uid(), ord.creado_por),
    v_metodo,
    v_cheque,
    v_ruta
  );

  RETURN NEW;
END;
$$;
-- Solo la llama su trigger (corre como su dueño): sin GRANT.
REVOKE ALL ON FUNCTION public.trg_order_deposit_sync() FROM PUBLIC, anon, authenticated;
