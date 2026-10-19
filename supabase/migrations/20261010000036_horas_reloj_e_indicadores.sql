-- ====================================================================================
-- RESTORIFY — Horas, reloj por tarea e indicadores, la base (20261010000036)
-- ====================================================================================
-- Plan SaaS (17/10/2026), Parte L (plan fase 3).
--
-- Qué cambia para el taller:
-- 1. Cada mano de obra puede llevar sus horas facturadas.
-- 2. El técnico arranca y pausa el reloj de su tarea con un toque.
-- 3. Administración ve los números del dueño: número de carros, ticket promedio (ARO),
--    tarifa efectiva por hora, margen de mano de obra y de repuestos, horas por orden,
--    eficiencia por técnico, aprobación de presupuestos y días en el taller.
--
-- Reescrituras:
-- - create_work_order: reescrita entera desde 20261010000034:553, leyendo item->>'horas'.
-- - agregar_trabajo_del_catalogo: reescrita entera desde 20261010000034:176, copiando horas.
-- - catalogo_de_trabajos: reescrita entera desde 20261010000034:375, devolviendo horas.
-- - guardar_trabajo_catalogo: reescrita entera desde 20261010000034:443, guardando horas.
-- - trg_historial: reescrita entera desde 20261010000031:525, registrando horas en mano de obra.
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- L0. Columnas y tablas
-- ------------------------------------------------------------------------------------

-- 1. Columnas nuevas
ALTER TABLE public.orden_labor
  ADD COLUMN horas NUMERIC(6,2) CHECK (horas >= 0);

ALTER TABLE public.catalogo_trabajo_lineas
  ADD COLUMN horas NUMERIC(6,2) CHECK (horas >= 0);

ALTER TABLE public.catalogo_trabajo_lineas
  DROP CONSTRAINT IF EXISTS catalogo_trabajo_lineas_forma_check;

ALTER TABLE public.catalogo_trabajo_lineas
  ADD CONSTRAINT catalogo_trabajo_lineas_forma_check CHECK (
    (tipo = 'mano_obra' AND especialidad IS NOT NULL AND cantidad = 1 AND costo_unitario IS NULL)
    OR
    (tipo = 'repuesto' AND especialidad IS NULL AND horas IS NULL)
  );

ALTER TABLE public.sedes
  ADD COLUMN tarifa_hora NUMERIC(10,2) CHECK (tarifa_hora >= 0);

-- 2. orden_labor_tiempos
CREATE TABLE public.orden_labor_tiempos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_id   UUID NOT NULL REFERENCES public.orden_labor(id) ON DELETE CASCADE,
  orden_id   UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  inicio     TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin        TIMESTAMPTZ,
  CONSTRAINT orden_labor_tiempos_fin_check CHECK (fin IS NULL OR fin >= inicio)
);

CREATE UNIQUE INDEX idx_orden_labor_tiempos_activo
  ON public.orden_labor_tiempos (usuario_id)
  WHERE fin IS NULL;

CREATE INDEX idx_orden_labor_tiempos_labor_id ON public.orden_labor_tiempos (labor_id);
CREATE INDEX idx_orden_labor_tiempos_orden_id ON public.orden_labor_tiempos (orden_id);
CREATE INDEX idx_orden_labor_tiempos_usuario_id ON public.orden_labor_tiempos (usuario_id);

-- 3. RLS de orden_labor_tiempos
ALTER TABLE public.orden_labor_tiempos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orden_labor_tiempos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orden_labor_tiempos TO authenticated;

CREATE POLICY orden_labor_tiempos_select ON public.orden_labor_tiempos
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR usuario_id = (SELECT auth.uid())
    OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[])
  );

-- 4. Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orden_labor_tiempos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_labor_tiempos;
  END IF;
END $$;


-- ------------------------------------------------------------------------------------
-- L1. Funciones
-- ------------------------------------------------------------------------------------

-- 1. Reloj por tarea

-- Iniciar reloj en una tarea
CREATE OR REPLACE FUNCTION public.iniciar_reloj(p_labor_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_labor     orden_labor;
  v_orden     ordenes_trabajo;
  v_tiempo_id UUID;
  v_ahora     TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT * INTO v_labor FROM public.orden_labor WHERE id = p_labor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea no encontrada.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_trabajo WHERE id = v_labor.orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_admin() OR v_labor.asignado_a = auth.uid()) THEN
    RAISE EXCEPTION 'Solo administración o el técnico asignado pueden iniciar el reloj.'
      USING ERRCODE = '42501';
  END IF;

  IF v_labor.estado <> 'aprobado' THEN
    RAISE EXCEPTION 'Solo se puede iniciar el reloj en tareas aprobadas.'
      USING ERRCODE = '42501';
  END IF;

  IF v_labor.completado_en IS NOT NULL THEN
    RAISE EXCEPTION 'La tarea ya está completada.'
      USING ERRCODE = '42501';
  END IF;

  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'No se puede iniciar el reloj en una orden entregada.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orden_labor_tiempos
  SET fin = v_ahora
  WHERE usuario_id = auth.uid() AND fin IS NULL;

  INSERT INTO public.orden_labor_tiempos (
    labor_id, orden_id, usuario_id, inicio
  ) VALUES (
    v_labor.id, v_orden.id, auth.uid(), v_ahora
  )
  RETURNING id INTO v_tiempo_id;

  RETURN v_tiempo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_reloj(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_reloj(UUID) TO authenticated;

-- Detener reloj de esa persona en esa tarea
CREATE OR REPLACE FUNCTION public.detener_reloj(p_labor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orden_labor_tiempos
  SET fin = clock_timestamp()
  WHERE labor_id = p_labor_id AND usuario_id = auth.uid() AND fin IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.detener_reloj(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detener_reloj(UUID) TO authenticated;

-- Trigger auxiliar: al marcar la tarea hecha, cierra los relojes que corren en esa línea
CREATE OR REPLACE FUNCTION public.trg_labor_cerrar_reloj()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE public.orden_labor_tiempos
    SET fin = clock_timestamp()
    WHERE labor_id = NEW.id AND fin IS NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_labor_cerrar_reloj(%): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_labor_cerrar_reloj() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_labor_cerrar_reloj ON public.orden_labor;
CREATE TRIGGER trg_labor_cerrar_reloj
  AFTER UPDATE OF completado_en ON public.orden_labor
  FOR EACH ROW
  WHEN (NEW.completado_en IS NOT NULL AND OLD.completado_en IS NULL)
  EXECUTE FUNCTION public.trg_labor_cerrar_reloj();

-- Corregir registro de tiempo (solo admin)
CREATE OR REPLACE FUNCTION public.corregir_tiempo(
  p_tiempo_id UUID,
  p_inicio    TIMESTAMPTZ,
  p_fin       TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
-- DEFINER: orden_labor_tiempos es de solo lectura por la API (17/10/2026).
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede corregir tiempos.'
      USING ERRCODE = '42501';
  END IF;

  IF p_inicio IS NULL THEN
    RAISE EXCEPTION 'La fecha y hora de inicio es requerida.' USING ERRCODE = '22023';
  END IF;

  IF p_fin IS NOT NULL AND p_fin < p_inicio THEN
    RAISE EXCEPTION 'La fecha de fin no puede ser anterior al inicio.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orden_labor_tiempos
  SET inicio = p_inicio,
      fin = p_fin
  WHERE id = p_tiempo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de tiempo no encontrado.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.corregir_tiempo(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_tiempo(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Borrar registro de tiempo (solo admin)
CREATE OR REPLACE FUNCTION public.borrar_tiempo(p_tiempo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
-- DEFINER: orden_labor_tiempos es de solo lectura por la API (17/10/2026).
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede borrar tiempos.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.orden_labor_tiempos WHERE id = p_tiempo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.borrar_tiempo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_tiempo(UUID) TO authenticated;


-- 2. Indicadores del taller (solo administración)
-- ====================================================================================
-- Indicadores calculados:
-- - carros_recibidos: Órdenes cuyo ingreso al taller ocurrió dentro del período seleccionado.
-- - carros_entregados: Órdenes entregadas al cliente cuya fecha de finalización cae dentro del período.
-- - ventas_mano_obra: Total facturado por mano de obra aprobada en las órdenes entregadas.
-- - ventas_repuestos: Total facturado por repuestos aprobados en las órdenes entregadas.
-- - costo_repuestos: Costo total de adquisición de los repuestos aprobados en órdenes entregadas.
-- - descuentos: Suma de descuentos aplicados en las órdenes entregadas en el período.
-- - ticket_promedio: Promedio del total general facturado por orden entregada en el período.
-- - comisiones: Total de comisiones devengadas (aceptadas o pagadas) en las órdenes entregadas.
-- - margen_mano_obra: Porcentaje de margen neto en mano de obra después de comisiones ((ventas - comisiones) / ventas).
-- - margen_repuestos: Porcentaje de margen comercial en repuestos ((ventas - costo) / ventas).
-- - horas_facturadas: Total de horas facturadas en tareas aprobadas de órdenes entregadas.
-- - tarifa_efectiva: Monto promedio cobrado por hora facturada de mano de obra (ventas / horas facturadas).
-- - horas_por_orden: Promedio de horas facturadas por cada vehículo entregado (horas / entregados).
-- - tarifa_hora_sede: Tarifa de mano de obra por hora de referencia configurada para la sede.
-- - aprobacion_presupuestos: Tasa de conversión de presupuestos aprobados sobre propuestos respondidos en el período.
-- - dias_promedio_en_taller: Promedio de días de permanencia del vehículo desde su ingreso hasta la finalización.
-- - por_tecnico: Desglose individual de horas facturadas, horas de reloj, eficiencia y tareas completadas por técnico.
-- ====================================================================================
CREATE OR REPLACE FUNCTION public.indicadores_taller(
  p_sede_id UUID,
  p_desde   DATE,
  p_hasta   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_zona_horaria            TEXT;
  v_zona                    TEXT;
  v_tarifa_hora_sede        NUMERIC;
  v_carros_recibidos        INTEGER;
  v_carros_entregados       INTEGER;
  v_ventas_mano_obra        NUMERIC;
  v_ventas_repuestos        NUMERIC;
  v_costo_repuestos         NUMERIC;
  v_descuentos              NUMERIC;
  v_ticket_promedio         NUMERIC;
  v_comisiones              NUMERIC;
  v_margen_mano_obra        NUMERIC;
  v_margen_repuestos        NUMERIC;
  v_horas_facturadas        NUMERIC;
  v_tarifa_efectiva         NUMERIC;
  v_horas_por_orden         NUMERIC;
  v_sum_propuesto           NUMERIC;
  v_sum_aprobado            NUMERIC;
  v_aprobacion_presupuestos NUMERIC;
  v_dias_promedio           NUMERIC;
  v_por_tecnico             JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede consultar los indicadores del taller.'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL THEN
    RAISE EXCEPTION 'Las fechas de inicio y fin del período son requeridas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_desde > p_hasta THEN
    RAISE EXCEPTION 'La fecha de inicio no puede ser posterior a la de fin.'
      USING ERRCODE = '22023';
  END IF;

  SELECT zona_horaria, tarifa_hora INTO v_zona_horaria, v_tarifa_hora_sede
  FROM public.sedes WHERE id = p_sede_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sede no encontrada.' USING ERRCODE = '42501';
  END IF;

  v_zona := COALESCE(v_zona_horaria, 'America/New_York');

  -- Órdenes recibidas en el período
  SELECT COUNT(*)::int INTO v_carros_recibidos
  FROM public.ordenes_trabajo o
  WHERE o.sede_id = p_sede_id
    AND ((o.fecha_ingreso::timestamptz AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta);

  -- Órdenes entregadas en el período
  WITH entregadas AS (
    SELECT o.id, o.fecha_ingreso, o.fecha_finalizacion
    FROM public.ordenes_trabajo o
    WHERE o.sede_id = p_sede_id
      AND o.estatus = 'entregado'
      AND o.fecha_finalizacion IS NOT NULL
      AND ((o.fecha_finalizacion AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta)
  )
  SELECT
    COUNT(*)::int,
    (SELECT COALESCE(SUM(l.costo), 0)
     FROM public.orden_labor l
     WHERE l.orden_id IN (SELECT id FROM entregadas) AND l.estado = 'aprobado'),
    (SELECT COALESCE(SUM(r.subtotal), 0)
     FROM public.orden_repuestos r
     WHERE r.orden_id IN (SELECT id FROM entregadas) AND r.estado = 'aprobado'),
    (SELECT COALESCE(SUM(r.costo_unitario * r.cantidad), 0)
     FROM public.orden_repuestos r
     WHERE r.orden_id IN (SELECT id FROM entregadas) AND r.estado = 'aprobado'),
    (SELECT COALESCE(SUM(m.descuento), 0)
     FROM public.orden_montos m
     WHERE m.orden_id IN (SELECT id FROM entregadas)),
    (SELECT COALESCE(SUM(c.monto), 0)
     FROM public.comisiones c
     WHERE c.orden_id IN (SELECT id FROM entregadas) AND (c.estado = 'aceptada' OR c.pago_id IS NOT NULL)),
    (SELECT COALESCE(SUM(l.horas), 0)
     FROM public.orden_labor l
     WHERE l.orden_id IN (SELECT id FROM entregadas) AND l.estado = 'aprobado'),
    (SELECT round(AVG(m.total_general), 2)
     FROM public.orden_montos m
     WHERE m.orden_id IN (SELECT id FROM entregadas)),
    (SELECT round(AVG(EXTRACT(EPOCH FROM (e.fecha_finalizacion - e.fecha_ingreso::timestamptz)) / 86400.0)::numeric, 1)
     FROM entregadas e
     WHERE e.fecha_ingreso IS NOT NULL AND e.fecha_finalizacion IS NOT NULL)
  INTO
    v_carros_entregados,
    v_ventas_mano_obra,
    v_ventas_repuestos,
    v_costo_repuestos,
    v_descuentos,
    v_comisiones,
    v_horas_facturadas,
    v_ticket_promedio,
    v_dias_promedio
  FROM entregadas;

  -- Divisiones con protección de división por cero
  IF v_carros_entregados = 0 THEN
    v_ticket_promedio := NULL;
    v_horas_por_orden := NULL;
  ELSE
    v_horas_por_orden := round(v_horas_facturadas / v_carros_entregados, 2);
  END IF;

  IF v_ventas_mano_obra = 0 THEN
    v_margen_mano_obra := NULL;
  ELSE
    v_margen_mano_obra := round((v_ventas_mano_obra - v_comisiones) / v_ventas_mano_obra, 4);
  END IF;

  IF v_ventas_repuestos = 0 THEN
    v_margen_repuestos := NULL;
  ELSE
    v_margen_repuestos := round((v_ventas_repuestos - v_costo_repuestos) / v_ventas_repuestos, 4);
  END IF;

  IF v_horas_facturadas = 0 THEN
    v_tarifa_efectiva := NULL;
  ELSE
    v_tarifa_efectiva := round(v_ventas_mano_obra / v_horas_facturadas, 2);
  END IF;

  -- Aprobación de presupuestos respondidos en el período
  SELECT
    SUM(p.total_propuesto),
    SUM(p.total_aprobado)
  INTO v_sum_propuesto, v_sum_aprobado
  FROM public.presupuestos p
  WHERE p.sede_id = p_sede_id
    AND p.estado = 'respondido'
    AND p.respondido_en IS NOT NULL
    AND ((p.respondido_en AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta);

  IF COALESCE(v_sum_propuesto, 0) > 0 THEN
    v_aprobacion_presupuestos := round(v_sum_aprobado / v_sum_propuesto, 4);
  ELSE
    v_aprobacion_presupuestos := NULL;
  END IF;

  -- Desglose por técnico de la sede
  WITH entregadas AS (
    SELECT o.id
    FROM public.ordenes_trabajo o
    WHERE o.sede_id = p_sede_id
      AND o.estatus = 'entregado'
      AND o.fecha_finalizacion IS NOT NULL
      AND ((o.fecha_finalizacion AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'usuario_id', tec.usuario_id,
        'nombre', tec.nombre,
        'horas_facturadas', tec.horas_facturadas,
        'horas_reloj', tec.horas_reloj,
        'eficiencia', tec.eficiencia,
        'tareas_completadas', tec.tareas_completadas
      ) ORDER BY tec.nombre, tec.usuario_id
    ),
    '[]'::jsonb
  ) INTO v_por_tecnico
  FROM (
    SELECT
      p.id AS usuario_id,
      p.nombre_completo AS nombre,
      COALESCE(SUM(l.horas) FILTER (
        WHERE l.estado = 'aprobado' AND l.orden_id IN (SELECT id FROM entregadas)
      ), 0) AS horas_facturadas,
      COALESCE(rel.horas_reloj, 0) AS horas_reloj,
      CASE
        WHEN COALESCE(rel.horas_reloj, 0) > 0 THEN
          round(
            COALESCE(SUM(l.horas) FILTER (
              WHERE l.estado = 'aprobado' AND l.orden_id IN (SELECT id FROM entregadas)
            ), 0) / rel.horas_reloj,
            4
          )
        ELSE NULL
      END AS eficiencia,
      COALESCE(tar.tareas_completadas, 0) AS tareas_completadas
    FROM public.perfiles p
    LEFT JOIN public.orden_labor l ON l.asignado_a = p.id
    LEFT JOIN LATERAL (
      SELECT round(COALESCE(SUM(EXTRACT(EPOCH FROM (t.fin - t.inicio)) / 3600.0), 0)::numeric, 2) AS horas_reloj
      FROM public.orden_labor_tiempos t
      WHERE t.usuario_id = p.id
        AND t.fin IS NOT NULL
        AND ((t.inicio AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta)
    ) rel ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS tareas_completadas
      FROM public.orden_labor t_lab
      JOIN public.ordenes_trabajo t_ord ON t_ord.id = t_lab.orden_id
      WHERE t_ord.sede_id = p_sede_id
        AND t_lab.asignado_a = p.id
        AND t_lab.completado_en IS NOT NULL
        AND ((t_lab.completado_en AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta)
    ) tar ON true
    WHERE p.sede_id = p_sede_id
      AND p.rol IN ('mecanico', 'pintor')
    GROUP BY p.id, p.nombre_completo, rel.horas_reloj, tar.tareas_completadas
  ) tec;

  RETURN jsonb_build_object(
    'carros_recibidos', v_carros_recibidos,
    'carros_entregados', v_carros_entregados,
    'ventas_mano_obra', v_ventas_mano_obra,
    'ventas_repuestos', v_ventas_repuestos,
    'costo_repuestos', v_costo_repuestos,
    'descuentos', v_descuentos,
    'ticket_promedio', v_ticket_promedio,
    'comisiones', v_comisiones,
    'margen_mano_obra', v_margen_mano_obra,
    'margen_repuestos', v_margen_repuestos,
    'horas_facturadas', v_horas_facturadas,
    'tarifa_efectiva', v_tarifa_efectiva,
    'horas_por_orden', v_horas_por_orden,
    'tarifa_hora_sede', v_tarifa_hora_sede,
    'aprobacion_presupuestos', v_aprobacion_presupuestos,
    'dias_promedio_en_taller', v_dias_promedio,
    'por_tecnico', v_por_tecnico
  );
END;
$$;

REVOKE ALL ON FUNCTION public.indicadores_taller(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.indicadores_taller(UUID, DATE, DATE) TO authenticated;


-- ------------------------------------------------------------------------------------
-- L2. Funciones que cambian (reescritas enteras desde su versión vigente)
-- ------------------------------------------------------------------------------------

-- 1. create_work_order: reescrita entera desde 20261010000034_trabajos_y_catalogo.sql:553
-- Cambios (20261010000036):
--   - Lee item->>'horas' (vacío = NULL) al insertar orden_labor.
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
    COALESCE((p_order->>'millas_ingreso')::int, 0),
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
        NULLIF(GREATEST(COALESCE((item->>'costo_unitario')::numeric, -1), -1), -1),
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


-- 2. agregar_trabajo_del_catalogo: reescrita entera desde 20261010000034_trabajos_y_catalogo.sql:176
-- Cambios (20261010000036):
--   - Copia la columna horas de catalogo_trabajo_lineas a orden_labor.
CREATE OR REPLACE FUNCTION public.agregar_trabajo_del_catalogo(
  p_orden_id    UUID,
  p_catalogo_id UUID,
  p_asignado_a  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_orden      ordenes_trabajo;
  v_cat        catalogo_trabajos;
  v_trabajo_id UUID;
  v_rol        TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede agregar trabajos del catálogo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cat FROM public.catalogo_trabajos
  WHERE id = p_catalogo_id AND sede_id = v_orden.sede_id AND activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese trabajo del catálogo no es de la sede de esta orden o está desactivado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_asignado_a IS NOT NULL THEN
    SELECT rol INTO v_rol FROM public.perfiles WHERE id = p_asignado_a;
  END IF;

  INSERT INTO public.orden_trabajos (orden_id, titulo, catalogo_id, creado_por)
  VALUES (v_orden.id, v_cat.nombre, v_cat.id, auth.uid())
  RETURNING id INTO v_trabajo_id;

  INSERT INTO public.orden_labor (
    orden_id, trabajo_id, descripcion, costo, horas, especialidad, asignado_a, reparto_heredado
  )
  SELECT
    v_orden.id,
    v_trabajo_id,
    l.descripcion,
    l.precio,
    l.horas,
    l.especialidad,
    CASE
      WHEN l.especialidad = 'mecanica' AND v_rol = 'mecanico' THEN p_asignado_a
      WHEN l.especialidad = 'pintura' AND v_rol = 'pintor' THEN p_asignado_a
      ELSE NULL
    END,
    false
  FROM public.catalogo_trabajo_lineas l
  WHERE l.catalogo_id = v_cat.id AND l.tipo = 'mano_obra'
  ORDER BY l.posicion, l.id;

  INSERT INTO public.orden_repuestos (
    orden_id, trabajo_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal
  )
  SELECT
    v_orden.id,
    v_trabajo_id,
    l.descripcion,
    l.cantidad,
    COALESCE(l.costo_unitario, l.precio),
    l.precio,
    l.cantidad * l.precio
  FROM public.catalogo_trabajo_lineas l
  WHERE l.catalogo_id = v_cat.id AND l.tipo = 'repuesto'
  ORDER BY l.posicion, l.id;

  RETURN v_trabajo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agregar_trabajo_del_catalogo(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agregar_trabajo_del_catalogo(UUID, UUID, UUID) TO authenticated;


-- 3. catalogo_de_trabajos: reescrita entera desde 20261010000034_trabajos_y_catalogo.sql:375
-- Cambios (20261010000036):
--   - Devuelve la columna horas en el JSON de cada línea.
CREATE OR REPLACE FUNCTION public.catalogo_de_trabajos(
  p_sede_id           UUID,
  p_incluir_inactivos BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_resultado JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede consultar el catálogo de trabajos.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'activo', c.activo,
        'total', COALESCE(lin.total, 0),
        'lineas', COALESCE(lin.lineas, '[]'::jsonb)
      ) ORDER BY c.nombre, c.id
    ),
    '[]'::jsonb
  ) INTO v_resultado
  FROM public.catalogo_trabajos c
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(
        CASE
          WHEN l.tipo = 'mano_obra' THEN l.precio
          ELSE l.cantidad * l.precio
        END
      ), 0) AS total,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'catalogo_id', l.catalogo_id,
            'tipo', l.tipo,
            'descripcion', l.descripcion,
            'especialidad', l.especialidad,
            'horas', l.horas,
            'cantidad', l.cantidad,
            'precio', l.precio,
            'costo_unitario', l.costo_unitario,
            'posicion', l.posicion
          ) ORDER BY l.posicion, l.id
        ),
        '[]'::jsonb
      ) AS lineas
    FROM public.catalogo_trabajo_lineas l
    WHERE l.catalogo_id = c.id
  ) lin ON true
  WHERE c.sede_id = p_sede_id
    AND (p_incluir_inactivos OR c.activo = true);

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.catalogo_de_trabajos(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalogo_de_trabajos(UUID, BOOLEAN) TO authenticated;


-- 4. guardar_trabajo_catalogo: reescrita entera desde 20261010000034_trabajos_y_catalogo.sql:443
-- Cambios (20261010000036):
--   - Lee y guarda la columna horas en catalogo_trabajo_lineas para mano de obra.
CREATE OR REPLACE FUNCTION public.guardar_trabajo_catalogo(
  p_id      UUID,
  p_sede_id UUID,
  p_nombre  TEXT,
  p_activo  BOOLEAN,
  p_lineas  JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede guardar trabajos en el catálogo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_nombre IS NULL OR char_length(btrim(p_nombre)) = 0 OR char_length(p_nombre) > 120 THEN
    RAISE EXCEPTION 'El nombre no puede estar vacío y debe tener 120 caracteres o menos.'
      USING ERRCODE = '22023';
  END IF;

  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Un trabajo del catálogo necesita al menos una línea.'
      USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.catalogo_trabajos (sede_id, nombre, activo, creado_por)
    VALUES (p_sede_id, btrim(p_nombre), COALESCE(p_activo, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.catalogo_trabajos
    SET nombre = btrim(p_nombre),
        activo = COALESCE(p_activo, true),
        actualizado_en = now()
    WHERE id = p_id AND sede_id = p_sede_id
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Trabajo del catálogo no encontrado.' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.catalogo_trabajo_lineas WHERE catalogo_id = v_id;
  END IF;

  INSERT INTO public.catalogo_trabajo_lineas (
    catalogo_id,
    tipo,
    descripcion,
    especialidad,
    horas,
    cantidad,
    precio,
    costo_unitario,
    posicion
  )
  SELECT
    v_id,
    elem->>'tipo',
    btrim(elem->>'descripcion'),
    CASE WHEN elem->>'tipo' = 'mano_obra' THEN elem->>'especialidad' ELSE NULL END,
    CASE
      WHEN elem->>'tipo' = 'mano_obra' AND NULLIF(btrim(COALESCE(elem->>'horas', '')), '') IS NOT NULL
      THEN (elem->>'horas')::numeric
      ELSE NULL
    END,
    CASE WHEN elem->>'tipo' = 'mano_obra' THEN 1 ELSE GREATEST(COALESCE((elem->>'cantidad')::int, 1), 1) END,
    GREATEST(COALESCE((elem->>'precio')::numeric, 0), 0),
    CASE
      WHEN elem->>'tipo' = 'repuesto' AND elem->>'costo_unitario' IS NOT NULL AND btrim(elem->>'costo_unitario') <> ''
      THEN GREATEST((elem->>'costo_unitario')::numeric, 0)
      ELSE NULL
    END,
    COALESCE((elem->>'posicion')::int, (pos - 1)::int)
  FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS arr(elem, pos);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_trabajo_catalogo(UUID, UUID, TEXT, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_trabajo_catalogo(UUID, UUID, TEXT, BOOLEAN, JSONB) TO authenticated;


-- 5. trg_historial: reescrita entera desde 20261010000031_marcas_de_danos.sql:525
-- Cambios (20261010000036):
--   - Suma 'horas' a v_campos en orden_labor y al trigger trg_historial ON orden_labor.
CREATE OR REPLACE FUNCTION public.trg_historial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes   JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_despues JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_fila    JSONB := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
  v_accion  TEXT := CASE TG_OP WHEN 'INSERT' THEN 'crear' WHEN 'UPDATE' THEN 'cambiar' ELSE 'borrar' END;
  v_entidad TEXT;
  v_campos  TEXT[];
  v_orden   UUID;
  v_resumen TEXT;
  v_cambios JSONB;
  v_numero  TEXT;
  v_sede    UUID;
  v_actor   UUID := auth.uid();
  v_nombre  TEXT;
BEGIN
  BEGIN
    v_orden := COALESCE(v_fila ->> 'orden_id', v_fila ->> 'id')::uuid;

    CASE TG_TABLE_NAME
      WHEN 'ordenes_trabajo' THEN
        v_entidad := 'orden';
        v_orden := (v_fila ->> 'id')::uuid;
        v_resumen := v_fila ->> 'numero_orden';
        v_campos := ARRAY[
          'estatus', 'porcentaje_avance', 'tipo_trabajo', 'fecha_estimada_entrega',
          'millas_ingreso', 'nivel_gasolina', 'inspeccion_360_notas', 'cliente_id',
          'vehiculo_id', 'firma_fecha', 'motivo_autorizacion', 'archivada_en',
          'retirada_sin_reparar', 'lista_para_entregar_en',
          'con_seguro', 'aseguradora', 'numero_reclamo', 'marcas_danos'];
      WHEN 'orden_labor' THEN
        v_entidad := 'mano_obra';
        v_resumen := v_fila ->> 'descripcion';
        v_campos := ARRAY['descripcion', 'costo', 'horas', 'especialidad', 'estado', 'completado_en', 'tecnico'];
        IF v_antes IS NOT NULL THEN
          v_antes := v_antes || jsonb_build_object('tecnico',
            (SELECT nombre_completo FROM perfiles WHERE id = (v_antes ->> 'asignado_a')::uuid));
        END IF;
        IF v_despues IS NOT NULL THEN
          v_despues := v_despues || jsonb_build_object('tecnico',
            (SELECT nombre_completo FROM perfiles WHERE id = (v_despues ->> 'asignado_a')::uuid));
        END IF;
      WHEN 'orden_repuestos' THEN
        v_entidad := 'repuesto';
        v_resumen := v_fila ->> 'descripcion';
        v_campos := ARRAY['descripcion', 'cantidad', 'precio_venta_unitario', 'costo_unitario', 'estado', 'estado_pedido'];
      WHEN 'orden_asignaciones' THEN
        v_entidad := 'asignacion';
        SELECT nombre_completo INTO v_resumen FROM perfiles WHERE id = (v_fila ->> 'usuario_id')::uuid;
        v_campos := ARRAY['tipo_tarea', 'reparto'];
        IF v_antes IS NOT NULL THEN
          v_antes := v_antes || jsonb_build_object('reparto', (v_antes ->> 'origen') = 'manual');
        END IF;
        IF v_despues IS NOT NULL THEN
          v_despues := v_despues || jsonb_build_object('reparto', (v_despues ->> 'origen') = 'manual');
        END IF;
      WHEN 'orden_montos' THEN
        IF TG_OP = 'UPDATE'
           AND (v_antes ->> 'deposito_inicial') IS NOT DISTINCT FROM (v_despues ->> 'deposito_inicial') THEN
          v_entidad := 'descuento';
          v_campos := ARRAY['descuento', 'descuento_motivo'];
        ELSE
          v_entidad := 'deposito';
          v_campos := ARRAY['deposito_inicial'];
        END IF;
      WHEN 'presupuestos' THEN
        v_entidad := 'presupuesto';
        v_resumen := v_fila ->> 'numero';
        v_campos := ARRAY['estado', 'total_propuesto', 'total_aprobado', 'respondido_via', 'respondido_por_nombre'];
      WHEN 'orden_media' THEN
        v_entidad := 'archivo';
        v_resumen := concat_ws(' · ', v_fila ->> 'tipo', v_fila ->> 'origen', v_fila ->> 'zona');
        v_campos := ARRAY['tipo', 'origen', 'zona', 'visible_cliente'];
      WHEN 'orden_avances' THEN
        v_entidad := 'avance';
        v_resumen := left(v_fila ->> 'descripcion', 120);
        v_campos := ARRAY['descripcion', 'visible_cliente'];
      WHEN 'orden_parqueo' THEN
        IF TG_OP = 'INSERT'
           AND (v_fila ->> 'tarifa_manual') IS NULL
           AND (v_fila ->> 'inicio_manual') IS NULL
           AND (v_fila ->> 'nota') IS NULL
           AND COALESCE((v_fila ->> 'dias_exonerados')::int, 0) = 0
           AND COALESCE((v_fila ->> 'cobrar')::boolean, true) = true THEN
          RETURN NULL;
        END IF;
        v_entidad := 'parqueo';
        v_resumen := 'Ajuste de parqueo';
        v_campos := ARRAY['cobrar', 'tarifa_manual', 'inicio_manual', 'dias_exonerados', 'nota'];
      WHEN 'orden_proximo_servicio' THEN
        v_entidad := 'proximo_servicio';
        v_resumen := 'Próximo servicio';
        v_campos := ARRAY['fecha', 'millas', 'nota', 'sugerido_fecha', 'sugerido_millas', 'sugerido_nota'];
      ELSE
        RETURN NULL;
    END CASE;

    v_cambios := CASE TG_OP
      WHEN 'UPDATE' THEN public._historial_diferencias(v_antes, v_despues, v_campos)
      WHEN 'INSERT' THEN public._historial_valores(v_despues, v_campos, 'despues')
      ELSE public._historial_valores(v_antes, v_campos, 'antes')
    END;

    IF TG_OP = 'UPDATE' AND v_cambios = '{}'::jsonb THEN
      RETURN NULL;
    END IF;

    IF TG_TABLE_NAME = 'ordenes_trabajo' THEN
      v_numero := v_fila ->> 'numero_orden';
      v_sede := (v_fila ->> 'sede_id')::uuid;
    ELSE
      SELECT numero_orden, sede_id INTO v_numero, v_sede FROM ordenes_trabajo WHERE id = v_orden;
      IF NOT FOUND THEN
        RETURN NULL;
      END IF;
    END IF;

    IF v_actor IS NOT NULL THEN
      SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = v_actor;
    END IF;

    INSERT INTO historial_orden (
      orden_id, numero_orden, sede_id, actor_id, actor_nombre, origen,
      entidad, entidad_id, accion, resumen, cambios
    ) VALUES (
      v_orden, v_numero, v_sede, v_actor, v_nombre,
      CASE auth.role() WHEN 'authenticated' THEN 'app' WHEN 'service_role' THEN 'portal' ELSE 'sistema' END,
      v_entidad,
      CASE WHEN TG_TABLE_NAME IN ('orden_montos', 'orden_proximo_servicio') THEN v_orden ELSE (v_fila ->> 'id')::uuid END,
      v_accion, v_resumen, v_cambios
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'historial_orden (%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_historial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_historial ON public.orden_labor;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF
    descripcion, costo, horas, especialidad, estado, completado_en, asignado_a
  ON public.orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();
