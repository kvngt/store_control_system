-- ------------------------------------------------------------------------------------
-- Pago "Mixto": salario + comisiones (pedido del taller, 05/10/2026)
-- ------------------------------------------------------------------------------------
-- Un empleado puede cobrar solo comisión, solo salario, o las dos cosas. En "mixto" el salario
-- sigue siendo informativo (no se paga desde la app) y las comisiones se calculan, aceptan y
-- pagan igual que a quien va por comisión.
--   1. El CHECK de `esquema` admite 'mixto'. Solo se suelta ESE check (el que habla de `esquema`):
--      buscarlo por la palabra "comision" soltaba también el del porcentaje (0–100).
--   2. `trg_perfiles_pago_sello`: 'mixto' conserva salario y porcentaje y exige el salario.
--   3. `sync_order_commissions` y `comisiones_estimadas`: el filtro `esquema = 'comision'` pasa
--      a `esquema <> 'salario'`; si no, un mixto no generaba comisión.
-- Expandir: nadie tiene 'mixto' al aplicarla, así que ningún monto cambia.
-- ------------------------------------------------------------------------------------

DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.perfiles_pago'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%esquema%'
  LOOP
    EXECUTE 'ALTER TABLE public.perfiles_pago DROP CONSTRAINT ' || quote_ident(v_rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.perfiles_pago ADD CONSTRAINT perfiles_pago_esquema_check CHECK (esquema IN ('comision', 'salario', 'mixto'));

CREATE OR REPLACE FUNCTION public.trg_perfiles_pago_sello()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.actualizado_en := now();
  NEW.actualizado_por := auth.uid();
  IF NEW.esquema = 'salario' THEN
    NEW.comision_porcentaje := NULL;
  ELSIF NEW.esquema = 'comision' THEN
    NEW.salario_monto := NULL;
    NEW.salario_periodo := NULL;
  ELSIF NEW.esquema = 'mixto' THEN
    IF NEW.salario_monto IS NULL THEN
      RAISE EXCEPTION 'Escribe el salario del pago mixto.' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_perfiles_pago_sello() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_order_commissions(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estatus  order_status;
  v_sede     UUID;
BEGIN
  SELECT estatus, sede_id INTO v_estatus, v_sede
  FROM ordenes_trabajo WHERE id = target_order_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_estatus <> 'entregado' THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  DELETE FROM comisiones c
  WHERE c.orden_id = target_order_id
    AND c.pago_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public._reparto_comisiones(target_order_id) r
      WHERE r.usuario_id = c.usuario_id
        AND r.especialidad = c.especialidad
        AND r.labor_id IS NOT DISTINCT FROM c.labor_id
        AND r.esquema <> 'salario' AND r.monto > 0
    );

  INSERT INTO comisiones (orden_id, usuario_id, sede_id, especialidad, labor_id, base_ganancia, porcentaje, tecnicos, monto, estado)
  SELECT target_order_id, r.usuario_id, v_sede, r.especialidad, r.labor_id, r.base, r.porcentaje, r.tecnicos, r.monto, 'sugerida'
  FROM public._reparto_comisiones(target_order_id) r
  WHERE r.esquema <> 'salario' AND r.monto > 0
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
  v_res   JSONB;
BEGIN
  IF NOT v_admin AND NOT (p_orden_id = ANY (public.mis_ordenes_asignadas())) THEN
    RAISE EXCEPTION 'Solo el personal asignado ve la comisión de esta orden.' USING ERRCODE = '42501';
  END IF;

  WITH r AS (
    SELECT rr.*, c.id AS comision_id, c.estado AS c_estado, c.monto AS c_monto,
           c.porcentaje AS c_porcentaje, c.pago_id AS c_pago
    FROM public._reparto_comisiones(p_orden_id) rr
    LEFT JOIN comisiones c
      ON c.orden_id = p_orden_id
     AND c.usuario_id = rr.usuario_id
     AND c.especialidad = rr.especialidad
     AND c.labor_id IS NOT DISTINCT FROM rr.labor_id
    WHERE v_admin OR rr.usuario_id = v_yo
  ),
  v AS (
    SELECT r.*,
      CASE WHEN r.c_estado = 'aceptada' OR r.c_pago IS NOT NULL THEN r.c_monto
           WHEN v_admin THEN COALESCE(r.c_monto, r.monto) END AS monto_visible,
      CASE WHEN r.c_estado = 'aceptada' OR r.c_pago IS NOT NULL THEN r.c_porcentaje
           WHEN v_admin THEN COALESCE(r.c_porcentaje, r.porcentaje) END AS porcentaje_visible,
      CASE WHEN r.c_estado = 'aceptada' OR r.c_pago IS NOT NULL THEN 'aceptada' ELSE 'sugerida' END AS estado
    FROM r
  )
  SELECT jsonb_build_object(
    'bolsas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'especialidad', b.especialidad,
               'base', CASE WHEN v_admin THEN round(b.base, 2) END,
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
               'usuario_id', g.usuario_id,
               'especialidad', g.especialidad,
               'esquema', g.esquema,
               'porcentaje', g.porcentaje,
               'tecnicos', g.tecnicos,
               'monto', g.monto,
               'heredado', g.heredado,
               'tareas', g.tareas,
               'comision_id', g.comision_id,
               'estado', g.estado
             ) ORDER BY g.especialidad, g.usuario_id)
      FROM (
        SELECT
          v.usuario_id,
          v.especialidad,
          min(v.esquema) AS esquema,
          CASE WHEN bool_and(v.porcentaje_visible IS NOT NULL) THEN max(v.porcentaje_visible) END AS porcentaje,
          COALESCE(max(v.tecnicos) FILTER (WHERE v.labor_id IS NULL), 1) AS tecnicos,
          CASE WHEN bool_and(v.monto_visible IS NOT NULL) THEN SUM(v.monto_visible) END AS monto,
          bool_or(v.labor_id IS NULL) AS heredado,
          COUNT(v.labor_id)::INTEGER AS tareas,
          (array_agg(v.comision_id) FILTER (WHERE v.labor_id IS NULL))[1] AS comision_id,
          COALESCE((array_agg(v.estado) FILTER (WHERE v.labor_id IS NULL))[1], 'sugerida') AS estado
        FROM v
        GROUP BY v.usuario_id, v.especialidad
      ) g
    ), '[]'::jsonb),
    'mi_total', CASE
      WHEN v_admin THEN COALESCE((
        SELECT SUM(COALESCE(v.c_monto, v.monto)) FROM v
        WHERE v.usuario_id = v_yo AND v.esquema <> 'salario'
      ), 0)
      ELSE COALESCE((
        SELECT SUM(c.monto) FROM comisiones c
        WHERE c.orden_id = p_orden_id AND c.usuario_id = v_yo
          AND (c.estado = 'aceptada' OR c.pago_id IS NOT NULL)
      ), 0)
    END,
    'tareas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'labor_id', v.labor_id,
               'descripcion', l.descripcion,
               'especialidad', v.especialidad,
               'usuario_id', v.usuario_id,
               'esquema', v.esquema,
               'base', CASE WHEN v_admin THEN v.base END,
               'porcentaje', v.porcentaje_visible,
               'monto', v.monto_visible,
               'comision_id', v.comision_id,
               'estado', v.estado
             ) ORDER BY l.creado_en, l.id)
      FROM v
      JOIN orden_labor l ON l.id = v.labor_id
      WHERE v.labor_id IS NOT NULL
    ), '[]'::jsonb),
    'sin_asignar', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'labor_id', l.id,
               'descripcion', l.descripcion,
               'especialidad', l.especialidad,
               'costo', l.costo,
               'estado', l.estado
             ) ORDER BY l.creado_en, l.id)
      FROM orden_labor l
      WHERE l.orden_id = p_orden_id AND l.asignado_a IS NULL
        AND NOT l.reparto_heredado AND l.estado <> 'rechazado'
    ), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.comisiones_estimadas(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comisiones_estimadas(UUID) TO authenticated;
