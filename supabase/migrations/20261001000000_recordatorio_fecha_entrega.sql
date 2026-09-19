-- ------------------------------------------------------------------------------------
-- Aviso diario de órdenes que pasaron su fecha de entrega
-- ------------------------------------------------------------------------------------
-- `fecha_estimada_entrega` existe desde el primer día y nadie la vigilaba: una orden podía
-- pasarse una semana sin que el sistema dijera nada. La pantalla ya la pinta en rojo, pero
-- eso solo lo ve quien entra a mirar.
--
-- Copia estructural de `recordar_presupuestos_sin_respuesta` (20260924000000): barrido con
-- `FOR UPDATE SKIP LOCKED`, una columna para no repetir el aviso el mismo día, `notificar()`
-- y un `cron.schedule` con nombre fijo (reaplicar la migración lo reemplaza, no lo duplica).
--
-- El aviso va a los admins de la sede **y** a quien esté asignado: el retraso es
-- información de los dos lados.
--
-- Por qué el UPDATE del cron no choca con los guardias de la orden: corre como el rol del
-- cron, así que `auth.role() IS DISTINCT FROM 'authenticated'` hace que
-- `trg_guard_order_technician` y `trg_guard_order_money` salgan al principio;
-- `trg_order_portal` escucha `firma_ruta` y `estatus`, que no se tocan; y
-- `trg_progress_on_status` solo actúa si cambió el estatus. Y un técnico nunca podrá
-- escribir esta columna, porque `to_jsonb(NEW) - v_permitidas` la protege sin que nadie
-- tenga que acordarse de ese trigger.

ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS recordado_entrega_en TIMESTAMPTZ;

-- Para el barrido diario.
CREATE INDEX IF NOT EXISTS idx_ordenes_entrega_pendiente
  ON ordenes_trabajo (fecha_estimada_entrega)
  WHERE estatus NOT IN ('finalizado', 'entregado');

-- Para la lista de archivadas (`getArchivedWorkOrders`), que filtra por sede y ordena por
-- fecha de finalización.
CREATE INDEX IF NOT EXISTS idx_ordenes_archivo
  ON ordenes_trabajo (sede_id, fecha_finalizacion)
  WHERE estatus = 'entregado';


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
      -- La fecha del taller, no la del servidor: a las 15:00 UTC en Chicago son las 9 o 10
      -- de la mañana, y una orden que vence hoy no está vencida todavía.
      AND fecha_estimada_entrega < (NOW() AT TIME ZONE 'America/Chicago')::date
      AND (recordado_entrega_en IS NULL OR recordado_entrega_en < NOW() - INTERVAL '20 hours')
    FOR UPDATE SKIP LOCKED
  LOOP
    d := public.datos_orden_aviso(r.id);
    v_dias := GREATEST(1, ((NOW() AT TIME ZONE 'America/Chicago')::date - r.fecha_estimada_entrega));
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

-- 15:15 UTC y no 15:00, para no coincidir con el recordatorio de presupuestos.
SELECT cron.schedule(
  'restorify-due-reminders',
  '15 15 * * *',
  $$SELECT public.recordar_ordenes_vencidas()$$
);
