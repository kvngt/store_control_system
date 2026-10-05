-- ====================================================================================
-- Aprobación de comisiones: el técnico ve su comisión cuando administración la acepta
-- ====================================================================================
-- Al entregar, la base calcula la comisión de cada quien como siempre (`sync_order_commissions`)
-- y la deja **sugerida**. Administración la acepta tal cual o con otro porcentaje o monto
-- (`aprobar_comision`). Hasta entonces el técnico no ve el monto: ni en la tarjeta de la orden
-- (`comisiones_estimadas`), ni leyendo la tabla por la API (política de `comisiones`), ni en el
-- aviso de "comisión generada" (sale al aceptarla, con el monto aceptado).
--
-- Corregida el 05/10/2026 antes de aplicarse en ninguna base real (la primera versión, del
-- 04/10, no estaba en producción): esa versión dejaba al técnico ver las comisiones de sus
-- compañeros en la orden, cambiaba `sin_asignar` de lista a número (el diálogo de entrega hace
-- `.filter` sobre esa lista y se rompía), conservaba una comisión aceptada al sacar la orden de
-- Entregado o al cambiar el técnico de la tarea (se pagaba dos veces o una orden no entregada),
-- y aceptaba montos negativos. Las tres funciones se reescriben enteras partiendo de
-- 20261010000006.
-- ====================================================================================

-- 1. El estado de cada comisión. Las que ya existen nacen sugeridas; las ya pagadas se
--    consideran aceptadas en todo lo que mira el estado (el pago ya fijó el monto).
ALTER TABLE comisiones ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'sugerida'
  CHECK (estado IN ('sugerida', 'aceptada'));


-- 2. El recálculo: igual que en 20261010000006, salvo que no pisa lo que administración aceptó.
--    Una comisión aceptada se borra (como cualquier otra sin pagar) si la orden deja de estar
--    entregada o si su llave ya no está en el reparto (otra persona hace esa tarea): conservarla
--    pagaría una orden no entregada o la misma tarea dos veces.
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

  -- Solo una orden entregada devenga comisiones. Al volver a entregarla, administración las
  -- acepta de nuevo.
  IF v_estatus <> 'entregado' THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  -- Quien cobra: con esquema de comisión y algo que cobrar. Un asalariado, o alguien en una
  -- bolsa vacía, no genera una fila en cero (ni el aviso de "comisión generada"). Lo pagado
  -- nunca se borra ni se cambia.
  DELETE FROM comisiones c
  WHERE c.orden_id = target_order_id
    AND c.pago_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public._reparto_comisiones(target_order_id) r
      WHERE r.usuario_id = c.usuario_id
        AND r.especialidad = c.especialidad
        AND r.labor_id IS NOT DISTINCT FROM c.labor_id
        AND r.esquema = 'comision' AND r.monto > 0
    );

  -- Nace sugerida. Lo que administración ya aceptó conserva su monto y su porcentaje.
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


-- 3. Aceptar una comisión, tal cual o con otro porcentaje o monto. Con solo el porcentaje, el
--    monto sale de la misma cuenta que `_reparto_comisiones` (base × % ÷ técnicos). Lo pagado
--    no se toca. Al aceptarla se le avisa al técnico, con el monto aceptado.
CREATE OR REPLACE FUNCTION public.aprobar_comision(p_comision_id UUID, p_monto NUMERIC DEFAULT NULL, p_porcentaje NUMERIC DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c     comisiones;
  v_monto NUMERIC;
  d       JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aprobar comisiones.' USING ERRCODE = '42501';
  END IF;
  IF p_monto IS NOT NULL AND p_monto < 0 THEN
    RAISE EXCEPTION 'La comisión no puede ser negativa.' USING ERRCODE = '22023';
  END IF;
  IF p_porcentaje IS NOT NULL AND (p_porcentaje < 0 OR p_porcentaje > 100) THEN
    RAISE EXCEPTION 'El porcentaje tiene que estar entre 0 y 100.' USING ERRCODE = '22023';
  END IF;

  -- Bloqueada: un pago que entre al mismo tiempo no paga un monto que está cambiando.
  SELECT * INTO v_c FROM comisiones WHERE id = p_comision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa comisión ya no existe: vuelve a abrir la orden.' USING ERRCODE = 'P0002';
  END IF;
  IF v_c.pago_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esa comisión ya se pagó: no se puede cambiar.' USING ERRCODE = '42501';
  END IF;

  v_monto := COALESCE(
    round(p_monto, 2),
    CASE WHEN p_porcentaje IS NOT NULL
      THEN (round(v_c.base_ganancia * p_porcentaje / GREATEST(v_c.tecnicos, 1)) / 100)::NUMERIC(12,2)
      ELSE v_c.monto
    END
  );

  UPDATE comisiones
  SET estado = 'aceptada',
      monto = v_monto,
      porcentaje = COALESCE(p_porcentaje, porcentaje)
  WHERE id = p_comision_id;

  BEGIN
    d := public.datos_orden_aviso(v_c.orden_id);
    PERFORM public.notificar(
      ARRAY[v_c.usuario_id],
      'comision_generada',
      'Comisión aprobada · ' || (d->>'numero_orden'),
      '$' || to_char(v_monto, 'FM999,999,990.00') || ' por la mano de obra de ' ||
        COALESCE(NULLIF(d->>'vehiculo', ''), 'la orden'),
      d || jsonb_build_object('monto', v_monto),
      v_c.orden_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'aprobar_comision (aviso): %', SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.aprobar_comision(UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_comision(UUID, NUMERIC, NUMERIC) TO authenticated;


-- 4. El aviso al entregar ya no sale: era el monto sugerido. Sale al aceptarla (arriba).
--    Reescrita entera desde 20261010000006: solo cuenta lo que nace aceptado (hoy, nada).
CREATE OR REPLACE FUNCTION public.trg_notify_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  d JSONB;
BEGIN
  FOR r IN
    SELECT n.orden_id, n.usuario_id, SUM(n.monto) AS monto
    FROM nuevas n
    WHERE n.estado = 'aceptada'
    GROUP BY n.orden_id, n.usuario_id
  LOOP
    BEGIN
      d := public.datos_orden_aviso(r.orden_id);
      PERFORM public.notificar(
        ARRAY[r.usuario_id],
        'comision_generada',
        'Comisión generada · ' || (d->>'numero_orden'),
        '$' || to_char(r.monto, 'FM999,999,990.00') || ' por la mano de obra de ' ||
          COALESCE(NULLIF(d->>'vehiculo', ''), 'la orden'),
        d || jsonb_build_object('monto', r.monto),
        r.orden_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trg_notify_commission: %', SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_notify_commission() FROM PUBLIC, anon, authenticated;


-- 5. Un técnico lee por la API solo sus comisiones aceptadas o pagadas. Administración, todas.
DROP POLICY IF EXISTS "comisiones_select" ON comisiones;
CREATE POLICY "comisiones_select" ON comisiones FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (usuario_id = (SELECT auth.uid()) AND (estado = 'aceptada' OR pago_id IS NOT NULL))
  );


-- 6. El reparto estimado de una orden, con el estado de cada comisión. Reescrita entera desde
--    20261010000006: misma forma (`bolsas`, `reparto` agrupado por persona y especialidad,
--    `mi_total`, `tareas`, `sin_asignar` como lista) y un técnico sigue viendo **solo lo
--    suyo**. Agrega `comision_id` y `estado`. Lo que ve cada quien:
--      - administración: lo aceptado, o la cuenta mientras no se acepte;
--      - un técnico: solo lo aceptado o pagado; lo demás llega en null ("pendiente").
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
    -- La bolsa heredada de cada especialidad (líneas aprobadas sin técnico de antes de la
    -- comisión por tarea) y cuántos asignados a mano la reparten. La base, solo administración.
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
    -- Lo de cada quien por especialidad: su parte heredada más sus tareas. El monto y el
    -- porcentaje, solo si se ven todos los de ese grupo. `comision_id` y `estado` son los de
    -- la parte heredada (las tareas traen los suyos en `tareas`).
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
    -- Lo de quien pregunta, sumado aquí: el navegador no suma dinero. Un técnico, solo lo
    -- aceptado o pagado (de la tabla, no de la cuenta).
    'mi_total', CASE
      WHEN v_admin THEN COALESCE((
        SELECT SUM(COALESCE(v.c_monto, v.monto)) FROM v
        WHERE v.usuario_id = v_yo AND v.esquema = 'comision'
      ), 0)
      ELSE COALESCE((
        SELECT SUM(c.monto) FROM comisiones c
        WHERE c.orden_id = p_orden_id AND c.usuario_id = v_yo
          AND (c.estado = 'aceptada' OR c.pago_id IS NOT NULL)
      ), 0)
    END,
    -- Cada tarea aprobada con técnico y su comisión. Un técnico ve solo las suyas.
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
    -- Tareas nuevas sin técnico (no rechazadas): nadie cobrará su comisión hasta asignarlas.
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
