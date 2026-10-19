-- ====================================================================================
-- RESTORIFY — Enlace al crear, correo tras firma, auto inicio y toma de tareas (E0)
-- ====================================================================================
-- Cambios derivados de la prueba de campo con orden real (ORD-2026-008, 16/10/2026):
-- 1. El enlace del cliente nace con la orden (no espera a la firma de recepción).
--    Las órdenes abiertas existentes reciben su enlace activo si aún no lo tienen.
-- 2. El correo automático de aviso de 'en_proceso' espera a que la orden esté firmada
--    (antes de firmar no se envía correo de estado; la firma enviará el de recepción
--    con el enlace).
-- 3. La primera autorización (cuando un presupuesto pasa a 'respondido' con al menos una
--    línea aprobada) pasa la orden de 'recepcion' a 'en_proceso'.
-- 4. Asignar un mecánico/pintor de la sede a la orden le asigna automáticamente las
--    tareas no heredadas de su especialidad que estaban sin asignar y no rechazadas.
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. El enlace nace con la orden
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_enlace_al_crear_orden()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.asegurar_enlace_orden(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Un enlace que no nace no impide abrir la orden: se crea al firmar o con el botón.
    RAISE WARNING 'trg_enlace_al_crear_orden(%): %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_enlace_al_crear_orden() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_link_on_create ON ordenes_trabajo;
CREATE TRIGGER trg_order_link_on_create AFTER INSERT ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_enlace_al_crear_orden();

-- Asegurar enlace para órdenes abiertas que no tengan uno activo
SELECT public.asegurar_enlace_orden(o.id)
FROM ordenes_trabajo o
WHERE o.estatus <> 'entregado' AND o.archivada_en IS NULL
  AND NOT EXISTS (SELECT 1 FROM orden_enlaces e WHERE e.orden_id = o.id AND e.revocado_en IS NULL);

-- ------------------------------------------------------------------------------------
-- 2. El aviso automático «en proceso» espera la firma de recepción
-- Reescrita entera desde 20261010000021.sql:290
-- ------------------------------------------------------------------------------------
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

      -- 'finalizado' ya no encola: que el técnico finalice no es "listo para entregar". El correo
      -- de "listo" lo encola `marcar_lista_para_entregar`.
      -- Tres minutos de espera: quien mueve una orden de un lado a otro en el
      -- tablero no le manda tres correos al cliente. Qué estado se anuncia se
      -- decide al enviar, con el estatus de ese momento (ver datos_correo).
      -- Antes de firmar no se le escribe al cliente: el correo de recepción, al firmar,
      -- ya lleva el enlace.
      IF NEW.estatus IN ('en_proceso', 'entregado')
         AND NOT (NEW.estatus = 'en_proceso' AND NEW.firma_ruta IS NULL)
         AND NOT (
           OLD.estatus = 'espera_autorizacion' AND NEW.estatus = 'en_proceso'
           AND EXISTS (
             SELECT 1 FROM cola_envios
             WHERE orden_id = NEW.id AND canal = 'email' AND plantilla = 'estatus'
               AND estado IN ('pendiente', 'procesando', 'enviado')
           )
         ) THEN
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

-- ------------------------------------------------------------------------------------
-- 3. La primera autorización pone la orden en proceso
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_presupuesto_empieza_orden()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    UPDATE ordenes_trabajo o SET estatus = 'en_proceso'
    WHERE o.id = NEW.orden_id AND o.estatus = 'recepcion'
      AND (EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = NEW.orden_id AND estado = 'aprobado')
        OR EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = NEW.orden_id AND estado = 'aprobado'));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_presupuesto_empieza_orden(%): %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_presupuesto_empieza_orden() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_quote_starts_order ON presupuestos;
CREATE TRIGGER trg_quote_starts_order AFTER UPDATE OF estado ON presupuestos
  FOR EACH ROW WHEN (NEW.estado = 'respondido' AND OLD.estado IS DISTINCT FROM 'respondido')
  EXECUTE FUNCTION public.trg_presupuesto_empieza_orden();

-- ------------------------------------------------------------------------------------
-- 4. Asignar a un técnico le pasa las tareas sin técnico de su oficio
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_asignacion_toma_tareas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    UPDATE orden_labor l SET asignado_a = NEW.usuario_id
    FROM ordenes_trabajo o, perfiles p
    WHERE l.orden_id = NEW.orden_id AND o.id = NEW.orden_id AND p.id = NEW.usuario_id
      AND o.estatus <> 'entregado'
      AND p.rol IN ('mecanico', 'pintor') AND p.sede_id = o.sede_id
      AND l.asignado_a IS NULL AND l.reparto_heredado = false
      AND l.especialidad = NEW.tipo_tarea AND l.estado <> 'rechazado';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_asignacion_toma_tareas(%): %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_asignacion_toma_tareas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assignment_takes_tasks ON orden_asignaciones;
CREATE TRIGGER trg_assignment_takes_tasks AFTER INSERT ON orden_asignaciones
  FOR EACH ROW WHEN (NEW.origen = 'manual')
  EXECUTE FUNCTION public.trg_asignacion_toma_tareas();
