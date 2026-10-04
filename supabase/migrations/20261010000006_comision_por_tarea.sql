-- ------------------------------------------------------------------------------------
-- Tareas con técnico y comisión por tarea (plan-mejoras-2026-10, F3)
-- ------------------------------------------------------------------------------------
-- Pedido del taller (reunión del 03/10/2026): "la pintora no cobró una mano de obra extra".
-- Con el modelo por especialidad (20261009000000) la comisión de una línea depende de quién
-- tenga esa tarea en la orden, y eso no lo ve nadie al agregar la línea. Decisión del
-- taller: cada línea de mano de obra (`orden_labor`) tiene SU técnico (`asignado_a`) y la
-- comisión de esa línea es de ese técnico, a su porcentaje (`perfiles_pago`, o el de la
-- sede; a sueldo, 0).
--
-- Reglas:
--   * Línea aprobada con técnico: una fila de comisión para él (`comisiones.labor_id`),
--     costo × su porcentaje, en centavos exactos.
--   * Línea SIN técnico de la app nueva (`reparto_heredado = false`): nadie cobra hasta que
--     se le asigne uno. La estimación la devuelve en `sin_asignar` para que la orden lo avise.
--   * Líneas que ya existían (`reparto_heredado = true`, el valor por omisión de la columna):
--     conservan el reparto por especialidad de hoy hasta que un admin les asigne técnico.
--     Al aplicar esta migración no cambia ninguna comisión (la red de seguridad del final
--     lo comprueba y aborta si no).
--   * El reparto heredado cuenta solo a los asignados a mano (`orden_asignaciones.origen =
--     'manual'`). A quien agrega una tarea (origen 'tarea') se le agrega a la orden para que
--     la vea, pero no entra a esa bolsa: cobra por sus tareas.
--   * Asignar técnico es de administración (la política de UPDATE de `orden_labor` ya es solo
--     admin). El técnico tiene que ser mecánico o pintor de la sede de la orden.
--   * Lo pagado nunca se toca ni se paga dos veces: no se cambia el técnico ni la
--     especialidad de una línea con comisión pagada, ni se le asigna técnico a una línea
--     heredada cuya bolsa ya se pagó, ni se mete una línea a una bolsa ya pagada, ni se borra
--     una línea con comisión pagada. Una línea tampoco se muda a otra orden.
--   * Quién entra al reparto heredado lo decide administración con `orden_asignaciones.origen`
--     (editar una asignación es solo admin): 'manual' entra, 'tarea' no. Así se saca del
--     reparto a quien tiene tareas (no se le puede quitar de la orden) y se mete a quien
--     entró por una tarea. El cambio recalcula (`trg_assignment_commissions`) y queda en el
--     historial.
--   * Quitar de la orden a un técnico con tareas se bloquea hasta reasignarlas (salvo al
--     borrar la orden entera o al empleado).
--   * La política de UPDATE de `orden_asignaciones` pasa a ser solo de admin: un técnico
--     podía cambiar el `tipo_tarea` de su propia asignación y con eso mover su comisión.
--
-- Expandir y contraer: esta migración solo agrega. `reparto_heredado` nace con DEFAULT true
-- (un default constante no reescribe la tabla ni dispara triggers) para que la app que hoy
-- está publicada, que no conoce la columna, siga creando líneas con el reparto de siempre.
-- La app nueva manda `reparto_heredado = false` en cada línea que crea. PENDIENTE: cuando la
-- app nueva esté publicada, una migración posterior cambia el default a false
-- (`ALTER TABLE orden_labor ALTER COLUMN reparto_heredado SET DEFAULT false`). No se hace
-- aquí a propósito.
-- ------------------------------------------------------------------------------------


-- ----- 0. La foto de antes (red de seguridad, ver §10) ------------------------------------
-- Dos fotos, tomadas antes de tocar nada:
--   * el reparto que da la fórmula VIGENTE (`_reparto_comisiones` de 20261009000000) para
--     cada orden. Al final se compara con lo que da la fórmula nueva sobre los mismos datos:
--     así la red mide solo lo que esta migración puede cambiar, la cuenta, y no las
--     diferencias que ya había entre la tabla `comisiones` y la fórmula. Esas existen a
--     propósito: a quien pasa de salario a comisión no le nacen comisiones de órdenes ya
--     entregadas (`trg_commissions_on_pay_scheme`), así que recalcular "para comparar" le
--     daría una comisión retroactiva que el taller no quiso, y abortaría el db push por un
--     estado legítimo.
--   * la tabla `comisiones` tal cual: esta migración no recalcula ni escribe ninguna fila, y
--     la red lo comprueba.
DROP TABLE IF EXISTS pg_temp._f3_reparto_antes;
CREATE TEMP TABLE _f3_reparto_antes AS
  SELECT o.id AS orden_id, r.usuario_id, r.especialidad, r.esquema, r.base, r.porcentaje,
         r.tecnicos, r.monto
  FROM ordenes_trabajo o
  CROSS JOIN LATERAL public._reparto_comisiones(o.id) r;

DROP TABLE IF EXISTS pg_temp._f3_comisiones_antes;
DROP TABLE IF EXISTS pg_temp._f3_reparto_despues;
CREATE TEMP TABLE _f3_comisiones_antes AS
  SELECT id, orden_id, usuario_id, especialidad, monto, base_ganancia, porcentaje, tecnicos, pago_id
  FROM comisiones;


-- ----- 1. Columnas nuevas ----------------------------------------------------------------
ALTER TABLE orden_labor
  ADD COLUMN IF NOT EXISTS asignado_a UUID REFERENCES perfiles(id) ON DELETE SET NULL;
ALTER TABLE orden_labor
  ADD COLUMN IF NOT EXISTS reparto_heredado BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_orden_labor_asignado ON orden_labor (asignado_a, orden_id)
  WHERE asignado_a IS NOT NULL;

COMMENT ON COLUMN orden_labor.asignado_a IS
  'El técnico de esta tarea: cobra su comisión. Nulo = sin técnico (nadie cobra) o, si reparto_heredado, el reparto por especialidad.';
COMMENT ON COLUMN orden_labor.reparto_heredado IS
  'true = línea anterior a la comisión por tarea: sin técnico, se reparte por especialidad entre los asignados a mano. La app nueva crea las líneas con false.';

ALTER TABLE orden_asignaciones
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE orden_asignaciones DROP CONSTRAINT IF EXISTS orden_asignaciones_origen_check;
ALTER TABLE orden_asignaciones ADD CONSTRAINT orden_asignaciones_origen_check
  CHECK (origen IN ('manual', 'tarea'));

COMMENT ON COLUMN orden_asignaciones.origen IS
  'manual = lo asignó administración (entra al reparto heredado por especialidad); tarea = se agregó solo al darle una tarea (cobra por sus tareas).';

ALTER TABLE comisiones
  ADD COLUMN IF NOT EXISTS labor_id UUID REFERENCES orden_labor(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comisiones_labor ON comisiones (labor_id) WHERE labor_id IS NOT NULL;

COMMENT ON COLUMN comisiones.labor_id IS
  'La tarea que paga esta comisión. Nulo = reparto heredado por especialidad.';

-- Una fila por tarea, y una por (persona, bolsa) para el reparto heredado (labor_id nulo).
-- NULLS NOT DISTINCT: dos filas heredadas de la misma persona y bolsa siguen chocando.
ALTER TABLE comisiones DROP CONSTRAINT IF EXISTS comisiones_orden_usuario_especialidad_key;
ALTER TABLE comisiones DROP CONSTRAINT IF EXISTS comisiones_orden_usuario_especialidad_tarea_key;
ALTER TABLE comisiones ADD CONSTRAINT comisiones_orden_usuario_especialidad_tarea_key
  UNIQUE NULLS NOT DISTINCT (orden_id, usuario_id, especialidad, labor_id);


-- ----- 2. El guardia de presupuestos -----------------------------------------------------
-- Reescrito entero desde 20261009000000. Cambio: además de la especialidad, el técnico
-- (`asignado_a`) y `reparto_heredado` tampoco son lo cotizado. El cliente no los ve, así que
-- se dejan cambiar sin mover el estado de la línea (en una pendiente lanzaría y en una
-- rechazada la devolvería a borrador).
CREATE OR REPLACE FUNCTION public.trg_guard_linea_presupuesto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sistema BOOLEAN := COALESCE(current_setting('restorify.presupuesto', true), 'off') = 'on';
  -- Lo que se puede cambiar sin tocar lo cotizado: a quién y a qué bolsa va la comisión.
  v_internos CONSTANT TEXT[] := ARRAY['especialidad', 'asignado_a', 'reparto_heredado'];
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

  -- Solo la especialidad, el técnico o el tipo de reparto: no toca lo cotizado.
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


-- ----- 3. El técnico de una tarea: quién puede ser y lo pagado ---------------------------
-- BEFORE: valida al asignado y protege lo pagado. Corre después de `trg_labor_especialidad`
-- (orden alfabético), así que en un INSERT la especialidad ya está puesta.
CREATE OR REPLACE FUNCTION public.trg_guard_labor_tecnico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sede_orden UUID;
  v_rol        user_role;
  v_sede_tec   UUID;
  v_pagada     BOOLEAN := false;
  v_bolsa      BOOLEAN := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    -- La comisión de esta tarea ya se pagó…
    v_pagada := EXISTS (
      SELECT 1 FROM comisiones WHERE labor_id = OLD.id AND pago_id IS NOT NULL
    );
    -- …o es una línea heredada aprobada y la bolsa de su especialidad ya se pagó: moverla
    -- a un técnico la pagaría dos veces.
    v_bolsa := OLD.asignado_a IS NULL AND OLD.reparto_heredado AND OLD.estado = 'aprobado'
      AND EXISTS (
        SELECT 1 FROM comisiones
        WHERE orden_id = OLD.orden_id AND especialidad = OLD.especialidad
          AND labor_id IS NULL AND pago_id IS NOT NULL
      );
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Borrar la orden arrastra sus líneas (y `trg_order_delete_paid_guard` ya impide borrar
    -- una orden con comisiones pagadas).
    IF (v_pagada OR v_bolsa) AND EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = OLD.orden_id) THEN
      RAISE EXCEPTION 'La comisión de este trabajo ya se pagó. Deshaz ese pago en Comisiones antes de quitarlo.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- Una línea no se muda de orden. Ninguna pantalla lo hace, y por la API pagaba dos veces lo
  -- ya pagado: la fila pagada se queda en la orden vieja y en la nueva nacía otra pendiente
  -- (la llave de `comisiones` lleva el `orden_id`).
  IF TG_OP = 'UPDATE' AND NEW.orden_id IS DISTINCT FROM OLD.orden_id THEN
    RAISE EXCEPTION 'Un trabajo no se puede mover a otra orden. Quítalo de esta y agrégalo en la otra.'
      USING ERRCODE = '42501';
  END IF;

  -- Quién puede tener una tarea: un mecánico o pintor de la sede de la orden.
  IF NEW.asignado_a IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.asignado_a IS DISTINCT FROM OLD.asignado_a) THEN
    SELECT sede_id INTO v_sede_orden FROM ordenes_trabajo WHERE id = NEW.orden_id;
    SELECT rol, sede_id INTO v_rol, v_sede_tec FROM perfiles WHERE id = NEW.asignado_a;
    IF v_rol IS NULL OR v_rol NOT IN ('mecanico', 'pintor') OR v_sede_tec IS DISTINCT FROM v_sede_orden THEN
      RAISE EXCEPTION 'Una tarea solo se puede asignar a un mecánico o pintor de la sede de la orden.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.asignado_a IS DISTINCT FROM OLD.asignado_a
          OR NEW.especialidad IS DISTINCT FROM OLD.especialidad
          OR NEW.reparto_heredado IS DISTINCT FROM OLD.reparto_heredado)
     -- ON DELETE SET NULL al borrar al empleado: no es una reasignación.
     AND NOT (NEW.asignado_a IS NULL AND OLD.asignado_a IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM perfiles WHERE id = OLD.asignado_a)) THEN
    IF v_pagada THEN
      RAISE EXCEPTION 'La comisión de esta tarea ya se pagó. Para cambiarle el técnico o la especialidad, deshaz ese pago en Comisiones.'
        USING ERRCODE = '42501';
    END IF;
    IF v_bolsa THEN
      RAISE EXCEPTION 'La comisión de % de esta orden ya se pagó con el reparto anterior. Deshaz ese pago en Comisiones antes de cambiarle el técnico o la especialidad a este trabajo.',
        CASE OLD.especialidad WHEN 'pintura' THEN 'pintura' ELSE 'mecánica' END
        USING ERRCODE = '42501';
    END IF;
    -- …ni entrar a una bolsa heredada que ya se pagó (otra especialidad, volver al reparto,
    -- quitarle el técnico a una línea con reparto): lo pagado no se recalcula, así que su
    -- comisión no la cobraría nadie, y la línea quedaría atrapada por la regla de arriba.
    -- Aprobar una línea (cambia solo el estado) no pasa por aquí: el presupuesto no se traba.
    IF NEW.asignado_a IS NULL AND NEW.reparto_heredado AND NEW.estado = 'aprobado'
       AND NOT (OLD.asignado_a IS NULL AND OLD.reparto_heredado AND OLD.estado = 'aprobado'
                AND OLD.especialidad IS NOT DISTINCT FROM NEW.especialidad)
       AND EXISTS (
         SELECT 1 FROM comisiones
         WHERE orden_id = NEW.orden_id AND especialidad = NEW.especialidad
           AND labor_id IS NULL AND pago_id IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'La comisión de % de esta orden ya se pagó con el reparto anterior: este trabajo no puede entrar a ese reparto. Deshaz ese pago en Comisiones o asígnale un técnico.',
        CASE NEW.especialidad WHEN 'pintura' THEN 'pintura' ELSE 'mecánica' END
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_guard_labor_tecnico() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_labor_tecnico_guard ON orden_labor;
CREATE TRIGGER trg_labor_tecnico_guard
  BEFORE INSERT OR DELETE OR UPDATE ON orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_labor_tecnico();


-- AFTER: quien recibe una tarea queda en la orden (si no estaba) para verla por RLS, y se le
-- avisa. Al que se la quitan, también.
CREATE OR REPLACE FUNCTION public.trg_labor_tecnico_asignado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nuevo BOOLEAN := NEW.asignado_a IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.asignado_a IS DISTINCT FROM OLD.asignado_a);
  -- A quien se la quitan, si sigue existiendo (borrar al empleado pone `asignado_a` en nulo).
  v_quitado UUID := CASE WHEN TG_OP = 'UPDATE' AND OLD.asignado_a IS DISTINCT FROM NEW.asignado_a
                          AND EXISTS (SELECT 1 FROM perfiles WHERE id = OLD.asignado_a)
                         THEN OLD.asignado_a END;
  d JSONB;
BEGIN
  -- Fuera del bloque de avisos: sin esta fila el técnico no ve su tarea.
  IF v_nuevo AND NOT EXISTS (
    SELECT 1 FROM orden_asignaciones WHERE orden_id = NEW.orden_id AND usuario_id = NEW.asignado_a
  ) THEN
    INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, estatus_tarea, origen)
    VALUES (NEW.orden_id, NEW.asignado_a, NEW.especialidad, 'pendiente', 'tarea');
  END IF;

  BEGIN
    IF v_nuevo OR v_quitado IS NOT NULL THEN
      d := public.datos_orden_aviso(NEW.orden_id)
        || jsonb_build_object('labor_id', NEW.id, 'descripcion', NEW.descripcion, 'especialidad', NEW.especialidad);
    END IF;

    IF v_quitado IS NOT NULL THEN
      PERFORM public.notificar(
        ARRAY[v_quitado],
        'tarea_reasignada',
        'Tarea reasignada · ' || (d->>'numero_orden'),
        NEW.descripcion || ' ya no está a tu cargo',
        d,
        NEW.orden_id
      );
    END IF;

    IF v_nuevo THEN
      PERFORM public.notificar(
        ARRAY[NEW.asignado_a],
        'tarea_asignada',
        'Nueva tarea · ' || (d->>'numero_orden'),
        concat_ws(' — ', NEW.descripcion, NULLIF(d->>'vehiculo', '')),
        d,
        NEW.orden_id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_labor_tecnico_asignado: %', SQLERRM;
  END;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_labor_tecnico_asignado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_labor_tecnico_asignado ON orden_labor;
CREATE TRIGGER trg_labor_tecnico_asignado
  AFTER INSERT OR UPDATE OF asignado_a ON orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_labor_tecnico_asignado();


-- ----- 4. Asignaciones: quitar a alguien con tareas, y quién las edita --------------------
-- BEFORE DELETE: quitar de la orden a quien tiene tareas se bloquea (decisión del taller).
-- BEFORE UPDATE: cambiar a quién cuenta el reparto heredado (`origen`, `tipo_tarea`) no se
-- deja si esa bolsa ya se pagó: lo pagado no se recalcula, así que meter a alguien le pagaría
-- su parte encima de lo ya pagado, y sacarlo dejaría lo pagado repartido de otra forma.
CREATE OR REPLACE FUNCTION public.trg_guard_asignacion_con_tareas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
  v_tareas INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.origen IS DISTINCT FROM OLD.origen OR NEW.tipo_tarea IS DISTINCT FROM OLD.tipo_tarea)
       AND EXISTS (
         SELECT 1 FROM comisiones
         WHERE orden_id = OLD.orden_id AND labor_id IS NULL AND pago_id IS NOT NULL
           AND especialidad IN (OLD.tipo_tarea, NEW.tipo_tarea)
       ) THEN
      RAISE EXCEPTION 'El reparto de % de esta orden ya se pagó: no se cambia quién entra en él. Deshaz ese pago en Comisiones primero.',
        CASE WHEN 'pintura' IN (OLD.tipo_tarea, NEW.tipo_tarea) AND 'mecanica' IN (OLD.tipo_tarea, NEW.tipo_tarea)
             THEN 'mecánica o pintura'
             WHEN 'pintura' IN (OLD.tipo_tarea, NEW.tipo_tarea) THEN 'pintura' ELSE 'mecánica' END
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Borrar la orden o al empleado arrastra sus asignaciones: eso no es "quitarlo de la orden".
  IF NOT EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = OLD.orden_id)
     OR NOT EXISTS (SELECT 1 FROM perfiles WHERE id = OLD.usuario_id) THEN
    RETURN OLD;
  END IF;

  -- Con otra asignación en la misma orden (las dos especialidades) sigue viéndola.
  IF EXISTS (
    SELECT 1 FROM orden_asignaciones
    WHERE orden_id = OLD.orden_id AND usuario_id = OLD.usuario_id AND id <> OLD.id
  ) THEN
    RETURN OLD;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_tareas
  FROM orden_labor WHERE orden_id = OLD.orden_id AND asignado_a = OLD.usuario_id;

  IF v_tareas > 0 THEN
    SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = OLD.usuario_id;
    RAISE EXCEPTION '% tiene % tarea(s) en esta orden. Asígnalas a otra persona antes de quitarlo de la orden.',
      COALESCE(v_nombre, 'Este técnico'), v_tareas
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_guard_asignacion_con_tareas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assignment_tasks_guard ON orden_asignaciones;
CREATE TRIGGER trg_assignment_tasks_guard
  BEFORE DELETE OR UPDATE OF origen, tipo_tarea ON orden_asignaciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_asignacion_con_tareas();

-- Solo administración edita una asignación. Antes el técnico podía editar la suya, y con el
-- `tipo_tarea` cambiaba de bolsa su comisión heredada. (El `estatus_tarea` de la asignación
-- no lo usa ninguna pantalla; el avance de cada tarea es `orden_labor.completado_en`.)
-- Administración también cambia aquí el `origen`: sacar del reparto heredado a quien tiene
-- tareas ('manual' → 'tarea') o meter a quien entró por una ('tarea' → 'manual').
DROP POLICY IF EXISTS orden_asignaciones_update ON orden_asignaciones;
CREATE POLICY orden_asignaciones_update ON orden_asignaciones
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));


-- Reescrita entera desde 20260920000000. Cambio: una asignación que nace de una tarea
-- (origen 'tarea') no avisa "Nueva orden asignada"; ya avisó `tarea_asignada`.
CREATE OR REPLACE FUNCTION public.trg_notify_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d JSONB;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.origen IS DISTINCT FROM 'tarea' THEN
        d := public.datos_orden_aviso(NEW.orden_id);
        PERFORM public.notificar(
          ARRAY[NEW.usuario_id],
          'asignacion',
          'Nueva orden asignada · ' || (d->>'numero_orden'),
          concat_ws(' — ', NULLIF(d->>'vehiculo', ''), NULLIF(d->>'cliente', '')),
          d,
          NEW.orden_id
        );
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      d := public.datos_orden_aviso(OLD.orden_id);
      -- Si la orden se está borrando entera, o el empleado, no queda nada que avisar.
      IF d IS NOT NULL AND EXISTS (SELECT 1 FROM perfiles WHERE id = OLD.usuario_id) THEN
        PERFORM public.notificar(
          ARRAY[OLD.usuario_id],
          'desasignacion',
          'Ya no estás asignado · ' || (d->>'numero_orden'),
          NULLIF(d->>'vehiculo', ''),
          d,
          OLD.orden_id
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_assignment: %', SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.trg_notify_assignment() FROM PUBLIC, anon, authenticated;


-- ----- 5. La comisión: reparto, devengo y estimación --------------------------------------
-- Cambia la forma de lo que devuelve `_reparto_comisiones` (columna `labor_id`), así que va
-- con DROP + CREATE, junto con las dos funciones que lo usan.
DROP FUNCTION IF EXISTS public._reparto_comisiones(UUID);

-- El reparto completo de una orden, entregada o no. Una sola cuenta para el devengo
-- (`sync_order_commissions`) y para la estimación que ve la pantalla:
--   * una fila por tarea aprobada con técnico (labor_id = la línea, tecnicos = 1);
--   * el reparto heredado de siempre (labor_id nulo) con las líneas aprobadas sin técnico y
--     `reparto_heredado`, entre los asignados a mano con esa especialidad;
--   * una línea sin técnico y sin reparto heredado no genera nada.
-- Los montos se calculan en centavos (base × porcentaje = centavos) y se redondean una vez.
CREATE FUNCTION public._reparto_comisiones(p_orden_id UUID)
RETURNS TABLE (
  usuario_id   UUID,
  especialidad TEXT,
  esquema      TEXT,
  base         NUMERIC,
  porcentaje   NUMERIC,
  tecnicos     INTEGER,
  monto        NUMERIC,
  labor_id     UUID
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
  -- Reparto heredado: la bolsa de cada especialidad, entre los asignados a mano.
  bolsas AS (
    SELECT l.especialidad, SUM(l.costo) AS base
    FROM orden_labor l
    WHERE l.orden_id = p_orden_id AND l.estado = 'aprobado'
      AND l.asignado_a IS NULL AND l.reparto_heredado
    GROUP BY l.especialidad
  ),
  equipo AS (
    SELECT DISTINCT a.usuario_id, a.tipo_tarea AS especialidad
    FROM orden_asignaciones a
    WHERE a.orden_id = p_orden_id AND a.tipo_tarea IN ('mecanica', 'pintura')
      AND a.origen = 'manual'
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
  ),
  -- Por tarea: el costo de la línea × el porcentaje de su técnico.
  tareas AS (
    SELECT
      l.id,
      l.asignado_a,
      l.especialidad,
      l.costo,
      COALESCE(pp.esquema, 'comision') AS esquema,
      CASE WHEN COALESCE(pp.esquema, 'comision') = 'salario' THEN 0
           ELSE COALESCE(pp.comision_porcentaje, o.tasa_sede) END AS porcentaje
    FROM orden_labor l
    CROSS JOIN o
    LEFT JOIN perfiles_pago pp ON pp.usuario_id = l.asignado_a
    WHERE l.orden_id = p_orden_id AND l.estado = 'aprobado' AND l.asignado_a IS NOT NULL
  )
  SELECT
    r.usuario_id,
    r.especialidad,
    r.esquema,
    round(r.base, 2),
    r.porcentaje,
    r.tecnicos,
    ((r.piso + CASE WHEN r.turno <= r.sobrantes THEN 1 ELSE 0 END) / 100)::NUMERIC(12,2),
    NULL::UUID
  FROM repartido r
  UNION ALL
  SELECT
    t.asignado_a,
    t.especialidad,
    t.esquema,
    round(t.costo, 2),
    t.porcentaje,
    1,
    (ROUND(t.costo * t.porcentaje) / 100)::NUMERIC(12,2),
    t.id
  FROM tareas t;
$$;
REVOKE ALL ON FUNCTION public._reparto_comisiones(UUID) FROM PUBLIC, anon, authenticated;


-- Reescrita entera desde 20261009000000. Cambio: la llave incluye la tarea (`labor_id`).
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

  INSERT INTO comisiones (orden_id, usuario_id, sede_id, especialidad, labor_id, base_ganancia, porcentaje, tecnicos, monto)
  SELECT target_order_id, r.usuario_id, v_sede, r.especialidad, r.labor_id, r.base, r.porcentaje, r.tecnicos, r.monto
  FROM public._reparto_comisiones(target_order_id) r
  WHERE r.esquema = 'comision' AND r.monto > 0
  ON CONFLICT ON CONSTRAINT comisiones_orden_usuario_especialidad_tarea_key DO UPDATE
    SET base_ganancia = EXCLUDED.base_ganancia,
        porcentaje    = EXCLUDED.porcentaje,
        tecnicos      = EXCLUDED.tecnicos,
        monto         = EXCLUDED.monto,
        sede_id       = EXCLUDED.sede_id
    WHERE comisiones.pago_id IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_order_commissions(UUID) FROM PUBLIC, anon, authenticated;


-- El reparto estimado de una orden. Administración lo ve entero; un técnico asignado, las
-- bolsas, lo suyo y las tareas sin técnico. Reescrita entera desde 20261009000000; conserva
-- `bolsas`, `reparto` (agrupado por persona y especialidad) y `mi_total`, y agrega `tareas`
-- y `sin_asignar`.
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
    -- La bolsa heredada de cada especialidad (líneas aprobadas sin técnico de antes de la
    -- comisión por tarea) y cuántos asignados a mano la reparten. Cero técnicos = nadie la
    -- cobra.
    'bolsas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'especialidad', b.especialidad,
               'base', round(b.base, 2),
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
    -- Lo de cada quien por especialidad: su parte heredada más sus tareas.
    'reparto', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'usuario_id', g.usuario_id,
               'especialidad', g.especialidad,
               'esquema', g.esquema,
               'porcentaje', g.porcentaje,
               'tecnicos', g.tecnicos,
               'monto', g.monto,
               'heredado', g.heredado,
               'tareas', g.tareas
             ) ORDER BY g.especialidad, g.usuario_id)
      FROM (
        SELECT
          r.usuario_id,
          r.especialidad,
          min(r.esquema) AS esquema,
          max(r.porcentaje) AS porcentaje,
          COALESCE(max(r.tecnicos) FILTER (WHERE r.labor_id IS NULL), 1) AS tecnicos,
          SUM(r.monto) AS monto,
          bool_or(r.labor_id IS NULL) AS heredado,
          COUNT(r.labor_id)::INTEGER AS tareas
        FROM public._reparto_comisiones(p_orden_id) r
        WHERE v_admin OR r.usuario_id = v_yo
        GROUP BY r.usuario_id, r.especialidad
      ) g
    ), '[]'::jsonb),
    -- Lo de quien pregunta, sumado aquí: el navegador no suma dinero.
    'mi_total', COALESCE((
      SELECT SUM(r.monto) FROM public._reparto_comisiones(p_orden_id) r
      WHERE r.usuario_id = v_yo AND r.esquema = 'comision'
    ), 0),
    -- Cada tarea aprobada con técnico y su comisión. Un técnico ve solo las suyas.
    'tareas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'labor_id', r.labor_id,
               'descripcion', l.descripcion,
               'especialidad', r.especialidad,
               'usuario_id', r.usuario_id,
               'esquema', r.esquema,
               'base', r.base,
               'porcentaje', r.porcentaje,
               'monto', r.monto
             ) ORDER BY l.creado_en, l.id)
      FROM public._reparto_comisiones(p_orden_id) r
      JOIN orden_labor l ON l.id = r.labor_id
      WHERE r.labor_id IS NOT NULL AND (v_admin OR r.usuario_id = v_yo)
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
  );
END;
$$;
REVOKE ALL ON FUNCTION public.comisiones_estimadas(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comisiones_estimadas(UUID) TO authenticated;


-- ----- 6. Cuándo se recalcula --------------------------------------------------------------
-- Un solo trigger en `orden_labor` con todo lo que mueve la comisión: estado, costo, técnico,
-- tipo de reparto y especialidad. Reemplaza a `trg_labor_specialty_commissions` (solo
-- especialidad) y a `trg_order_montos_commissions`, que recalculaba cuando cambiaban los
-- totales de `orden_montos`: desde 20261009000000 la comisión sale de las líneas, no de los
-- totales, así que con este trigger cada cambio de una línea recalculaba dos veces, y un
-- cambio de técnico (que no mueve ningún total) no recalculaba.
CREATE OR REPLACE FUNCTION public.trg_commissions_on_labor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Una línea nueva nace en borrador; solo cuenta si entró ya aprobada (sistema).
    IF NEW.estado = 'aprobado' THEN
      PERFORM public.sync_order_commissions(NEW.orden_id);
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_order_commissions(OLD.orden_id);
    RETURN NULL;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.costo IS DISTINCT FROM OLD.costo
     OR NEW.asignado_a IS DISTINCT FROM OLD.asignado_a
     OR NEW.reparto_heredado IS DISTINCT FROM OLD.reparto_heredado
     OR NEW.especialidad IS DISTINCT FROM OLD.especialidad
     OR NEW.orden_id IS DISTINCT FROM OLD.orden_id THEN
    PERFORM public.sync_order_commissions(NEW.orden_id);
    IF NEW.orden_id IS DISTINCT FROM OLD.orden_id THEN
      PERFORM public.sync_order_commissions(OLD.orden_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_commissions_on_labor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_labor_commissions ON orden_labor;
CREATE TRIGGER trg_labor_commissions
  AFTER INSERT OR DELETE OR UPDATE OF estado, costo, asignado_a, reparto_heredado, especialidad, orden_id
  ON orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_commissions_on_labor();

DROP TRIGGER IF EXISTS trg_labor_specialty_commissions ON orden_labor;
DROP FUNCTION IF EXISTS public.trg_commissions_on_labor_specialty();
DROP TRIGGER IF EXISTS trg_order_montos_commissions ON orden_montos;
DROP FUNCTION IF EXISTS public.trg_commissions_on_amounts();


-- ----- 7. Avisos de comisión: uno por orden y persona -------------------------------------
-- Con la comisión por tarea una persona tiene varias filas por orden; un aviso por fila
-- llenaría la bandeja al entregar. Pasa a nivel de sentencia: suma lo que nació en esa
-- sentencia por (orden, persona). Reescrita entera desde 20260920000000.
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

DROP TRIGGER IF EXISTS trg_commission_notify ON comisiones;
CREATE TRIGGER trg_commission_notify
  AFTER INSERT ON comisiones
  REFERENCING NEW TABLE AS nuevas
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_notify_commission();


-- ----- 8. Marcar una tarea hecha --------------------------------------------------------
-- Reescrita entera desde 20261006000000. Cambios: una tarea con técnico la marca ese técnico
-- (o un admin); una sin técnico, cualquier técnico asignado a la orden, como hasta hoy. Si la
-- marca un técnico, se avisa a administración (`tarea_completada`).
CREATE OR REPLACE FUNCTION public.marcar_labor_completada(p_labor_id UUID, p_completado BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden_id UUID;
  v_sede     UUID;
  v_estatus  order_status;
  v_estado   TEXT;
  v_asignado UUID;
  v_desc     TEXT;
  v_antes    TIMESTAMPTZ;
  v_en       TIMESTAMPTZ;
  v_por      UUID;
  v_admin    BOOLEAN := public.is_admin();
  d          JSONB;
BEGIN
  -- FOR UPDATE OF l: la fila de la línea queda bloqueada, no la de la orden.
  SELECT l.orden_id, o.sede_id, o.estatus, l.estado, l.asignado_a, l.descripcion, l.completado_en
  INTO v_orden_id, v_sede, v_estatus, v_estado, v_asignado, v_desc, v_antes
  FROM orden_labor l
  JOIN ordenes_trabajo o ON o.id = l.orden_id
  WHERE l.id = p_labor_id
  FOR UPDATE OF l;

  IF v_orden_id IS NULL THEN
    RAISE EXCEPTION 'Esa línea de trabajo ya no existe.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    v_admin
    OR (v_sede = public.current_user_sede_id() AND public.is_assigned_to_order(v_orden_id))
  ) THEN
    RAISE EXCEPTION 'Solo el personal asignado puede marcar el trabajo de esta orden. Pide a administración que te asigne.'
      USING ERRCODE = '42501';
  END IF;

  -- Una tarea con técnico es de ese técnico.
  IF NOT v_admin AND v_asignado IS NOT NULL AND v_asignado IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Esta tarea está asignada a otro técnico. Solo esa persona o administración pueden marcarla.'
      USING ERRCODE = '42501';
  END IF;

  IF v_estatus = 'entregado' AND NOT v_admin THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  -- COALESCE por los datos anteriores a la fase 5, que no tenían `estado`.
  IF COALESCE(v_estado, 'aprobado') <> 'aprobado' THEN
    RAISE EXCEPTION 'Solo se puede marcar un trabajo que el cliente ya autorizó.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE orden_labor
  SET completado_en  = CASE WHEN p_completado THEN NOW() END,
      completado_por = CASE WHEN p_completado THEN auth.uid() END
  WHERE id = p_labor_id
  RETURNING completado_en, completado_por INTO v_en, v_por;

  -- Aviso a administración cuando un técnico termina una tarea (no al volver a marcarla).
  IF p_completado AND NOT v_admin AND v_antes IS NULL THEN
    BEGIN
      d := public.datos_orden_aviso(v_orden_id) || jsonb_build_object(
        'labor_id', p_labor_id,
        'descripcion', v_desc,
        'usuario_id', auth.uid(),
        'tecnico', (SELECT nombre_completo FROM perfiles WHERE id = auth.uid())
      );
      PERFORM public.notificar(
        public.admins_de_sede(v_sede),
        'tarea_completada',
        'Tarea hecha · ' || (d->>'numero_orden'),
        concat_ws(': ', NULLIF(d->>'tecnico', ''), v_desc),
        d,
        v_orden_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'marcar_labor_completada (aviso): %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('id', p_labor_id, 'completado_en', v_en, 'completado_por', v_por);
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_labor_completada(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_labor_completada(UUID, BOOLEAN) TO authenticated;


-- ----- 9. Historial: el técnico de una tarea, con su nombre -------------------------------
-- Reescrita entera desde 20261010000004. Cambios: en `orden_labor` se registra el campo
-- legible `tecnico` (el nombre de `asignado_a`, antes → después), y `asignado_a` entra a la
-- lista `UPDATE OF` del trigger; en `orden_asignaciones`, el campo `reparto` (true = origen
-- 'manual', entra al reparto heredado), y `origen` entra a su `UPDATE OF`.
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
          'vehiculo_id', 'firma_fecha', 'motivo_autorizacion', 'archivada_en'];
      WHEN 'orden_labor' THEN
        v_entidad := 'mano_obra';
        v_resumen := v_fila ->> 'descripcion';
        v_campos := ARRAY['descripcion', 'costo', 'especialidad', 'estado', 'completado_en', 'tecnico'];
        -- El técnico, por nombre: un uuid no le dice nada a quien lee el historial.
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
        v_campos := ARRAY['descripcion', 'cantidad', 'precio_venta_unitario', 'estado'];
      WHEN 'orden_asignaciones' THEN
        v_entidad := 'asignacion';
        SELECT nombre_completo INTO v_resumen FROM perfiles WHERE id = (v_fila ->> 'usuario_id')::uuid;
        -- `reparto`: si entra al reparto heredado (origen 'manual') o cobra solo sus tareas
        -- ('tarea'). Es dinero que decide administración, así que se registra.
        v_campos := ARRAY['tipo_tarea', 'reparto'];
        IF v_antes IS NOT NULL THEN
          v_antes := v_antes || jsonb_build_object('reparto', (v_antes ->> 'origen') = 'manual');
        END IF;
        IF v_despues IS NOT NULL THEN
          v_despues := v_despues || jsonb_build_object('reparto', (v_despues ->> 'origen') = 'manual');
        END IF;
      WHEN 'orden_montos' THEN
        v_entidad := 'deposito';
        v_campos := ARRAY['deposito_inicial'];
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
      ELSE
        RETURN NULL;
    END CASE;

    v_cambios := CASE TG_OP
      WHEN 'UPDATE' THEN public._historial_diferencias(v_antes, v_despues, v_campos)
      WHEN 'INSERT' THEN public._historial_valores(v_despues, v_campos, 'despues')
      ELSE public._historial_valores(v_antes, v_campos, 'antes')
    END;

    -- Un UPDATE que no cambió nada de lo que se registra no deja fila.
    IF TG_OP = 'UPDATE' AND v_cambios = '{}'::jsonb THEN
      RETURN NULL;
    END IF;

    IF TG_TABLE_NAME = 'ordenes_trabajo' THEN
      v_numero := v_fila ->> 'numero_orden';
      v_sede := (v_fila ->> 'sede_id')::uuid;
    ELSE
      SELECT numero_orden, sede_id INTO v_numero, v_sede FROM ordenes_trabajo WHERE id = v_orden;
      -- La orden ya no existe: es una hija que se va en cascada con ella. Su borrado ya quedó
      -- registrado como el de la orden.
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
      CASE WHEN TG_TABLE_NAME = 'orden_montos' THEN v_orden ELSE (v_fila ->> 'id')::uuid END,
      v_accion, v_resumen, v_cambios
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'historial_orden (%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_historial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_historial ON orden_labor;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF descripcion, costo, especialidad, estado, completado_en, asignado_a
  ON orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

DROP TRIGGER IF EXISTS trg_historial ON orden_asignaciones;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF tipo_tarea, origen
  ON orden_asignaciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();


-- ----- 10. Red de seguridad: la cuenta no cambia y no se escribe ninguna comisión ---------
-- No hay staging: esto corre directo sobre la base del taller. Dos comprobaciones, y si
-- alguna falla la migración entera se deshace:
--   1. La fórmula nueva da, para cada orden, exactamente el mismo reparto que la vigente
--      (§0) sobre los mismos datos. Debe ser así: al aplicarla todas las líneas son
--      `reparto_heredado` sin técnico y todas las asignaciones son 'manual'. No se llama a
--      `sync_order_commissions`: comparar fórmula contra fórmula no reescribe el estado que el
--      taller dejó a propósito (ver §0) ni le crea a nadie una comisión retroactiva.
--   2. La tabla `comisiones` queda idéntica fila por fila.
DO $$
DECLARE
  v_cambios  INTEGER;
  v_detalle  TEXT;
BEGIN
  CREATE TEMP TABLE _f3_reparto_despues AS
    SELECT o.id AS orden_id, r.usuario_id, r.especialidad, r.esquema, r.base, r.porcentaje,
           r.tecnicos, r.monto
    FROM ordenes_trabajo o
    CROSS JOIN LATERAL public._reparto_comisiones(o.id) r;

  WITH diferencias AS (
    (SELECT 'antes' AS lado, * FROM pg_temp._f3_reparto_antes
     EXCEPT ALL
     SELECT 'antes', * FROM pg_temp._f3_reparto_despues)
    UNION ALL
    (SELECT 'despues' AS lado, * FROM pg_temp._f3_reparto_despues
     EXCEPT ALL
     SELECT 'despues', * FROM pg_temp._f3_reparto_antes)
  )
  SELECT (SELECT COUNT(*)::INTEGER FROM diferencias),
         (SELECT string_agg(format('%s: orden %s, usuario %s, %s, %s',
                                   x.lado, x.orden_id, x.usuario_id, x.especialidad, x.monto), '; ')
          FROM (SELECT * FROM diferencias LIMIT 20) x)
    INTO v_cambios, v_detalle;

  IF v_cambios > 0 THEN
    RAISE EXCEPTION 'Comisión por tarea: la fórmula nueva no da el mismo reparto que la vigente (% filas). Se deshace la migración. %',
      v_cambios, v_detalle;
  END IF;

  WITH ahora AS (
    SELECT id, orden_id, usuario_id, especialidad, monto, base_ganancia, porcentaje, tecnicos, pago_id
    FROM comisiones
  ),
  diferencias AS (
    (SELECT * FROM pg_temp._f3_comisiones_antes EXCEPT ALL SELECT * FROM ahora)
    UNION ALL
    (SELECT * FROM ahora EXCEPT ALL SELECT * FROM pg_temp._f3_comisiones_antes)
  )
  SELECT COUNT(*)::INTEGER INTO v_cambios FROM diferencias;

  IF v_cambios > 0 OR EXISTS (SELECT 1 FROM comisiones WHERE labor_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Comisión por tarea: la migración cambió la tabla de comisiones (% filas). Se deshace la migración.',
      v_cambios;
  END IF;
END $$;

DROP TABLE IF EXISTS pg_temp._f3_reparto_antes;
DROP TABLE IF EXISTS pg_temp._f3_comisiones_antes;
DROP TABLE IF EXISTS pg_temp._f3_reparto_despues;
