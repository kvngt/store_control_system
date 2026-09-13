-- ====================================================================================
-- RESTORIFY — Notificaciones internas, push al teléfono y cola de envíos
-- ====================================================================================
-- Pedido del cliente: "un sistema de notificaciones realmente útil para el
-- mecánico: que le lleguen cuando tiene una orden nueva, cuando ya está
-- autorizado para trabajar".
--
-- Lo que había: la campana del encabezado volvía a descargar TODAS las órdenes
-- cada 60 segundos, por pestaña, y deducía "alertas" en el navegador. Nada se
-- guardaba, nada se marcaba como leído, y con la app cerrada no llegaba nada —
-- que en un teléfono de taller es casi siempre.
--
-- Lo que se construye:
--
--   notificaciones     una fila por aviso y por persona; la campana la lee en
--                      tiempo real (Supabase Realtime)
--   push_suscripciones los teléfonos de cada usuario que aceptaron push (PWA)
--   cola_envios        outbox: todo lo que sale de la plataforma (push hoy,
--                      correos al cliente en la fase 4) pasa por aquí, con
--                      reintentos, y queda registro de si llegó
--
-- Los avisos los generan triggers, no el navegador: así llegan igual los cree
-- quien los cree, desde la pantalla que sea, y no dependen de que alguien tenga
-- la app abierta. El envío lo hace la edge function `process-outbox`, que pg_net
-- llama al instante y pg_cron vuelve a llamar cada minuto como red de seguridad.
--
-- Configuración única fuera de este archivo (ver docs/deployment.md):
--   Vault:   restorify_project_url, restorify_functions_secret
--   Secrets: RESTORIFY_FUNCTIONS_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
-- Sin los secretos de Vault todo funciona igual salvo el envío: los avisos se
-- guardan y se ven en la campana, y la cola espera.

-- pg_net crea sus funciones en el esquema `net` y pg_cron en `cron` sin importar
-- el esquema que se indique; en Supabase ambas vienen disponibles para activar.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ------------------------------------------------------------------------------------
-- 1. Tablas.
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  sede_id     UUID REFERENCES sedes(id) ON DELETE CASCADE,
  -- asignacion | desasignacion | recepcion_tecnico | avance_tecnico |
  -- orden_finalizada | comision_generada (y los de presupuestos en la fase 5)
  tipo        TEXT NOT NULL,
  -- En español: es lo que se manda por push, donde no hay preferencia de idioma.
  titulo      TEXT NOT NULL,
  cuerpo      TEXT NOT NULL DEFAULT '',
  -- Los mismos datos sin redactar, para que la campana los traduzca al idioma
  -- que tenga elegido la persona.
  datos       JSONB NOT NULL DEFAULT '{}'::jsonb,
  orden_id    UUID REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  url         TEXT,
  leida_en    TIMESTAMP WITH TIME ZONE,
  creado_en   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario
  ON notificaciones (usuario_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_no_leidas
  ON notificaciones (usuario_id) WHERE leida_en IS NULL;

CREATE TABLE IF NOT EXISTS push_suscripciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  -- Un endpoint es un navegador en un dispositivo. Único: si otra persona inicia
  -- sesión en la misma tablet, la suscripción pasa a ser suya.
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  ultimo_error TEXT,
  creado_en   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_suscripciones_usuario ON push_suscripciones (usuario_id);

CREATE TABLE IF NOT EXISTS cola_envios (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal              TEXT NOT NULL CHECK (canal IN ('push', 'email')),
  -- push: usuario_id; email: dirección.
  destinatario       TEXT NOT NULL,
  plantilla          TEXT NOT NULL,
  datos              JSONB NOT NULL DEFAULT '{}'::jsonb,
  orden_id           UUID REFERENCES ordenes_trabajo(id) ON DELETE SET NULL,
  estado             TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'procesando', 'enviado', 'omitido', 'error')),
  intentos           INTEGER NOT NULL DEFAULT 0,
  ultimo_error       TEXT,
  enviar_despues_de  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  bloqueado_en       TIMESTAMP WITH TIME ZONE,
  -- Colapsa envíos repetidos mientras siguen pendientes (la fase 4 lo usa para
  -- que dos cambios de estatus seguidos lleguen al cliente como uno).
  clave_dedupe       TEXT,
  proveedor_id       TEXT,
  creado_en          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  enviado_en         TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_cola_envios_pendientes
  ON cola_envios (enviar_despues_de) WHERE estado = 'pendiente';
CREATE UNIQUE INDEX IF NOT EXISTS uq_cola_envios_dedupe
  ON cola_envios (clave_dedupe) WHERE clave_dedupe IS NOT NULL AND estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_cola_envios_orden ON cola_envios (orden_id, creado_en DESC);

-- ------------------------------------------------------------------------------------
-- 2. RLS.
-- ------------------------------------------------------------------------------------
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_suscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE cola_envios ENABLE ROW LEVEL SECURITY;

-- Cada quien ve, marca y borra solo lo suyo. Nadie inserta desde la API: los
-- avisos los escriben los triggers, que corren como SECURITY DEFINER.
DROP POLICY IF EXISTS "notificaciones_select" ON notificaciones;
CREATE POLICY "notificaciones_select" ON notificaciones FOR SELECT
  USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS "notificaciones_update" ON notificaciones;
CREATE POLICY "notificaciones_update" ON notificaciones FOR UPDATE
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS "notificaciones_delete" ON notificaciones;
CREATE POLICY "notificaciones_delete" ON notificaciones FOR DELETE
  USING (usuario_id = auth.uid());

-- Marcar como leído es lo único que se puede cambiar de un aviso.
CREATE OR REPLACE FUNCTION public.trg_guard_notificacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.titulo IS DISTINCT FROM OLD.titulo
     OR NEW.cuerpo IS DISTINCT FROM OLD.cuerpo
     OR NEW.datos IS DISTINCT FROM OLD.datos
     OR NEW.orden_id IS DISTINCT FROM OLD.orden_id
     OR NEW.url IS DISTINCT FROM OLD.url
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en THEN
    RAISE EXCEPTION 'Solo se puede marcar un aviso como leído.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificacion_guard ON notificaciones;
CREATE TRIGGER trg_notificacion_guard
  BEFORE UPDATE ON notificaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_notificacion();

-- Suscripciones: se leen y se borran las propias; se registran por RPC.
DROP POLICY IF EXISTS "push_suscripciones_select" ON push_suscripciones;
CREATE POLICY "push_suscripciones_select" ON push_suscripciones FOR SELECT
  USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS "push_suscripciones_delete" ON push_suscripciones;
CREATE POLICY "push_suscripciones_delete" ON push_suscripciones FOR DELETE
  USING (usuario_id = auth.uid());

-- La cola: un admin la puede consultar (en la fase 4, "correos enviados" por
-- orden). Nadie escribe desde la API.
DROP POLICY IF EXISTS "cola_envios_admin_select" ON cola_envios;
CREATE POLICY "cola_envios_admin_select" ON cola_envios FOR SELECT
  USING (public.is_admin());

-- La campana escucha los avisos nuevos en tiempo real. Realtime respeta RLS, así
-- que cada quien recibe solo los suyos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notificaciones'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;
  END IF;
END;
$$;

-- ------------------------------------------------------------------------------------
-- 3. Llamar a una edge function desde la base.
-- ------------------------------------------------------------------------------------
-- pg_net es asíncrono: encola la petición y la manda un proceso aparte después
-- del COMMIT, así que llamarlo desde un trigger no hace esperar a nadie, y si la
-- transacción se revierte la petición se revierte con ella.
--
-- La URL y el secreto viven en Vault, no en este archivo: una migración se
-- commitea, y un secreto en git es un secreto publicado.
CREATE OR REPLACE FUNCTION public.invoke_edge_function(p_name TEXT, p_body JSONB DEFAULT '{}'::jsonb)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'restorify_project_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'restorify_functions_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    -- Sin configurar (entorno local, o recién desplegado): los avisos esperan en
    -- la cola en vez de fallar la operación que los generó.
    RETURN NULL;
  END IF;

  RETURN net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-restorify-secret', v_secret),
    body := p_body,
    timeout_milliseconds := 10000
  );
EXCEPTION WHEN OTHERS THEN
  -- Un aviso que no se pudo despachar nunca debe tumbar, por ejemplo, la
  -- asignación de un técnico. El cron lo vuelve a intentar.
  RAISE WARNING 'invoke_edge_function(%): %', p_name, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_edge_function(TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 4. Crear avisos.
-- ------------------------------------------------------------------------------------
-- Admins a los que les toca una sede: los de esa sede; si la sede no tiene
-- ninguno, todos. Cubre los dos arreglos posibles — un encargado por taller, o
-- un dueño que administra los dos — sin configuración.
CREATE OR REPLACE FUNCTION public.admins_de_sede(p_sede_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT array_agg(id) FROM perfiles WHERE rol = 'admin' AND sede_id = p_sede_id),
    (SELECT array_agg(id) FROM perfiles WHERE rol = 'admin'),
    ARRAY[]::UUID[]
  );
$$;

REVOKE ALL ON FUNCTION public.admins_de_sede(UUID) FROM PUBLIC, anon, authenticated;

-- "ORD-2026-014 · 2019 Toyota Camry" y los datos para armar el texto.
CREATE OR REPLACE FUNCTION public.datos_orden_aviso(p_orden_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'orden_id', o.id,
    'numero_orden', o.numero_orden,
    'sede_id', o.sede_id,
    'vehiculo', btrim(concat_ws(' ', v.anio::text, v.marca, v.modelo)),
    'cliente', c.nombre
  )
  FROM ordenes_trabajo o
  LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
  LEFT JOIN clientes c ON c.id = o.cliente_id
  WHERE o.id = p_orden_id;
$$;

REVOKE ALL ON FUNCTION public.datos_orden_aviso(UUID) FROM PUBLIC, anon, authenticated;

/**
 * Crea un aviso para cada destinatario y encola su push.
 *
 * Nunca avisa a quien hizo la acción: un técnico que se une a una orden no
 * necesita que su teléfono le cuente que se unió.
 *
 * El push solo se encola para quien tiene al menos un teléfono suscrito; los
 * demás ven el aviso en la campana y la cola no se llena de envíos sin destino.
 */
CREATE OR REPLACE FUNCTION public.notificar(
  p_usuarios UUID[],
  p_tipo     TEXT,
  p_titulo   TEXT,
  p_cuerpo   TEXT,
  p_datos    JSONB DEFAULT '{}'::jsonb,
  p_orden_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_sede   UUID;
  v_url    TEXT;
  v_count  INTEGER := 0;
  v_pushes INTEGER := 0;
  r        RECORD;
BEGIN
  IF p_usuarios IS NULL OR array_length(p_usuarios, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT sede_id INTO v_sede FROM ordenes_trabajo WHERE id = p_orden_id;
  v_url := CASE WHEN p_orden_id IS NOT NULL THEN '/work-orders?open=' || p_orden_id::text ELSE '/' END;

  FOR r IN
    INSERT INTO notificaciones (usuario_id, sede_id, tipo, titulo, cuerpo, datos, orden_id, url)
    SELECT DISTINCT u, v_sede, p_tipo, p_titulo, COALESCE(p_cuerpo, ''), COALESCE(p_datos, '{}'::jsonb), p_orden_id, v_url
    FROM unnest(p_usuarios) AS u
    WHERE u IS NOT NULL
      AND u IS DISTINCT FROM v_actor
    RETURNING id, usuario_id, titulo, cuerpo, url
  LOOP
    v_count := v_count + 1;
    IF EXISTS (SELECT 1 FROM push_suscripciones WHERE usuario_id = r.usuario_id) THEN
      INSERT INTO cola_envios (canal, destinatario, plantilla, datos, orden_id)
      VALUES (
        'push',
        r.usuario_id::text,
        'notificacion',
        jsonb_build_object(
          'notificacion_id', r.id,
          'titulo', r.titulo,
          'cuerpo', r.cuerpo,
          'url', r.url,
          -- Un tag por orden y tipo: dos avisos iguales seguidos se reemplazan
          -- en la bandeja del teléfono en vez de apilarse.
          'tag', p_tipo || ':' || COALESCE(p_orden_id::text, r.id::text)
        ),
        p_orden_id
      );
      v_pushes := v_pushes + 1;
    END IF;
  END LOOP;

  IF v_pushes > 0 THEN
    PERFORM public.invoke_edge_function('process-outbox');
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notificar(UUID[], TEXT, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 5. Cuándo se avisa.
-- ------------------------------------------------------------------------------------
-- Cada trigger atrapa sus propios errores: un aviso que falla nunca debe impedir
-- la operación de negocio que lo generó.

-- 5a. Asignado / quitado de una orden → el técnico.
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
      d := public.datos_orden_aviso(NEW.orden_id);
      PERFORM public.notificar(
        ARRAY[NEW.usuario_id],
        'asignacion',
        'Nueva orden asignada · ' || (d->>'numero_orden'),
        concat_ws(' — ', NULLIF(d->>'vehiculo', ''), NULLIF(d->>'cliente', '')),
        d,
        NEW.orden_id
      );
    ELSIF TG_OP = 'DELETE' THEN
      d := public.datos_orden_aviso(OLD.orden_id);
      -- Si la orden se está borrando entera no queda nada que avisar.
      IF d IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS trg_assignment_notify ON orden_asignaciones;
CREATE TRIGGER trg_assignment_notify
  AFTER INSERT OR DELETE ON orden_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_assignment();

-- 5b. Un técnico registra una recepción → los admins: hay que cotizar.
CREATE OR REPLACE FUNCTION public.trg_notify_order_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       JSONB;
  v_quien TEXT;
BEGIN
  BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      d := public.datos_orden_aviso(NEW.id);
      SELECT nombre_completo INTO v_quien FROM perfiles WHERE id = auth.uid();
      PERFORM public.notificar(
        public.admins_de_sede(NEW.sede_id),
        'recepcion_tecnico',
        'Recepción registrada · ' || NEW.numero_orden,
        COALESCE(v_quien, 'Un técnico') || ' recibió ' || COALESCE(NULLIF(d->>'vehiculo', ''), 'un vehículo') || '. Falta cotizar.',
        d || jsonb_build_object('actor', v_quien),
        NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_order_created: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- AFTER INSERT de la orden corre antes de que create_work_order inserte las
-- asignaciones, pero no las necesita: solo usa la orden, el vehículo y el cliente.
DROP TRIGGER IF EXISTS trg_order_created_notify ON ordenes_trabajo;
CREATE TRIGGER trg_order_created_notify
  AFTER INSERT ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_order_created();

-- 5c. Una orden queda terminada → los admins: lista para entregar.
CREATE OR REPLACE FUNCTION public.trg_notify_order_finished()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d JSONB;
BEGIN
  BEGIN
    IF NEW.estatus = 'finalizado' AND OLD.estatus IS DISTINCT FROM 'finalizado' THEN
      d := public.datos_orden_aviso(NEW.id);
      PERFORM public.notificar(
        public.admins_de_sede(NEW.sede_id),
        'orden_finalizada',
        'Lista para entregar · ' || NEW.numero_orden,
        concat_ws(' — ', NULLIF(d->>'vehiculo', ''), NULLIF(d->>'cliente', '')),
        d,
        NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_order_finished: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_finished_notify ON ordenes_trabajo;
CREATE TRIGGER trg_order_finished_notify
  AFTER UPDATE OF estatus ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_order_finished();

-- 5d. Un técnico documenta un avance → los admins: puede haber fotos o videos
--     que publicar al cliente. Un aviso por avance, no por archivo: diez fotos no
--     son diez notificaciones.
CREATE OR REPLACE FUNCTION public.trg_notify_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       JSONB;
  v_quien TEXT;
  v_texto TEXT;
BEGIN
  BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      d := public.datos_orden_aviso(NEW.orden_id);
      SELECT nombre_completo INTO v_quien FROM perfiles WHERE id = NEW.usuario_id;
      v_texto := NULLIF(btrim(NEW.descripcion), '');
      PERFORM public.notificar(
        public.admins_de_sede((d->>'sede_id')::uuid),
        'avance_tecnico',
        'Nuevo avance · ' || (d->>'numero_orden'),
        COALESCE(v_quien, 'Un técnico') || ': ' ||
          COALESCE(left(v_texto, 120), 'agregó archivos. Revisa si hay algo para mostrar al cliente.'),
        d || jsonb_build_object('actor', v_quien, 'avance_id', NEW.id),
        NEW.orden_id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_progress: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_progress_notify ON orden_avances;
CREATE TRIGGER trg_progress_notify
  AFTER INSERT ON orden_avances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_progress();

-- 5e. Se genera una comisión → el técnico. Es la razón por la que ve la mano de
--     obra; saber cuándo se devengó cierra ese círculo.
--     Solo al insertar: un recálculo (ON CONFLICT DO UPDATE) no es una comisión nueva.
CREATE OR REPLACE FUNCTION public.trg_notify_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d JSONB;
BEGIN
  BEGIN
    d := public.datos_orden_aviso(NEW.orden_id);
    PERFORM public.notificar(
      ARRAY[NEW.usuario_id],
      'comision_generada',
      'Comisión generada · ' || (d->>'numero_orden'),
      '$' || to_char(NEW.monto, 'FM999,999,990.00') || ' por la mano de obra de ' ||
        COALESCE(NULLIF(d->>'vehiculo', ''), 'la orden'),
      d || jsonb_build_object('monto', NEW.monto),
      NEW.orden_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_commission: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_notify ON comisiones;
CREATE TRIGGER trg_commission_notify
  AFTER INSERT ON comisiones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_commission();

-- ------------------------------------------------------------------------------------
-- 6. Registrar el teléfono de alguien para push.
-- ------------------------------------------------------------------------------------
-- RPC y no INSERT directo: si en la tablet del taller cambia quién inició sesión,
-- el mismo endpoint tiene que pasar a la persona nueva, y RLS no deja tocar la
-- fila de otro usuario. Sin esto, los avisos del técnico anterior seguirían
-- llegando a una tablet que ya usa otra persona.
CREATE OR REPLACE FUNCTION public.registrar_push(
  p_endpoint   TEXT,
  p_p256dh     TEXT,
  p_auth       TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para activar las notificaciones.' USING ERRCODE = '42501';
  END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://' THEN
    RAISE EXCEPTION 'Suscripción push inválida.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO push_suscripciones (usuario_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET usuario_id = EXCLUDED.usuario_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        ultimo_error = NULL,
        actualizado_en = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_push(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_push(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Al cerrar sesión, el dispositivo deja de recibir los avisos de esa persona.
CREATE OR REPLACE FUNCTION public.eliminar_push(p_endpoint TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM push_suscripciones WHERE endpoint = p_endpoint AND usuario_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.eliminar_push(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_push(TEXT) TO authenticated;

-- "Enviar prueba" desde Configuración: la forma más corta de confirmar, en el
-- propio teléfono, que todo el camino funciona (permiso, suscripción, VAPID,
-- edge function, entrega). No crea un aviso en la campana; solo el push.
-- Máximo uno por minuto por persona, para que el botón no sirva para inundar.
CREATE OR REPLACE FUNCTION public.probar_push()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para probar las notificaciones.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM push_suscripciones WHERE usuario_id = auth.uid()) THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM cola_envios
    WHERE canal = 'push' AND plantilla = 'prueba' AND destinatario = auth.uid()::text
      AND creado_en > NOW() - INTERVAL '1 minute'
  ) THEN
    RETURN TRUE;
  END IF;

  INSERT INTO cola_envios (canal, destinatario, plantilla, datos)
  VALUES (
    'push',
    auth.uid()::text,
    'prueba',
    jsonb_build_object(
      'titulo', 'Notificaciones activas',
      'cuerpo', 'Así te van a llegar las órdenes asignadas y los trabajos autorizados.',
      'url', '/settings',
      'tag', 'prueba'
    )
  );
  PERFORM public.invoke_edge_function('process-outbox');
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.probar_push() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.probar_push() TO authenticated;

-- Para Configuración → Usuarios: quién tiene al menos un teléfono con push.
-- Solo ids y conteos: el endpoint identifica un dispositivo y no hace falta verlo.
CREATE OR REPLACE FUNCTION public.usuarios_con_push()
RETURNS TABLE (usuario_id UUID, dispositivos INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar esto.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.usuario_id, COUNT(*)::INTEGER
    FROM push_suscripciones s
    GROUP BY s.usuario_id;
END;
$$;

REVOKE ALL ON FUNCTION public.usuarios_con_push() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuarios_con_push() TO authenticated;

-- ------------------------------------------------------------------------------------
-- 7. La cola, del lado del procesador.
-- ------------------------------------------------------------------------------------
-- Solo service_role (la edge function). `FOR UPDATE SKIP LOCKED`: si dos
-- invocaciones corren a la vez (el aviso inmediato y el cron del minuto), cada
-- fila la toma una sola.
CREATE OR REPLACE FUNCTION public.claim_outbox(p_limit INTEGER DEFAULT 25)
RETURNS SETOF cola_envios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Una invocación que murió a mitad (timeout, despliegue) deja filas tomadas;
  -- después de 5 minutos vuelven a estar disponibles.
  UPDATE cola_envios
  SET estado = 'pendiente', bloqueado_en = NULL
  WHERE estado = 'procesando' AND bloqueado_en < NOW() - INTERVAL '5 minutes';

  RETURN QUERY
  UPDATE cola_envios c
  SET estado = 'procesando', intentos = c.intentos + 1, bloqueado_en = NOW()
  WHERE c.id IN (
    SELECT id FROM cola_envios
    WHERE estado = 'pendiente' AND enviar_despues_de <= NOW()
    ORDER BY enviar_despues_de, creado_en
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_outbox(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbox(INTEGER) TO service_role;

-- Cierra un envío. Un fallo reintentable vuelve a la cola con espera creciente
-- (1, 4, 16, 64 minutos); al quinto intento queda en error para revisarlo.
CREATE OR REPLACE FUNCTION public.finish_outbox(
  p_id           UUID,
  p_estado       TEXT,
  p_error        TEXT DEFAULT NULL,
  p_proveedor_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intentos INTEGER;
BEGIN
  SELECT intentos INTO v_intentos FROM cola_envios WHERE id = p_id;

  IF p_estado = 'reintentar' THEN
    IF COALESCE(v_intentos, 0) >= 5 THEN
      UPDATE cola_envios
      SET estado = 'error', ultimo_error = left(p_error, 1000), bloqueado_en = NULL
      WHERE id = p_id;
    ELSE
      UPDATE cola_envios
      SET estado = 'pendiente',
          ultimo_error = left(p_error, 1000),
          bloqueado_en = NULL,
          enviar_despues_de = NOW() + (INTERVAL '1 minute' * power(4, GREATEST(COALESCE(v_intentos, 1) - 1, 0)))
      WHERE id = p_id;
    END IF;
    RETURN;
  END IF;

  IF p_estado NOT IN ('enviado', 'omitido', 'error') THEN
    RAISE EXCEPTION 'Estado de envío inválido: %', p_estado;
  END IF;

  UPDATE cola_envios
  SET estado = p_estado,
      ultimo_error = left(p_error, 1000),
      proveedor_id = COALESCE(p_proveedor_id, proveedor_id),
      bloqueado_en = NULL,
      enviado_en = CASE WHEN p_estado = 'enviado' THEN NOW() ELSE enviado_en END
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_outbox(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_outbox(UUID, TEXT, TEXT, TEXT) TO service_role;

-- El cron llama al procesador solo si hay algo que procesar: 1.440 invocaciones
-- vacías al día no cuestan casi nada, pero tampoco sirven de nada.
CREATE OR REPLACE FUNCTION public.dispatch_outbox_if_due()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cola_envios
    WHERE (estado = 'pendiente' AND enviar_despues_de <= NOW())
       OR (estado = 'procesando' AND bloqueado_en < NOW() - INTERVAL '5 minutes')
  ) THEN
    PERFORM public.invoke_edge_function('process-outbox');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_outbox_if_due() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 8. Mantenimiento.
-- ------------------------------------------------------------------------------------
-- Avisos leídos de más de 60 días y envíos cerrados de más de 90: la campana y
-- el historial no necesitan más, y la base del plan son 8 GB.
CREATE OR REPLACE FUNCTION public.purge_old_notifications()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM notificaciones WHERE leida_en IS NOT NULL AND creado_en < NOW() - INTERVAL '60 days';
  DELETE FROM notificaciones WHERE creado_en < NOW() - INTERVAL '180 days';
  DELETE FROM cola_envios WHERE estado IN ('enviado', 'omitido') AND creado_en < NOW() - INTERVAL '90 days';
$$;

REVOKE ALL ON FUNCTION public.purge_old_notifications() FROM PUBLIC, anon, authenticated;

-- Archivos del bucket de multimedia que ya no pertenecen a nada. La base no
-- puede borrar objetos de Storage (lo hace la edge function `cleanup-storage`),
-- pero sí puede decir cuáles son:
--   - los de una orden que ya no existe (borrar una sede entera se lleva sus
--     órdenes en cascada, y con ellas las filas que decían qué archivos eran), o
--   - los que ninguna fila de orden_media menciona, si no son firmas (que se
--     conservan a propósito como historial) y tienen más de 7 días — el margen
--     para que una subida que quedó a medias en un teléfono termine de guardarse.
CREATE OR REPLACE FUNCTION public.archivos_huerfanos(p_limit INTEGER DEFAULT 500)
RETURNS TABLE (nombre TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'orden_media'
    AND o.created_at < NOW() - INTERVAL '7 days'
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.ordenes_trabajo t
        WHERE t.id::text = (storage.foldername(o.name))[2]
      )
      OR (
        o.name NOT LIKE '%/firma-%'
        AND NOT EXISTS (
          SELECT 1 FROM public.orden_media m
          WHERE m.ruta = o.name OR m.ruta_miniatura = o.name
        )
      )
    )
  ORDER BY o.created_at
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

REVOKE ALL ON FUNCTION public.archivos_huerfanos(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archivos_huerfanos(INTEGER) TO service_role;

-- ------------------------------------------------------------------------------------
-- 9. Tareas programadas.
-- ------------------------------------------------------------------------------------
-- `cron.schedule` con un nombre ya existente lo reemplaza, así que re-aplicar
-- esta migración no duplica tareas.
SELECT cron.schedule('restorify-outbox', '* * * * *', $$SELECT public.dispatch_outbox_if_due()$$);

-- 09:00 UTC = 03:00–04:00 en el centro de EE. UU.: nadie está subiendo nada.
SELECT cron.schedule(
  'restorify-maintenance',
  '0 9 * * *',
  $$SELECT public.purge_old_notifications(); SELECT public.invoke_edge_function('cleanup-storage');$$
);
