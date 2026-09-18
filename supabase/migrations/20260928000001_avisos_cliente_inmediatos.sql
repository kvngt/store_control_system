-- ------------------------------------------------------------------------------------
-- El aviso de recepción sale al firmar, y ningún aviso puede aplazarse para siempre
-- ------------------------------------------------------------------------------------
-- Dos cambios, los dos sobre cuándo sale un correo al cliente.
--
-- 1. RECEPCIÓN, AL FIRMAR. Hasta ahora se encolaba con dos minutos de espera para dar
--    tiempo a que subieran las fotos que el cliente ve al abrir el enlace. Desde el
--    mostrador eso se siente como que el correo no sale: el cliente firma, se va, y el
--    aviso llega cuando ya está en la calle.
--
--    Se descartó esperar a que termine la cola de subida: esa cola vive en el
--    IndexedDB del teléfono que firmó, así que si se cierra la pestaña o se va la
--    señal el correo no saldría nunca. Cambiar dos minutos por un correo que a veces
--    no llega es peor que el problema.
--
--    En su lugar, la espera se mide: si la orden ya tiene al menos una foto de
--    recepción registrada, sale al instante. Si todavía no ha aterrizado ninguna, se
--    espera 30 segundos para que lo primero que abra el cliente no sea un reporte
--    vacío. Efecto conocido y aceptado: una orden sin fotos por diseño también espera
--    esos 30 segundos, porque desde la base no se distingue "no hay fotos" de "las
--    fotos vienen en camino".
--
-- 2. NINGÚN AVISO SE APLAZA INDEFINIDAMENTE. `encolar_correo_cliente` colapsa avisos
--    repetidos con `ON CONFLICT`, pero además REINICIABA la espera: una orden que se
--    mueve por el tablero cada dos minutos empujaba su correo de estatus hacia
--    adelante una y otra vez, y el cliente no se enteraba de nada. Con `LEAST` la
--    ráfaga sigue siendo un solo correo, pero con la hora del primero. Que el correo
--    describa un cambio real ya lo garantiza `process-outbox`, que al enviar compara
--    contra `ultimo_estatus_enviado` y omite lo que ya se anunció.
--
--    Aplica igual a los avisos de avance y de presupuesto: en todos, dos toques
--    seguían siendo un correo, y ahora además sale a tiempo.

-- Solo cambia el ON CONFLICT; el resto se transcribe de 20260923000000.
CREATE OR REPLACE FUNCTION public.encolar_correo_cliente(
  p_orden_id     UUID,
  p_plantilla    TEXT,
  p_datos        JSONB DEFAULT '{}'::jsonb,
  p_clave_dedupe TEXT DEFAULT NULL,
  p_espera       INTERVAL DEFAULT INTERVAL '0 seconds'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  TEXT;
  v_acepta BOOLEAN;
  v_id     UUID;
BEGIN
  SELECT btrim(c.email), c.acepta_correos INTO v_email, v_acepta
  FROM ordenes_trabajo o
  JOIN clientes c ON c.id = o.cliente_id
  WHERE o.id = p_orden_id;

  IF NOT public.es_correo_valido(v_email) OR NOT COALESCE(v_acepta, false) THEN
    RETURN NULL;
  END IF;

  PERFORM public.asegurar_enlace_orden(p_orden_id);

  INSERT INTO cola_envios (canal, destinatario, plantilla, datos, orden_id, enviar_despues_de, clave_dedupe)
  VALUES ('email', lower(v_email), p_plantilla, COALESCE(p_datos, '{}'::jsonb), p_orden_id, NOW() + p_espera, p_clave_dedupe)
  ON CONFLICT (clave_dedupe) WHERE clave_dedupe IS NOT NULL AND estado = 'pendiente'
  DO UPDATE SET
    datos = EXCLUDED.datos,
    destinatario = EXCLUDED.destinatario,
    -- Nunca hacia adelante: el aviso se manda a la hora del primero de la ráfaga.
    enviar_despues_de = LEAST(cola_envios.enviar_despues_de, EXCLUDED.enviar_despues_de)
  RETURNING id INTO v_id;

  -- Sin espera, al instante. Con espera, lo toma el cron de cada minuto.
  IF p_espera <= INTERVAL '0 seconds' THEN
    PERFORM public.invoke_edge_function('process-outbox');
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.encolar_correo_cliente(UUID, TEXT, JSONB, TEXT, INTERVAL) FROM PUBLIC, anon, authenticated;


-- Solo cambia la espera de la rama de recepción; el resto se transcribe igual.
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
      IF NEW.estatus IN ('en_proceso', 'espera_repuestos', 'finalizado', 'entregado') THEN
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

-- El trigger no cambia de firma; se reemite por consistencia con la migración que
-- lo creó.
DROP TRIGGER IF EXISTS trg_order_portal ON ordenes_trabajo;
CREATE TRIGGER trg_order_portal
  AFTER UPDATE OF firma_ruta, estatus ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_portal_on_order_change();
