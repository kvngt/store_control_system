-- ------------------------------------------------------------------------------------
-- Aprobación de comisiones
-- ------------------------------------------------------------------------------------

-- 1. Modificar tabla comisiones
ALTER TABLE comisiones ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'sugerida' CHECK (estado IN ('sugerida', 'aceptada'));

-- 2. Modificar el sync para no tocar comisiones aceptadas
CREATE OR REPLACE FUNCTION public.sync_order_commissions(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estatus order_status;
  v_sede    UUID;
BEGIN
  SELECT estatus, sede_id INTO v_estatus, v_sede
  FROM ordenes_trabajo WHERE id = target_order_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Solo una orden entregada devenga comisiones.
  IF v_estatus <> 'entregado' THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL AND estado = 'sugerida';
    RETURN;
  END IF;

  -- Quien cobra: con esquema de comisión y algo que cobrar. Un asalariado, o alguien en una
  -- bolsa vacía, no genera una fila en cero. Lo pagado nunca se borra ni se cambia.
  -- Tampoco se borran las comisiones aceptadas por administración.
  DELETE FROM comisiones c
  WHERE c.orden_id = target_order_id
    AND c.pago_id IS NULL
    AND c.estado = 'sugerida'
    AND NOT EXISTS (
      SELECT 1 FROM public._reparto_comisiones(target_order_id) r
      WHERE r.usuario_id = c.usuario_id
        AND r.especialidad = c.especialidad
        AND r.labor_id IS NOT DISTINCT FROM c.labor_id
        AND r.esquema = 'comision' AND r.monto > 0
    );

  INSERT INTO comisiones (orden_id, usuario_id, sede_id, especialidad, labor_id, base_ganancia, porcentaje, tecnicos, monto, estado)
  SELECT target_order_id, r.usuario_id, v_sede, r.especialidad, r.labor_id, r.base, r.porcentaje, r.tecnicos, r.monto, 'sugerida'
  FROM public._reparto_comisiones(target_order_id) r
  WHERE r.esquema = 'comision' AND r.monto > 0
  ON CONFLICT ON CONSTRAINT comisiones_orden_usuario_especialidad_tarea_key DO UPDATE
    SET base_ganancia = EXCLUDED.base_ganancia,
        porcentaje    = EXCLUDED.porcentaje,
        tecnicos      = EXCLUDED.tecnicos,
        monto         = EXCLUDED.monto,
        sede_id       = EXCLUDED.sede_id
    WHERE comisiones.pago_id IS NULL AND comisiones.estado = 'sugerida';
END;
$$;
REVOKE ALL ON FUNCTION public.sync_order_commissions(UUID) FROM PUBLIC, anon, authenticated;

-- 3. Función RPC para que el admin apruebe o modifique la comisión
CREATE OR REPLACE FUNCTION public.aprobar_comision(p_comision_id UUID, p_monto NUMERIC DEFAULT NULL, p_porcentaje NUMERIC DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aprobar comisiones.' USING ERRCODE = '42501';
  END IF;

  UPDATE comisiones
  SET estado = 'aceptada',
      monto = COALESCE(p_monto, monto),
      porcentaje = COALESCE(p_porcentaje, porcentaje)
  WHERE id = p_comision_id AND pago_id IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.aprobar_comision(UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_comision(UUID, NUMERIC, NUMERIC) TO authenticated;

-- 4. Modificar comisiones_estimadas para ocultar los montos al mecánico si no están aceptadas.
CREATE OR REPLACE FUNCTION public.comisiones_estimadas(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin BOOLEAN := public.is_admin();
  v_yo    UUID := auth.uid();
BEGIN
  IF NOT v_admin AND NOT (p_orden_id = ANY (public.mis_ordenes_asignadas())) THEN
    RAISE EXCEPTION 'Solo el personal asignado ve la comisión de esta orden.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'bolsas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'especialidad', b.especialidad,
               'base', CASE WHEN v_admin THEN round(b.base, 2) ELSE null END,
               'tecnicos', (
                 SELECT COUNT(DISTINCT a.usuario_id) FROM orden_asignaciones a
                 WHERE a.orden_id = p_orden_id AND a.tipo_tarea = b.especialidad
                   AND a.origen = 'manual'
               )
             ) ORDER BY b.especialidad)
      FROM (
        SELECT l.especialidad, SUM(l.costo) AS base
        FROM orden_labor l
        WHERE l.orden_id = p_orden_id AND l.estado = 'aprobado'
          AND l.asignado_a IS NULL AND l.reparto_heredado
        GROUP BY l.especialidad
      ) b
    ), '[]'::jsonb),

    'reparto', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'usuario_id', r.usuario_id,
               'especialidad', r.especialidad,
               'esquema', r.esquema,
               'porcentaje', CASE 
                 WHEN v_admin THEN COALESCE(c.porcentaje, r.porcentaje) 
                 WHEN c.estado = 'aceptada' THEN c.porcentaje
                 ELSE null END,
               'tecnicos', r.tecnicos,
               'monto', CASE 
                 WHEN v_admin THEN COALESCE(c.monto, r.monto) 
                 WHEN c.estado = 'aceptada' THEN c.monto
                 ELSE null END,
               'heredado', true,
               'tareas', 0,
               'comision_id', c.id,
               'estado', COALESCE(c.estado, 'sugerida')
             ) ORDER BY r.especialidad, r.usuario_id)
      FROM public._reparto_comisiones(p_orden_id) r
      LEFT JOIN comisiones c ON c.orden_id = p_orden_id 
                            AND c.usuario_id = r.usuario_id 
                            AND c.especialidad = r.especialidad 
                            AND c.labor_id IS NULL
      WHERE r.labor_id IS NULL
    ), '[]'::jsonb),

    'tareas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'labor_id', r.labor_id,
               'descripcion', l.descripcion,
               'especialidad', r.especialidad,
               'usuario_id', r.usuario_id,
               'esquema', r.esquema,
               'base', CASE WHEN v_admin THEN round(r.base, 2) ELSE null END,
               'porcentaje', CASE 
                 WHEN v_admin THEN COALESCE(c.porcentaje, r.porcentaje) 
                 WHEN c.estado = 'aceptada' THEN c.porcentaje
                 ELSE null END,
               'monto', CASE 
                 WHEN v_admin THEN COALESCE(c.monto, r.monto) 
                 WHEN c.estado = 'aceptada' THEN c.monto
                 ELSE null END,
               'comision_id', c.id,
               'estado', COALESCE(c.estado, 'sugerida')
             ) ORDER BY r.especialidad, l.creado_en)
      FROM public._reparto_comisiones(p_orden_id) r
      JOIN orden_labor l ON l.id = r.labor_id
      LEFT JOIN comisiones c ON c.orden_id = p_orden_id AND c.labor_id = r.labor_id
      WHERE r.labor_id IS NOT NULL
    ), '[]'::jsonb),

    'mi_total', (
      SELECT COALESCE(SUM(
        CASE 
          WHEN v_admin THEN COALESCE(c.monto, r.monto)
          WHEN c.estado = 'aceptada' THEN c.monto
          ELSE 0
        END
      ), 0)
      FROM public._reparto_comisiones(p_orden_id) r
      LEFT JOIN comisiones c ON c.orden_id = p_orden_id 
                            AND c.usuario_id = r.usuario_id 
                            AND c.labor_id IS NOT DISTINCT FROM r.labor_id
                            AND c.especialidad IS NOT DISTINCT FROM r.especialidad
      WHERE r.usuario_id = v_yo AND r.esquema = 'comision'
    ),

    'sin_asignar', (
      SELECT COALESCE(SUM(l.costo), 0)
      FROM orden_labor l
      WHERE l.orden_id = p_orden_id AND l.estado = 'aprobado'
        AND l.asignado_a IS NULL AND NOT l.reparto_heredado
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.comisiones_estimadas(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comisiones_estimadas(UUID) TO authenticated;
