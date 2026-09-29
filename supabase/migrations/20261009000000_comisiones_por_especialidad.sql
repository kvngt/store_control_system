-- ------------------------------------------------------------------------------------
-- Comisiones por especialidad y por empleado
-- ------------------------------------------------------------------------------------
-- Acordado en la reunión con el taller (septiembre 2026), cambios 5 y 6.
--
-- Hasta hoy `sync_order_commissions` tomaba toda la mano de obra autorizada de la orden, le
-- aplicaba el porcentaje de la SEDE y lo repartía en partes iguales entre TODOS los
-- asignados. En el ejemplo de la reunión — pintura $1,000, mecánica $200 — el mecánico se
-- llevaba la mitad de la comisión de $1,200, aunque solo hizo $200 de trabajo.
--
-- Modelo nuevo:
--   * Cada línea de mano de obra tiene `especialidad` (mecanica | pintura). Por omisión sale
--     del tipo de la orden; en una orden "combinado", mecánica, y el admin la cambia.
--   * Cada especialidad es una bolsa: la mano de obra autorizada de esa especialidad. Se
--     reparte entre los asignados con esa tarea (`orden_asignaciones.tipo_tarea`).
--   * Cada quien cobra SU porcentaje sobre su parte: el de `perfiles_pago` si lo tiene, si
--     no, el de la sede. Quien está a salario no cobra comisión y su parte se queda en el
--     taller (decisión D5). Una bolsa sin nadie asignado no la cobra nadie (D8); la orden
--     lo avisa (`comisiones_estimadas`).
--   * La misma persona puede cobrar de las dos bolsas: la llave de `comisiones` pasa a ser
--     (orden, usuario, especialidad).
--   * Lo pagado nunca se toca. Lo pendiente sigue la configuración vigente, igual que ya
--     pasaba al cambiar el porcentaje de la sede (`trg_commissions_on_rate_change`): cambiar
--     el porcentaje o el esquema de alguien recalcula sus comisiones pendientes.
--
-- El dinero de cada quien se calcula en centavos exactos y el sobrante de redondeo va a las
-- fracciones más grandes (empate: por usuario). Con porcentajes iguales da exactamente lo
-- mismo que el reparto anterior: la bolsa redondeada, repartida con el centavo de sobra a
-- los primeros.
--
-- La configuración de pago va en una tabla aparte (`perfiles_pago`) y no en `perfiles`:
-- un técnico lee los perfiles de sus compañeros de sede, y no tiene por qué ver su sueldo
-- ni su porcentaje.
-- ------------------------------------------------------------------------------------


-- ----- 1. La especialidad de cada línea de mano de obra ----------------------------------
ALTER TABLE orden_labor ADD COLUMN IF NOT EXISTS especialidad TEXT;

-- Relleno sin disparar triggers: no cambia ningún monto, y los guardias de presupuesto
-- rechazarían tocar una línea pendiente.
ALTER TABLE orden_labor DISABLE TRIGGER USER;
UPDATE orden_labor l
SET especialidad = CASE o.tipo_trabajo WHEN 'pintura' THEN 'pintura' ELSE 'mecanica' END
FROM ordenes_trabajo o
WHERE o.id = l.orden_id AND l.especialidad IS NULL;
ALTER TABLE orden_labor ENABLE TRIGGER USER;

ALTER TABLE orden_labor ALTER COLUMN especialidad SET NOT NULL;
ALTER TABLE orden_labor DROP CONSTRAINT IF EXISTS orden_labor_especialidad_check;
ALTER TABLE orden_labor ADD CONSTRAINT orden_labor_especialidad_check
  CHECK (especialidad IN ('mecanica', 'pintura'));

-- Una línea que llega sin especialidad toma la del tipo de orden.
CREATE OR REPLACE FUNCTION public.trg_labor_especialidad()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.especialidad IS NULL THEN
    SELECT CASE tipo_trabajo WHEN 'pintura' THEN 'pintura' ELSE 'mecanica' END
      INTO NEW.especialidad
    FROM ordenes_trabajo WHERE id = NEW.orden_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_labor_especialidad() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_labor_especialidad ON orden_labor;
CREATE TRIGGER trg_labor_especialidad
  BEFORE INSERT ON orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_labor_especialidad();

-- El guardia de presupuestos: cambiar SOLO la especialidad no es cambiar lo cotizado. El
-- cliente no la ve, así que se deja pasar sin mover el estado de la línea (sin esto, en una
-- línea pendiente lanzaría y en una rechazada la devolvería a borrador).
CREATE OR REPLACE FUNCTION public.trg_guard_linea_presupuesto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sistema BOOLEAN := COALESCE(current_setting('restorify.presupuesto', true), 'off') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Toda línea nueva nace como borrador, diga lo que diga quien la inserta.
    IF NOT v_sistema THEN
      NEW.estado := 'borrador';
      NEW.presupuesto_id := NULL;
      NEW.decidido_en := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Borrar la orden (o la sede) arrastra sus líneas: eso no es "quitar una línea
    -- de un presupuesto abierto".
    IF OLD.estado = 'pendiente' AND NOT v_sistema
       AND EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = OLD.orden_id)
       AND EXISTS (SELECT 1 FROM presupuestos WHERE id = OLD.presupuesto_id AND estado = 'enviado') THEN
      RAISE EXCEPTION 'Esta línea es parte de un presupuesto que espera respuesta del cliente. Cancela el presupuesto para quitarla.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF v_sistema THEN
    RETURN NEW;
  END IF;

  -- Solo la especialidad (a qué bolsa de comisión va): no toca lo cotizado.
  IF (to_jsonb(NEW) - 'especialidad') = (to_jsonb(OLD) - 'especialidad') THEN
    RETURN NEW;
  END IF;

  -- ON DELETE SET NULL de un presupuesto que se borra con su orden.
  IF NEW.presupuesto_id IS NULL AND OLD.presupuesto_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM presupuestos WHERE id = OLD.presupuesto_id) THEN
    RETURN NEW;
  END IF;

  IF OLD.estado = 'pendiente' THEN
    RAISE EXCEPTION 'Esta línea es parte de un presupuesto que espera respuesta del cliente. Cancela el presupuesto para modificarla.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.presupuesto_id IS DISTINCT FROM OLD.presupuesto_id
     OR NEW.decidido_en IS DISTINCT FROM OLD.decidido_en THEN
    RAISE EXCEPTION 'El estado de una línea lo cambian el presupuesto, la firma de recepción o una autorización registrada.'
      USING ERRCODE = '42501';
  END IF;

  -- Corregir una línea rechazada (otro precio, otra pieza) es volver a cotizarla:
  -- regresa a borrador para presentársela de nuevo al cliente.
  IF OLD.estado = 'rechazado' THEN
    NEW.estado := 'borrador';
    NEW.presupuesto_id := NULL;
    NEW.decidido_en := NULL;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_guard_linea_presupuesto() FROM PUBLIC, anon, authenticated;


-- ----- 2. Cómo se le paga a cada quien ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.perfiles_pago (
  usuario_id          UUID PRIMARY KEY REFERENCES perfiles(id) ON DELETE CASCADE,
  esquema             TEXT NOT NULL DEFAULT 'comision'
                        CHECK (esquema IN ('comision', 'salario')),
  -- Nulo = el porcentaje de la sede.
  comision_porcentaje NUMERIC(5,2)
                        CHECK (comision_porcentaje IS NULL OR (comision_porcentaje >= 0 AND comision_porcentaje <= 100)),
  -- Informativo por ahora (decisión D6): el salario no se asienta en Finanzas.
  salario_monto       NUMERIC(12,2) CHECK (salario_monto IS NULL OR salario_monto >= 0),
  salario_periodo     TEXT CHECK (salario_periodo IS NULL OR salario_periodo IN ('semanal', 'quincenal', 'mensual')),
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por     UUID REFERENCES perfiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.perfiles_pago IS
  'Esquema de pago de cada empleado: comisión (con su porcentaje o el de la sede) o salario. Sin fila = comisión con el porcentaje de la sede.';

ALTER TABLE public.perfiles_pago ENABLE ROW LEVEL SECURITY;

-- Cada quien ve el suyo (la comisión estimada lo usa); los demás, solo administración.
DROP POLICY IF EXISTS perfiles_pago_select ON perfiles_pago;
CREATE POLICY perfiles_pago_select ON perfiles_pago
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS perfiles_pago_insert ON perfiles_pago;
CREATE POLICY perfiles_pago_insert ON perfiles_pago
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS perfiles_pago_update ON perfiles_pago;
CREATE POLICY perfiles_pago_update ON perfiles_pago
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS perfiles_pago_delete ON perfiles_pago;
CREATE POLICY perfiles_pago_delete ON perfiles_pago
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

REVOKE ALL ON TABLE public.perfiles_pago FROM anon;

CREATE OR REPLACE FUNCTION public.trg_perfiles_pago_sello()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.actualizado_en := now();
  NEW.actualizado_por := auth.uid();
  -- Un salario sin datos de salario y una comisión con datos de salario son lo mismo que
  -- nada: se limpia lo que no aplica al esquema elegido.
  IF NEW.esquema = 'salario' THEN
    NEW.comision_porcentaje := NULL;
  ELSE
    NEW.salario_monto := NULL;
    NEW.salario_periodo := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_perfiles_pago_sello() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_perfiles_pago_sello ON perfiles_pago;
CREATE TRIGGER trg_perfiles_pago_sello
  BEFORE INSERT OR UPDATE ON perfiles_pago
  FOR EACH ROW EXECUTE FUNCTION public.trg_perfiles_pago_sello();


-- ----- 3. La comisión, por especialidad ---------------------------------------------------
ALTER TABLE comisiones ADD COLUMN IF NOT EXISTS especialidad TEXT;

-- Las que ya existen: la tarea de esa persona en esa orden (mecánica si no hay otra).
UPDATE comisiones c
SET especialidad = COALESCE((
  SELECT min(a.tipo_tarea) FROM orden_asignaciones a
  WHERE a.orden_id = c.orden_id AND a.usuario_id = c.usuario_id AND a.tipo_tarea IN ('mecanica', 'pintura')
), 'mecanica')
WHERE c.especialidad IS NULL;

ALTER TABLE comisiones ALTER COLUMN especialidad SET NOT NULL;
ALTER TABLE comisiones DROP CONSTRAINT IF EXISTS comisiones_especialidad_check;
ALTER TABLE comisiones ADD CONSTRAINT comisiones_especialidad_check
  CHECK (especialidad IN ('mecanica', 'pintura'));

ALTER TABLE comisiones DROP CONSTRAINT IF EXISTS comisiones_orden_id_usuario_id_key;
ALTER TABLE comisiones DROP CONSTRAINT IF EXISTS comisiones_orden_usuario_especialidad_key;
ALTER TABLE comisiones ADD CONSTRAINT comisiones_orden_usuario_especialidad_key
  UNIQUE (orden_id, usuario_id, especialidad);


-- El reparto completo de una orden, entregada o no. Una sola cuenta para el devengo
-- (`sync_order_commissions`) y para la estimación que ve la pantalla.
CREATE OR REPLACE FUNCTION public._reparto_comisiones(p_orden_id UUID)
RETURNS TABLE (
  usuario_id   UUID,
  especialidad TEXT,
  esquema      TEXT,
  base         NUMERIC,
  porcentaje   NUMERIC,
  tecnicos     INTEGER,
  monto        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH o AS (
    SELECT o.id, COALESCE(s.comision_porcentaje, 0) AS tasa_sede
    FROM ordenes_trabajo o
    JOIN sedes s ON s.id = o.sede_id
    WHERE o.id = p_orden_id
  ),
  bolsas AS (
    SELECT l.especialidad, SUM(l.costo) AS base
    FROM orden_labor l
    WHERE l.orden_id = p_orden_id AND l.estado = 'aprobado'
    GROUP BY l.especialidad
  ),
  equipo AS (
    SELECT DISTINCT a.usuario_id, a.tipo_tarea AS especialidad
    FROM orden_asignaciones a
    WHERE a.orden_id = p_orden_id AND a.tipo_tarea IN ('mecanica', 'pintura')
  ),
  n AS (
    SELECT e.especialidad, COUNT(*)::INTEGER AS tecnicos FROM equipo e GROUP BY e.especialidad
  ),
  personas AS (
    SELECT
      e.usuario_id,
      e.especialidad,
      COALESCE(pp.esquema, 'comision') AS esquema,
      CASE WHEN COALESCE(pp.esquema, 'comision') = 'salario' THEN 0
           ELSE COALESCE(pp.comision_porcentaje, o.tasa_sede) END AS porcentaje,
      COALESCE(b.base, 0) AS base,
      n.tecnicos
    FROM equipo e
    CROSS JOIN o
    JOIN n ON n.especialidad = e.especialidad
    LEFT JOIN bolsas b ON b.especialidad = e.especialidad
    LEFT JOIN perfiles_pago pp ON pp.usuario_id = e.usuario_id
  ),
  exactos AS (
    -- Centavos de cada quien, con su fracción: su parte de la bolsa × su porcentaje.
    SELECT p.*, p.base * p.porcentaje / p.tecnicos AS exacto
    FROM personas p
  ),
  repartido AS (
    SELECT
      x.*,
      floor(x.exacto) AS piso,
      ROW_NUMBER() OVER (
        PARTITION BY x.especialidad
        ORDER BY (x.exacto - floor(x.exacto)) DESC, x.usuario_id
      ) AS turno,
      ROUND(SUM(x.exacto) OVER (PARTITION BY x.especialidad))
        - SUM(floor(x.exacto)) OVER (PARTITION BY x.especialidad) AS sobrantes
    FROM exactos x
  )
  SELECT
    r.usuario_id,
    r.especialidad,
    r.esquema,
    round(r.base, 2),
    r.porcentaje,
    r.tecnicos,
    ((r.piso + CASE WHEN r.turno <= r.sobrantes THEN 1 ELSE 0 END) / 100)::NUMERIC(12,2)
  FROM repartido r;
$$;
REVOKE ALL ON FUNCTION public._reparto_comisiones(UUID) FROM PUBLIC, anon, authenticated;


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
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  -- Quien cobra: con esquema de comisión y algo que cobrar. Un asalariado, o alguien en una
  -- bolsa vacía, no genera una fila en cero (ni el aviso de "comisión generada").
  DELETE FROM comisiones c
  WHERE c.orden_id = target_order_id
    AND c.pago_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public._reparto_comisiones(target_order_id) r
      WHERE r.usuario_id = c.usuario_id AND r.especialidad = c.especialidad
        AND r.esquema = 'comision' AND r.monto > 0
    );

  INSERT INTO comisiones (orden_id, usuario_id, sede_id, especialidad, base_ganancia, porcentaje, tecnicos, monto)
  SELECT target_order_id, r.usuario_id, v_sede, r.especialidad, r.base, r.porcentaje, r.tecnicos, r.monto
  FROM public._reparto_comisiones(target_order_id) r
  WHERE r.esquema = 'comision' AND r.monto > 0
  ON CONFLICT (orden_id, usuario_id, especialidad) DO UPDATE
    SET base_ganancia = EXCLUDED.base_ganancia,
        porcentaje    = EXCLUDED.porcentaje,
        tecnicos      = EXCLUDED.tecnicos,
        monto         = EXCLUDED.monto,
        sede_id       = EXCLUDED.sede_id
    WHERE comisiones.pago_id IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_order_commissions(UUID) FROM PUBLIC, anon, authenticated;


-- Cambiar la especialidad de una línea cambia las bolsas, aunque no cambie ningún total
-- (y por eso `trg_commissions_on_amounts` no se entera).
CREATE OR REPLACE FUNCTION public.trg_commissions_on_labor_specialty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.especialidad IS DISTINCT FROM OLD.especialidad THEN
    PERFORM public.sync_order_commissions(NEW.orden_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_commissions_on_labor_specialty() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_labor_specialty_commissions ON orden_labor;
CREATE TRIGGER trg_labor_specialty_commissions
  AFTER UPDATE OF especialidad ON orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_commissions_on_labor_specialty();


-- Cambiar el esquema o el porcentaje de alguien recalcula sus comisiones pendientes, igual
-- que cambiar el de la sede. Lo pagado no se toca, y a quien pasa de salario a comisión no
-- le nacen comisiones de órdenes ya entregadas.
CREATE OR REPLACE FUNCTION public.trg_commissions_on_pay_scheme()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
BEGIN
  FOR o IN
    SELECT DISTINCT orden_id FROM comisiones
    WHERE usuario_id = COALESCE(NEW.usuario_id, OLD.usuario_id) AND pago_id IS NULL
  LOOP
    PERFORM public.sync_order_commissions(o.orden_id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.trg_commissions_on_pay_scheme() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pay_scheme_commissions ON perfiles_pago;
CREATE TRIGGER trg_pay_scheme_commissions
  AFTER INSERT OR UPDATE OR DELETE ON perfiles_pago
  FOR EACH ROW EXECUTE FUNCTION public.trg_commissions_on_pay_scheme();


-- ----- 4. Lo que ve la pantalla ------------------------------------------------------------
-- El reparto estimado de una orden. Administración lo ve entero (con las bolsas que nadie
-- cobra); un técnico asignado, las bolsas y lo suyo.
CREATE OR REPLACE FUNCTION public.comisiones_estimadas(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin BOOLEAN := public.is_admin();
BEGIN
  IF NOT v_admin AND NOT (p_orden_id = ANY (public.mis_ordenes_asignadas())) THEN
    RAISE EXCEPTION 'Solo el personal asignado ve la comisión de esta orden.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'bolsas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'especialidad', b.especialidad,
               'base', round(b.base, 2),
               'tecnicos', (
                 SELECT COUNT(DISTINCT a.usuario_id) FROM orden_asignaciones a
                 WHERE a.orden_id = p_orden_id AND a.tipo_tarea = b.especialidad
               )
             ) ORDER BY b.especialidad)
      FROM (
        SELECT l.especialidad, SUM(l.costo) AS base
        FROM orden_labor l
        WHERE l.orden_id = p_orden_id AND l.estado = 'aprobado'
        GROUP BY l.especialidad
      ) b
    ), '[]'::jsonb),
    'reparto', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'usuario_id', r.usuario_id,
               'especialidad', r.especialidad,
               'esquema', r.esquema,
               'porcentaje', r.porcentaje,
               'tecnicos', r.tecnicos,
               'monto', r.monto
             ) ORDER BY r.especialidad, r.usuario_id)
      FROM public._reparto_comisiones(p_orden_id) r
      WHERE v_admin OR r.usuario_id = auth.uid()
    ), '[]'::jsonb),
    -- Lo de quien pregunta, sumado aquí: el navegador no suma dinero.
    'mi_total', COALESCE((
      SELECT SUM(r.monto) FROM public._reparto_comisiones(p_orden_id) r
      WHERE r.usuario_id = auth.uid() AND r.esquema = 'comision'
    ), 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.comisiones_estimadas(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comisiones_estimadas(UUID) TO authenticated;


-- Resumen de un empleado para la sección Empleados. Las sumas, en la base (regla 0).
CREATE OR REPLACE FUNCTION public.resumen_empleado(p_usuario_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el resumen de un empleado.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'comisiones_pendientes', COALESCE((
      SELECT round(SUM(monto), 2) FROM comisiones WHERE usuario_id = p_usuario_id AND pago_id IS NULL
    ), 0),
    'comisiones_pagadas', COALESCE((
      SELECT round(SUM(monto), 2) FROM comisiones WHERE usuario_id = p_usuario_id AND pago_id IS NOT NULL
    ), 0),
    'ultimo_pago', (
      SELECT MAX(fecha_pago) FROM comision_pagos WHERE usuario_id = p_usuario_id
    ),
    'ordenes_activas', (
      SELECT COUNT(DISTINCT a.orden_id) FROM orden_asignaciones a
      JOIN ordenes_trabajo o ON o.id = a.orden_id
      WHERE a.usuario_id = p_usuario_id AND o.estatus NOT IN ('finalizado', 'entregado')
    ),
    'ordenes_entregadas', (
      SELECT COUNT(DISTINCT a.orden_id) FROM orden_asignaciones a
      JOIN ordenes_trabajo o ON o.id = a.orden_id
      WHERE a.usuario_id = p_usuario_id AND o.estatus = 'entregado'
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.resumen_empleado(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumen_empleado(UUID) TO authenticated;


-- ----- 5. El alta de la orden acepta la especialidad de cada línea ------------------------
-- Idéntica a la vigente salvo `especialidad` en la mano de obra (nula = la del tipo de orden).
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
    IF v_deposito > 0 THEN
      UPDATE orden_montos SET deposito_inicial = v_deposito WHERE orden_id = v_order.id;
    END IF;

    INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'costo')::numeric, 0), 0),
      CASE WHEN item->>'especialidad' IN ('mecanica', 'pintura') THEN item->>'especialidad' END
    FROM jsonb_array_elements(COALESCE(p_labor, '[]'::jsonb)) AS item;

    INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1),
      COALESCE((item->>'precio_venta_unitario')::numeric, 0),
      COALESCE((item->>'precio_venta_unitario')::numeric, 0),
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1) * COALESCE((item->>'precio_venta_unitario')::numeric, 0)
    FROM jsonb_array_elements(COALESCE(p_parts, '[]'::jsonb)) AS item;

    INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, estatus_tarea)
    SELECT v_order.id, (item->>'usuario_id')::uuid, item->>'tipo_tarea', 'pendiente'
    FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) AS item;
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


-- ----- 6. Lo pendiente, con el modelo nuevo -----------------------------------------------
-- Datos de prueba hoy: se recalcula lo que no se ha pagado de las órdenes entregadas.
DO $$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM ordenes_trabajo WHERE estatus = 'entregado' LOOP
    PERFORM public.sync_order_commissions(o.id);
  END LOOP;
END $$;
