-- ------------------------------------------------------------------------------------
-- Historial de la orden: quién cambió qué, y cuándo
-- ------------------------------------------------------------------------------------
-- Pedido del taller (reunión del 03/10/2026): "debemos dar trazabilidad a los problemas que
-- nos reportan los clientes". El primer reporte del día lo mostró: una orden apareció
-- Finalizada en 0 % y no había forma de saber quién movió el avance ni cuándo. Ninguna
-- tabla guardaba eso.
--
-- `historial_orden` es una bitácora de solo agregar. La escriben triggers AFTER sobre la
-- orden y sus hijas; nadie la escribe por la API, y solo un admin la lee. Cada fila dice:
--   * quién (`actor_id` y `actor_nombre`; el nombre como texto porque `delete-employee`
--     borra el perfil y el historial tiene que seguir diciendo quién fue),
--   * desde dónde (`origen`: 'app' = una sesión del taller; 'portal' = la llave de servicio,
--     que en las tablas de la orden solo usa la función `portal` cuando el cliente responde
--     un presupuesto; 'sistema' = cron, migraciones),
--   * qué (`entidad`, `accion`, `resumen`) y el antes → después de cada campo (`cambios`).
--
-- Decisiones:
--   * Sin FK a la orden y con una copia de `numero_orden`: el historial sobrevive al borrado
--     de la orden, que es justo cuando más se pregunta "¿quién la borró?". Las filas hijas
--     que se van en cascada con la orden no se registran una por una: se registra el borrado
--     de la orden.
--   * Solo las columnas que alguien decide. Los totales (`total_labor`, `orden_montos.total_*`)
--     los reescribe `recalculate_order_totals` con cada línea; registrarlos duplicaría cada
--     cambio. Las listas `UPDATE OF` hacen que esos recálculos ni siquiera disparen el trigger,
--     y un cambio sin diferencias reales no deja fila.
--   * A prueba de fallas: cada registro va dentro de BEGIN/EXCEPTION con un WARNING. Un error
--     del historial nunca debe impedir que se entregue una orden. Es preferible perder una
--     fila del historial que bloquear al taller.
--   * Fuera de Realtime: es de consulta, no de pantalla viva (`15_tiempo_real.test.sql` fija
--     la lista exacta de tablas publicadas).
--
-- Agregar una columna a lo que se registra: reescribir `trg_historial` en una migración nueva
-- con el campo en la lista de su tabla, y agregarlo a la lista `UPDATE OF` del trigger.
-- ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS historial_orden (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden_id     UUID NOT NULL,
  numero_orden TEXT,
  sede_id      UUID,
  ocurrido_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id     UUID,
  actor_nombre TEXT,
  origen       TEXT NOT NULL CHECK (origen IN ('app', 'portal', 'sistema')),
  entidad      TEXT NOT NULL CHECK (entidad IN (
                 'orden', 'mano_obra', 'repuesto', 'asignacion', 'deposito',
                 'presupuesto', 'archivo', 'avance')),
  entidad_id   UUID,
  accion       TEXT NOT NULL CHECK (accion IN ('crear', 'cambiar', 'borrar')),
  -- Cómo se llama la fila para quien lee: la descripción de la línea, el nombre del técnico…
  resumen      TEXT,
  cambios      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_historial_orden_orden
  ON historial_orden (orden_id, ocurrido_en DESC, id DESC);

ALTER TABLE historial_orden ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS historial_orden_admin_select ON historial_orden;
CREATE POLICY historial_orden_admin_select ON historial_orden
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

-- Supabase concede todo sobre una tabla nueva a `anon` y `authenticated`. Aquí solo se lee,
-- y solo con sesión (la política decide quién).
REVOKE ALL ON historial_orden FROM PUBLIC, anon, authenticated;
GRANT SELECT ON historial_orden TO authenticated;


-- ------------------------------------------------------------------------------------
-- Ayudantes
-- ------------------------------------------------------------------------------------

-- Los campos que cambiaron entre dos versiones de una fila: {campo: {antes, despues}}.
CREATE OR REPLACE FUNCTION public._historial_diferencias(p_antes JSONB, p_despues JSONB, p_campos TEXT[])
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(c, jsonb_build_object('antes', p_antes -> c, 'despues', p_despues -> c)),
    '{}'::jsonb)
  FROM unnest(p_campos) AS c
  WHERE (p_antes -> c) IS DISTINCT FROM (p_despues -> c);
$$;

-- Los valores de una fila que se crea o se borra, sin los vacíos: {campo: {clave: valor}}.
CREATE OR REPLACE FUNCTION public._historial_valores(p_fila JSONB, p_campos TEXT[], p_clave TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(c, jsonb_build_object(p_clave, p_fila -> c)), '{}'::jsonb)
  FROM unnest(p_campos) AS c
  WHERE p_fila -> c IS NOT NULL
    AND p_fila -> c <> 'null'::jsonb
    AND p_fila -> c <> '""'::jsonb;
$$;

REVOKE ALL ON FUNCTION public._historial_diferencias(JSONB, JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._historial_valores(JSONB, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- El trigger
-- ------------------------------------------------------------------------------------
-- Uno solo para todas las tablas: qué campos se registran y cómo se llama la fila lo decide
-- el CASE de abajo según la tabla.
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
        v_campos := ARRAY['descripcion', 'costo', 'especialidad', 'estado', 'completado_en'];
      WHEN 'orden_repuestos' THEN
        v_entidad := 'repuesto';
        v_resumen := v_fila ->> 'descripcion';
        v_campos := ARRAY['descripcion', 'cantidad', 'precio_venta_unitario', 'estado'];
      WHEN 'orden_asignaciones' THEN
        v_entidad := 'asignacion';
        SELECT nombre_completo INTO v_resumen FROM perfiles WHERE id = (v_fila ->> 'usuario_id')::uuid;
        v_campos := ARRAY['tipo_tarea'];
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

-- Solo la llaman los triggers, que corren como su dueño: ningún GRANT.
REVOKE ALL ON FUNCTION public.trg_historial() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- Dónde se engancha
-- ------------------------------------------------------------------------------------
-- `UPDATE OF` con las mismas columnas que el CASE: un recálculo de totales no dispara nada.

DROP TRIGGER IF EXISTS trg_historial ON ordenes_trabajo;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF
    estatus, porcentaje_avance, tipo_trabajo, fecha_estimada_entrega, millas_ingreso,
    nivel_gasolina, inspeccion_360_notas, cliente_id, vehiculo_id, firma_fecha,
    motivo_autorizacion, archivada_en
  ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

DROP TRIGGER IF EXISTS trg_historial ON orden_labor;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF descripcion, costo, especialidad, estado, completado_en
  ON orden_labor
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

DROP TRIGGER IF EXISTS trg_historial ON orden_repuestos;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF descripcion, cantidad, precio_venta_unitario, estado
  ON orden_repuestos
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

DROP TRIGGER IF EXISTS trg_historial ON orden_asignaciones;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF tipo_tarea
  ON orden_asignaciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

-- Solo el depósito: la fila nace en cero con la orden y sus totales los escribe el sistema.
DROP TRIGGER IF EXISTS trg_historial ON orden_montos;
CREATE TRIGGER trg_historial
  AFTER UPDATE OF deposito_inicial
  ON orden_montos
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

DROP TRIGGER IF EXISTS trg_historial ON presupuestos;
CREATE TRIGGER trg_historial
  AFTER INSERT OR UPDATE OF estado, total_propuesto
  ON presupuestos
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

DROP TRIGGER IF EXISTS trg_historial ON orden_media;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF visible_cliente
  ON orden_media
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();

DROP TRIGGER IF EXISTS trg_historial ON orden_avances;
CREATE TRIGGER trg_historial
  AFTER INSERT OR DELETE OR UPDATE OF descripcion, visible_cliente
  ON orden_avances
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();
