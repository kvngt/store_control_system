-- ====================================================================================
-- RESTORIFY — El dinero de una orden, fuera del alcance de mecánicos y pintores
-- ====================================================================================
-- Pedido del cliente: los técnicos no ven costos de repuestos, ni totales, ni
-- depósitos, y no agregan líneas de mano de obra ni de repuestos. Lo único que
-- ven es la mano de obra de la orden, porque su comisión sale de ahí.
--
-- Esconderlo en la interfaz no alcanza, y este proyecto ya lo dejó escrito
-- (20260908000000): la anon key y cada endpoint de tabla están en el bundle del
-- navegador, así que un técnico puede pedir `/rest/v1/orden_repuestos` directo.
-- El único límite que se sostiene es RLS.
--
-- RLS filtra filas, no columnas, y columna a columna no se puede distinguir
-- admin de técnico: los dos son el rol `authenticated` de Postgres. Así que el
-- dinero se muda a tablas que el técnico no puede leer:
--
--   orden_montos      total_repuestos, total_general, deposito_inicial  (nueva, solo admin)
--   orden_repuestos   ahora solo admin; el técnico ve descripción y cantidad por RPC
--   orden_labor       lectura para la sede, escritura solo admin
--   ordenes_trabajo   conserva total_labor, que el técnico sí puede ver
--
-- Ventaja práctica de una tabla y no de columnas revocadas: PostgREST devuelve
-- `null` cuando un embed está bloqueado por RLS, así que la misma consulta
-- `select('*, montos:orden_montos(*)')` sirve para los dos roles, y ningún
-- `select('*')` futuro rompe la pantalla de un técnico.

-- ------------------------------------------------------------------------------------
-- 1. La tabla de montos.
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orden_montos (
  orden_id         UUID PRIMARY KEY REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  total_repuestos  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_general    NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposito_inicial NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (deposito_inicial >= 0),
  actualizado_en   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Se copia lo que haya antes de crear los triggers de la tabla, para que la
-- copia no asiente nada en Finanzas.
INSERT INTO orden_montos (orden_id, total_repuestos, total_general, deposito_inicial)
SELECT id, total_repuestos, total_general, deposito_inicial
FROM ordenes_trabajo
ON CONFLICT (orden_id) DO NOTHING;

ALTER TABLE orden_montos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orden_montos_admin" ON orden_montos;
CREATE POLICY "orden_montos_admin" ON orden_montos FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Toda orden nace con su fila de montos. SECURITY DEFINER porque la crea
-- también un técnico al registrar una recepción, y él no puede escribir aquí.
CREATE OR REPLACE FUNCTION public.trg_create_order_montos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO orden_montos (orden_id) VALUES (NEW.id)
  ON CONFLICT (orden_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_montos_create ON ordenes_trabajo;
CREATE TRIGGER trg_order_montos_create
  AFTER INSERT ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_create_order_montos();

-- ------------------------------------------------------------------------------------
-- 2. Retirar las columnas de ordenes_trabajo.
-- ------------------------------------------------------------------------------------
-- Los dos triggers que las leían directamente se quitan primero; sus funciones
-- se reescriben abajo contra orden_montos. Un cuerpo plpgsql no se valida al
-- borrar una columna, así que cualquier función que quedara apuntando a estas
-- columnas fallaría recién al ejecutarse — la misma trampa que documentan
-- 20260915000000 y 20260916000000. Todas las que las usaban están en esta
-- migración.
DROP TRIGGER IF EXISTS trg_order_deposit ON ordenes_trabajo;
DROP TRIGGER IF EXISTS trg_delivered_order_adjustment ON ordenes_trabajo;
DROP FUNCTION IF EXISTS public.handle_order_deposit();

ALTER TABLE ordenes_trabajo
  DROP COLUMN IF EXISTS total_repuestos,
  DROP COLUMN IF EXISTS total_general,
  DROP COLUMN IF EXISTS deposito_inicial;

-- ------------------------------------------------------------------------------------
-- 3. Recalcular totales: total_labor en la orden, el resto en montos.
-- ------------------------------------------------------------------------------------
-- `restorify.recalc` marca la transacción para que los guards distingan este
-- recálculo de un PATCH directo contra la API (ver 20260917000000). Los UPDATE
-- solo tocan filas que realmente cambian, para no disparar triggers en vano.
CREATE OR REPLACE FUNCTION public.recalculate_order_totals(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  labor_total NUMERIC;
  parts_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(costo), 0) INTO labor_total FROM orden_labor WHERE orden_id = target_order_id;
  SELECT COALESCE(SUM(subtotal), 0) INTO parts_total FROM orden_repuestos WHERE orden_id = target_order_id;

  PERFORM set_config('restorify.recalc', 'on', true);

  UPDATE ordenes_trabajo
  SET total_labor = labor_total
  WHERE id = target_order_id
    AND total_labor IS DISTINCT FROM labor_total;

  UPDATE orden_montos
  SET total_repuestos = parts_total,
      total_general   = labor_total + parts_total,
      actualizado_en  = NOW()
  WHERE orden_id = target_order_id
    AND (total_repuestos IS DISTINCT FROM parts_total
      OR total_general   IS DISTINCT FROM labor_total + parts_total);

  PERFORM set_config('restorify.recalc', 'off', true);
END;
$$;

-- ------------------------------------------------------------------------------------
-- 4. Guards.
-- ------------------------------------------------------------------------------------
-- 4a. ordenes_trabajo: los montos ya no están aquí, así que el guard se reduce a
--     entregar, sede, número y total_labor.
CREATE OR REPLACE FUNCTION public.trg_guard_order_money()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.estatus = 'entregado' AND OLD.estatus IS DISTINCT FROM 'entregado' THEN
    RAISE EXCEPTION 'Sólo un administrador puede marcar una orden como entregada.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.numero_orden IS DISTINCT FROM OLD.numero_orden
     OR NEW.sede_id IS DISTINCT FROM OLD.sede_id THEN
    RAISE EXCEPTION 'Sólo un administrador puede cambiar la sede o el número de una orden.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(current_setting('restorify.recalc', true), 'off') <> 'on'
     AND NEW.total_labor IS DISTINCT FROM OLD.total_labor THEN
    RAISE EXCEPTION 'Los totales de una orden los calcula el sistema a partir de sus líneas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- 4b. orden_montos: solo un admin llega aquí (RLS), pero aun así los totales los
--     escribe el sistema, y el depósito de una orden ya entregada no se mueve:
--     esa orden ya cobró su total completo, y la reversión de una entrega usa el
--     depósito como el monto al que regresar.
CREATE OR REPLACE FUNCTION public.trg_guard_order_montos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estatus order_status;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.orden_id IS DISTINCT FROM OLD.orden_id THEN
    RAISE EXCEPTION 'No se puede mover los montos a otra orden.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(current_setting('restorify.recalc', true), 'off') <> 'on'
     AND (NEW.total_repuestos IS DISTINCT FROM OLD.total_repuestos
       OR NEW.total_general   IS DISTINCT FROM OLD.total_general) THEN
    RAISE EXCEPTION 'Los totales de una orden los calcula el sistema a partir de sus líneas.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.deposito_inicial IS DISTINCT FROM OLD.deposito_inicial THEN
    SELECT estatus INTO v_estatus FROM ordenes_trabajo WHERE id = NEW.orden_id;
    IF v_estatus = 'entregado' THEN
      RAISE EXCEPTION 'La orden ya fue entregada: su depósito no se puede cambiar.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_montos_guard ON orden_montos;
CREATE TRIGGER trg_order_montos_guard
  BEFORE UPDATE ON orden_montos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_order_montos();

-- ------------------------------------------------------------------------------------
-- 5. Depósito.
-- ------------------------------------------------------------------------------------
-- Antes se asentaba en el AFTER INSERT de la orden, con el depósito que traía el
-- INSERT. Ahora la fila de montos nace en cero y create_work_order le escribe el
-- depósito después, así que se asienta cuando cambia — lo que además cubre que
-- un admin lo corrija antes de entregar, con un ajuste en vez de nada.
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
BEGIN
  previo := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.deposito_inicial, 0) ELSE 0 END;
  delta := COALESCE(NEW.deposito_inicial, 0) - previo;

  IF ABS(delta) <= 0.01 THEN
    RETURN NEW;
  END IF;

  SELECT id, sede_id, numero_orden, creado_por INTO ord
  FROM ordenes_trabajo WHERE id = NEW.orden_id;

  INSERT INTO finanzas_movimientos (
    sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id, registrado_por
  )
  VALUES (
    ord.sede_id,
    (CASE WHEN delta > 0 THEN 'ingreso' ELSE 'egreso' END)::transaction_type,
    'pago_cliente',
    ABS(delta),
    CASE WHEN previo = 0 THEN 'Depósito inicial - ' ELSE 'Ajuste de depósito - ' END || ord.numero_orden,
    CURRENT_DATE,
    ord.id,
    COALESCE(auth.uid(), ord.creado_por)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_montos_deposit ON orden_montos;
CREATE TRIGGER trg_order_montos_deposit
  AFTER INSERT OR UPDATE OF deposito_inicial ON orden_montos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_deposit_sync();

-- ------------------------------------------------------------------------------------
-- 6. Cobro final al entregar (la versión con suma con signo de 20260917000000,
--    leyendo el total desde orden_montos).
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_order_delivery_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total      NUMERIC;
  already_paid NUMERIC;
  remaining    NUMERIC;
BEGIN
  IF NEW.estatus = 'entregado' AND (OLD.estatus IS DISTINCT FROM 'entregado') THEN
    SELECT COALESCE(total_general, 0) INTO v_total
    FROM orden_montos WHERE orden_id = NEW.id;

    SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
      INTO already_paid
    FROM finanzas_movimientos
    WHERE referencia_orden_id = NEW.id
      AND categoria = 'pago_cliente';

    remaining := COALESCE(v_total, 0) - already_paid;

    IF remaining > 0.01 THEN
      INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
      VALUES (
        NEW.sede_id, 'ingreso', 'pago_cliente', remaining,
        'Pago final - ' || NEW.numero_orden, CURRENT_DATE, NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------------
-- 7. Ajuste de cobro cuando cambian los totales de una orden ya entregada.
-- ------------------------------------------------------------------------------------
-- Mismo cálculo que en 20260909000000; el disparador pasa de ordenes_trabajo a
-- orden_montos, que es donde ahora cambia el total.
CREATE OR REPLACE FUNCTION public.handle_delivered_order_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord              RECORD;
  already_recorded NUMERIC;
  delta            NUMERIC;
BEGIN
  IF NEW.total_general IS NOT DISTINCT FROM OLD.total_general THEN
    RETURN NEW;
  END IF;

  SELECT id, sede_id, numero_orden, estatus INTO ord
  FROM ordenes_trabajo WHERE id = NEW.orden_id;

  IF ord.estatus IS DISTINCT FROM 'entregado' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
  INTO already_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = ord.id AND categoria = 'pago_cliente';

  delta := NEW.total_general - already_recorded;

  IF ABS(delta) > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id,
      (CASE WHEN delta > 0 THEN 'ingreso' ELSE 'egreso' END)::transaction_type,
      'pago_cliente',
      ABS(delta),
      CASE WHEN delta > 0 THEN 'Ajuste por cargo adicional - ' ELSE 'Reembolso por ajuste - ' END
        || ord.numero_orden,
      CURRENT_DATE,
      ord.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_montos_delivered_adjustment ON orden_montos;
CREATE TRIGGER trg_order_montos_delivered_adjustment
  AFTER UPDATE ON orden_montos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_delivered_order_adjustment();

-- ------------------------------------------------------------------------------------
-- 8. Reversión de una entrega: vuelve al depósito, que ahora vive en montos.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_order_delivery_finance(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord            RECORD;
  v_deposito     NUMERIC;
  paid_recorded  NUMERIC;
  cost_recorded  NUMERIC;
  delta          NUMERIC;
BEGIN
  SELECT id, sede_id, numero_orden INTO ord
  FROM ordenes_trabajo WHERE id = target_order_id;

  IF ord.id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(deposito_inicial, 0) INTO v_deposito
  FROM orden_montos WHERE orden_id = target_order_id;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
    INTO paid_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id
    AND categoria = 'pago_cliente'
    AND importacion_id IS NULL;

  delta := paid_recorded - COALESCE(v_deposito, 0);

  IF delta > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'egreso', 'pago_cliente', delta,
      'Reversión de entrega - ' || ord.numero_orden, CURRENT_DATE, target_order_id
    );
  END IF;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END), 0)
    INTO cost_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id
    AND categoria = 'compra_repuesto'
    AND importacion_id IS NULL;

  IF cost_recorded > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'ingreso', 'compra_repuesto', cost_recorded,
      'Reversión de costo de repuestos - ' || ord.numero_orden, CURRENT_DATE, target_order_id
    );
  END IF;
END;
$$;

-- ------------------------------------------------------------------------------------
-- 9. Comisiones: base desde orden_montos; se recalculan por estatus (orden) o
--    por totales (montos).
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_order_commissions(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord          RECORD;
  rate         NUMERIC;
  base         NUMERIC;
  pool_cents   BIGINT;
  crew         INTEGER;
BEGIN
  SELECT o.id, o.sede_id, o.estatus, m.total_general, m.total_repuestos
    INTO ord
  FROM ordenes_trabajo o
  LEFT JOIN orden_montos m ON m.orden_id = o.id
  WHERE o.id = target_order_id;

  IF ord.id IS NULL THEN
    RETURN;
  END IF;

  IF ord.estatus <> 'entregado' THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  SELECT COALESCE(comision_porcentaje, 0) INTO rate FROM sedes WHERE id = ord.sede_id;

  base := GREATEST(COALESCE(ord.total_general, 0) - COALESCE(ord.total_repuestos, 0), 0);
  pool_cents := ROUND(base * COALESCE(rate, 0))::BIGINT;

  SELECT COUNT(DISTINCT usuario_id) INTO crew
  FROM orden_asignaciones
  WHERE orden_id = target_order_id;

  IF crew IS NULL OR crew = 0 THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  DELETE FROM comisiones c
  WHERE c.orden_id = target_order_id
    AND c.pago_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM orden_asignaciones a
      WHERE a.orden_id = target_order_id AND a.usuario_id = c.usuario_id
    );

  INSERT INTO comisiones (orden_id, usuario_id, sede_id, base_ganancia, porcentaje, tecnicos, monto)
  SELECT
    target_order_id,
    a.usuario_id,
    ord.sede_id,
    base,
    rate,
    crew,
    (pool_cents / crew
      + CASE WHEN a.posicion <= (pool_cents % crew) THEN 1 ELSE 0 END
    )::NUMERIC / 100
  FROM (
    SELECT usuario_id,
           ROW_NUMBER() OVER (ORDER BY usuario_id) AS posicion
    FROM (SELECT DISTINCT usuario_id FROM orden_asignaciones WHERE orden_id = target_order_id) u
  ) a
  ON CONFLICT (orden_id, usuario_id) DO UPDATE
    SET base_ganancia = EXCLUDED.base_ganancia,
        porcentaje    = EXCLUDED.porcentaje,
        tecnicos      = EXCLUDED.tecnicos,
        monto         = EXCLUDED.monto,
        sede_id       = EXCLUDED.sede_id
    WHERE comisiones.pago_id IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_commissions_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estatus IS DISTINCT FROM OLD.estatus THEN
    PERFORM public.sync_order_commissions(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_commissions_on_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.total_general IS DISTINCT FROM OLD.total_general
     OR NEW.total_repuestos IS DISTINCT FROM OLD.total_repuestos THEN
    PERFORM public.sync_order_commissions(NEW.orden_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_montos_commissions ON orden_montos;
CREATE TRIGGER trg_order_montos_commissions
  AFTER UPDATE ON orden_montos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_commissions_on_amounts();

-- ------------------------------------------------------------------------------------
-- 10. Crear una orden.
-- ------------------------------------------------------------------------------------
-- Sigue siendo SECURITY INVOKER, por la razón de 20260911000000: así toda la RLS
-- aplica igual que siempre. Lo que cambia es lo que hace según quién llama. Un
-- técnico registra la recepción del vehículo y queda asignado; cotizar, cobrar y
-- asignar a otros es de administración, así que lo que mande en esos campos se
-- ignora en vez de hacer fallar la recepción entera por RLS.
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

    INSERT INTO orden_labor (orden_id, descripcion, costo)
    SELECT v_order.id, item->>'descripcion', GREATEST(COALESCE((item->>'costo')::numeric, 0), 0)
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

REVOKE ALL ON FUNCTION public.create_work_order(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_work_order(jsonb, jsonb, jsonb, jsonb) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 11. RLS de las líneas de la orden.
-- ------------------------------------------------------------------------------------
-- Repuestos: solo admin. El técnico ve qué piezas lleva la orden, sin precios,
-- por la función de la sección 12.
DROP POLICY IF EXISTS "orden_repuestos_all" ON orden_repuestos;
DROP POLICY IF EXISTS "orden_repuestos_admin" ON orden_repuestos;
CREATE POLICY "orden_repuestos_admin" ON orden_repuestos FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Mano de obra: la sede la lee (es la base de la comisión), solo admin la escribe.
DROP POLICY IF EXISTS "orden_labor_all" ON orden_labor;
DROP POLICY IF EXISTS "orden_labor_select" ON orden_labor;
DROP POLICY IF EXISTS "orden_labor_admin_write" ON orden_labor;
DROP POLICY IF EXISTS "orden_labor_admin_update" ON orden_labor;
DROP POLICY IF EXISTS "orden_labor_admin_delete" ON orden_labor;

CREATE POLICY "orden_labor_select" ON orden_labor FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_labor.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  );
CREATE POLICY "orden_labor_admin_write" ON orden_labor FOR INSERT
  WITH CHECK (public.is_admin());
CREATE POLICY "orden_labor_admin_update" ON orden_labor FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY "orden_labor_admin_delete" ON orden_labor FOR DELETE
  USING (public.is_admin());

-- Asignaciones: `FOR ALL` dejaba a un técnico asignar a cualquier compañero a
-- cualquier orden de la sede. Ahora solo puede unirse él mismo, y actualizar el
-- estatus de su propia tarea.
DROP POLICY IF EXISTS "orden_asignaciones_all" ON orden_asignaciones;
DROP POLICY IF EXISTS "orden_asignaciones_select" ON orden_asignaciones;
DROP POLICY IF EXISTS "orden_asignaciones_insert" ON orden_asignaciones;
DROP POLICY IF EXISTS "orden_asignaciones_update" ON orden_asignaciones;
DROP POLICY IF EXISTS "orden_asignaciones_delete" ON orden_asignaciones;

CREATE POLICY "orden_asignaciones_select" ON orden_asignaciones FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_asignaciones.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  );
CREATE POLICY "orden_asignaciones_insert" ON orden_asignaciones FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      usuario_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM ordenes_trabajo o
        WHERE o.id = orden_asignaciones.orden_id AND o.sede_id = public.current_user_sede_id()
      )
    )
  );
CREATE POLICY "orden_asignaciones_update" ON orden_asignaciones FOR UPDATE
  USING (public.is_admin() OR usuario_id = auth.uid())
  WITH CHECK (
    public.is_admin()
    OR (
      usuario_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM ordenes_trabajo o
        WHERE o.id = orden_asignaciones.orden_id AND o.sede_id = public.current_user_sede_id()
      )
    )
  );
CREATE POLICY "orden_asignaciones_delete" ON orden_asignaciones FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------------------------------
-- 12. Repuestos sin precios para el técnico.
-- ------------------------------------------------------------------------------------
-- Función y no vista SECURITY DEFINER: el linter de Supabase marca esas vistas
-- como riesgo, y una función deja explícito qué columnas salen y con qué filtro.
CREATE OR REPLACE FUNCTION public.repuestos_de_orden(p_orden_id UUID)
RETURNS TABLE (id UUID, descripcion TEXT, cantidad INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.descripcion, r.cantidad
  FROM orden_repuestos r
  JOIN ordenes_trabajo o ON o.id = r.orden_id
  WHERE r.orden_id = p_orden_id
    AND (public.is_admin() OR o.sede_id = public.current_user_sede_id())
  ORDER BY r.descripcion;
$$;

REVOKE ALL ON FUNCTION public.repuestos_de_orden(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_de_orden(UUID) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 13. Reportes: solo administración los genera y los comparte.
-- ------------------------------------------------------------------------------------
-- El PDF lleva precios, totales y depósito. Pedido del cliente: los técnicos no
-- mandan reportes desde su perfil.
DROP POLICY IF EXISTS "reportes_sede_select" ON storage.objects;
DROP POLICY IF EXISTS "reportes_admin_select" ON storage.objects;
CREATE POLICY "reportes_admin_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'reportes' AND public.is_admin());

DROP POLICY IF EXISTS "reportes_sede_insert" ON storage.objects;
DROP POLICY IF EXISTS "reportes_admin_insert" ON storage.objects;
CREATE POLICY "reportes_admin_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'reportes' AND public.is_admin());

DROP POLICY IF EXISTS "reportes_sede_update" ON storage.objects;
DROP POLICY IF EXISTS "reportes_admin_update" ON storage.objects;
CREATE POLICY "reportes_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'reportes' AND public.is_admin());
