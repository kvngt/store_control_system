-- ====================================================================================
-- Correo al técnico: orden asignada y respuesta del presupuesto (pedido del 06/10/2026)
-- ====================================================================================
-- Hasta aquí el técnico se enteraba solo por la campana y el push. El taller pidió que también
-- le llegue un correo cuando:
--   * le asignan una orden (`asignacion`) o una tarea (`tarea_asignada`), y
--   * el cliente autoriza o rechaza un presupuesto de su orden (`presupuesto_respondido`), para
--     saber si ya puede trabajar o no.
--
-- Cómo: `notificar` encola además un correo (`cola_envios`, canal 'email', plantilla
-- 'empleado') a `perfiles.email` para esos tipos. Lo manda `process-outbox` con su propia
-- plantilla (`renderEmployeeEmail`), nunca con la del cliente.
--
--   * **Sin `orden_id` en la fila del correo**, a propósito: `datos_correo` (los correos al
--     cliente) devuelve NULL para una fila sin orden, así que un `process-outbox` viejo que lo
--     tomara lo omitiría en vez de mandárselo al cliente. La orden viaja en `datos`.
--   * **Uno por orden y motivo**, aunque se asignen varias tareas seguidas: la clave
--     `empleado:<usuario>:<orden>:<grupo>` junta lo que llega mientras el correo espera (sale a
--     los 2 minutos) y suma cada línea al mismo correo.
--   * Como todo aviso, nunca bloquea la operación que lo generó: va en su propio bloque.
-- ====================================================================================

-- Desde 20260920000000. Cambia: correo al técnico para `asignacion`, `tarea_asignada` y
-- `presupuesto_respondido`.
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
  v_grupo  TEXT;
  v_email  TEXT;
  r        RECORD;
BEGIN
  IF p_usuarios IS NULL OR array_length(p_usuarios, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT sede_id INTO v_sede FROM ordenes_trabajo WHERE id = p_orden_id;
  v_url := CASE WHEN p_orden_id IS NOT NULL THEN '/work-orders?open=' || p_orden_id::text ELSE '/' END;
  -- Qué avisos llevan además correo, y cuáles se juntan en uno.
  v_grupo := CASE
    WHEN p_tipo IN ('asignacion', 'tarea_asignada') THEN 'asignacion'
    WHEN p_tipo = 'presupuesto_respondido' THEN 'presupuesto:' || COALESCE(p_datos->>'presupuesto_id', '')
  END;

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

    -- El correo al técnico (06/10/2026). En su propio bloque: un correo que no se pudo
    -- encolar no deja sin aviso en la campana ni frena la operación.
    IF v_grupo IS NOT NULL AND p_orden_id IS NOT NULL THEN
      BEGIN
        SELECT lower(btrim(p.email)) INTO v_email
        FROM perfiles p
        WHERE p.id = r.usuario_id AND p.rol IN ('mecanico', 'pintor');
        IF public.es_correo_valido(v_email) THEN
          INSERT INTO cola_envios (canal, destinatario, plantilla, datos, orden_id, clave_dedupe, enviar_despues_de)
          VALUES (
            'email',
            v_email,
            'empleado',
            jsonb_build_object(
              'usuario_id', r.usuario_id,
              'sede_id', v_sede,
              'orden', p_orden_id,
              'numero_orden', p_datos->>'numero_orden',
              'vehiculo', p_datos->>'vehiculo',
              'tipo', p_tipo,
              'titulo', r.titulo,
              'url', r.url,
              'lineas', jsonb_build_array(r.cuerpo)
            ),
            NULL,
            'empleado:' || r.usuario_id::text || ':' || p_orden_id::text || ':' || v_grupo,
            NOW() + INTERVAL '2 minutes'
          )
          ON CONFLICT (clave_dedupe) WHERE clave_dedupe IS NOT NULL AND estado = 'pendiente'
          DO UPDATE SET datos = jsonb_set(
            cola_envios.datos,
            '{lineas}',
            COALESCE(cola_envios.datos->'lineas', '[]'::jsonb) || to_jsonb(EXCLUDED.datos->'lineas'->>0)
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notificar correo al técnico (%): %', r.usuario_id, SQLERRM;
      END;
    END IF;
  END LOOP;

  IF v_pushes > 0 THEN
    PERFORM public.invoke_edge_function('process-outbox');
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notificar(UUID[], TEXT, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
