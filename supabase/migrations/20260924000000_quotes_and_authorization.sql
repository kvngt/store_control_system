-- ====================================================================================
-- RESTORIFY — Fase 5: presupuestos y autorización por línea
-- ====================================================================================
-- Hasta aquí toda línea de mano de obra o repuesto que un admin agregaba se cobraba.
-- El cliente pidió autorizar antes: "lo que no autorizo no se hace ni se cobra".
--
-- Cada línea tiene ahora un estado:
--   borrador .... la agregó un admin; todavía no se le presentó al cliente
--   pendiente ... está en un presupuesto que espera respuesta; no se puede editar
--   aprobado .... el cliente la autorizó (o la firmó en la recepción)
--   rechazado ... el cliente no la autorizó: no se realiza
--
-- SOLO LO APROBADO CUENTA: totales, costo de repuestos, cobro al entregar, ajustes
-- de órdenes entregadas y comisiones. Todo eso ya se calculaba a partir de los
-- totales; basta con que los totales sumen solo lo aprobado.
--
-- Cómo se aprueba una línea:
--   1. La firma de recepción aprueba los borradores que había ("lo que el cliente
--      firmó, lo aprobó").
--   2. "Enviar presupuesto" junta los borradores en un presupuesto; el cliente
--      responde línea por línea desde su enlace.
--   3. "Registrar autorización": el cliente respondió por teléfono, en persona o por
--      WhatsApp, y un admin lo registra.
-- Las tres dejan un registro en `presupuestos` con quién, cómo y cuándo.
--
-- Las líneas que ya existían quedan aprobadas: se cobraban, siguen cobrándose.
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. Estado de las líneas
-- ------------------------------------------------------------------------------------
-- DEFAULT 'aprobado' al agregar la columna (las filas existentes), 'borrador' después
-- (las nuevas).
ALTER TABLE orden_labor ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'aprobado';
ALTER TABLE orden_labor ALTER COLUMN estado SET DEFAULT 'borrador';
ALTER TABLE orden_labor DROP CONSTRAINT IF EXISTS orden_labor_estado_valido;
ALTER TABLE orden_labor ADD CONSTRAINT orden_labor_estado_valido
  CHECK (estado IN ('borrador', 'pendiente', 'aprobado', 'rechazado'));
ALTER TABLE orden_labor ADD COLUMN IF NOT EXISTS presupuesto_id UUID;
ALTER TABLE orden_labor ADD COLUMN IF NOT EXISTS decidido_en TIMESTAMP WITH TIME ZONE;
-- Orden estable de las líneas en el presupuesto, el portal y el PDF.
ALTER TABLE orden_labor ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

ALTER TABLE orden_repuestos ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'aprobado';
ALTER TABLE orden_repuestos ALTER COLUMN estado SET DEFAULT 'borrador';
ALTER TABLE orden_repuestos DROP CONSTRAINT IF EXISTS orden_repuestos_estado_valido;
ALTER TABLE orden_repuestos ADD CONSTRAINT orden_repuestos_estado_valido
  CHECK (estado IN ('borrador', 'pendiente', 'aprobado', 'rechazado'));
ALTER TABLE orden_repuestos ADD COLUMN IF NOT EXISTS presupuesto_id UUID;
ALTER TABLE orden_repuestos ADD COLUMN IF NOT EXISTS decidido_en TIMESTAMP WITH TIME ZONE;
ALTER TABLE orden_repuestos ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();


-- ------------------------------------------------------------------------------------
-- 2. Presupuestos
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuestos (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id               UUID NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  sede_id                UUID NOT NULL REFERENCES sedes(id) ON DELETE CASCADE,
  -- 1, 2, 3… dentro de la orden: "presupuesto 2" es lo que se agregó después.
  numero                 INTEGER NOT NULL,
  estado                 TEXT NOT NULL DEFAULT 'enviado'
                         CHECK (estado IN ('enviado', 'respondido', 'cancelado')),
  creado_en              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  enviado_por            UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  total_propuesto        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  -- La evidencia de la respuesta.
  respondido_en          TIMESTAMP WITH TIME ZONE,
  respondido_via         TEXT CHECK (respondido_via IN (
                           'cliente_portal', 'admin_telefono', 'admin_presencial', 'admin_whatsapp', 'firma_recepcion'
                         )),
  respondido_por_nombre  TEXT,
  respondido_por_perfil  UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  total_aprobado         NUMERIC(12, 2),
  comentario_cliente     TEXT,
  nota_admin             TEXT,
  ip                     TEXT,
  user_agent             TEXT,
  cancelado_en           TIMESTAMP WITH TIME ZONE,
  -- Último aviso a admins de "sin respuesta" (una vez al día como mucho).
  recordado_en           TIMESTAMP WITH TIME ZONE,
  UNIQUE (orden_id, numero)
);

-- Uno abierto por orden: lo nuevo se suma al abierto en vez de abrir otro.
CREATE UNIQUE INDEX IF NOT EXISTS uq_presupuestos_abierto
  ON presupuestos (orden_id) WHERE estado = 'enviado';
CREATE INDEX IF NOT EXISTS idx_presupuestos_enviados
  ON presupuestos (creado_en) WHERE estado = 'enviado';

ALTER TABLE orden_labor DROP CONSTRAINT IF EXISTS orden_labor_presupuesto_fk;
ALTER TABLE orden_labor ADD CONSTRAINT orden_labor_presupuesto_fk
  FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE SET NULL;
ALTER TABLE orden_repuestos DROP CONSTRAINT IF EXISTS orden_repuestos_presupuesto_fk;
ALTER TABLE orden_repuestos ADD CONSTRAINT orden_repuestos_presupuesto_fk
  FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orden_labor_presupuesto ON orden_labor (presupuesto_id) WHERE presupuesto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orden_repuestos_presupuesto ON orden_repuestos (presupuesto_id) WHERE presupuesto_id IS NOT NULL;

ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;

-- Lleva montos y la evidencia de la respuesta: solo admin. Nadie escribe desde la
-- API; todo pasa por las funciones de abajo. El técnico sabe qué hacer por el
-- estado de cada línea, que sí ve.
DROP POLICY IF EXISTS "presupuestos_admin_select" ON presupuestos;
CREATE POLICY "presupuestos_admin_select" ON presupuestos FOR SELECT
  USING (public.is_admin());


-- ------------------------------------------------------------------------------------
-- 3. Solo lo aprobado cuenta
-- ------------------------------------------------------------------------------------
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
  SELECT COALESCE(SUM(costo), 0) INTO labor_total
  FROM orden_labor WHERE orden_id = target_order_id AND estado = 'aprobado';
  SELECT COALESCE(SUM(subtotal), 0) INTO parts_total
  FROM orden_repuestos WHERE orden_id = target_order_id AND estado = 'aprobado';

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

-- El costo de un repuesto no autorizado no es un gasto del taller: la pieza no se
-- compra ni se instala.
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
  WHERE referencia_orden_id = target_order_id AND categoria = 'compra_repuesto';

  delta := cost_total - already;

  IF ABS(delta) > 0.01 THEN
    INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
    VALUES (
      ord.sede_id,
      (CASE WHEN delta > 0 THEN 'egreso' ELSE 'ingreso' END)::transaction_type,
      'compra_repuesto',
      ABS(delta),
      CASE WHEN delta > 0 THEN 'Costo de repuestos - ' ELSE 'Ajuste de costo de repuestos - ' END || ord.numero_orden,
      CURRENT_DATE,
      target_order_id
    );
  END IF;
END;
$$;

-- El técnico ve qué piezas lleva la orden y en qué estado están, sin precios.
DROP FUNCTION IF EXISTS public.repuestos_de_orden(UUID);
CREATE FUNCTION public.repuestos_de_orden(p_orden_id UUID)
RETURNS TABLE (id UUID, descripcion TEXT, cantidad INTEGER, estado TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.descripcion, r.cantidad, r.estado
  FROM orden_repuestos r
  JOIN ordenes_trabajo o ON o.id = r.orden_id
  WHERE r.orden_id = p_orden_id
    AND (public.is_admin() OR o.sede_id = public.current_user_sede_id())
  ORDER BY r.creado_en, r.descripcion;
$$;

REVOKE ALL ON FUNCTION public.repuestos_de_orden(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_de_orden(UUID) TO authenticated;

-- Las líneas que ya existían: sus totales no cambian (todas quedaron aprobadas).
-- Se recalcula igual por si alguna orden tenía totales desfasados.


-- ------------------------------------------------------------------------------------
-- 4. Qué se puede hacer con una línea
-- ------------------------------------------------------------------------------------
-- El estado lo cambian solo las funciones de presupuesto (bandera de transacción
-- `restorify.presupuesto`). Desde la API, ni un admin: aprobar una línea sin
-- presupuesto sería cobrar algo sin evidencia de que el cliente lo autorizó.
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

DROP TRIGGER IF EXISTS trg_labor_quote_guard ON orden_labor;
CREATE TRIGGER trg_labor_quote_guard
  BEFORE INSERT OR UPDATE OR DELETE ON orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_linea_presupuesto();

DROP TRIGGER IF EXISTS trg_parts_quote_guard ON orden_repuestos;
CREATE TRIGGER trg_parts_quote_guard
  BEFORE INSERT OR UPDATE OR DELETE ON orden_repuestos
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_linea_presupuesto();

-- No se entrega con un presupuesto esperando respuesta: se cobraría sin saber qué
-- autorizó el cliente.
CREATE OR REPLACE FUNCTION public.trg_guard_entrega_con_presupuesto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estatus = 'entregado' AND OLD.estatus IS DISTINCT FROM 'entregado'
     AND EXISTS (SELECT 1 FROM presupuestos WHERE orden_id = NEW.id AND estado = 'enviado') THEN
    RAISE EXCEPTION 'La orden tiene un presupuesto esperando respuesta del cliente. Registra la autorización o cancela el presupuesto antes de entregar.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_guard_entrega_con_presupuesto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_quote_delivery_guard ON ordenes_trabajo;
CREATE TRIGGER trg_order_quote_delivery_guard
  BEFORE UPDATE OF estatus ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_entrega_con_presupuesto();


-- ------------------------------------------------------------------------------------
-- 5. Piezas internas del presupuesto
-- ------------------------------------------------------------------------------------
-- Pasa los borradores de la orden a un presupuesto abierto. Devuelve cuántos.
CREATE OR REPLACE FUNCTION public._agregar_borradores(p_presupuesto_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden UUID;
  v_prev  TEXT := current_setting('restorify.presupuesto', true);
  v_labor INTEGER;
  v_parts INTEGER;
BEGIN
  SELECT orden_id INTO v_orden FROM presupuestos WHERE id = p_presupuesto_id AND estado = 'enviado';
  IF v_orden IS NULL THEN
    RAISE EXCEPTION 'El presupuesto no está abierto.';
  END IF;

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET estado = 'pendiente', presupuesto_id = p_presupuesto_id
  WHERE orden_id = v_orden AND estado = 'borrador';
  GET DIAGNOSTICS v_labor = ROW_COUNT;
  UPDATE orden_repuestos SET estado = 'pendiente', presupuesto_id = p_presupuesto_id
  WHERE orden_id = v_orden AND estado = 'borrador';
  GET DIAGNOSTICS v_parts = ROW_COUNT;
  PERFORM set_config('restorify.presupuesto', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  UPDATE presupuestos
  SET total_propuesto =
        (SELECT COALESCE(SUM(costo), 0) FROM orden_labor WHERE presupuesto_id = p_presupuesto_id)
      + (SELECT COALESCE(SUM(subtotal), 0) FROM orden_repuestos WHERE presupuesto_id = p_presupuesto_id)
  WHERE id = p_presupuesto_id;

  RETURN v_labor + v_parts;
END;
$$;

CREATE OR REPLACE FUNCTION public._crear_presupuesto(p_orden_id UUID)
RETURNS presupuestos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sede   UUID;
  v_numero INTEGER;
  v_p      presupuestos;
BEGIN
  -- Bloquea la orden: dos presupuestos a la vez no se llevan el mismo número.
  SELECT sede_id INTO v_sede FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF v_sede IS NULL THEN
    RAISE EXCEPTION 'La orden % no existe.', p_orden_id;
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero FROM presupuestos WHERE orden_id = p_orden_id;

  INSERT INTO presupuestos (orden_id, sede_id, numero, enviado_por)
  VALUES (p_orden_id, v_sede, v_numero, (SELECT id FROM perfiles WHERE id = auth.uid()))
  RETURNING * INTO v_p;

  PERFORM public._agregar_borradores(v_p.id);
  SELECT * INTO v_p FROM presupuestos WHERE id = v_p.id;
  RETURN v_p;
END;
$$;

-- Las líneas pendientes de un presupuesto, en orden.
CREATE OR REPLACE FUNCTION public._lineas_pendientes(p_presupuesto_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(id ORDER BY id), '{}')
  FROM (
    SELECT id FROM orden_labor WHERE presupuesto_id = p_presupuesto_id AND estado = 'pendiente'
    UNION
    SELECT id FROM orden_repuestos WHERE presupuesto_id = p_presupuesto_id AND estado = 'pendiente'
  ) s;
$$;

-- Aplica una respuesta: lo marcado se aprueba, el resto se rechaza. Deja la
-- evidencia, avisa a los técnicos (y a los admins si respondió el cliente) y manda
-- la confirmación al cliente.
CREATE OR REPLACE FUNCTION public._resolver_presupuesto(
  p_presupuesto_id UUID,
  p_aprobadas      UUID[],
  p_via            TEXT,
  p_nombre         TEXT,
  p_perfil         UUID,
  p_comentario     TEXT,
  p_nota           TEXT,
  p_ip             TEXT,
  p_user_agent     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p           presupuestos;
  v_prev        TEXT := current_setting('restorify.presupuesto', true);
  v_aprobadas   UUID[] := COALESCE(p_aprobadas, '{}');
  v_autorizadas TEXT;
  v_rechazadas  TEXT;
  v_n_aprob     INTEGER;
  v_n_rech      INTEGER;
  v_total       NUMERIC;
  v_comentario  TEXT := NULLIF(btrim(left(COALESCE(p_comentario, ''), 1000)), '');
  d             JSONB;
BEGIN
  SELECT * INTO v_p FROM presupuestos WHERE id = p_presupuesto_id FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado <> 'enviado' THEN
    RAISE EXCEPTION 'Este presupuesto ya fue respondido o cancelado.';
  END IF;

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor
  SET estado = CASE WHEN id = ANY (v_aprobadas) THEN 'aprobado' ELSE 'rechazado' END,
      decidido_en = NOW()
  WHERE presupuesto_id = v_p.id AND estado = 'pendiente';
  UPDATE orden_repuestos
  SET estado = CASE WHEN id = ANY (v_aprobadas) THEN 'aprobado' ELSE 'rechazado' END,
      decidido_en = NOW()
  WHERE presupuesto_id = v_p.id AND estado = 'pendiente';
  PERFORM set_config('restorify.presupuesto', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  SELECT
    string_agg(descripcion, ', ' ORDER BY creado_en, descripcion) FILTER (WHERE estado = 'aprobado'),
    string_agg(descripcion, ', ' ORDER BY creado_en, descripcion) FILTER (WHERE estado = 'rechazado'),
    COUNT(*) FILTER (WHERE estado = 'aprobado'),
    COUNT(*) FILTER (WHERE estado = 'rechazado'),
    COALESCE(SUM(monto) FILTER (WHERE estado = 'aprobado'), 0)
  INTO v_autorizadas, v_rechazadas, v_n_aprob, v_n_rech, v_total
  FROM (
    SELECT descripcion, estado, creado_en, costo AS monto FROM orden_labor WHERE presupuesto_id = v_p.id
    UNION ALL
    SELECT descripcion, estado, creado_en, subtotal FROM orden_repuestos WHERE presupuesto_id = v_p.id
  ) l;

  UPDATE presupuestos
  SET estado = 'respondido',
      respondido_en = NOW(),
      respondido_via = p_via,
      respondido_por_nombre = NULLIF(btrim(left(COALESCE(p_nombre, ''), 120)), ''),
      respondido_por_perfil = (SELECT id FROM perfiles WHERE id = p_perfil),
      total_aprobado = v_total,
      comentario_cliente = v_comentario,
      nota_admin = NULLIF(btrim(left(COALESCE(p_nota, ''), 1000)), ''),
      ip = left(p_ip, 64),
      user_agent = left(p_user_agent, 400)
  WHERE id = v_p.id;

  -- El correo del presupuesto que no alcanzó a salir ya no hace falta.
  UPDATE cola_envios
  SET estado = 'omitido', ultimo_error = 'El presupuesto ya fue respondido.'
  WHERE canal = 'email' AND plantilla = 'presupuesto' AND estado = 'pendiente'
    AND datos->>'presupuesto_id' = v_p.id::text;

  BEGIN
    d := public.datos_orden_aviso(v_p.orden_id);

    -- Al equipo: qué hacer y qué no.
    PERFORM public.notificar(
      ARRAY(SELECT DISTINCT usuario_id FROM orden_asignaciones WHERE orden_id = v_p.orden_id),
      'presupuesto_respondido',
      CASE WHEN v_n_aprob > 0 THEN 'Trabajos autorizados · ' ELSE 'Presupuesto rechazado · ' END || (d->>'numero_orden'),
      concat_ws(' ',
        CASE WHEN v_autorizadas IS NOT NULL THEN 'Autorizado: ' || v_autorizadas || '.' END,
        CASE WHEN v_rechazadas IS NOT NULL THEN 'No realizar: ' || v_rechazadas || '.' END
      ),
      d || jsonb_build_object('presupuesto_id', v_p.id, 'autorizados', v_n_aprob, 'rechazados', v_n_rech, 'via', p_via),
      v_p.orden_id
    );

    -- A administración, cuando respondió el cliente por su cuenta.
    IF p_via = 'cliente_portal' THEN
      PERFORM public.notificar(
        public.admins_de_sede(v_p.sede_id),
        'presupuesto_respondido_cliente',
        'El cliente respondió el presupuesto · ' || (d->>'numero_orden'),
        format('Autorizó %s de %s (%s).', v_n_aprob, v_n_aprob + v_n_rech, to_char(v_total, 'FM$999,999,990.00'))
          || COALESCE(' Comentario: ' || left(v_comentario, 200), ''),
        d || jsonb_build_object('presupuesto_id', v_p.id, 'autorizados', v_n_aprob, 'rechazados', v_n_rech),
        v_p.orden_id
      );
    END IF;

    -- Al cliente, la constancia de lo que autorizó. La firma de recepción ya tiene
    -- su propio correo.
    IF p_via <> 'firma_recepcion' THEN
      PERFORM public.encolar_correo_cliente(
        v_p.orden_id, 'presupuesto_confirmacion', jsonb_build_object('presupuesto_id', v_p.id),
        'presupuesto_confirmacion:' || v_p.id, INTERVAL '0 seconds'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_resolver_presupuesto avisos (%): %', v_p.id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'presupuesto_id', v_p.id,
    'numero', v_p.numero,
    'autorizados', v_n_aprob,
    'rechazados', v_n_rech,
    'total_autorizado', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public._agregar_borradores(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._crear_presupuesto(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._lineas_pendientes(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._resolver_presupuesto(UUID, UUID[], TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- 6. Lo que usa administración
-- ------------------------------------------------------------------------------------
-- "Enviar presupuesto": los borradores pasan a un presupuesto (el abierto, si ya
-- hay uno) y, si se pide, le llega al cliente el correo con su enlace. Sin borradores
-- nuevos y con uno abierto, solo reenvía el aviso.
CREATE OR REPLACE FUNCTION public.enviar_presupuesto(p_orden_id UUID, p_notificar BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p       presupuestos;
  v_drafts  BOOLEAN;
  v_correo  TEXT := 'no_solicitado';
  v_id      UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede enviar presupuestos.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;

  SELECT * INTO v_p FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'enviado' FOR UPDATE;
  v_drafts := EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'borrador')
           OR EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'borrador');

  IF v_p.id IS NULL THEN
    IF NOT v_drafts THEN
      RAISE EXCEPTION 'No hay trabajos sin autorizar para enviar al cliente.';
    END IF;
    v_p := public._crear_presupuesto(p_orden_id);
  ELSIF v_drafts THEN
    PERFORM public._agregar_borradores(v_p.id);
    SELECT * INTO v_p FROM presupuestos WHERE id = v_p.id;
  END IF;

  PERFORM public.asegurar_enlace_orden(p_orden_id);

  IF p_notificar THEN
    -- Un minuto con clave única: si el admin agrega otra línea y vuelve a enviar,
    -- el cliente recibe un solo correo con todo.
    v_id := public.encolar_correo_cliente(
      p_orden_id, 'presupuesto', jsonb_build_object('presupuesto_id', v_p.id),
      'presupuesto:' || v_p.id, INTERVAL '1 minute'
    );
    v_correo := CASE WHEN v_id IS NULL THEN 'sin_correo' ELSE 'encolado' END;
  END IF;

  RETURN jsonb_build_object(
    'presupuesto_id', v_p.id,
    'numero', v_p.numero,
    'lineas', array_length(public._lineas_pendientes(v_p.id), 1),
    'total', v_p.total_propuesto,
    'correo', v_correo
  );
END;
$$;

-- Deshace el envío: las líneas vuelven a borrador para corregirlas.
CREATE OR REPLACE FUNCTION public.cancelar_presupuesto(p_presupuesto_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p    presupuestos;
  v_prev TEXT := current_setting('restorify.presupuesto', true);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cancelar presupuestos.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_p FROM presupuestos WHERE id = p_presupuesto_id FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado <> 'enviado' THEN
    RAISE EXCEPTION 'Este presupuesto ya fue respondido o cancelado.';
  END IF;

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET estado = 'borrador', presupuesto_id = NULL
  WHERE presupuesto_id = v_p.id AND estado = 'pendiente';
  UPDATE orden_repuestos SET estado = 'borrador', presupuesto_id = NULL
  WHERE presupuesto_id = v_p.id AND estado = 'pendiente';
  PERFORM set_config('restorify.presupuesto', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  UPDATE presupuestos SET estado = 'cancelado', cancelado_en = NOW() WHERE id = v_p.id;

  UPDATE cola_envios
  SET estado = 'omitido', ultimo_error = 'El presupuesto se canceló.'
  WHERE canal = 'email' AND plantilla = 'presupuesto' AND estado = 'pendiente'
    AND datos->>'presupuesto_id' = v_p.id::text;
END;
$$;

-- "Trabajos autorizados por el cliente": respondió por teléfono, en persona o por
-- WhatsApp. Cubre lo pendiente del presupuesto abierto y los borradores (si no hay
-- presupuesto, se abre uno para dejar la evidencia).
--
-- `p_lineas` son las líneas que el admin tenía a la vista: si la orden cambió
-- mientras tanto, se rechaza en vez de decidir por líneas que no vio.
CREATE OR REPLACE FUNCTION public.registrar_autorizacion(
  p_orden_id  UUID,
  p_aprobadas UUID[],
  p_lineas    UUID[],
  p_via       TEXT,
  p_nombre    TEXT DEFAULT NULL,
  p_nota      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p       presupuestos;
  v_vistas  UUID[];
  v_actual  UUID[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar autorizaciones.' USING ERRCODE = '42501';
  END IF;
  IF p_via NOT IN ('admin_telefono', 'admin_presencial', 'admin_whatsapp') THEN
    RAISE EXCEPTION 'Indica cómo autorizó el cliente: teléfono, en persona o WhatsApp.';
  END IF;

  PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;

  SELECT * INTO v_p FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'enviado' FOR UPDATE;
  IF v_p.id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'borrador')
       AND NOT EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'borrador') THEN
      RAISE EXCEPTION 'No hay trabajos por autorizar en esta orden.';
    END IF;
    v_p := public._crear_presupuesto(p_orden_id);
  ELSE
    PERFORM public._agregar_borradores(v_p.id);
  END IF;

  v_actual := public._lineas_pendientes(v_p.id);
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_vistas FROM unnest(COALESCE(p_lineas, '{}')) AS x;

  IF v_actual IS DISTINCT FROM v_vistas THEN
    RAISE EXCEPTION 'Los trabajos de la orden cambiaron mientras registrabas la autorización. Vuelve a abrirla.';
  END IF;
  IF NOT (COALESCE(p_aprobadas, '{}') <@ v_actual) THEN
    RAISE EXCEPTION 'Una de las líneas autorizadas no pertenece a esta orden.';
  END IF;

  RETURN public._resolver_presupuesto(
    v_p.id, p_aprobadas, p_via,
    COALESCE(NULLIF(btrim(p_nombre), ''), (SELECT c.nombre FROM ordenes_trabajo o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = p_orden_id)),
    auth.uid(), NULL, p_nota, NULL, NULL
  );
END;
$$;

-- Para la lista y el tablero: qué órdenes esperan la respuesta del cliente. La ven
-- también los técnicos (solo sabe "espera autorización", sin montos).
CREATE OR REPLACE FUNCTION public.ordenes_esperando_autorizacion()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.orden_id
  FROM presupuestos p
  JOIN ordenes_trabajo o ON o.id = p.orden_id
  WHERE p.estado = 'enviado'
    AND (public.is_admin() OR o.sede_id = public.current_user_sede_id());
$$;

REVOKE ALL ON FUNCTION public.enviar_presupuesto(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_presupuesto(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_autorizacion(UUID, UUID[], UUID[], TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ordenes_esperando_autorizacion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_presupuesto(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_presupuesto(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_autorizacion(UUID, UUID[], UUID[], TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ordenes_esperando_autorizacion() TO authenticated;


-- ------------------------------------------------------------------------------------
-- 7. Lo que el cliente firmó, lo aprobó
-- ------------------------------------------------------------------------------------
-- Al firmar la recepción, los borradores quedan aprobados con un presupuesto
-- "firma de recepción" como evidencia. Si ya había un presupuesto enviado por
-- correo, la firma no decide por él: esas líneas esperan la respuesta del cliente.
CREATE OR REPLACE FUNCTION public.trg_quote_on_signature()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p     presupuestos;
  v_nombre TEXT;
BEGIN
  IF NEW.firma_ruta IS NULL OR OLD.firma_ruta IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM presupuestos WHERE orden_id = NEW.id AND estado = 'enviado') THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = NEW.id AND estado = 'borrador')
     AND NOT EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = NEW.id AND estado = 'borrador') THEN
    RETURN NULL;
  END IF;

  SELECT nombre INTO v_nombre FROM clientes WHERE id = NEW.cliente_id;
  v_p := public._crear_presupuesto(NEW.id);
  PERFORM public._resolver_presupuesto(
    v_p.id, public._lineas_pendientes(v_p.id), 'firma_recepcion',
    v_nombre, auth.uid(), NULL, 'Aprobado con la firma de recepción.', NULL, NULL
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_quote_on_signature() FROM PUBLIC, anon, authenticated;

-- Sin EXCEPTION que lo silencie: si la aprobación falla, la firma falla y se ve,
-- en vez de dejar trabajos firmados sin cobrar.
DROP TRIGGER IF EXISTS trg_order_quote_signature ON ordenes_trabajo;
CREATE TRIGGER trg_order_quote_signature
  AFTER UPDATE OF firma_ruta ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_quote_on_signature();


-- ------------------------------------------------------------------------------------
-- 8. El cliente responde desde su enlace
-- ------------------------------------------------------------------------------------
-- Solo la llama la edge function `portal` (service_role), que agrega IP y navegador.
-- Devuelve {ok:false, motivo} en vez de fallar: la página le explica al cliente qué
-- pasó.
CREATE OR REPLACE FUNCTION public.responder_presupuesto_portal(
  p_token          TEXT,
  p_presupuesto_id UUID,
  p_aprobadas      UUID[],
  p_lineas         UUID[],
  p_nombre         TEXT,
  p_comentario     TEXT,
  p_ip             TEXT,
  p_user_agent     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace orden_enlaces;
  v_p      presupuestos;
  v_vistas UUID[];
  v_actual UUID[];
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  END IF;

  SELECT * INTO v_enlace FROM orden_enlaces
  WHERE token = p_token AND revocado_en IS NULL AND (expira_en IS NULL OR expira_en > NOW());
  IF v_enlace.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  END IF;

  SELECT * INTO v_p FROM presupuestos
  WHERE id = p_presupuesto_id AND orden_id = v_enlace.orden_id
  FOR UPDATE;
  IF v_p.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrado');
  END IF;
  IF v_p.estado <> 'enviado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', CASE WHEN v_p.estado = 'cancelado' THEN 'cancelado' ELSE 'ya_respondido' END);
  END IF;

  IF length(btrim(COALESCE(p_nombre, ''))) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nombre_requerido');
  END IF;

  v_actual := public._lineas_pendientes(v_p.id);
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_vistas FROM unnest(COALESCE(p_lineas, '{}')) AS x;
  IF v_actual IS DISTINCT FROM v_vistas THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'presupuesto_cambio');
  END IF;
  IF NOT (COALESCE(p_aprobadas, '{}') <@ v_actual) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lineas_invalidas');
  END IF;

  RETURN jsonb_build_object('ok', true) || public._resolver_presupuesto(
    v_p.id, p_aprobadas, 'cliente_portal', p_nombre, NULL, p_comentario, NULL, p_ip, p_user_agent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.responder_presupuesto_portal(TEXT, UUID, UUID[], UUID[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.responder_presupuesto_portal(TEXT, UUID, UUID[], UUID[], TEXT, TEXT, TEXT, TEXT) TO service_role;


-- ------------------------------------------------------------------------------------
-- 9. El portal: presupuesto pendiente, historial y cuenta solo con lo aprobado
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.datos_portal(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace orden_enlaces;
  v_orden  ordenes_trabajo;
  v_taller JSONB;
  v_pagado NUMERIC;
  v_montos orden_montos;
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
    RETURN jsonb_build_object('estado_enlace', 'vencido', 'taller', v_taller);
  END IF;

  UPDATE orden_enlaces
  SET accesos = accesos + 1, ultimo_acceso_en = NOW()
  WHERE id = v_enlace.id;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = v_enlace.orden_id;
  SELECT * INTO v_montos FROM orden_montos WHERE orden_id = v_orden.id;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
  INTO v_pagado
  FROM finanzas_movimientos
  WHERE referencia_orden_id = v_orden.id AND categoria = 'pago_cliente';

  RETURN jsonb_build_object(
    'estado_enlace', 'ok',
    'taller', v_taller,
    'enlace', jsonb_build_object('expira_en', v_enlace.expira_en),
    'orden', jsonb_build_object(
      'numero', v_orden.numero_orden,
      'estatus', v_orden.estatus,
      'tipo_trabajo', v_orden.tipo_trabajo,
      'porcentaje_avance', v_orden.porcentaje_avance,
      'fecha_ingreso', v_orden.fecha_ingreso,
      'fecha_estimada_entrega', v_orden.fecha_estimada_entrega,
      'fecha_finalizacion', v_orden.fecha_finalizacion,
      'millas_ingreso', v_orden.millas_ingreso,
      'nivel_gasolina', v_orden.nivel_gasolina,
      'notas_recepcion', v_orden.inspeccion_360_notas,
      'firma_ruta', v_orden.firma_ruta,
      'firma_fecha', v_orden.firma_fecha
    ),
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre,
        'tiene_correo', public.es_correo_valido(c.email),
        'acepta_correos', c.acepta_correos
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
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
      WHERE m.orden_id = v_orden.id AND m.visible_cliente
    ), '[]'::jsonb),
    -- El presupuesto que espera su respuesta. Los ids de las líneas viajan porque el
    -- cliente responde línea por línea.
    'presupuesto', (
      SELECT jsonb_build_object(
        'id', p.id,
        'numero', p.numero,
        'enviado_en', p.creado_en,
        'total', p.total_propuesto,
        'lineas', COALESCE((
          SELECT jsonb_agg(l.linea ORDER BY l.creado_en, l.descripcion)
          FROM (
            SELECT lb.creado_en, lb.descripcion, jsonb_build_object(
              'id', lb.id, 'tipo', 'mano_obra', 'descripcion', lb.descripcion,
              'cantidad', 1, 'precio_unitario', lb.costo, 'monto', lb.costo
            ) AS linea
            FROM orden_labor lb WHERE lb.presupuesto_id = p.id AND lb.estado = 'pendiente'
            UNION ALL
            SELECT r.creado_en, r.descripcion, jsonb_build_object(
              'id', r.id, 'tipo', 'repuesto', 'descripcion', r.descripcion,
              'cantidad', r.cantidad, 'precio_unitario', r.precio_venta_unitario, 'monto', r.subtotal
            )
            FROM orden_repuestos r WHERE r.presupuesto_id = p.id AND r.estado = 'pendiente'
          ) l
        ), '[]'::jsonb)
      )
      FROM presupuestos p
      WHERE p.orden_id = v_orden.id AND p.estado = 'enviado'
    ),
    -- Constancia de lo que ya respondió (o firmó).
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
    -- Lo que se cobra: solo lo aprobado, a precio de venta.
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
      'total_mano_obra', v_orden.total_labor,
      'total_repuestos', COALESCE(v_montos.total_repuestos, 0),
      'total', COALESCE(v_montos.total_general, 0),
      'deposito', COALESCE(v_montos.deposito_inicial, 0),
      'pagado', v_pagado,
      'saldo', GREATEST(COALESCE(v_montos.total_general, 0) - v_pagado, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.datos_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_portal(TEXT) TO service_role;


-- ------------------------------------------------------------------------------------
-- 10. Correos: el presupuesto y la constancia de la respuesta
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.datos_correo(p_cola_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job    cola_envios;
  v_orden  ordenes_trabajo;
  v_enlace orden_enlaces;
BEGIN
  SELECT * INTO v_job FROM cola_envios WHERE id = p_cola_id AND canal = 'email';
  IF NOT FOUND OR v_job.orden_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = v_job.orden_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_enlace := public.asegurar_enlace_orden(v_orden.id);

  RETURN jsonb_build_object(
    'token', v_enlace.token,
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre,
        'email', lower(btrim(c.email)),
        'email_valido', public.es_correo_valido(c.email),
        'acepta_correos', c.acepta_correos
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
    'taller', (
      SELECT jsonb_build_object(
        'nombre', s.nombre,
        'direccion', s.direccion,
        'telefono', s.telefono,
        'email', CASE WHEN public.es_correo_valido(s.email_contacto) THEN lower(btrim(s.email_contacto)) END,
        'whatsapp', NULLIF(btrim(s.whatsapp), ''),
        'logo_url', s.logo_url,
        'color', s.color_tema
      )
      FROM sedes s WHERE s.id = v_orden.sede_id
    ),
    'orden', jsonb_build_object(
      'numero', v_orden.numero_orden,
      'estatus', v_orden.estatus,
      'fecha_ingreso', v_orden.fecha_ingreso,
      'fecha_estimada_entrega', v_orden.fecha_estimada_entrega
    ),
    'vehiculo', (
      SELECT btrim(concat_ws(' ', v.anio::text, v.marca, v.modelo))
      FROM vehiculos v WHERE v.id = v_orden.vehiculo_id
    ),
    'ultimo_estatus_enviado', (
      SELECT datos->>'estatus_enviado'
      FROM cola_envios
      WHERE orden_id = v_orden.id AND canal = 'email' AND plantilla = 'estatus' AND estado = 'enviado'
      ORDER BY enviado_en DESC NULLS LAST
      LIMIT 1
    ),
    'presupuesto', CASE WHEN v_job.datos ? 'presupuesto_id' THEN (
      SELECT jsonb_build_object(
        'numero', p.numero,
        'estado', p.estado,
        'via', p.respondido_via,
        'total_propuesto', p.total_propuesto,
        'total_aprobado', p.total_aprobado,
        'lineas', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('descripcion', l.descripcion, 'monto', l.monto, 'estado', l.estado) ORDER BY l.creado_en)
          FROM (
            SELECT descripcion, costo AS monto, estado, creado_en FROM orden_labor WHERE presupuesto_id = p.id
            UNION ALL
            SELECT descripcion, subtotal, estado, creado_en FROM orden_repuestos WHERE presupuesto_id = p.id
          ) l
        ), '[]'::jsonb)
      )
      FROM presupuestos p
      WHERE p.id = (v_job.datos->>'presupuesto_id')::uuid
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.datos_correo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_correo(UUID) TO service_role;


-- ------------------------------------------------------------------------------------
-- 11. Presupuestos sin respuesta
-- ------------------------------------------------------------------------------------
-- Una vez al día, a los admins de la sede, por cada presupuesto con más de 24 horas
-- sin respuesta. Como mucho un recordatorio diario por presupuesto.
CREATE OR REPLACE FUNCTION public.recordar_presupuestos_sin_respuesta()
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
    SELECT * FROM presupuestos
    WHERE estado = 'enviado'
      AND creado_en < NOW() - INTERVAL '24 hours'
      AND (recordado_en IS NULL OR recordado_en < NOW() - INTERVAL '20 hours')
    FOR UPDATE SKIP LOCKED
  LOOP
    d := public.datos_orden_aviso(r.orden_id);
    v_dias := GREATEST(1, floor(EXTRACT(EPOCH FROM NOW() - r.creado_en) / 86400)::int);
    PERFORM public.notificar(
      public.admins_de_sede(r.sede_id),
      'presupuesto_sin_respuesta',
      'Presupuesto sin respuesta · ' || (d->>'numero_orden'),
      format('Enviado hace %s día(s) por %s. Llama al cliente o registra su autorización.', v_dias, to_char(r.total_propuesto, 'FM$999,999,990.00')),
      d || jsonb_build_object('presupuesto_id', r.id, 'dias', v_dias),
      r.orden_id
    );
    UPDATE presupuestos SET recordado_en = NOW() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recordar_presupuestos_sin_respuesta() FROM PUBLIC, anon, authenticated;

-- 15:00 UTC = 9–10 a. m. en el centro de EE. UU.: cuando alguien puede llamar.
SELECT cron.schedule(
  'restorify-quote-reminders',
  '0 15 * * *',
  $$SELECT public.recordar_presupuestos_sin_respuesta()$$
);
