-- ====================================================================================
-- RESTORIFY — Auditoría 2026-11 (segunda parte): integridad, portal vencido y Storage
-- ====================================================================================
-- Orden de trabajo 6. Cada función se reescribe entera desde su versión vigente
-- (20261010000043 o la última migración anterior que la definió), y se conservan
-- exactamente sus permisos (REVOKE / GRANT).
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. No duplicar estados de cuenta al importar
-- ------------------------------------------------------------------------------------
-- Convertir el índice del hash en UNIQUE parcial para impedir dos importaciones del
-- mismo archivo dentro de la misma sede (doble clic o reintento de red), y devolver un
-- 23505 con un mensaje claro para el taller.
DROP INDEX IF EXISTS public.idx_finanzas_importaciones_hash;
CREATE UNIQUE INDEX idx_finanzas_importaciones_hash
  ON public.finanzas_importaciones (sede_id, hash_archivo)
  WHERE hash_archivo IS NOT NULL;

-- Versión vigente: 20260927000000_production_hardening.sql:108-163
CREATE OR REPLACE FUNCTION public.importar_estado_cuenta(p_importacion JSONB, p_movimientos JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id   UUID;
  v_sede UUID := (p_importacion->>'sede_id')::uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede importar estados de cuenta.' USING ERRCODE = '42501';
  END IF;
  IF v_sede IS NULL THEN
    RAISE EXCEPTION 'Falta la sede del estado de cuenta.';
  END IF;
  IF jsonb_typeof(p_movimientos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_movimientos) = 0 THEN
    RAISE EXCEPTION 'No hay movimientos para importar.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_movimientos) mv
    WHERE (mv->>'monto') IS NULL OR (mv->>'monto')::numeric < 0 OR (mv->>'fecha') IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay movimientos sin monto, con monto negativo o sin fecha.';
  END IF;

  BEGIN
    INSERT INTO finanzas_importaciones (sede_id, nombre_archivo, ruta_archivo, importado_por, total_transacciones, hash_archivo)
    VALUES (
      v_sede,
      p_importacion->>'nombre_archivo',
      p_importacion->>'ruta_archivo',
      auth.uid(),
      jsonb_array_length(p_movimientos),
      NULLIF(p_importacion->>'hash_archivo', '')
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Este estado de cuenta ya se importó.' USING ERRCODE = '23505';
  END;

  INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, numero_cheque, registrado_por, importacion_id)
  SELECT
    v_sede,
    (mv->>'tipo')::transaction_type,
    (mv->>'categoria')::transaction_category,
    (mv->>'monto')::numeric,
    COALESCE(mv->>'descripcion', ''),
    (mv->>'fecha')::date,
    NULLIF(btrim(mv->>'numero_cheque'), ''),
    auth.uid(),
    v_id
  FROM jsonb_array_elements(p_movimientos) mv;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.importar_estado_cuenta(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_estado_cuenta(JSONB, JSONB) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 2. Restricciones que faltaban en finanzas_movimientos y orden_asignaciones
-- ------------------------------------------------------------------------------------
-- Todos los caminos vigentes que escriben en finanzas_movimientos garantizan monto >= 0
-- (el signo contable va en `tipo` = ingreso/egreso).
ALTER TABLE public.finanzas_movimientos DROP CONSTRAINT IF EXISTS finanzas_movimientos_monto_no_negativo;
ALTER TABLE public.finanzas_movimientos
  ADD CONSTRAINT finanzas_movimientos_monto_no_negativo
  CHECK (monto >= 0);

-- `orden_asignaciones.tipo_tarea` sigue siendo TEXT (20240101000000:111). Todos los
-- caminos vigentes (`create_work_order`, `trg_labor_tecnico_asignado`, `addAssignment`)
-- escriben 'mecanica' o 'pintura' sin insertar duplicados para (orden_id, usuario_id, tipo_tarea).
ALTER TABLE public.orden_asignaciones DROP CONSTRAINT IF EXISTS orden_asignaciones_tipo_tarea_check;
ALTER TABLE public.orden_asignaciones
  ADD CONSTRAINT orden_asignaciones_tipo_tarea_check
  CHECK (tipo_tarea IN ('mecanica', 'pintura'));

ALTER TABLE public.orden_asignaciones DROP CONSTRAINT IF EXISTS orden_asignaciones_unica;
ALTER TABLE public.orden_asignaciones
  ADD CONSTRAINT orden_asignaciones_unica
  UNIQUE (orden_id, usuario_id, tipo_tarea);


-- ------------------------------------------------------------------------------------
-- 3. create_work_order: tolerar cadenas vacías en campos numéricos opcionales
-- ------------------------------------------------------------------------------------
-- Versión vigente: 20261010000036_horas_reloj_e_indicadores.sql:535-745
-- Además de `costo_unitario` (que llega como "" desde PartEditor y CatalogPickerModal),
-- `deposito_inicial` y `millas_ingreso` pueden llegar como "" si el formulario se envía
-- con esos campos sin llenar o borrados.
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
  v_deposito   NUMERIC := GREATEST(COALESCE(NULLIF(btrim(COALESCE(p_order->>'deposito_inicial', '')), '')::numeric, 0), 0);
  -- Opcionales (la app anterior no los manda).
  v_metodo     TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_metodo', '')), '');
  v_cheque     TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_numero_cheque', '')), '');
  v_ruta       TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_comprobante_ruta', '')), '');
  v_borradores UUID[];
  v_mapa       JSONB := '{}'::jsonb;
  t            JSONB;
  v_trabajo_id UUID;
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
    numero_reclamo,
    marcas_danos
  )
  VALUES (
    (p_order->>'sede_id')::uuid,
    (p_order->>'cliente_id')::uuid,
    (p_order->>'vehiculo_id')::uuid,
    (p_order->>'tipo_trabajo')::work_type,
    'recepcion',
    COALESCE(NULLIF(btrim(COALESCE(p_order->>'millas_ingreso', '')), '')::int, 0),
    p_order->>'nivel_gasolina',
    COALESCE(p_order->>'inspeccion_360_notas', ''),
    (p_order->>'fecha_estimada_entrega')::date,
    0,
    (p_order->>'creado_por')::uuid,
    COALESCE((p_order->>'con_seguro')::boolean, false),
    NULLIF(btrim(COALESCE(p_order->>'aseguradora', '')), ''),
    NULLIF(btrim(COALESCE(p_order->>'numero_reclamo', '')), ''),
    CASE WHEN jsonb_typeof(p_order->'marcas_danos') = 'array' THEN p_order->'marcas_danos' ELSE '[]'::jsonb END
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

    -- Trabajos agrupados (20261010000034)
    IF jsonb_typeof(p_order->'trabajos') = 'array' THEN
      FOR t IN SELECT * FROM jsonb_array_elements(p_order->'trabajos')
      LOOP
        IF NULLIF(btrim(COALESCE(t->>'grupo', '')), '') IS NOT NULL AND NULLIF(btrim(COALESCE(t->>'titulo', '')), '') IS NOT NULL THEN
          INSERT INTO orden_trabajos (orden_id, titulo, catalogo_id, creado_por)
          VALUES (
            v_order.id,
            btrim(t->>'titulo'),
            (
              SELECT c.id
              FROM catalogo_trabajos c
              WHERE c.id = CASE
                WHEN (t->>'catalogo_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (t->>'catalogo_id')::uuid
                ELSE NULL
              END
                AND c.sede_id = v_order.sede_id
            ),
            (p_order->>'creado_por')::uuid
          )
          RETURNING id INTO v_trabajo_id;

          v_mapa := v_mapa || jsonb_build_object(t->>'grupo', v_trabajo_id);
        END IF;
      END LOOP;
    END IF;

    -- Cada línea puede traer su técnico. Sin `reparto_heredado`: con técnico, fuera del
    -- reparto (como `setLaborTechnician`); sin técnico, el reparto heredado de siempre.
    -- Horas leídas de item->>'horas' (20261010000036).
    INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, reparto_heredado, trabajo_id)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'costo')::numeric, 0), 0),
      NULLIF(btrim(COALESCE(item->>'horas', '')), '')::numeric,
      CASE WHEN item->>'especialidad' IN ('mecanica', 'pintura') THEN item->>'especialidad' END,
      t.tecnico,
      COALESCE((item->>'reparto_heredado')::boolean, t.tecnico IS NULL),
      (v_mapa ->> (item->>'grupo'))::uuid
    FROM jsonb_array_elements(COALESCE(p_labor, '[]'::jsonb)) AS item
    CROSS JOIN LATERAL (
      SELECT NULLIF(btrim(COALESCE(item->>'asignado_a', '')), '')::uuid AS tecnico
    ) AS t;

    -- El costo, si lo mandan y no es negativo; si no, el precio.
    INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal, trabajo_id)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1),
      COALESCE(
        NULLIF(GREATEST(COALESCE(NULLIF(btrim(COALESCE(item->>'costo_unitario', '')), '')::numeric, -1), -1), -1),
        COALESCE((item->>'precio_venta_unitario')::numeric, 0)
      ),
      COALESCE((item->>'precio_venta_unitario')::numeric, 0),
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1) * COALESCE((item->>'precio_venta_unitario')::numeric, 0),
      (v_mapa ->> (item->>'grupo'))::uuid
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


-- ------------------------------------------------------------------------------------
-- 4. Políticas de storage.objects con InitPlan (SELECT …)
-- ------------------------------------------------------------------------------------
-- `orden_media_select` (20261007000000) y `orden_media_delete` (20261010000043) ya envuelven
-- sus llamadas; las otras 20 políticas vigentes con helpers o `auth.uid()` se recrean aquí.

-- Vigente: 20260830000001_bank_statement_import.sql:79-89
DROP POLICY IF EXISTS "estados_cuenta_admin_select" ON storage.objects;
CREATE POLICY "estados_cuenta_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'estados_cuenta_bancarios' AND (SELECT public.current_user_role()) = 'admin');

DROP POLICY IF EXISTS "estados_cuenta_admin_insert" ON storage.objects;
CREATE POLICY "estados_cuenta_admin_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'estados_cuenta_bancarios' AND (SELECT public.current_user_role()) = 'admin');

DROP POLICY IF EXISTS "estados_cuenta_admin_delete" ON storage.objects;
CREATE POLICY "estados_cuenta_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'estados_cuenta_bancarios' AND (SELECT public.current_user_role()) = 'admin');

-- Vigente: 20260902000000_sede_branding_and_avatars.sql:30-43
DROP POLICY IF EXISTS "sede_logos_admin_insert" ON storage.objects;
CREATE POLICY "sede_logos_admin_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sede_logos' AND (SELECT public.current_user_role()) = 'admin');

DROP POLICY IF EXISTS "sede_logos_admin_update" ON storage.objects;
CREATE POLICY "sede_logos_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'sede_logos' AND (SELECT public.current_user_role()) = 'admin');

DROP POLICY IF EXISTS "sede_logos_admin_delete" ON storage.objects;
CREATE POLICY "sede_logos_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'sede_logos' AND (SELECT public.current_user_role()) = 'admin');

-- Vigente: 20260927000000_production_hardening.sql:280-296
DROP POLICY IF EXISTS "avatares_own_insert" ON storage.objects;
CREATE POLICY "avatares_own_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatares'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (SELECT public.current_user_role()) IS NOT NULL
);

DROP POLICY IF EXISTS "avatares_own_update" ON storage.objects;
CREATE POLICY "avatares_own_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatares'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (SELECT public.current_user_role()) IS NOT NULL
);

-- Vigente: 20260902000000_sede_branding_and_avatars.sql:72-78
DROP POLICY IF EXISTS "avatares_own_delete" ON storage.objects;
CREATE POLICY "avatares_own_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatares'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Vigente: 20260908000000_destructive_action_hardening.sql:212-226
DROP POLICY IF EXISTS "vehiculos_fotos_admin_delete" ON storage.objects;
CREATE POLICY "vehiculos_fotos_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehiculos_fotos' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "vehiculos_fotos_admin_update" ON storage.objects;
CREATE POLICY "vehiculos_fotos_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vehiculos_fotos' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "firmas_admin_update" ON storage.objects;
CREATE POLICY "firmas_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'firmas' AND (SELECT public.is_admin()));

-- Vigente: 20260913000000_sede_cascade_delete.sql:218-221 (faltaba en la primera entrega;
-- la encontró la aserción [16] de la prueba 48).
DROP POLICY IF EXISTS "reportes_admin_delete" ON storage.objects;
CREATE POLICY "reportes_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'reportes' AND (SELECT public.is_admin()));

-- Vigente: 20260912000000_commission_payroll.sql:377-395
DROP POLICY IF EXISTS "comprobantes_admin_select" ON storage.objects;
CREATE POLICY "comprobantes_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'comprobantes' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "comprobantes_admin_insert" ON storage.objects;
CREATE POLICY "comprobantes_admin_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'comprobantes' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "comprobantes_admin_update" ON storage.objects;
CREATE POLICY "comprobantes_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'comprobantes' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "comprobantes_admin_delete" ON storage.objects;
CREATE POLICY "comprobantes_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'comprobantes' AND (SELECT public.is_admin()));

-- Vigente: 20260918000000_money_admin_only.sql:739-742
DROP POLICY IF EXISTS "reportes_admin_select" ON storage.objects;
CREATE POLICY "reportes_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'reportes' AND (SELECT public.is_admin()));

-- Vigente: 20260922000000_technician_assignment_enforcement.sql:217-259
DROP POLICY IF EXISTS "orden_media_insert" ON storage.objects;
CREATE POLICY "orden_media_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'orden_media'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM ordenes_trabajo o
    WHERE o.id::text = (storage.foldername(name))[2]
      AND o.sede_id::text = (storage.foldername(name))[1]
      AND (
        (SELECT public.is_admin())
        OR (
          o.sede_id = (SELECT public.current_user_sede_id())
          AND o.estatus <> 'entregado'
          AND (SELECT public.is_assigned_to_order(o.id))
        )
      )
  )
);

DROP POLICY IF EXISTS "vehiculos_fotos_admin_select" ON storage.objects;
CREATE POLICY "vehiculos_fotos_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehiculos_fotos' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "firmas_admin_select" ON storage.objects;
CREATE POLICY "firmas_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'firmas' AND (SELECT public.is_admin()));


-- ------------------------------------------------------------------------------------
-- 5. Zona horaria por defecto del taller: America/New_York
-- ------------------------------------------------------------------------------------
-- Versión vigente: 20261010000000_egresos_de_comision_por_orden.sql:243-304
CREATE OR REPLACE FUNCTION public.margen_ordenes(
  p_sede_id        UUID,
  p_desde          DATE,
  p_hasta          DATE,
  p_limite         INTEGER DEFAULT 25,
  p_desplazamiento INTEGER DEFAULT 0,
  p_tz             TEXT DEFAULT 'America/New_York'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(btrim(p_tz), ''), 'America/New_York');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el margen de las órdenes.' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH o AS (
      SELECT o.id, o.numero_orden, o.fecha_finalizacion, c.nombre AS cliente
      FROM ordenes_trabajo o
      LEFT JOIN clientes c ON c.id = o.cliente_id
      WHERE o.estatus = 'entregado'
        AND (p_sede_id IS NULL OR o.sede_id = p_sede_id)
        AND (o.fecha_finalizacion AT TIME ZONE v_tz)::date >= p_desde
        AND (o.fecha_finalizacion AT TIME ZONE v_tz)::date < p_hasta
    ),
    b AS (
      SELECT o.*, x.*
      FROM o CROSS JOIN LATERAL public._balance_orden(o.id) x
    )
    SELECT jsonb_build_object(
      'total_filas', (SELECT COUNT(*) FROM b),
      'sumas', (
        SELECT jsonb_build_object(
          'cobrado', COALESCE(SUM(cobrado), 0),
          'costo_repuestos', COALESCE(SUM(costo_repuestos), 0),
          'comisiones', COALESCE(SUM(comisiones), 0),
          'margen', COALESCE(SUM(margen), 0)
        ) FROM b
      ),
      'filas', COALESCE((
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.fecha_finalizacion DESC, p.id)
        FROM (
          SELECT id, numero_orden, cliente, fecha_finalizacion, total_orden, cobrado,
                 costo_repuestos, comisiones, margen
          FROM b
          ORDER BY fecha_finalizacion DESC, id
          LIMIT GREATEST(LEAST(COALESCE(p_limite, 25), 100), 1)
          OFFSET GREATEST(COALESCE(p_desplazamiento, 0), 0)
        ) p
      ), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.margen_ordenes(UUID, DATE, DATE, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.margen_ordenes(UUID, DATE, DATE, INTEGER, INTEGER, TEXT) TO authenticated;

-- Versión vigente: 20261010000017_dinero_de_la_orden.sql:1438-1507
CREATE OR REPLACE FUNCTION public.resumen_panel(
  p_sede_id UUID,
  p_hoy     DATE,
  p_tz      TEXT DEFAULT 'America/New_York'
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH p AS (
    SELECT date_trunc('month', p_hoy)::date                        AS mes_ini,
           (date_trunc('month', p_hoy) + INTERVAL '1 month')::date AS mes_fin,
           COALESCE(NULLIF(btrim(p_tz), ''), 'America/New_York')   AS tz
  ),
  o AS (
    SELECT estatus, fecha_finalizacion, retirada_sin_reparar FROM ordenes_trabajo
    WHERE p_sede_id IS NULL OR sede_id = p_sede_id
  ),
  m AS (
    SELECT tipo, monto, fecha FROM finanzas_movimientos
    WHERE (p_sede_id IS NULL OR sede_id = p_sede_id)
      AND importacion_id IS NULL
  ),
  meses AS (
    SELECT (date_trunc('month', p_hoy) - make_interval(months => g))::date AS ini
    FROM generate_series(5, 0, -1) AS g
  )
  SELECT jsonb_build_object(
    'ordenes_activas', (SELECT COUNT(*) FROM o WHERE estatus NOT IN ('finalizado', 'entregado')),
    'ordenes_finalizadas_mes', (
      SELECT COUNT(*) FROM o, p
      WHERE o.estatus IN ('finalizado', 'entregado')
        AND NOT o.retirada_sin_reparar
        AND o.fecha_finalizacion IS NOT NULL
        AND (o.fecha_finalizacion AT TIME ZONE p.tz)::date >= p.mes_ini
        AND (o.fecha_finalizacion AT TIME ZONE p.tz)::date <  p.mes_fin
    ),
    'ingresos_mes', (SELECT COALESCE(SUM(monto), 0) FROM m, p WHERE tipo = 'ingreso' AND fecha >= p.mes_ini AND fecha < p.mes_fin),
    'egresos_mes',  (SELECT COALESCE(SUM(monto), 0) FROM m, p WHERE tipo = 'egreso'  AND fecha >= p.mes_ini AND fecha < p.mes_fin),
    'ingresos_total', (SELECT COALESCE(SUM(monto), 0) FROM m WHERE tipo = 'ingreso'),
    'egresos_total',  (SELECT COALESCE(SUM(monto), 0) FROM m WHERE tipo = 'egreso'),
    'clientes_nuevos_mes', (
      SELECT COUNT(*) FROM clientes c, p
      WHERE (p_sede_id IS NULL OR c.sede_id = p_sede_id)
        AND (c.creado_en AT TIME ZONE p.tz)::date >= p.mes_ini
        AND (c.creado_en AT TIME ZONE p.tz)::date <  p.mes_fin
    ),
    'ordenes_por_estatus', (
      SELECT jsonb_build_object(
        'recepcion',           COUNT(*) FILTER (WHERE estatus = 'recepcion'),
        'en_proceso',          COUNT(*) FILTER (WHERE estatus = 'en_proceso'),
        'espera_autorizacion', COUNT(*) FILTER (WHERE estatus = 'espera_autorizacion'),
        'finalizado',          COUNT(*) FILTER (WHERE estatus = 'finalizado'),
        'entregado',           COUNT(*) FILTER (WHERE estatus = 'entregado')
      ) FROM o
    ),
    'ingresos_por_mes', (
      SELECT jsonb_agg(jsonb_build_object(
        'mes_inicio', x.ini,
        'ingresos', (SELECT COALESCE(SUM(monto), 0) FROM m WHERE tipo = 'ingreso' AND fecha >= x.ini AND fecha < (x.ini + INTERVAL '1 month')::date),
        'egresos',  (SELECT COALESCE(SUM(monto), 0) FROM m WHERE tipo = 'egreso'  AND fecha >= x.ini AND fecha < (x.ini + INTERVAL '1 month')::date)
      ) ORDER BY x.ini)
      FROM meses x
    )
  );
$$;
REVOKE ALL ON FUNCTION public.resumen_panel(UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_panel(UUID, DATE, TEXT) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 6. Darse de baja de correos con enlace vencido (y sin exponer el resto del reporte)
-- ------------------------------------------------------------------------------------
-- Versión vigente: 20261010000035_inspeccion_por_puntos.sql:726-1095
-- Cuando el enlace está vencido, se expone únicamente cliente.{tiene_correo, acepta_correos}
-- para que la vista de enlace no disponible pueda ofrecer la baja de correos.
CREATE OR REPLACE FUNCTION public.datos_portal(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace         orden_enlaces;
  v_orden          ordenes_trabajo;
  v_taller         JSONB;
  v_pagado         NUMERIC;
  v_montos         orden_montos;
  v_parq           JSONB;
  v_parqueo_portal JSONB := NULL;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado_enlace', 'no_encontrado');
  END IF;

  SELECT * INTO v_enlace FROM orden_enlaces WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado_enlace', 'no_encontrado');
  END IF;

  SELECT jsonb_build_object(
    'nombre', s.nombre,
    'direccion', s.direccion,
    'telefono', s.telefono,
    'telefonos', public._telefonos_sede(s.telefonos),
    'email', NULLIF(btrim(s.email_contacto), ''),
    'whatsapp', NULLIF(btrim(s.whatsapp), ''),
    'logo_url', s.logo_url,
    'color', s.color_tema
  ) INTO v_taller
  FROM sedes s WHERE s.id = v_enlace.sede_id;

  IF v_enlace.revocado_en IS NOT NULL THEN
    RETURN jsonb_build_object('estado_enlace', 'revocado', 'taller', v_taller);
  END IF;
  IF v_enlace.expira_en IS NOT NULL AND v_enlace.expira_en <= NOW() THEN
    RETURN jsonb_build_object(
      'estado_enlace', 'vencido',
      'taller', v_taller,
      'cliente', (
        SELECT jsonb_build_object(
          'tiene_correo', public.es_correo_valido(c.email),
          'acepta_correos', c.acepta_correos
        )
        FROM ordenes_trabajo o
        JOIN clientes c ON c.id = o.cliente_id
        WHERE o.id = v_enlace.orden_id
      )
    );
  END IF;

  UPDATE orden_enlaces
  SET accesos = accesos + 1, ultimo_acceso_en = NOW()
  WHERE id = v_enlace.id;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = v_enlace.orden_id;

  -- Recalcular parqueo antes de armar la cuenta si la orden no está entregada
  IF v_orden.estatus <> 'entregado' THEN
    BEGIN
      PERFORM public._recalcular_parqueo(v_orden.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'datos_portal recalcular_parqueo (%): %', v_orden.id, SQLERRM;
    END;
  END IF;

  SELECT * INTO v_montos FROM orden_montos WHERE orden_id = v_orden.id;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
  INTO v_pagado
  FROM finanzas_movimientos
  WHERE referencia_orden_id = v_orden.id AND categoria = 'pago_cliente' AND importacion_id IS NULL;

  -- Obtener información de parqueo para la cuenta
  BEGIN
    v_parq := public._parqueo_calcular(v_orden.id, NULL);
    IF v_parq->>'estado' NOT IN ('inactivo', 'sin_cobro', 'orden_previa') THEN
      v_parqueo_portal := jsonb_build_object(
        'estado', v_parq->>'estado',
        'inicio', v_parq->>'inicio',
        'dias', (v_parq->>'dias')::int,
        'monto', (v_parq->>'monto')::numeric,
        'detalle', v_parq->'detalle',
        'tope_aplicado', (v_parq->>'tope_aplicado')::boolean,
        'tarifa_inicial', (v_parq->>'tarifa_inicial')::numeric,
        'dias_gracia', (v_parq->>'dias_gracia')::int,
        'evento_inicio', v_parq->>'evento_inicio',
        'cobra_dia_evento', (v_parq->>'cobra_dia_evento')::boolean,
        'politica_es', v_parq->>'politica_es',
        'politica_en', v_parq->>'politica_en'
      );
    ELSE
      v_parqueo_portal := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_parqueo_portal := NULL;
  END;

  RETURN jsonb_build_object(
    'estado_enlace', 'ok',
    'taller', v_taller,
    'enlace', jsonb_build_object('expira_en', v_enlace.expira_en),
    'orden', jsonb_build_object(
      'numero', v_orden.numero_orden,
      'estatus', v_orden.estatus,
      'retirada_sin_reparar', v_orden.retirada_sin_reparar,
      'lista_para_entregar', v_orden.lista_para_entregar_en IS NOT NULL,
      'tipo_trabajo', v_orden.tipo_trabajo,
      'porcentaje_avance', v_orden.porcentaje_avance,
      'fecha_ingreso', v_orden.fecha_ingreso,
      'fecha_estimada_entrega', v_orden.fecha_estimada_entrega,
      'fecha_finalizacion', v_orden.fecha_finalizacion,
      'millas_ingreso', v_orden.millas_ingreso,
      'nivel_gasolina', v_orden.nivel_gasolina,
      'notas_recepcion', v_orden.inspeccion_360_notas,
      'marcas_danos', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'vista', m->>'vista',
            'x', (m->>'x')::numeric,
            'y', (m->>'y')::numeric,
            'tipo', m->>'tipo'
          )
        )
        FROM jsonb_array_elements(COALESCE(v_orden.marcas_danos, '[]'::jsonb)) AS m
      ), '[]'::jsonb),
      'firma_ruta', v_orden.firma_ruta,
      'firma_fecha', v_orden.firma_fecha
    ),
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre,
        'tiene_correo', public.es_correo_valido(c.email),
        'acepta_correos', c.acepta_correos,
        'idioma', c.idioma
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
    'traducciones', public._diccionario_traducciones(v_orden.id),
    'vehiculo', (
      SELECT jsonb_build_object(
        'marca', v.marca,
        'modelo', v.modelo,
        'anio', v.anio,
        'color', v.color,
        'placa', v.placa,
        'vin_final', right(v.vin, 6)
      )
      FROM vehiculos v WHERE v.id = v_orden.vehiculo_id
    ),
    'multimedia', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'tipo', m.tipo,
          'origen', m.origen,
          'avance_id', m.avance_id,
          'inspeccion_punto_id', m.inspeccion_punto_id,
          'zona', m.zona,
          'ruta', m.ruta,
          'ruta_miniatura', m.ruta_miniatura,
          'mime', m.mime,
          'duracion_seg', m.duracion_seg,
          'ancho', m.ancho,
          'alto', m.alto,
          'creado_en', m.creado_en
        ) ORDER BY m.creado_en
      )
      FROM orden_media m
      WHERE m.orden_id = v_orden.id
        AND (
          m.visible_cliente
          -- La foto de un punto sale con su inspección publicada, y solo la de un punto que
          -- el cliente ve (no los pendientes ni los "no aplica").
          OR (m.origen = 'inspeccion' AND EXISTS (
            SELECT 1
            FROM public.orden_inspeccion_puntos p
            JOIN public.orden_inspecciones i ON i.id = p.inspeccion_id
            WHERE p.id = m.inspeccion_punto_id
              AND i.publicada_en IS NOT NULL
              AND p.estado IN ('urgente', 'atencion', 'bien')
          ))
        )
    ), '[]'::jsonb),
    'avances', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'fecha', a.creado_en,
        'mensaje', NULLIF(btrim(a.descripcion), '')
      ) ORDER BY a.creado_en DESC)
      FROM orden_avances a
      WHERE a.orden_id = v_orden.id
        AND a.visible_cliente
        AND (
          NULLIF(btrim(a.descripcion), '') IS NOT NULL
          OR EXISTS (SELECT 1 FROM orden_media m WHERE m.avance_id = a.id AND m.visible_cliente)
        )
    ), '[]'::jsonb),
    'observaciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id,
        'fecha', h.resuelto_en,
        'texto', btrim(h.texto_cliente)
      ) ORDER BY h.resuelto_en, h.id)
      FROM orden_hallazgos h
      WHERE h.orden_id = v_orden.id
        AND h.estado = 'descartado'
        AND h.en_reporte
        AND NULLIF(btrim(h.texto_cliente), '') IS NOT NULL
    ), '[]'::jsonb),
    'esperando_repuestos', CASE WHEN v_orden.estatus = 'entregado' THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('descripcion', r.descripcion, 'desde', r.pedido_en) ORDER BY r.pedido_en, r.descripcion)
      FROM orden_repuestos r
      WHERE r.orden_id = v_orden.id AND r.estado_pedido = 'pedido' AND r.estado <> 'rechazado'
    ), '[]'::jsonb) END,
    'presupuesto', (
      SELECT jsonb_build_object(
        'id', p.id,
        'numero', p.numero,
        'enviado_en', p.creado_en,
        'total', p.total_propuesto,
        'trabajos', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', tj.id,
              'titulo', tj.titulo,
              'total', tj.total
            ) ORDER BY tj.creado_en, tj.titulo
          )
          FROM (
            SELECT
              ot.id,
              ot.titulo,
              ot.creado_en,
              SUM(x.monto) AS total
            FROM (
              SELECT lb.trabajo_id, lb.costo AS monto
              FROM orden_labor lb
              WHERE lb.presupuesto_id = p.id AND lb.estado = 'pendiente' AND lb.trabajo_id IS NOT NULL
              UNION ALL
              SELECT r.trabajo_id, r.subtotal AS monto
              FROM orden_repuestos r
              WHERE r.presupuesto_id = p.id AND r.estado = 'pendiente' AND r.trabajo_id IS NOT NULL
            ) x
            JOIN orden_trabajos ot ON ot.id = x.trabajo_id
            GROUP BY ot.id, ot.titulo, ot.creado_en
          ) tj
        ), '[]'::jsonb),
        'lineas', COALESCE((
          SELECT jsonb_agg(l.linea ORDER BY l.creado_en, l.descripcion)
          FROM (
            SELECT lb.creado_en, lb.descripcion, jsonb_build_object(
              'id', lb.id, 'tipo', 'mano_obra', 'descripcion', lb.descripcion,
              'cantidad', 1, 'precio_unitario', lb.costo, 'monto', lb.costo,
              'trabajo_id', lb.trabajo_id, 'trabajo', ot.titulo
            ) AS linea
            FROM orden_labor lb
            LEFT JOIN orden_trabajos ot ON ot.id = lb.trabajo_id
            WHERE lb.presupuesto_id = p.id AND lb.estado = 'pendiente'
            UNION ALL
            SELECT r.creado_en, r.descripcion, jsonb_build_object(
              'id', r.id, 'tipo', 'repuesto', 'descripcion', r.descripcion,
              'cantidad', r.cantidad, 'precio_unitario', r.precio_venta_unitario, 'monto', r.subtotal,
              'trabajo_id', r.trabajo_id, 'trabajo', ot.titulo
            )
            FROM orden_repuestos r
            LEFT JOIN orden_trabajos ot ON ot.id = r.trabajo_id
            WHERE r.presupuesto_id = p.id AND r.estado = 'pendiente'
          ) l
        ), '[]'::jsonb)
      )
      FROM presupuestos p
      WHERE p.orden_id = v_orden.id AND p.estado = 'enviado'
    ),
    'presupuestos_respondidos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', p.numero,
        'respondido_en', p.respondido_en,
        'via', p.respondido_via,
        'nombre', p.respondido_por_nombre,
        'total_aprobado', p.total_aprobado,
        'autorizados', (SELECT COUNT(*) FROM orden_labor WHERE presupuesto_id = p.id AND estado = 'aprobado')
                     + (SELECT COUNT(*) FROM orden_repuestos WHERE presupuesto_id = p.id AND estado = 'aprobado'),
        'rechazados', (SELECT COUNT(*) FROM orden_labor WHERE presupuesto_id = p.id AND estado = 'rechazado')
                    + (SELECT COUNT(*) FROM orden_repuestos WHERE presupuesto_id = p.id AND estado = 'rechazado')
      ) ORDER BY p.numero DESC)
      FROM presupuestos p
      WHERE p.orden_id = v_orden.id AND p.estado = 'respondido'
    ), '[]'::jsonb),
    'cuenta', jsonb_build_object(
      'mano_obra', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('descripcion', l.descripcion, 'monto', l.costo) ORDER BY l.creado_en, l.descripcion)
        FROM orden_labor l WHERE l.orden_id = v_orden.id AND l.estado = 'aprobado'
      ), '[]'::jsonb),
      'repuestos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'descripcion', r.descripcion,
          'cantidad', r.cantidad,
          'precio_unitario', r.precio_venta_unitario,
          'subtotal', r.subtotal
        ) ORDER BY r.creado_en, r.descripcion)
        FROM orden_repuestos r WHERE r.orden_id = v_orden.id AND r.estado = 'aprobado'
      ), '[]'::jsonb),
      'no_autorizados', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('descripcion', x.descripcion, 'monto', x.monto) ORDER BY x.creado_en)
        FROM (
          SELECT descripcion, costo AS monto, creado_en FROM orden_labor WHERE orden_id = v_orden.id AND estado = 'rechazado'
          UNION ALL
          SELECT descripcion, subtotal, creado_en FROM orden_repuestos WHERE orden_id = v_orden.id AND estado = 'rechazado'
        ) x
      ), '[]'::jsonb),
      'parqueo', v_parqueo_portal,
      'total_mano_obra', v_orden.total_labor,
      'total_repuestos', COALESCE(v_montos.total_repuestos, 0),
      'subtotal', COALESCE(v_orden.total_labor, 0) + COALESCE(v_montos.total_repuestos, 0),
      'descuento', COALESCE(v_montos.descuento, 0),
      'total', COALESCE(v_montos.total_general, 0),
      'deposito', COALESCE(v_montos.deposito_inicial, 0),
      'pagado', v_pagado,
      'otros_pagos', round(v_pagado - COALESCE(v_montos.deposito_inicial, 0), 2),
      'saldo', round(COALESCE(v_montos.total_general, 0) - v_pagado, 2)
    ),
    'proximo_servicio', (
      SELECT CASE
        WHEN ps.fecha IS NOT NULL OR ps.millas IS NOT NULL THEN
          jsonb_build_object(
            'fecha', ps.fecha,
            'millas', ps.millas,
            'nota', ps.nota
          )
        ELSE NULL
      END
      FROM public.orden_proximo_servicio ps
      WHERE ps.orden_id = v_orden.id
    ),
    'inspeccion', (
      SELECT jsonb_build_object(
        'nombre', i.nombre,
        'completada_en', i.completada_en,
        'resumen', jsonb_build_object(
          'urgente', COALESCE((SELECT COUNT(*)::int FROM public.orden_inspeccion_puntos WHERE inspeccion_id = i.id AND estado = 'urgente'), 0),
          'atencion', COALESCE((SELECT COUNT(*)::int FROM public.orden_inspeccion_puntos WHERE inspeccion_id = i.id AND estado = 'atencion'), 0),
          'bien', COALESCE((SELECT COUNT(*)::int FROM public.orden_inspeccion_puntos WHERE inspeccion_id = i.id AND estado = 'bien'), 0)
        ),
        'puntos', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'seccion', p.seccion,
              'nombre', p.nombre,
              'estado', p.estado,
              'nota', p.nota
            )
            ORDER BY
              CASE p.estado
                WHEN 'urgente' THEN 1
                WHEN 'atencion' THEN 2
                WHEN 'bien' THEN 3
                ELSE 4
              END,
              p.posicion,
              p.id
          )
          FROM public.orden_inspeccion_puntos p
          WHERE p.inspeccion_id = i.id
            AND p.estado IN ('urgente', 'atencion', 'bien')
        ), '[]'::jsonb)
      )
      FROM public.orden_inspecciones i
      WHERE i.orden_id = v_orden.id
        AND i.publicada_en IS NOT NULL
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.datos_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_portal(TEXT) TO service_role;


-- Versión vigente: 20260923000000_customer_portal_and_emails.sql:497-536
-- Con enlace vencido se deja darse de baja (p_acepta = false), pero volver a recibir
-- correos (p_acepta = true) requiere un enlace vigente.
CREATE OR REPLACE FUNCTION public.preferencia_correos_portal(p_token TEXT, p_acepta BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace  orden_enlaces;
  v_cliente UUID;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_acepta IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  -- Vale con un enlace vencido solo para darse de baja (p_acepta = false).
  SELECT * INTO v_enlace FROM orden_enlaces WHERE token = p_token AND revocado_en IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF p_acepta AND v_enlace.expira_en IS NOT NULL AND v_enlace.expira_en <= NOW() THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT cliente_id INTO v_cliente FROM ordenes_trabajo WHERE id = v_enlace.orden_id;

  UPDATE clientes
  SET acepta_correos = p_acepta,
      correos_baja_en = CASE WHEN p_acepta THEN NULL ELSE NOW() END
  WHERE id = v_cliente;

  IF NOT p_acepta THEN
    UPDATE cola_envios
    SET estado = 'omitido', ultimo_error = 'El cliente pidió no recibir correos.'
    WHERE canal = 'email' AND estado = 'pendiente'
      AND orden_id IN (SELECT id FROM ordenes_trabajo WHERE cliente_id = v_cliente);
  END IF;

  RETURN jsonb_build_object('ok', true, 'acepta_correos', p_acepta);
END;
$$;

REVOKE ALL ON FUNCTION public.preferencia_correos_portal(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preferencia_correos_portal(TEXT, BOOLEAN) TO service_role;


-- Versión vigente: 20261010000022_firma_idioma_y_rechazos.sql:57-83
-- Cambiar el idioma del cliente desde el portal ahora exige enlace vigente.
CREATE OR REPLACE FUNCTION public.preferencia_idioma_portal(p_token TEXT, p_idioma TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace  orden_enlaces;
  v_cliente UUID;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_idioma IS NULL OR p_idioma NOT IN ('es', 'en') THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO v_enlace
  FROM orden_enlaces
  WHERE token = p_token
    AND revocado_en IS NULL
    AND (expira_en IS NULL OR expira_en > NOW());
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT cliente_id INTO v_cliente FROM ordenes_trabajo WHERE id = v_enlace.orden_id;
  UPDATE clientes SET idioma = p_idioma WHERE id = v_cliente AND idioma IS DISTINCT FROM p_idioma;

  RETURN jsonb_build_object('ok', true, 'idioma', p_idioma);
END;
$$;

REVOKE ALL ON FUNCTION public.preferencia_idioma_portal(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preferencia_idioma_portal(TEXT, TEXT) TO service_role;
