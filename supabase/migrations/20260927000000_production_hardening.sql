-- ====================================================================================
-- RESTORIFY — Revisión antes de salir a producción
-- ====================================================================================
-- Lo que falla con datos reales y no con datos de prueba. Detalle y pruebas en
-- docs/salida-a-produccion.md.
--
--   1. Totales del panel y de Finanzas calculados en el servidor. El navegador los
--      sumaba sobre `select('*')`, y la API de Supabase devuelve como máximo 1.000
--      filas: con la importación bancaria eso se pasa en pocos meses y los ingresos
--      del mes salían mal sin ningún error. `resumen_panel` suma en la base.
--   2. Importar un estado de cuenta en una sola transacción. Eran dos escrituras: si
--      fallaba la segunda quedaba un lote sin movimientos que además bloqueaba la
--      reimportación del mismo archivo.
--   3. Pagar comisiones sin carrera: dos administradores (o dos pestañas) pagando a la
--      vez generaban dos pagos y dos egresos por las mismas comisiones.
--   4. Índices para las llaves foráneas por las que se filtra, se une y se borra en
--      cascada. Sin ellos, cada política RLS y cada borrado recorren la tabla entera.
--   5. Una cuenta de Auth sin perfil no ve nada. El registro público del proyecto
--      real estaba abierto: quien se registrara leía las sedes y podía subir archivos
--      al bucket público de avatares.
--   6. `search_path` fijo en las dos funciones que no lo tenían.
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. Resumen del panel y de Finanzas
-- ------------------------------------------------------------------------------------
-- SECURITY INVOKER: corre con los permisos de quien la llama, así que RLS decide.
-- Un técnico recibe ceros en todo lo que es dinero, igual que antes.
--
-- `p_hoy` y `p_tz` vienen del navegador: "este mes" es el mes del taller, no el del
-- servidor (UTC). Las columnas DATE (`fecha`) se comparan tal cual; las TIMESTAMPTZ
-- (`fecha_finalizacion`, `creado_en`) se pasan a la zona del taller.
CREATE OR REPLACE FUNCTION public.resumen_panel(
  p_sede_id UUID,
  p_hoy     DATE,
  p_tz      TEXT DEFAULT 'America/Chicago'
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
           COALESCE(NULLIF(btrim(p_tz), ''), 'America/Chicago')    AS tz
  ),
  o AS (
    SELECT estatus, fecha_finalizacion FROM ordenes_trabajo
    WHERE p_sede_id IS NULL OR sede_id = p_sede_id
  ),
  m AS (
    SELECT tipo, monto, fecha FROM finanzas_movimientos
    WHERE p_sede_id IS NULL OR sede_id = p_sede_id
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
        'recepcion',        COUNT(*) FILTER (WHERE estatus = 'recepcion'),
        'en_proceso',       COUNT(*) FILTER (WHERE estatus = 'en_proceso'),
        'espera_repuestos', COUNT(*) FILTER (WHERE estatus = 'espera_repuestos'),
        'finalizado',       COUNT(*) FILTER (WHERE estatus = 'finalizado'),
        'entregado',        COUNT(*) FILTER (WHERE estatus = 'entregado')
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
-- 2. Importar un estado de cuenta: el lote y sus movimientos, o nada
-- ------------------------------------------------------------------------------------
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
-- 3. Pagar comisiones: se bloquean antes de sumarlas
-- ------------------------------------------------------------------------------------
-- El segundo pago que llega a la vez espera al primero; cuando sigue, las comisiones
-- ya tienen pago y la suma da cero, así que falla con "no hay comisiones pendientes"
-- en vez de registrar un segundo cheque.
CREATE OR REPLACE FUNCTION public.pay_commissions(
  p_usuario_id    UUID,
  p_comision_ids  UUID[],
  p_fecha_pago    DATE DEFAULT CURRENT_DATE,
  p_metodo        TEXT DEFAULT 'cheque',
  p_numero_cheque TEXT DEFAULT NULL,
  p_comprobante_url TEXT DEFAULT NULL,
  p_notas         TEXT DEFAULT NULL
)
RETURNS comision_pagos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total  NUMERIC;
  v_sedes  UUID[];
  v_sede   UUID;
  v_pago   comision_pagos;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar pagos de comisiones.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM comisiones
  WHERE id = ANY(p_comision_ids) AND usuario_id = p_usuario_id
  ORDER BY id
  FOR UPDATE;

  SELECT COALESCE(SUM(monto), 0), array_agg(DISTINCT sede_id)
    INTO v_total, v_sedes
  FROM comisiones
  WHERE id = ANY(p_comision_ids)
    AND usuario_id = p_usuario_id
    AND pago_id IS NULL;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'No hay comisiones pendientes para pagar en esta selección.'
      USING ERRCODE = 'P0001';
  END IF;

  IF array_length(v_sedes, 1) > 1 THEN
    RAISE EXCEPTION 'No se pueden pagar en un solo cheque comisiones de sedes distintas.'
      USING ERRCODE = 'P0001';
  END IF;

  v_sede := v_sedes[1];

  INSERT INTO comision_pagos (
    sede_id, usuario_id, monto, fecha_pago, metodo, numero_cheque, comprobante_url, notas, pagado_por
  )
  VALUES (
    v_sede, p_usuario_id, v_total, COALESCE(p_fecha_pago, CURRENT_DATE),
    COALESCE(NULLIF(btrim(p_metodo), ''), 'cheque'),
    NULLIF(btrim(p_numero_cheque), ''),
    NULLIF(btrim(p_comprobante_url), ''),
    NULLIF(btrim(p_notas), ''),
    auth.uid()
  )
  RETURNING * INTO v_pago;

  UPDATE comisiones
  SET pago_id = v_pago.id
  WHERE id = ANY(p_comision_ids)
    AND usuario_id = p_usuario_id
    AND pago_id IS NULL;

  RETURN v_pago;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_commissions(UUID, UUID[], DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_commissions(UUID, UUID[], DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 4. Índices de las llaves foráneas que se usan
-- ------------------------------------------------------------------------------------
-- Las listas filtran por sede; las políticas RLS y `is_assigned_to_order` buscan por
-- orden y persona; borrar una orden, un cliente o una sede recorre las tablas hijas.
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_sede_creado ON ordenes_trabajo (sede_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_cliente     ON ordenes_trabajo (cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_vehiculo    ON ordenes_trabajo (vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_orden_labor_orden           ON orden_labor (orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_repuestos_orden       ON orden_repuestos (orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_asignaciones_orden    ON orden_asignaciones (orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_asignaciones_usuario  ON orden_asignaciones (usuario_id, orden_id);
CREATE INDEX IF NOT EXISTS idx_clientes_sede               ON clientes (sede_id);
CREATE INDEX IF NOT EXISTS idx_vehiculos_cliente           ON vehiculos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_sede               ON perfiles (sede_id);
CREATE INDEX IF NOT EXISTS idx_finanzas_movimientos_sede_fecha ON finanzas_movimientos (sede_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_finanzas_movimientos_importacion ON finanzas_movimientos (importacion_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_pago             ON comisiones (pago_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_orden        ON notificaciones (orden_id);


-- ------------------------------------------------------------------------------------
-- 5. Una sesión sin perfil no ve nada
-- ------------------------------------------------------------------------------------
-- La primera línea de defensa es apagar el registro público en el panel de Supabase
-- (Authentication → Sign In / Providers). Esto es la segunda: aunque alguien logre
-- una cuenta, sin fila en `perfiles` no lee sedes ni sube archivos.
DROP POLICY IF EXISTS "sedes_select" ON sedes;
CREATE POLICY "sedes_select"
ON sedes FOR SELECT
USING (public.current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "avatares_own_insert" ON storage.objects;
CREATE POLICY "avatares_own_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatares'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.current_user_role() IS NOT NULL
);

DROP POLICY IF EXISTS "avatares_own_update" ON storage.objects;
CREATE POLICY "avatares_own_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatares'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.current_user_role() IS NOT NULL
);


-- ------------------------------------------------------------------------------------
-- 6. search_path fijo
-- ------------------------------------------------------------------------------------
ALTER FUNCTION public.create_work_order(JSONB, JSONB, JSONB, JSONB) SET search_path = public;
ALTER FUNCTION public.es_correo_valido(TEXT) SET search_path = public;


-- ------------------------------------------------------------------------------------
-- 7. El avance de una orden va de 0 a 100
-- ------------------------------------------------------------------------------------
-- La pantalla lo limita, la API no. NOT VALID: se exige en cada escritura nueva sin
-- revisar (ni bloquear) las filas que ya existen; los triggers solo escriben 0 o 100.
ALTER TABLE ordenes_trabajo DROP CONSTRAINT IF EXISTS ordenes_trabajo_porcentaje_avance_rango;
ALTER TABLE ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_porcentaje_avance_rango
  CHECK (porcentaje_avance BETWEEN 0 AND 100) NOT VALID;
