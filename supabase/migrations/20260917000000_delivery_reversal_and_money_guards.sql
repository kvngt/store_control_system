-- ====================================================================================
-- RESTORIFY — Revertir una entrega, atar el pago de comisiones a su egreso,
--             y cerrar las rutas por las que un técnico se factura a sí mismo
-- ====================================================================================
-- Tres defectos encontrados auditando el ciclo de vida de la orden. Ninguno se
-- manifiesta como un error: los tres dejan la contabilidad del taller
-- describiendo algo que no pasó.

-- ------------------------------------------------------------------------------------
-- 1. Sacar una orden de "entregado" borraba las comisiones pero no el ingreso.
-- ------------------------------------------------------------------------------------
-- Los cuatro triggers AFTER UPDATE de ordenes_trabajo eran asimétricos. En la
-- transición `entregado -> finalizado` (una entrega marcada por error, que es
-- exactamente para lo que existe poder retroceder el estatus):
--
--   sync_order_commissions            borra las comisiones pendientes   ✔
--   handle_order_delivery_payment     exige NEW = 'entregado'           ✘ no entra
--   sync_order_parts_expense          exige estatus = 'entregado'       ✘ no entra
--   handle_delivered_order_adjustment exige OLD y NEW = 'entregado'     ✘ no entra
--
-- Es decir: el "Pago final" y el "Costo de repuestos" se quedaban asentados. El
-- taller reportaba el ingreso completo de un carro que seguía en el taller, y
-- sin el pasivo de comisión que lo acompaña. Si esa ventana cruzaba un cierre de
-- mes, el mes cerró mal y nada lo decía.
--
-- La reversión se calcula desde lo que hay asentado, no desde lo que debería
-- haber: así es exacta e idempotente — correrla dos veces no asienta nada la
-- segunda vez, porque para entonces lo registrado ya es el depósito.
--
-- Las filas conciliadas contra un estado de cuenta (importacion_id NOT NULL) se
-- excluyen, igual que hace cleanup_order_finance: ese dinero sí se movió por la
-- cuenta bancaria y no es nuestro para deshacerlo.
CREATE OR REPLACE FUNCTION public.reverse_order_delivery_finance(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord            RECORD;
  paid_recorded  NUMERIC;
  cost_recorded  NUMERIC;
  delta          NUMERIC;
BEGIN
  SELECT id, sede_id, numero_orden, deposito_inicial
    INTO ord
  FROM ordenes_trabajo
  WHERE id = target_order_id;

  IF ord.id IS NULL THEN
    RETURN;
  END IF;

  -- Cobros al cliente que generó la automatización. Con la orden fuera de
  -- "entregado" lo único que el cliente ha pagado es su depósito.
  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
    INTO paid_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id
    AND categoria = 'pago_cliente'
    AND importacion_id IS NULL;

  delta := paid_recorded - COALESCE(ord.deposito_inicial, 0);

  IF delta > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'egreso', 'pago_cliente', delta,
      'Reversión de entrega - ' || ord.numero_orden, CURRENT_DATE, target_order_id
    );
  END IF;

  -- El costo de repuestos se asienta al entregar. Si la entrega se deshace, el
  -- egreso se deshace con ella.
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

CREATE OR REPLACE FUNCTION public.trg_order_delivery_reversal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.estatus = 'entregado' AND NEW.estatus IS DISTINCT FROM 'entregado' THEN
    PERFORM public.reverse_order_delivery_finance(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Su condición y la de trg_order_delivery_payment son mutuamente excluyentes
-- dentro de un mismo UPDATE (una sale de "entregado", la otra entra), así que el
-- orden alfabético en que Postgres dispara los AFTER ROW no cambia nada aquí.
DROP TRIGGER IF EXISTS trg_order_delivery_reversal ON ordenes_trabajo;
CREATE TRIGGER trg_order_delivery_reversal
  AFTER UPDATE ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_delivery_reversal();

-- ------------------------------------------------------------------------------------
-- 1b. Y el cobro final tiene que saber sumar una reversión.
-- ------------------------------------------------------------------------------------
-- handle_order_delivery_payment calculaba lo ya cobrado sumando sólo los
-- ingresos:
--
--     SELECT COALESCE(SUM(monto), 0) ... WHERE tipo = 'ingreso' AND categoria <> ...
--
-- Un egreso contra la orden no le restaba nada. Con la reversión de arriba eso
-- se vuelve un defecto de inmediato: entregar ($200 de depósito + $1,000 de pago
-- final), des-entregar (reversión de -$1,000) y volver a entregar dejaba
-- `already_paid` en $1,200 — porque los dos ingresos siguen ahí y la reversión
-- no cuenta — así que el cobro final no se volvía a asentar y la orden quedaba
-- entregada con $200 registrados de $1,200.
--
-- La suma pasa a ser con signo, que es lo que ya hacían sync_order_parts_expense
-- y handle_delivered_order_adjustment; ésta era la única de las tres que no.
--
-- Y el filtro pasa de "cualquier ingreso que no sea de repuestos" a "de la
-- categoría pago_cliente", que es más estrecho y más exacto: un gasto operativo
-- adjuntado a la orden nunca fue un pago del cliente.
--
-- A diferencia de la reversión, aquí NO se excluyen las filas conciliadas
-- (`importacion_id`): un depósito real del cliente que llegó por el banco y se
-- ató a la orden sí reduce lo que queda por cobrar. La reversión las excluye por
-- lo contrario — no puede deshacer dinero que de verdad se movió.
CREATE OR REPLACE FUNCTION public.handle_order_delivery_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  already_paid NUMERIC;
  remaining NUMERIC;
BEGIN
  IF NEW.estatus = 'entregado' AND (OLD.estatus IS DISTINCT FROM 'entregado') THEN
    SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
      INTO already_paid
    FROM finanzas_movimientos
    WHERE referencia_orden_id = NEW.id
      AND categoria = 'pago_cliente';

    remaining := NEW.total_general - already_paid;

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
-- 2. Deshacer un pago de comisiones podía borrar el egreso de otro empleado.
-- ------------------------------------------------------------------------------------
-- finanzas_movimientos no guardaba a qué comision_pagos pertenecía su fila, así
-- que al borrar el pago el trigger buscaba el egreso por heurística:
--
--   DELETE FROM finanzas_movimientos
--   WHERE sede_id = OLD.sede_id AND categoria = 'planilla' AND tipo = 'egreso'
--     AND fecha = OLD.fecha_pago AND ABS(monto - OLD.monto) < 0.01
--     AND descripcion LIKE 'Pago de comisiones -%';
--
-- Un DELETE sin LIMIT borra todas las coincidencias, y la colisión es el caso
-- normal de este modelo: una bolsa de $350 repartida entre dos mecánicos son
-- dos pagos de $175 el mismo día en la misma sede. Deshacer uno borraba los dos
-- egresos y el segundo empleado quedaba pagado sin registro contable.
--
-- Con la referencia explícita el borrado deja de ser una búsqueda: lo hace la
-- propia restricción, sobre la fila correcta y sólo sobre ella.
ALTER TABLE finanzas_movimientos
  ADD COLUMN IF NOT EXISTS comision_pago_id UUID;

ALTER TABLE finanzas_movimientos
  DROP CONSTRAINT IF EXISTS finanzas_movimientos_comision_pago_id_fkey;
ALTER TABLE finanzas_movimientos
  ADD CONSTRAINT finanzas_movimientos_comision_pago_id_fkey
  FOREIGN KEY (comision_pago_id) REFERENCES comision_pagos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_finanzas_movimientos_comision_pago
  ON finanzas_movimientos (comision_pago_id)
  WHERE comision_pago_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_commission_payment_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
BEGIN
  SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = NEW.usuario_id;

  INSERT INTO finanzas_movimientos (
    sede_id, tipo, categoria, monto, descripcion, fecha, numero_cheque,
    registrado_por, comision_pago_id
  )
  VALUES (
    NEW.sede_id, 'egreso', 'planilla', NEW.monto,
    'Pago de comisiones - ' || COALESCE(v_nombre, 'empleado'),
    NEW.fecha_pago, NEW.numero_cheque, NEW.pagado_por, NEW.id
  );
  RETURN NEW;
END;
$$;

-- Sólo INSERT: deshacer el pago ya se lleva su egreso por la FK en cascada, que
-- no puede equivocarse de fila.
DROP TRIGGER IF EXISTS trg_commission_payment_finance ON comision_pagos;
CREATE TRIGGER trg_commission_payment_finance
  AFTER INSERT ON comision_pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_commission_payment_expense();

-- ------------------------------------------------------------------------------------
-- 3. Un técnico podía facturar trabajo y cobrarse la comisión.
-- ------------------------------------------------------------------------------------
-- La migración 20260908000000 documentó el modelo de amenaza ("un mecánico que
-- está por ser despedido y todavía tiene sesión válida") y cerró todos los
-- DELETE. Dejó abiertas las rutas que escriben dinero:
--
--   ordenes_trabajo_update    cualquier usuario de la sede -> PATCH de
--                             total_general / deposito_inicial / estatus
--   orden_labor_all           FOR ALL -> insertar una línea de labor de $10,000
--   orden_asignaciones_all    FOR ALL -> auto-asignarse
--
-- Encadenadas: agregar labor, auto-asignarse, mover la orden a "entregado"
-- (el Kanban lo permite a cualquiera asignado) y cobrar el 35%. Y unirse a una
-- orden YA entregada re-reparte la bolsa: quien se auto-asigna después del
-- hecho se lleva una tajada y le baja la de quienes hicieron el trabajo.
--
-- Entregar una orden es asentar un ingreso. Es una decisión de administración,
-- no un paso del taller.

-- 3a. Los totales sólo los escribe recalculate_order_totals.
-- ------------------------------------------------------------------------------------
-- El guard no puede simplemente prohibir escribir los totales a un técnico: el
-- propio recalculate_order_totals los escribe con un UPDATE, y corre con el
-- auth.uid() de quien agregó la línea de labor. Se marca la transacción para
-- distinguir el recálculo legítimo de un PATCH directo contra la API.
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

  -- `true` = sólo por esta transacción. Es lo que le dice al guard de abajo que
  -- este UPDATE viene de aquí y no de un cliente.
  PERFORM set_config('restorify.recalc', 'on', true);

  UPDATE ordenes_trabajo
  SET total_labor = labor_total,
      total_repuestos = parts_total,
      total_general = labor_total + parts_total
  WHERE id = target_order_id;

  PERFORM set_config('restorify.recalc', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_guard_order_money()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Sin JWT de usuario final esto es una ruta de mantenimiento de confianza: la
  -- service-role key o SQL de una migración. Mismo criterio que
  -- trg_guard_perfil_privilegios.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.estatus = 'entregado' AND OLD.estatus IS DISTINCT FROM 'entregado' THEN
    RAISE EXCEPTION 'Sólo un administrador puede marcar una orden como entregada.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.deposito_inicial IS DISTINCT FROM OLD.deposito_inicial THEN
    RAISE EXCEPTION 'Sólo un administrador puede cambiar el depósito de una orden.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.numero_orden IS DISTINCT FROM OLD.numero_orden
     OR NEW.sede_id IS DISTINCT FROM OLD.sede_id THEN
    RAISE EXCEPTION 'Sólo un administrador puede cambiar la sede o el número de una orden.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(current_setting('restorify.recalc', true), 'off') <> 'on'
     AND (NEW.total_labor     IS DISTINCT FROM OLD.total_labor
       OR NEW.total_repuestos IS DISTINCT FROM OLD.total_repuestos
       OR NEW.total_general   IS DISTINCT FROM OLD.total_general) THEN
    RAISE EXCEPTION 'Los totales de una orden los calcula el sistema a partir de sus líneas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_money_guard ON ordenes_trabajo;
CREATE TRIGGER trg_order_money_guard
  BEFORE UPDATE ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_order_money();

-- 3b. Una orden entregada está cerrada para el taller.
-- ------------------------------------------------------------------------------------
-- Labor, repuestos y asignaciones de una orden ya entregada mueven dinero ya
-- asentado: los totales disparan un ajuste en Finanzas y las asignaciones
-- re-reparten la bolsa de comisión. Editarlas es corregir la contabilidad, que
-- es trabajo de administración. Para el técnico la orden se cierra al entregarse.
CREATE OR REPLACE FUNCTION public.trg_guard_delivered_order_children()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estatus order_status;
BEGIN
  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT estatus INTO v_estatus
  FROM ordenes_trabajo
  WHERE id = COALESCE(NEW.orden_id, OLD.orden_id);

  IF v_estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_delivered_guard ON orden_labor;
CREATE TRIGGER trg_labor_delivered_guard
  BEFORE INSERT OR UPDATE OR DELETE ON orden_labor
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_delivered_order_children();

DROP TRIGGER IF EXISTS trg_parts_delivered_guard ON orden_repuestos;
CREATE TRIGGER trg_parts_delivered_guard
  BEFORE INSERT OR UPDATE OR DELETE ON orden_repuestos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_delivered_order_children();

DROP TRIGGER IF EXISTS trg_assignments_delivered_guard ON orden_asignaciones;
CREATE TRIGGER trg_assignments_delivered_guard
  BEFORE INSERT OR UPDATE OR DELETE ON orden_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_delivered_order_children();

-- ------------------------------------------------------------------------------------
-- 4. El reparto de la comisión no sumaba la bolsa.
-- ------------------------------------------------------------------------------------
-- `share := ROUND(pool / crew, 2)` daba a cada uno la misma cifra redondeada,
-- así que $350 entre 3 pagaba $116.67 tres veces: $350.01. Un centavo por orden
-- no rompe nada, pero es una diferencia que no cuadra contra el egreso y que
-- alguien va a tener que explicar.
--
-- Se reparte en centavos y el residuo se le da a los primeros, ordenados por
-- usuario_id para que el reparto sea el mismo cada vez que se recalcula:
-- $116.67 + $116.67 + $116.66 = $350.00.
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
  SELECT id, sede_id, estatus, total_general, total_repuestos
    INTO ord
  FROM ordenes_trabajo
  WHERE id = target_order_id;

  IF ord.id IS NULL THEN
    RETURN;
  END IF;

  -- Nada se gana hasta que el carro sale. Si una orden se saca de `entregado`
  -- (una entrega marcada por error), las comisiones pendientes se van con ella
  -- en vez de quedar como un saldo que nadie puede explicar.
  IF ord.estatus <> 'entregado' THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  SELECT COALESCE(comision_porcentaje, 0) INTO rate FROM sedes WHERE id = ord.sede_id;

  -- Los repuestos son de traspaso: lo que se le cobra al cliente por ellos es
  -- lo que le costaron al taller (ver la migración 20260913000000), así que
  -- restar la línea de repuestos deja el margen propio del taller.
  base := GREATEST(COALESCE(ord.total_general, 0) - COALESCE(ord.total_repuestos, 0), 0);
  -- En centavos: base (dólares) * rate (porcentaje) = base * rate / 100 dólares
  -- * 100 centavos. El ROUND es el único redondeo de todo el cálculo.
  pool_cents := ROUND(base * COALESCE(rate, 0))::BIGINT;

  SELECT COUNT(DISTINCT usuario_id) INTO crew
  FROM orden_asignaciones
  WHERE orden_id = target_order_id;

  -- Una orden sin nadie no le gana nada a nadie; se limpia lo pendiente y se
  -- para, en vez de dividir por cero.
  IF crew IS NULL OR crew = 0 THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  -- Se quitan las comisiones no pagadas de quien ya no está en la orden.
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
    -- El cociente entero a todos, y un centavo más a los primeros `resto`.
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
    -- Lo liquidado es historia. Sólo se recalcula lo que sigue pendiente.
    WHERE comisiones.pago_id IS NULL;
END;
$$;
