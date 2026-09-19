-- ------------------------------------------------------------------------------------
-- Cuando el cliente responde el presupuesto
-- ------------------------------------------------------------------------------------
-- Tres cambios sobre `_resolver_presupuesto` (20260924000000), transcrita entera porque un
-- `CREATE OR REPLACE` la reemplaza completa:
--
-- 1. AL RECHAZAR, EL TÉCNICO NO RECIBE AVISO. Hasta ahora recibía en los dos casos, y un
--    "presupuesto rechazado" en el teléfono de quien está trabajando no le dice qué hacer.
--    El aviso al equipo queda condicionado a que se haya aprobado algo.
--    Consecuencia que conviene saber: si el cliente rechaza TODO, el técnico no se enterará
--    por aviso. Se enterará porque la línea desaparece de lo aprobado y porque el admin se
--    lo dirá.
-- 2. El aviso a administración distingue en el título si el cliente autorizó o no.
-- 3. LA ORDEN SALE DE "ESPERA DE AUTORIZACIÓN". Sin esto, una orden que el mecánico mandó a
--    ese estado se quedaba ahí para siempre después de que el cliente autoriza: la trampa
--    más probable de este flujo. Va en su propio BEGIN…EXCEPTION porque el dinero ya quedó
--    asentado unas líneas arriba, y mover el tablero es cortesía: nunca debe poder revertir
--    una autorización.
--    No se toca si el cliente rechazó todo: la orden sigue esperando una decisión de
--    administración, y ese es justo el estado que lo dice.
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

  -- Autorizado algo: el taller puede seguir, así que la orden deja de esperar. En su propio
  -- bloque: el dinero ya está asentado y esto es cortesía de tablero.
  BEGIN
    IF v_n_aprob > 0 THEN
      UPDATE ordenes_trabajo
      SET estatus = 'en_proceso'
      WHERE id = v_p.orden_id AND estatus = 'espera_autorizacion';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_resolver_presupuesto estatus (%): %', v_p.id, SQLERRM;
  END;

  BEGIN
    d := public.datos_orden_aviso(v_p.orden_id);

    -- Al equipo, solo cuando hay trabajo que hacer. Un rechazo es una conversación de
    -- administración con el cliente, no una instrucción para el taller.
    IF v_n_aprob > 0 THEN
      PERFORM public.notificar(
        ARRAY(SELECT DISTINCT usuario_id FROM orden_asignaciones WHERE orden_id = v_p.orden_id),
        'presupuesto_respondido',
        'Trabajos autorizados · ' || (d->>'numero_orden'),
        concat_ws(' ',
          CASE WHEN v_autorizadas IS NOT NULL THEN 'Autorizado: ' || v_autorizadas || '.' END,
          CASE WHEN v_rechazadas IS NOT NULL THEN 'No realizar: ' || v_rechazadas || '.' END
        ),
        d || jsonb_build_object('presupuesto_id', v_p.id, 'autorizados', v_n_aprob, 'rechazados', v_n_rech, 'via', p_via),
        v_p.orden_id
      );
    END IF;

    -- A administración, cuando respondió el cliente por su cuenta.
    IF p_via = 'cliente_portal' THEN
      PERFORM public.notificar(
        public.admins_de_sede(v_p.sede_id),
        'presupuesto_respondido_cliente',
        CASE WHEN v_n_aprob > 0
          THEN 'El cliente respondió el presupuesto · '
          ELSE 'El cliente no autorizó el presupuesto · '
        END || (d->>'numero_orden'),
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

REVOKE ALL ON FUNCTION public._resolver_presupuesto(UUID, UUID[], TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
