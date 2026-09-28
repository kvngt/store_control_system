-- ------------------------------------------------------------------------------------
-- El aviso de orden vencida se reemplaza cada día en vez de apilarse
-- ------------------------------------------------------------------------------------
-- El taller reportó que las notificaciones "se acumulan". La causa principal era esta:
-- `recordar_ordenes_vencidas` (20261001000000) avisa una vez al día por cada orden atrasada,
-- y cada aviso era una fila nueva. Una orden con una semana de retraso dejaba siete avisos
-- casi iguales en la campana — "7 días de retraso", "6 días", "5 días"… — de los que solo el
-- último dice algo. Al hacer esta migración había 20 avisos de este tipo para 4 pares
-- persona-orden: 16 eran copias viejas.
--
-- Ahora el barrido borra el aviso anterior de esa orden antes de crear el de hoy. Queda uno
-- por orden y por persona, siempre con los días de retraso al día, y sin leer: el empujón
-- diario sigue existiendo (incluido el push), lo que desaparece es el historial.
--
-- Borrar es seguro: ninguna tabla referencia `notificaciones` con una clave foránea, y un
-- aviso de retraso no es un registro que haya que conservar — la base ya purga los avisos a
-- los 60 días.
--
-- El resto de la función es la de 20261001000000 tal cual.

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

-- Las copias que ya se apilaron: se queda el aviso más reciente de cada orden y persona.
DELETE FROM notificaciones n
USING notificaciones m
WHERE n.tipo = 'orden_vencida'
  AND m.tipo = 'orden_vencida'
  AND n.orden_id = m.orden_id
  AND n.usuario_id = m.usuario_id
  AND (n.creado_en, n.id) < (m.creado_en, m.id);
