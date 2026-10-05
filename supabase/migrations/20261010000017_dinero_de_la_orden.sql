-- ====================================================================================
-- El dinero de la orden, como lo decidió el taller (05/10/2026)
-- ====================================================================================
-- Decisiones sobre docs/analisis-del-proceso-2026-10.md:
--
--   A. La importación del estado de cuenta es para la contabilidad de meses pasados y para el
--      contador: queda separada de lo que registra la app. Un movimiento importado ya no cuenta
--      como cobro de una orden (saldo, balance, ajuste al entregar, enlace del cliente) ni como
--      costo automático de sus repuestos. Los totales del panel los separa `resumen_panel`.
--   B. El costo de un repuesto: por defecto el precio, y administración lo cambia cuando sabe
--      lo que pagó. Ya no se pisa con el precio en cada edición (`trg_part_cost_follows_price`).
--      El costo automático de una orden solo cuenta lo que asentó el sistema (sin quién ni
--      lote): una compra a mano vinculada a la orden ya no lo achica.
--   C. Se cobra también con tarjeta y con Zelle. Las comisiones de Clover y del banco tienen su
--      categoría (`comision_bancaria`, 20261010000016) y las reglas de importación las usan.
--   H. "Retirada sin reparar": el cliente se lleva el vehículo sin que se haga (todo) el
--      trabajo. Administración dice qué pasó: se canceló todo y se le devuelve lo que dejó; o
--      solo se cobra la revisión; o se hicieron algunos trabajos y el resto no. Lo hecho se
--      cobra (y su técnico cobra su comisión), lo no hecho pasa a no autorizado, y se devuelve
--      o se cobra la diferencia con lo que dejó el cliente. No cuenta como orden terminada en
--      el panel. En la base es una entrega marcada (`retirada_sin_reparar`), así hereda el
--      cobro, el archivo, el candado de lo entregado y la reversión; en pantalla y para el
--      cliente es otro estado.
--   J. La fecha del taller: los movimientos automáticos se fechaban con `CURRENT_DATE`, que en
--      la base es UTC, y un cobro después de las 8 p. m. de Maryland caía al día siguiente (y el
--      último día del mes, en el mes siguiente). Ahora `hoy_taller(sede)`, con la zona de la
--      sede (`sedes.zona_horaria`, por defecto America/New_York). Los recordatorios de entrega
--      vencida usaban la hora de Chicago.
--   N. Anticipos: un pago del cliente antes de entregar (la pieza por Zelle, la mitad al
--      autorizar), con su método y su comprobante (`registrar_anticipo`). Suma al depósito,
--      así que el saldo, la entrega y la reversión ya lo cuentan: sacar la orden de Entregado
--      vuelve a lo pagado por adelantado, no al depósito del alta.
--   K. Descuento por orden, absorbido por el taller: baja el total que se le cobra al cliente
--      y no toca la mano de obra de la que salen las comisiones. Lo aplica solo administración
--      (`aplicar_descuento`), en dólares o en porcentaje de lo autorizado (la base hace la
--      cuenta).
--
-- Cada función se reescribe entera partiendo de su versión vigente (`npm run db:donde`).
-- Expandir: todo lo que cambia acepta lo que manda la app publicada (las firmas de las RPC
-- no cambian; los métodos nuevos solo se agregan).
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. La fecha del taller (J)
-- ------------------------------------------------------------------------------------
ALTER TABLE sedes ADD COLUMN IF NOT EXISTS zona_horaria TEXT NOT NULL DEFAULT 'America/New_York';
COMMENT ON COLUMN sedes.zona_horaria IS
  'Zona horaria del taller (IANA). Fecha de los movimientos automáticos y de los recordatorios.';

-- Una zona mal escrita no puede tumbar una entrega: cae a la de Maryland.
CREATE OR REPLACE FUNCTION public.hoy_taller(p_sede_id UUID DEFAULT NULL)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  SELECT NULLIF(btrim(zona_horaria), '') INTO v_tz FROM sedes WHERE id = p_sede_id;
  BEGIN
    RETURN (NOW() AT TIME ZONE COALESCE(v_tz, 'America/New_York'))::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN (NOW() AT TIME ZONE 'America/New_York')::date;
  END;
END;
$$;
-- Solo la usan otras funciones de la base.
REVOKE ALL ON FUNCTION public.hoy_taller(UUID) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- 2. Tarjeta y Zelle (C)
-- ------------------------------------------------------------------------------------
ALTER TABLE finanzas_movimientos
  DROP CONSTRAINT IF EXISTS finanzas_movimientos_metodo_pago_check;
ALTER TABLE finanzas_movimientos
  ADD CONSTRAINT finanzas_movimientos_metodo_pago_check
  CHECK (metodo_pago IS NULL OR metodo_pago IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque'));

COMMENT ON COLUMN finanzas_movimientos.metodo_pago IS
  'Cómo pagó (o cómo se le devolvió) el cliente: efectivo, tarjeta, zelle, transferencia o cheque.';

-- Los cargos de Clover y de la tarjeta, en su categoría al importar un estado de cuenta.
-- Las reglas son datos que administración edita: solo se mueven las que siguen como venían.
UPDATE finanzas_reglas_categorizacion
SET categoria = 'comision_bancaria'
WHERE lower(patron) IN ('bankcard fee', 'bankcard discount fee', 'clover fee', 'cash deposit processing fee', 'monthly service fee', 'transactions fee')
  AND categoria = 'gasto_operativo';


-- ------------------------------------------------------------------------------------
-- 3. Retirada sin reparar (H): la columna y quién la escribe
-- ------------------------------------------------------------------------------------
ALTER TABLE ordenes_trabajo
  ADD COLUMN IF NOT EXISTS retirada_sin_reparar BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN ordenes_trabajo.retirada_sin_reparar IS
  'La orden se cerró sin hacer el trabajo (retirar_sin_reparar). Solo con estatus entregado.';

-- Solo `retirar_sin_reparar` la enciende (a través de `entregar_orden`), y sacar la orden de
-- Entregado la apaga. Nadie la escribe directo, tampoco un admin: cambiarla moverían
-- comisiones sin pasar por el cobro.
CREATE OR REPLACE FUNCTION public.trg_guard_retirada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.retirada_sin_reparar := false;
    RETURN NEW;
  END IF;

  IF NEW.estatus IS DISTINCT FROM 'entregado' THEN
    NEW.retirada_sin_reparar := false;
  ELSIF NEW.retirada_sin_reparar IS DISTINCT FROM OLD.retirada_sin_reparar
        AND COALESCE(current_setting('restorify.retirada', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Una orden queda "Retirada sin reparar" solo al cerrarla con esa opción.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_guard_retirada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_retirada_guard ON ordenes_trabajo;
CREATE TRIGGER trg_order_retirada_guard
  BEFORE INSERT OR UPDATE ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_retirada();


-- ------------------------------------------------------------------------------------
-- 4. Descuento (K)
-- ------------------------------------------------------------------------------------
ALTER TABLE orden_montos
  ADD COLUMN IF NOT EXISTS descuento NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_motivo TEXT;
ALTER TABLE orden_montos DROP CONSTRAINT IF EXISTS orden_montos_descuento_check;
ALTER TABLE orden_montos ADD CONSTRAINT orden_montos_descuento_check CHECK (descuento >= 0);
COMMENT ON COLUMN orden_montos.descuento IS
  'Descuento al cliente, absorbido por el taller: baja total_general, no la mano de obra ni las comisiones.';


-- ------------------------------------------------------------------------------------
-- 5. Los totales: lo aprobado menos el descuento
-- ------------------------------------------------------------------------------------
-- Parte de 20260924000000. Cambia: `total_general` resta el descuento (nunca por debajo de 0:
-- si después se rechaza una línea, el descuento no vuelve negativo el total).
CREATE OR REPLACE FUNCTION public.recalculate_order_totals(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  labor_total NUMERIC;
  parts_total NUMERIC;
  v_descuento NUMERIC;
  v_total     NUMERIC;
BEGIN
  SELECT COALESCE(SUM(costo), 0) INTO labor_total
  FROM orden_labor WHERE orden_id = target_order_id AND estado = 'aprobado';
  SELECT COALESCE(SUM(subtotal), 0) INTO parts_total
  FROM orden_repuestos WHERE orden_id = target_order_id AND estado = 'aprobado';
  SELECT COALESCE(descuento, 0) INTO v_descuento
  FROM orden_montos WHERE orden_id = target_order_id;

  v_total := GREATEST(labor_total + parts_total - COALESCE(v_descuento, 0), 0);

  PERFORM set_config('restorify.recalc', 'on', true);

  UPDATE ordenes_trabajo
  SET total_labor = labor_total
  WHERE id = target_order_id
    AND total_labor IS DISTINCT FROM labor_total;

  UPDATE orden_montos
  SET total_repuestos = parts_total,
      total_general   = v_total,
      actualizado_en  = NOW()
  WHERE orden_id = target_order_id
    AND (total_repuestos IS DISTINCT FROM parts_total
      OR total_general   IS DISTINCT FROM v_total);

  PERFORM set_config('restorify.recalc', 'off', true);
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_order_totals(UUID) FROM PUBLIC, anon, authenticated;

-- Parte de 20260918000000. Cambia: el descuento lo escribe solo `aplicar_descuento` (que
-- valida y recalcula), igual que los totales los escribe solo el recálculo.
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

  IF COALESCE(current_setting('restorify.descuento', true), 'off') <> 'on'
     AND (NEW.descuento IS DISTINCT FROM OLD.descuento
       OR NEW.descuento_motivo IS DISTINCT FROM OLD.descuento_motivo) THEN
    RAISE EXCEPTION 'El descuento se aplica desde la orden, con "Aplicar descuento".'
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
REVOKE ALL ON FUNCTION public.trg_guard_order_montos() FROM PUBLIC, anon, authenticated;

-- Aplicar (o quitar, con 0) el descuento, en dólares (`p_monto`) o en porcentaje de lo
-- autorizado (`p_porcentaje`, la base hace la cuenta). Nunca más que lo autorizado: un descuento
-- mayor dejaría el total en cero y escondería el exceso. Sobre una orden ya entregada vale
-- igual: el ajuste de cobro (`handle_delivered_order_adjustment`) asienta la devolución.
CREATE OR REPLACE FUNCTION public.aplicar_descuento(
  p_orden_id   UUID,
  p_monto      NUMERIC DEFAULT NULL,
  p_motivo     TEXT DEFAULT NULL,
  p_porcentaje NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_montos   orden_montos;
  v_subtotal NUMERIC;
  v_monto    NUMERIC;
  v_motivo   TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aplicar descuentos.' USING ERRCODE = '42501';
  END IF;
  IF p_porcentaje IS NOT NULL AND (p_porcentaje < 0 OR p_porcentaje > 100) THEN
    RAISE EXCEPTION 'El porcentaje tiene que estar entre 0 y 100.' USING ERRCODE = '22023';
  END IF;
  IF p_porcentaje IS NULL AND COALESCE(p_monto, 0) < 0 THEN
    RAISE EXCEPTION 'El descuento no puede ser negativo.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_montos FROM orden_montos WHERE orden_id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE((SELECT SUM(costo) FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'aprobado'), 0)
       + COALESCE((SELECT SUM(subtotal) FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'aprobado'), 0)
    INTO v_subtotal;

  v_monto := round(
    CASE WHEN p_porcentaje IS NOT NULL THEN v_subtotal * p_porcentaje / 100 ELSE COALESCE(p_monto, 0) END,
    2
  );

  IF v_monto > v_subtotal THEN
    RAISE EXCEPTION 'El descuento no puede ser mayor que lo autorizado (%).', to_char(v_subtotal, 'FM$999,999,990.00')
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('restorify.descuento', 'on', true);
  UPDATE orden_montos
  SET descuento = v_monto,
      descuento_motivo = CASE WHEN v_monto > 0 THEN v_motivo END
  WHERE orden_id = p_orden_id;
  PERFORM set_config('restorify.descuento', 'off', true);

  PERFORM public.recalculate_order_totals(p_orden_id);

  RETURN jsonb_build_object(
    'descuento', v_monto,
    'total', (SELECT total_general FROM orden_montos WHERE orden_id = p_orden_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_descuento(UUID, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_descuento(UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 6. El costo de un repuesto (B) y si está pedido o llegó (H)
-- ------------------------------------------------------------------------------------
-- Parte de 20260913000000. Antes el costo se igualaba al precio en cada INSERT y UPDATE. Ahora
-- el precio es solo el valor por defecto: al crear la línea sin costo, o mientras el costo
-- siga siendo igual al precio (nadie lo cambió) y cambie el precio. Si administración escribe
-- otro costo, se queda.
CREATE OR REPLACE FUNCTION public.trg_part_cost_follows_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.costo_unitario := COALESCE(NEW.costo_unitario, NEW.precio_venta_unitario, 0);
  ELSIF NEW.costo_unitario IS NOT DISTINCT FROM OLD.costo_unitario
        AND OLD.costo_unitario IS NOT DISTINCT FROM OLD.precio_venta_unitario THEN
    NEW.costo_unitario := COALESCE(NEW.precio_venta_unitario, 0);
  END IF;

  NEW.costo_unitario := COALESCE(NEW.costo_unitario, 0);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_part_cost_follows_price() FROM PUBLIC, anon, authenticated;

-- Sin valor por defecto: con `DEFAULT 0` el trigger no distingue "no mandaron costo" de "costo
-- cero", y una línea nueva sin costo quedaba en 0 en vez de en el precio. El NOT NULL se revisa
-- después del trigger, que siempre lo llena.
ALTER TABLE orden_repuestos ALTER COLUMN costo_unitario DROP DEFAULT;

-- Un costo negativo no existe. NOT VALID: no revisa las filas viejas (solo las nuevas y las
-- que se editen), para no frenar la migración por un dato de antes.
ALTER TABLE orden_repuestos DROP CONSTRAINT IF EXISTS orden_repuestos_costo_unitario_check;
ALTER TABLE orden_repuestos ADD CONSTRAINT orden_repuestos_costo_unitario_check
  CHECK (costo_unitario >= 0) NOT VALID;

-- Pedido → llegó. Nulo: la pieza no se pide (estaba en el taller o no hace falta seguirla).
ALTER TABLE orden_repuestos
  ADD COLUMN IF NOT EXISTS estado_pedido TEXT,
  ADD COLUMN IF NOT EXISTS pedido_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recibido_en TIMESTAMPTZ;
ALTER TABLE orden_repuestos DROP CONSTRAINT IF EXISTS orden_repuestos_estado_pedido_check;
ALTER TABLE orden_repuestos ADD CONSTRAINT orden_repuestos_estado_pedido_check
  CHECK (estado_pedido IS NULL OR estado_pedido IN ('pedido', 'recibido'));
COMMENT ON COLUMN orden_repuestos.estado_pedido IS
  'pedido: la orden espera esta pieza; recibido: ya llegó. Nulo: no se sigue.';

CREATE OR REPLACE FUNCTION public.trg_repuesto_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estado_pedido IS NOT DISTINCT FROM OLD.estado_pedido THEN
    RETURN NEW;
  END IF;
  IF NEW.estado_pedido IS NULL THEN
    NEW.pedido_en := NULL;
    NEW.recibido_en := NULL;
  ELSIF NEW.estado_pedido = 'pedido' THEN
    NEW.pedido_en := NOW();
    NEW.recibido_en := NULL;
  ELSE
    NEW.pedido_en := COALESCE(NEW.pedido_en, NOW());
    NEW.recibido_en := NOW();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_repuesto_pedido() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_parts_pedido ON orden_repuestos;
CREATE TRIGGER trg_parts_pedido
  BEFORE INSERT OR UPDATE OF estado_pedido ON orden_repuestos
  FOR EACH ROW EXECUTE FUNCTION public.trg_repuesto_pedido();

-- Al llegar la pieza se avisa a los técnicos de la orden: la estaban esperando.
CREATE OR REPLACE FUNCTION public.trg_notify_repuesto_recibido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d JSONB;
  v_tecnicos UUID[];
BEGIN
  BEGIN
    IF NEW.estado_pedido = 'recibido' AND OLD.estado_pedido IS DISTINCT FROM 'recibido' THEN
      SELECT array_agg(DISTINCT usuario_id) INTO v_tecnicos
      FROM orden_asignaciones WHERE orden_id = NEW.orden_id;
      IF v_tecnicos IS NOT NULL THEN
        d := public.datos_orden_aviso(NEW.orden_id);
        PERFORM public.notificar(
          v_tecnicos,
          'repuesto_recibido',
          'Llegó un repuesto · ' || (d->>'numero_orden'),
          NEW.descripcion || COALESCE(' — ' || NULLIF(d->>'vehiculo', ''), ''),
          d || jsonb_build_object('descripcion', NEW.descripcion),
          NEW.orden_id
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_repuesto_recibido: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_notify_repuesto_recibido() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_parts_recibido_notify ON orden_repuestos;
CREATE TRIGGER trg_parts_recibido_notify
  AFTER UPDATE OF estado_pedido ON orden_repuestos
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_repuesto_recibido();

-- Qué órdenes esperan una pieza (la marca de la lista y del tablero). Igual que
-- `ordenes_esperando_autorizacion`: un técnico, solo las suyas.
CREATE OR REPLACE FUNCTION public.ordenes_esperando_repuestos()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT r.orden_id
  FROM orden_repuestos r
  JOIN ordenes_trabajo o ON o.id = r.orden_id
  WHERE r.estado_pedido = 'pedido'
    AND r.estado <> 'rechazado'
    AND o.estatus <> 'entregado'
    AND (public.is_admin() OR r.orden_id = ANY (public.mis_ordenes_asignadas()));
$$;
REVOKE ALL ON FUNCTION public.ordenes_esperando_repuestos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ordenes_esperando_repuestos() TO authenticated;

-- El técnico ve qué piezas lleva la orden, en qué estado están y si ya llegaron; sin precios.
-- Cambia la forma del resultado: se borra y se crea (parte de 20261007000000).
DROP FUNCTION IF EXISTS public.repuestos_de_orden(UUID);
CREATE FUNCTION public.repuestos_de_orden(p_orden_id UUID)
RETURNS TABLE(id UUID, descripcion TEXT, cantidad INTEGER, estado TEXT, estado_pedido TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.descripcion, r.cantidad, r.estado, r.estado_pedido
  FROM orden_repuestos r
  WHERE r.orden_id = p_orden_id
    AND (public.is_admin() OR r.orden_id = ANY (public.mis_ordenes_asignadas()))
  ORDER BY r.creado_en, r.descripcion;
$$;
REVOKE ALL ON FUNCTION public.repuestos_de_orden(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_de_orden(UUID) TO authenticated;

-- El guardia de presupuestos (parte de 20261010000006). Cambia: el costo y el seguimiento del
-- pedido tampoco son lo cotizado (el cliente ve el precio, no el costo), así que se cambian
-- en cualquier estado de la línea sin moverlo.
CREATE OR REPLACE FUNCTION public.trg_guard_linea_presupuesto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sistema BOOLEAN := COALESCE(current_setting('restorify.presupuesto', true), 'off') = 'on';
  -- Lo que se puede cambiar sin tocar lo cotizado: a quién y a qué bolsa va la comisión, lo
  -- que costó la pieza y si ya llegó.
  v_internos CONSTANT TEXT[] := ARRAY[
    'especialidad', 'asignado_a', 'reparto_heredado',
    'costo_unitario', 'estado_pedido', 'pedido_en', 'recibido_en'
  ];
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

  -- Solo lo interno: no toca lo cotizado.
  IF (to_jsonb(NEW) - v_internos) = (to_jsonb(OLD) - v_internos) THEN
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


-- ------------------------------------------------------------------------------------
-- 7. Lo cobrado de una orden no incluye lo importado del banco (A)
-- ------------------------------------------------------------------------------------
-- Parte de 20261008000000. Cambia: sin movimientos importados.
CREATE OR REPLACE FUNCTION public._saldo_orden(p_orden_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT total_general FROM orden_montos WHERE orden_id = p_orden_id), 0)
       - COALESCE((
           SELECT SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END)
           FROM finanzas_movimientos
           WHERE referencia_orden_id = p_orden_id AND categoria = 'pago_cliente'
             AND importacion_id IS NULL
         ), 0);
$$;
REVOKE ALL ON FUNCTION public._saldo_orden(UUID) FROM PUBLIC, anon, authenticated;

-- Para el diálogo de "Retirada sin reparar": cuánto se recibió y cuánto se cobraría o
-- devolvería si se cobran los trabajos que sí se hicieron (`p_conservar`: ids de líneas
-- autorizadas de la orden, de mano de obra o de repuestos) más `p_cobro` (la revisión). La
-- cuenta la hace la base, no la pantalla.
CREATE OR REPLACE FUNCTION public.saldo_retiro(
  p_orden_id  UUID,
  p_cobro     NUMERIC DEFAULT 0,
  p_conservar UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobrado  NUMERIC;
  v_extra    NUMERIC := round(GREATEST(COALESCE(p_cobro, 0), 0), 2);
  v_trabajos NUMERIC;
  v_cobro    NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el saldo de una orden.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = p_orden_id) THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  SELECT round(COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0), 2)
    INTO v_cobrado
  FROM finanzas_movimientos
  WHERE referencia_orden_id = p_orden_id AND categoria = 'pago_cliente' AND importacion_id IS NULL;

  SELECT round(
           COALESCE((SELECT SUM(costo) FROM orden_labor
                     WHERE orden_id = p_orden_id AND estado = 'aprobado' AND id = ANY(COALESCE(p_conservar, '{}'))), 0)
         + COALESCE((SELECT SUM(subtotal) FROM orden_repuestos
                     WHERE orden_id = p_orden_id AND estado = 'aprobado' AND id = ANY(COALESCE(p_conservar, '{}'))), 0),
         2)
    INTO v_trabajos;

  v_cobro := v_trabajos + v_extra;
  RETURN jsonb_build_object(
    'cobrado', v_cobrado,
    'trabajos', v_trabajos,
    'revision', v_extra,
    'cobro', v_cobro,
    'saldo', v_cobro - v_cobrado
  );
END;
$$;
REVOKE ALL ON FUNCTION public.saldo_retiro(UUID, NUMERIC, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saldo_retiro(UUID, NUMERIC, UUID[]) TO authenticated;

-- Parte de 20261010000000. Cambia: lo cobrado sin lo importado.
CREATE OR REPLACE FUNCTION public._balance_orden(p_orden_id UUID)
RETURNS TABLE (
  total_orden        NUMERIC,
  cobrado            NUMERIC,
  costo_repuestos    NUMERIC,
  comisiones         NUMERIC,
  comisiones_pagadas NUMERIC,
  margen             NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (
    SELECT
      COALESCE((SELECT total_general FROM orden_montos WHERE orden_id = p_orden_id), 0) AS total_orden,
      -- Todo lo cobrado al cliente, como lo cuenta el saldo: depósito, pagos, devoluciones.
      COALESCE((
        SELECT SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END)
        FROM finanzas_movimientos
        WHERE referencia_orden_id = p_orden_id AND categoria = 'pago_cliente'
          AND importacion_id IS NULL
      ), 0) AS cobrado,
      -- El costo automático de las líneas: lo asientan los triggers, sin quién ni lote.
      COALESCE((
        SELECT SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END)
        FROM finanzas_movimientos
        WHERE referencia_orden_id = p_orden_id AND categoria = 'compra_repuesto'
          AND importacion_id IS NULL AND registrado_por IS NULL
      ), 0) AS costo_repuestos,
      COALESCE((SELECT SUM(monto) FROM comisiones WHERE orden_id = p_orden_id), 0) AS comisiones,
      COALESCE((SELECT SUM(monto) FROM comisiones WHERE orden_id = p_orden_id AND pago_id IS NOT NULL), 0) AS comisiones_pagadas
  )
  SELECT round(total_orden, 2), round(cobrado, 2), round(costo_repuestos, 2), round(comisiones, 2),
         round(comisiones_pagadas, 2), round(cobrado - costo_repuestos - comisiones, 2)
  FROM v;
$$;
REVOKE ALL ON FUNCTION public._balance_orden(UUID) FROM PUBLIC, anon, authenticated;

-- Parte de 20260918000000. Cambia: sin lo importado; fecha del taller.
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
  WHERE referencia_orden_id = ord.id AND categoria = 'pago_cliente' AND importacion_id IS NULL;

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
      public.hoy_taller(ord.sede_id),
      ord.id
    );
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_delivered_order_adjustment() FROM PUBLIC, anon, authenticated;

-- Parte de 20260924000000. Cambia: "lo ya asentado" es solo el costo automático (sin quién ni
-- lote), el mismo que cuenta `_balance_orden`. Antes una compra a mano vinculada a la orden lo
-- achicaba; fecha del taller.
CREATE OR REPLACE FUNCTION public.sync_order_parts_expense(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord        RECORD;
  cost_total NUMERIC;
  already    NUMERIC;
  delta      NUMERIC;
BEGIN
  SELECT id, sede_id, numero_orden, estatus INTO ord
  FROM ordenes_trabajo WHERE id = target_order_id;

  IF ord.id IS NULL OR ord.estatus <> 'entregado' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(cantidad * costo_unitario), 0) INTO cost_total
  FROM orden_repuestos WHERE orden_id = target_order_id AND estado = 'aprobado';

  SELECT COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END), 0) INTO already
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id AND categoria = 'compra_repuesto'
    AND importacion_id IS NULL AND registrado_por IS NULL;

  delta := cost_total - already;

  IF ABS(delta) > 0.01 THEN
    INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
    VALUES (
      ord.sede_id,
      (CASE WHEN delta > 0 THEN 'egreso' ELSE 'ingreso' END)::transaction_type,
      'compra_repuesto',
      ABS(delta),
      CASE WHEN delta > 0 THEN 'Costo de repuestos - ' ELSE 'Ajuste de costo de repuestos - ' END || ord.numero_orden,
      public.hoy_taller(ord.sede_id),
      target_order_id
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_order_parts_expense(UUID) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- 8. Entregar, el depósito, la red de la entrega y la reversión
-- ------------------------------------------------------------------------------------
-- Parte de 20261008000000. Cambia: tarjeta y Zelle; fecha del taller; marca la retirada sin
-- reparar cuando la llama `retirar_sin_reparar`.
CREATE OR REPLACE FUNCTION public.entregar_orden(
  p_orden_id         UUID,
  p_metodo           TEXT DEFAULT NULL,
  p_numero_cheque    TEXT DEFAULT NULL,
  p_comprobante_ruta TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden   RECORD;
  v_saldo   NUMERIC;
  v_metodo  TEXT := NULLIF(btrim(COALESCE(p_metodo, '')), '');
  v_cheque  TEXT := NULLIF(btrim(COALESCE(p_numero_cheque, '')), '');
  v_ruta    TEXT := NULLIF(btrim(COALESCE(p_comprobante_ruta, '')), '');
  v_mov_id  UUID;
  v_tipo    TEXT;
  v_hoy     DATE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede entregar una orden.' USING ERRCODE = '42501';
  END IF;

  -- Bloquea la orden: dos clics, o dos pestañas, no asientan dos pagos.
  SELECT id, sede_id, numero_orden, estatus INTO v_orden
  FROM ordenes_trabajo WHERE id = p_orden_id
  FOR UPDATE;

  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada.' USING ERRCODE = '42501';
  END IF;

  v_saldo := round(public._saldo_orden(p_orden_id), 2);
  v_hoy := public.hoy_taller(v_orden.sede_id);

  IF abs(v_saldo) > 0.01 THEN
    IF v_metodo IS NULL OR v_metodo NOT IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque') THEN
      RAISE EXCEPTION 'Elige cómo pagó el cliente: efectivo, tarjeta, Zelle, transferencia o cheque.' USING ERRCODE = '22023';
    END IF;
    IF v_metodo = 'cheque' AND v_cheque IS NULL AND v_ruta IS NULL THEN
      RAISE EXCEPTION 'Anota el número del cheque o sube su foto.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- El comprobante es un archivo del bucket privado, en la carpeta de la sede de la orden.
  IF v_ruta IS NOT NULL AND v_ruta NOT LIKE v_orden.sede_id::text || '/%' THEN
    RAISE EXCEPTION 'El comprobante debe guardarse en la carpeta de la sede de la orden.' USING ERRCODE = '42501';
  END IF;

  IF v_saldo > 0.01 THEN
    v_tipo := 'ingreso';
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id,
      registrado_por, metodo_pago, numero_cheque, comprobante_ruta
    ) VALUES (
      v_orden.sede_id, 'ingreso', 'pago_cliente', v_saldo,
      'Pago final - ' || v_orden.numero_orden, v_hoy, p_orden_id,
      auth.uid(), v_metodo, v_cheque, v_ruta
    ) RETURNING id INTO v_mov_id;
  ELSIF v_saldo < -0.01 THEN
    v_tipo := 'egreso';
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id,
      registrado_por, metodo_pago, numero_cheque, comprobante_ruta
    ) VALUES (
      v_orden.sede_id, 'egreso', 'pago_cliente', -v_saldo,
      'Devolución al cliente - ' || v_orden.numero_orden, v_hoy, p_orden_id,
      auth.uid(), v_metodo, v_cheque, v_ruta
    ) RETURNING id INTO v_mov_id;
  END IF;

  -- Con el pago ya asentado, `handle_order_delivery_payment` calcula un restante de cero. Si
  -- algo lo impide (un presupuesto esperando al cliente, `trg_guard_entrega_con_presupuesto`),
  -- la excepción deshace también el pago de arriba. La marca de retirada solo la enciende
  -- `retirar_sin_reparar` (y `trg_guard_retirada` no deja hacerlo de otra forma).
  UPDATE ordenes_trabajo
  SET estatus = 'entregado', fecha_finalizacion = NOW(), porcentaje_avance = 100,
      retirada_sin_reparar = COALESCE(current_setting('restorify.retirada', true), 'off') = 'on'
  WHERE id = p_orden_id;

  RETURN jsonb_build_object('saldo', v_saldo, 'tipo', v_tipo, 'movimiento_id', v_mov_id);
END;
$$;
REVOKE ALL ON FUNCTION public.entregar_orden(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entregar_orden(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Parte de 20261008000000. Cambia: fecha del taller.
CREATE OR REPLACE FUNCTION public.handle_order_delivery_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining NUMERIC;
BEGIN
  IF NEW.estatus = 'entregado' AND (OLD.estatus IS DISTINCT FROM 'entregado') THEN
    remaining := round(public._saldo_orden(NEW.id), 2);

    IF remaining > 0.01 THEN
      INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
      VALUES (
        NEW.sede_id, 'ingreso', 'pago_cliente', remaining,
        'Pago final - ' || NEW.numero_orden, public.hoy_taller(NEW.sede_id), NEW.id
      );
    ELSIF remaining < -0.01 THEN
      INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
      VALUES (
        NEW.sede_id, 'egreso', 'pago_cliente', -remaining,
        'Devolución al cliente - ' || NEW.numero_orden, public.hoy_taller(NEW.sede_id), NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_order_delivery_payment() FROM PUBLIC, anon, authenticated;

-- Parte de 20261008000000. Cambia: fecha del taller, y el costo que se revierte es solo el
-- automático (antes revertía también una compra a mano vinculada a la orden, que es dinero
-- que sí se gastó).
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
  v_hoy          DATE;
BEGIN
  SELECT id, sede_id, numero_orden INTO ord
  FROM ordenes_trabajo WHERE id = target_order_id;

  IF ord.id IS NULL THEN
    RETURN;
  END IF;

  v_hoy := public.hoy_taller(ord.sede_id);

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
      'Reversión de entrega - ' || ord.numero_orden, v_hoy, target_order_id
    );
  ELSIF delta < -0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'ingreso', 'pago_cliente', -delta,
      'Reversión de devolución - ' || ord.numero_orden, v_hoy, target_order_id
    );
  END IF;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END), 0)
    INTO cost_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id
    AND categoria = 'compra_repuesto'
    AND importacion_id IS NULL
    AND registrado_por IS NULL;

  IF cost_recorded > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'ingreso', 'compra_repuesto', cost_recorded,
      'Reversión de costo de repuestos - ' || ord.numero_orden, v_hoy, target_order_id
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_order_delivery_finance(UUID) FROM PUBLIC, anon, authenticated;

-- Parte de 20261010000007. Cambia: fecha del taller, y el método, el cheque y el comprobante
-- de un anticipo (`registrar_anticipo`), que llega por la misma configuración que el depósito
-- del alta y se asienta como "Anticipo".
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
  v_desc   TEXT;
BEGIN
  previo := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.deposito_inicial, 0) ELSE 0 END;
  delta := COALESCE(NEW.deposito_inicial, 0) - previo;

  IF ABS(delta) <= 0.01 THEN
    RETURN NEW;
  END IF;

  SELECT id, sede_id, numero_orden, creado_por INTO ord
  FROM ordenes_trabajo WHERE id = NEW.orden_id;

  v_desc := CASE WHEN previo = 0 THEN 'Depósito inicial - ' ELSE 'Ajuste de depósito - ' END;

  -- El depósito del alta o un anticipo, y solo con los datos de esta misma orden. Otro ajuste
  -- queda sin método, como antes.
  IF delta > 0 THEN
    v_cfg := NULLIF(current_setting('restorify.deposito', true), '')::jsonb;
    IF v_cfg IS NOT NULL AND v_cfg->>'orden_id' = NEW.orden_id::text
       AND (previo = 0 OR COALESCE((v_cfg->>'anticipo')::boolean, false)) THEN
      IF COALESCE((v_cfg->>'anticipo')::boolean, false) THEN
        v_desc := 'Anticipo - ';
      END IF;
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
    v_desc || ord.numero_orden,
    public.hoy_taller(ord.sede_id),
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


-- Un anticipo: el cliente paga una parte antes de llevarse el vehículo. Solo administración,
-- con la orden sin entregar (el guardia de montos no deja mover el depósito de una entregada).
-- Lo mismo que se exige al cobrar al entregar: método, y número o foto si es cheque.
CREATE OR REPLACE FUNCTION public.registrar_anticipo(
  p_orden_id         UUID,
  p_monto            NUMERIC,
  p_metodo           TEXT,
  p_numero_cheque    TEXT DEFAULT NULL,
  p_comprobante_ruta TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden  RECORD;
  v_monto  NUMERIC := round(COALESCE(p_monto, 0), 2);
  v_metodo TEXT := NULLIF(btrim(COALESCE(p_metodo, '')), '');
  v_cheque TEXT := NULLIF(btrim(COALESCE(p_numero_cheque, '')), '');
  v_ruta   TEXT := NULLIF(btrim(COALESCE(p_comprobante_ruta, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar un anticipo.' USING ERRCODE = '42501';
  END IF;
  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El anticipo tiene que ser mayor que cero.' USING ERRCODE = '22023';
  END IF;
  IF v_metodo IS NULL OR v_metodo NOT IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque') THEN
    RAISE EXCEPTION 'Elige cómo pagó el cliente: efectivo, tarjeta, Zelle, transferencia o cheque.' USING ERRCODE = '22023';
  END IF;
  IF v_metodo = 'cheque' AND v_cheque IS NULL AND v_ruta IS NULL THEN
    RAISE EXCEPTION 'Anota el número del cheque o sube su foto.' USING ERRCODE = '22023';
  END IF;
  IF v_metodo IS DISTINCT FROM 'cheque' THEN
    v_cheque := NULL;
  END IF;

  SELECT o.id, o.sede_id, o.estatus INTO v_orden
  FROM ordenes_trabajo o WHERE o.id = p_orden_id
  FOR UPDATE;
  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada: su saldo se cobró al entregar.' USING ERRCODE = 'P0001';
  END IF;
  IF v_ruta IS NOT NULL AND v_ruta NOT LIKE v_orden.sede_id::text || '/%' THEN
    RAISE EXCEPTION 'El comprobante debe guardarse en la carpeta de la sede de la orden.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config(
    'restorify.deposito',
    jsonb_build_object('orden_id', p_orden_id, 'anticipo', true, 'metodo', v_metodo,
                       'numero_cheque', v_cheque, 'comprobante_ruta', v_ruta)::text,
    true
  );
  UPDATE orden_montos SET deposito_inicial = COALESCE(deposito_inicial, 0) + v_monto WHERE orden_id = p_orden_id;
  PERFORM set_config('restorify.deposito', '', true);

  RETURN jsonb_build_object(
    'anticipos', (SELECT deposito_inicial FROM orden_montos WHERE orden_id = p_orden_id),
    'saldo', round(public._saldo_orden(p_orden_id), 2)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_anticipo(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_anticipo(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 9. El alta: tarjeta y Zelle en el depósito, y el costo de los repuestos
-- ------------------------------------------------------------------------------------
-- Parte de 20261010000007. Cambia: los métodos nuevos y, por repuesto, un `costo_unitario`
-- opcional (sin él, el precio, como hasta hoy).
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

    -- El costo, si lo mandan y no es negativo; si no, el precio.
    INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1),
      COALESCE(
        NULLIF(GREATEST(COALESCE((item->>'costo_unitario')::numeric, -1), -1), -1),
        COALESCE((item->>'precio_venta_unitario')::numeric, 0)
      ),
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


-- ------------------------------------------------------------------------------------
-- 10. Retirada sin reparar (H)
-- ------------------------------------------------------------------------------------
-- El cliente se lleva el vehículo sin que se haga todo el trabajo. Administración dice qué
-- pasó (las tres salidas del diálogo):
--   * se canceló todo: `p_conservar` vacío y `p_cobro` 0 → se le devuelve lo que dejó;
--   * solo se cobra la revisión: `p_conservar` vacío y `p_cobro` > 0;
--   * se hicieron algunos trabajos: `p_conservar` con esas líneas (y, si se quiere, la revisión).
-- En una transacción:
--   * cancela el presupuesto que espere respuesta y descarta los hallazgos pendientes (no
--     hay a quién cotizarlos);
--   * lo autorizado que no se conserva pasa a no autorizado: no se hizo y no se cobra;
--   * lo que se conserva se cobra y su mano de obra queda hecha (su técnico cobra su comisión,
--     que administración acepta como cualquier otra);
--   * si se cobra la revisión, entra como una línea de mano de obra ya autorizada, sin técnico;
--   * el descuento se quita: lo que se cobra es exactamente lo conservado más la revisión;
--   * entrega con `entregar_orden`: devuelve o cobra la diferencia con lo que dejó el cliente,
--     con su método, y marca la orden.
CREATE OR REPLACE FUNCTION public.retirar_sin_reparar(
  p_orden_id         UUID,
  p_cobro            NUMERIC DEFAULT 0,
  p_concepto         TEXT DEFAULT NULL,
  p_metodo           TEXT DEFAULT NULL,
  p_numero_cheque    TEXT DEFAULT NULL,
  p_comprobante_ruta TEXT DEFAULT NULL,
  p_conservar        UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden     RECORD;
  v_cobro     NUMERIC := round(COALESCE(p_cobro, 0), 2);
  v_concepto  TEXT := COALESCE(NULLIF(btrim(COALESCE(p_concepto, '')), ''), 'Diagnóstico');
  v_conservar UUID[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_conservar, '{}')) x WHERE x IS NOT NULL);
  v_validas   INTEGER;
  v_p         UUID;
  v_prev      TEXT := current_setting('restorify.presupuesto', true);
  v_res       JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cerrar una orden.' USING ERRCODE = '42501';
  END IF;
  IF v_cobro < 0 THEN
    RAISE EXCEPTION 'Lo que se cobra no puede ser negativo.' USING ERRCODE = '22023';
  END IF;

  SELECT id, sede_id, estatus INTO v_orden
  FROM ordenes_trabajo WHERE id = p_orden_id
  FOR UPDATE;
  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada.' USING ERRCODE = '42501';
  END IF;

  -- Solo se conserva lo autorizado de esta orden: una línea ajena o sin autorizar no se cobra.
  SELECT (SELECT COUNT(*) FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'aprobado' AND id = ANY(v_conservar))
       + (SELECT COUNT(*) FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'aprobado' AND id = ANY(v_conservar))
    INTO v_validas;
  IF v_validas <> COALESCE(array_length(v_conservar, 1), 0) THEN
    RAISE EXCEPTION 'Solo se pueden cobrar trabajos autorizados de esta orden.' USING ERRCODE = '22023';
  END IF;

  FOR v_p IN SELECT id FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'enviado' LOOP
    PERFORM public.cancelar_presupuesto(v_p);
  END LOOP;

  UPDATE orden_hallazgos
  SET estado = 'descartado', en_reporte = false, resuelto_por = auth.uid(), resuelto_en = NOW()
  WHERE orden_id = p_orden_id AND estado = 'pendiente';

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET estado = 'rechazado', decidido_en = NOW()
  WHERE orden_id = p_orden_id AND estado = 'aprobado' AND NOT (id = ANY(v_conservar));
  UPDATE orden_repuestos SET estado = 'rechazado', decidido_en = NOW()
  WHERE orden_id = p_orden_id AND estado = 'aprobado' AND NOT (id = ANY(v_conservar));
  -- Lo que se cobra se hizo.
  UPDATE orden_labor
  SET completado_en = COALESCE(completado_en, NOW()), completado_por = COALESCE(completado_por, auth.uid())
  WHERE orden_id = p_orden_id AND id = ANY(v_conservar);
  IF v_cobro > 0 THEN
    INSERT INTO orden_labor (orden_id, descripcion, costo, estado, decidido_en, reparto_heredado, completado_en, completado_por)
    VALUES (p_orden_id, v_concepto, v_cobro, 'aprobado', NOW(), false, NOW(), auth.uid());
  END IF;
  PERFORM set_config('restorify.presupuesto', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  -- Sin descuento: lo que se cobra es exactamente lo conservado más la revisión.
  IF EXISTS (SELECT 1 FROM orden_montos WHERE orden_id = p_orden_id AND descuento > 0) THEN
    PERFORM set_config('restorify.descuento', 'on', true);
    UPDATE orden_montos SET descuento = 0, descuento_motivo = NULL WHERE orden_id = p_orden_id;
    PERFORM set_config('restorify.descuento', 'off', true);
    PERFORM public.recalculate_order_totals(p_orden_id);
  END IF;

  PERFORM set_config('restorify.retirada', 'on', true);
  v_res := public.entregar_orden(p_orden_id, p_metodo, p_numero_cheque, p_comprobante_ruta);
  PERFORM set_config('restorify.retirada', 'off', true);

  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.retirar_sin_reparar(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retirar_sin_reparar(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID[]) TO authenticated;

-- Parte de 20261010000014. Sin cambios de regla (se reemite para fijarla junto a la retirada):
-- una orden retirada sin reparar devenga comisiones solo por las tareas que se conservaron como
-- hechas. Lo no hecho queda rechazado y la revisión no tiene técnico, así que cancelar todo o
-- cobrar solo la revisión no le paga a nadie.
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


-- ------------------------------------------------------------------------------------
-- 11. El panel: sin lo importado; una retirada no es una orden terminada
-- ------------------------------------------------------------------------------------
-- Parte de 20260929000000. Cambia: ingresos y egresos son los de la app (lo importado del
-- banco es contabilidad aparte, ver `resumen_importaciones`), y las finalizadas del mes no
-- cuentan las retiradas sin reparar.
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

-- Lo importado del banco, por estado de cuenta: el periodo, cuántos movimientos y cuánto entró
-- y salió. Para la pestaña de contabilidad de Finanzas y para mandarle al contador. Solo admin
-- (SECURITY INVOKER: la RLS de Finanzas ya es de administración).
CREATE OR REPLACE FUNCTION public.resumen_importaciones(p_sede_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración ve los estados de cuenta.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'importacion_id', x.importacion_id,
             'desde', x.desde,
             'hasta', x.hasta,
             'movimientos', x.n,
             'ingresos', x.ingresos,
             'egresos', x.egresos
           ) ORDER BY x.desde DESC NULLS LAST)
    FROM (
      SELECT importacion_id,
             MIN(fecha) AS desde,
             MAX(fecha) AS hasta,
             COUNT(*)::int AS n,
             round(COALESCE(SUM(monto) FILTER (WHERE tipo = 'ingreso'), 0), 2) AS ingresos,
             round(COALESCE(SUM(monto) FILTER (WHERE tipo = 'egreso'), 0), 2) AS egresos
      FROM finanzas_movimientos
      WHERE importacion_id IS NOT NULL
        AND (p_sede_id IS NULL OR sede_id = p_sede_id)
      GROUP BY importacion_id
    ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.resumen_importaciones(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumen_importaciones(UUID) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 12. El recordatorio de entrega vencida, con la fecha del taller (J)
-- ------------------------------------------------------------------------------------
-- Parte de 20261005000001. Cambia: la fecha de cada sede en vez de la de Chicago.
CREATE OR REPLACE FUNCTION public.recordar_ordenes_vencidas()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       RECORD;
  d       JSONB;
  v_dias  INTEGER;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT * FROM ordenes_trabajo
    WHERE estatus NOT IN ('finalizado', 'entregado')
      AND fecha_estimada_entrega IS NOT NULL
      -- La fecha del taller, no la del servidor: una orden que vence hoy no está vencida
      -- todavía aunque en UTC ya sea mañana.
      AND fecha_estimada_entrega < public.hoy_taller(sede_id)
      AND (recordado_entrega_en IS NULL OR recordado_entrega_en < NOW() - INTERVAL '20 hours')
    FOR UPDATE SKIP LOCKED
  LOOP
    d := public.datos_orden_aviso(r.id);
    v_dias := GREATEST(1, (public.hoy_taller(r.sede_id) - r.fecha_estimada_entrega));

    -- El aviso de ayer ya no dice nada que el de hoy no diga mejor.
    DELETE FROM notificaciones WHERE tipo = 'orden_vencida' AND orden_id = r.id;

    PERFORM public.notificar(
      public.admins_de_sede(r.sede_id)
        || ARRAY(SELECT DISTINCT usuario_id FROM orden_asignaciones WHERE orden_id = r.id),
      'orden_vencida',
      'Pasó la fecha de entrega · ' || r.numero_orden,
      format('%s día(s) de retraso. %s', v_dias, concat_ws(' — ', NULLIF(d->>'vehiculo', ''), NULLIF(d->>'cliente', ''))),
      d || jsonb_build_object('dias', v_dias, 'fecha_estimada_entrega', r.fecha_estimada_entrega),
      r.id
    );
    UPDATE ordenes_trabajo SET recordado_entrega_en = NOW() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
-- Sin GRANT: solo la llama el cron.
REVOKE ALL ON FUNCTION public.recordar_ordenes_vencidas() FROM PUBLIC, anon, authenticated;
