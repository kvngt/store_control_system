-- ------------------------------------------------------------------------------------
-- "En espera de repuestos" pasa a ser "En espera de autorización"
-- ------------------------------------------------------------------------------------
-- Desde que los montos son solo de administración, un mecánico que descubre que hay que
-- cambiar una pieza no tiene forma de decirlo dentro del sistema: lo dice de viva voz y
-- alguien lo anota. Este estado cierra ese hueco. El mecánico manda la orden a "espera de
-- autorización" y escribe POR QUÉ; el admin recibe el aviso con ese motivo, carga mano de
-- obra y repuestos, y el presupuesto sale al cliente.
--
-- POR QUÉ `RENAME VALUE` Y NO `ADD VALUE`:
--   * `ALTER TYPE ... ADD VALUE` no se puede usar en la misma transacción que lo agrega, y
--     el CLI de Supabase envuelve cada migración en una: haría falta partirla en dos.
--   * Postgres no puede ELIMINAR un valor de un enum. Con `ADD VALUE`, `espera_repuestos`
--     quedaría vivo en el catálogo para siempre y un UPDATE con ese literal seguiría siendo
--     válido. Con `RENAME VALUE` el literal viejo pasa a ser inválido (22P02) de inmediato,
--     que es exactamente lo que se quiere.
--   * Es un cambio de catálogo: no reescribe la tabla ni pide soltar dependencias.
--
-- QUÉ NO HAY QUE TOCAR: el `DEFAULT 'recepcion'` de la columna (un DEFAULT se guarda como
-- expresión ya resuelta al valor del enum, así que sigue el renombre), ni las funciones que
-- declaran `v_estatus order_status` — referencian el TIPO, que no cambia de nombre ni de
-- OID. No hay vistas, índices, CHECK ni columnas generadas sobre `estatus`.
--
-- QUÉ SÍ: todo cuerpo plpgsql/SQL que contenga el LITERAL. Postgres no valida cuerpos al
-- renombrar, así que el error aparecería en producción. Son tres, y se reemiten abajo:
-- `trg_guard_order_technician`, `trg_portal_on_order_change` y `resumen_panel`.

-- ------------------------------------------------------------------------------------
-- 1. Las filas que ya estaban en el estado viejo
-- ------------------------------------------------------------------------------------
-- `RENAME VALUE` las reetiqueta en sitio: una orden que decía "esperando repuestos" pasa a
-- decir "esperando autorización", con el motivo vacío. La migración no adivina qué hacer
-- con ellas; avisa para que quien administra decida.
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_n FROM ordenes_trabajo WHERE estatus = 'espera_repuestos';
  IF v_n > 0 THEN
    RAISE NOTICE '% orden(es) quedan en espera_autorizacion sin motivo. Revísalas: estaban esperando repuestos, no autorización.', v_n;
  END IF;
END;
$$;

ALTER TYPE public.order_status RENAME VALUE 'espera_repuestos' TO 'espera_autorizacion';


-- ------------------------------------------------------------------------------------
-- 2. El motivo
-- ------------------------------------------------------------------------------------
-- Lo escribe el técnico al mover la orden, y es lo primero que el admin necesita leer
-- antes de cotizar. Se guarda en la orden y no en un avance porque es el estado el que lo
-- exige: sin motivo, el estado no se puede fijar.
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS motivo_autorizacion TEXT;

ALTER TABLE ordenes_trabajo DROP CONSTRAINT IF EXISTS ordenes_motivo_autorizacion_largo;
ALTER TABLE ordenes_trabajo ADD CONSTRAINT ordenes_motivo_autorizacion_largo
  CHECK (motivo_autorizacion IS NULL OR length(motivo_autorizacion) <= 1000);


-- ------------------------------------------------------------------------------------
-- 3. El guardia del técnico
-- ------------------------------------------------------------------------------------
-- Transcrito de 20260928000000 con cuatro cambios: `motivo_autorizacion` entra en la lista
-- de columnas que un técnico puede escribir (sin eso el trigger rechaza el UPDATE),
-- `v_estados_tecnico` usa el nombre nuevo, el motivo se normaliza para todos, y fijar el
-- estado sin motivo es un 42501 con la razón escrita para el taller.
CREATE OR REPLACE FUNCTION public.trg_guard_order_technician()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Lo único que un técnico cambia desde la app: estado (con su fecha de
  -- finalización y, si pide autorización, su motivo), porcentaje de avance y firma.
  -- total_labor lo vigila trg_guard_order_money, que deja pasar el recálculo del sistema.
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'fecha_finalizacion', 'porcentaje_avance',
    'firma_ruta', 'firma_fecha', 'total_labor', 'motivo_autorizacion'
  ];
  -- Los estados a los que el taller mueve una orden por su cuenta. `recepcion` no
  -- está: se sale de ahí, no se vuelve. `entregado` tampoco, y además lo para
  -- trg_guard_order_money.
  v_estados_tecnico CONSTANT order_status[] := ARRAY[
    'en_proceso', 'espera_autorizacion', 'finalizado'
  ]::order_status[];
BEGIN
  -- Normalización, antes de la salida del admin porque vale para todos: un motivo en
  -- blanco es no tener motivo, y el motivo solo significa algo mientras la orden espera
  -- autorización. Dejarlo puesto después mostraría un banner que ya no es cierto.
  NEW.motivo_autorizacion := NULLIF(btrim(left(COALESCE(NEW.motivo_autorizacion, ''), 1000)), '');
  IF NEW.estatus IS DISTINCT FROM 'espera_autorizacion' THEN
    NEW.motivo_autorizacion := NULL;
  END IF;

  -- La firma es un archivo de la carpeta de ESTA orden en el bucket privado. Vale
  -- para todos, admin incluido: apuntar a otra ruta mostraría en el reporte una
  -- firma que no es la de esta orden.
  IF NEW.firma_ruta IS DISTINCT FROM OLD.firma_ruta
     AND NEW.firma_ruta IS NOT NULL
     AND NEW.firma_ruta NOT LIKE NEW.sede_id::text || '/' || NEW.id::text || '/%' THEN
    RAISE EXCEPTION 'La firma debe guardarse en la carpeta de esta orden.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF OLD.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_assigned_to_order(OLD.id) THEN
    RAISE EXCEPTION 'Solo el personal asignado puede modificar esta orden. Únete a la orden primero.'
      USING ERRCODE = '42501';
  END IF;

  -- A dónde puede llevarla.
  IF NEW.estatus IS DISTINCT FROM OLD.estatus
     AND NOT (NEW.estatus = ANY (v_estados_tecnico)) THEN
    IF NEW.estatus = 'recepcion' THEN
      RAISE EXCEPTION 'Solo un administrador puede devolver una orden a Recepción.'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Solo un administrador puede poner la orden en ese estado.'
      USING ERRCODE = '42501';
  END IF;

  -- Pedir autorización sin decir por qué deja al admin adivinando qué cotizar.
  IF NEW.estatus = 'espera_autorizacion' AND NEW.motivo_autorizacion IS NULL THEN
    RAISE EXCEPTION 'Escribe por qué la orden necesita autorización.'
      USING ERRCODE = '42501';
  END IF;

  -- Quitar la firma rehace el respaldo de lo que el cliente autorizó.
  IF OLD.firma_ruta IS NOT NULL AND NEW.firma_ruta IS NULL THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la firma de recepción.'
      USING ERRCODE = '42501';
  END IF;

  -- Comparar la fila completa menos lo permitido, en vez de listar lo prohibido:
  -- una columna que se agregue mañana queda protegida sin acordarse de este trigger.
  IF (to_jsonb(NEW) - v_permitidas) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar los datos de recepción de una orden.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_guard_order_technician() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_technician_guard ON ordenes_trabajo;
CREATE TRIGGER trg_order_technician_guard
  BEFORE UPDATE ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_order_technician();


-- ------------------------------------------------------------------------------------
-- 4. Los correos al cliente
-- ------------------------------------------------------------------------------------
-- Transcrito de 20260928000001 con un solo cambio: `espera_autorizacion` NO se anuncia por
-- correo. Un "su vehículo espera autorización" antes de que exista el presupuesto no le
-- dice nada útil al cliente, y se pisa con el correo del presupuesto que sale minutos
-- después. El portal sí conserva su texto de estado, para quien abra el enlace entonces.
CREATE OR REPLACE FUNCTION public.trg_portal_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_espera INTERVAL;
BEGIN
  BEGIN
    -- La firma de recepción: nace el enlace y, si hay correo, el aviso de ingreso.
    -- Sale al instante cuando ya hay fotos de recepción registradas; si todavía no
    -- ha llegado ninguna, un piso corto para no mandar a un reporte vacío. Solo una
    -- vez por orden: volver a firmar no lo reenvía.
    IF NEW.firma_ruta IS NOT NULL AND OLD.firma_ruta IS NULL THEN
      PERFORM public.asegurar_enlace_orden(NEW.id);
      IF NOT EXISTS (
        SELECT 1 FROM cola_envios
        WHERE orden_id = NEW.id AND canal = 'email' AND plantilla = 'recepcion'
          AND estado IN ('pendiente', 'procesando', 'enviado')
      ) THEN
        v_espera := CASE
          WHEN EXISTS (
            SELECT 1 FROM orden_media m
            WHERE m.orden_id = NEW.id AND m.origen = 'recepcion'
          ) THEN INTERVAL '0 seconds'
          ELSE INTERVAL '30 seconds'
        END;
        PERFORM public.encolar_correo_cliente(NEW.id, 'recepcion', '{}'::jsonb, 'recepcion:' || NEW.id, v_espera);
      END IF;
    END IF;

    IF NEW.estatus IS DISTINCT FROM OLD.estatus THEN
      -- El enlace vive mientras el vehículo está en el taller y 90 días después.
      IF NEW.estatus = 'entregado' THEN
        UPDATE orden_enlaces SET expira_en = NOW() + INTERVAL '90 days'
        WHERE orden_id = NEW.id AND revocado_en IS NULL;
      ELSIF OLD.estatus = 'entregado' THEN
        UPDATE orden_enlaces SET expira_en = NULL
        WHERE orden_id = NEW.id AND revocado_en IS NULL;
      END IF;

      -- Tres minutos de espera: quien mueve una orden de un lado a otro en el
      -- tablero no le manda tres correos al cliente. Qué estado se anuncia se
      -- decide al enviar, con el estatus de ese momento (ver datos_correo).
      IF NEW.estatus IN ('en_proceso', 'finalizado', 'entregado') THEN
        PERFORM public.encolar_correo_cliente(
          NEW.id, 'estatus', jsonb_build_object('estatus', NEW.estatus), 'estatus:' || NEW.id, INTERVAL '3 minutes'
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Un aviso al cliente nunca debe impedir firmar o mover una orden.
    RAISE WARNING 'trg_portal_on_order_change(%): %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_portal_on_order_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_portal ON ordenes_trabajo;
CREATE TRIGGER trg_order_portal
  AFTER UPDATE OF firma_ruta, estatus ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_portal_on_order_change();


-- ------------------------------------------------------------------------------------
-- 5. El panel
-- ------------------------------------------------------------------------------------
-- Transcrito de 20260927000000. `ordenes_por_estatus` son cinco pares literales, así que
-- el renombre del enum no los sigue: el panel devolvería una clave que el frontend no
-- conoce y la tarjeta saldría en cero.
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
    SELECT estatus, fecha_finalizacion FROM ordenes_trabajo
    WHERE p_sede_id IS NULL OR sede_id = p_sede_id
  ),
  m AS (
    SELECT tipo, monto, fecha FROM finanzas_movimientos
    WHERE p_sede_id IS NULL OR sede_id = p_sede_id
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


-- ------------------------------------------------------------------------------------
-- 6. El aviso a administración
-- ------------------------------------------------------------------------------------
-- Copiado de trg_notify_order_finished (20260920000000): su propio BEGIN…EXCEPTION, porque
-- un aviso que falla nunca debe impedir que el mecánico mueva la orden.
--
-- El trigger escucha las DOS columnas: la app manda estado y motivo en un solo UPDATE, y
-- un trigger de fila corre una vez por sentencia, así que es un aviso y no dos. Escuchar
-- también el motivo hace que corregirlo vuelva a avisar, que es lo que se quiere: el admin
-- necesita el texto corregido.
CREATE OR REPLACE FUNCTION public.trg_notify_auth_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d JSONB;
BEGIN
  BEGIN
    IF NEW.estatus = 'espera_autorizacion'
       AND (OLD.estatus IS DISTINCT FROM NEW.estatus
            OR OLD.motivo_autorizacion IS DISTINCT FROM NEW.motivo_autorizacion) THEN
      d := public.datos_orden_aviso(NEW.id);
      PERFORM public.notificar(
        public.admins_de_sede(NEW.sede_id),
        'autorizacion_solicitada',
        'Requiere autorización · ' || NEW.numero_orden,
        left(COALESCE(NEW.motivo_autorizacion, ''), 200),
        d || jsonb_build_object('motivo', NEW.motivo_autorizacion),
        NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_auth_request: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_auth_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_auth_request_notify ON ordenes_trabajo;
CREATE TRIGGER trg_order_auth_request_notify
  AFTER UPDATE OF estatus, motivo_autorizacion ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_auth_request();
