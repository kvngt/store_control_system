-- ------------------------------------------------------------------------------------
-- F6: Hallazgos y nueva espera de autorización (plan-mejoras-2026-10)
-- ------------------------------------------------------------------------------------
-- El mecánico reporta hallazgos (trabajo adicional) que pausan la orden. El admin
-- los cotiza o descarta. El cliente ve los descartados en su reporte.
-- ------------------------------------------------------------------------------------

CREATE TABLE orden_hallazgos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  sede_id uuid NOT NULL REFERENCES sedes(id) ON DELETE CASCADE,
  reportado_por uuid NOT NULL REFERENCES perfiles(id),
  descripcion text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'cotizado', 'descartado')),
  en_reporte boolean NOT NULL DEFAULT false,
  texto_cliente text,
  resuelto_por uuid REFERENCES perfiles(id),
  resuelto_en timestamptz,
  presupuesto_id uuid REFERENCES presupuestos(id) ON DELETE SET NULL,
  avance_id uuid REFERENCES orden_avances(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orden_hallazgos_orden_id ON orden_hallazgos(orden_id);
CREATE INDEX idx_orden_hallazgos_sede_id ON orden_hallazgos(sede_id);

ALTER TABLE orden_hallazgos ENABLE ROW LEVEL SECURITY;

CREATE POLICY orden_hallazgos_select ON orden_hallazgos
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin()) OR
    auth.uid() IN (
      SELECT usuario_id FROM orden_asignaciones WHERE orden_id = orden_hallazgos.orden_id
    )
  );

REVOKE ALL ON orden_hallazgos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON orden_hallazgos TO authenticated;

-- Agregar a Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE orden_hallazgos;

-- Helper para sacar de espera de autorización
CREATE OR REPLACE FUNCTION _salir_de_espera(p_orden_id uuid)
RETURNS void AS $$
BEGIN
  -- Vuelve a 'en_proceso' solo si la orden está 'espera_autorizacion',
  -- sin hallazgos pendientes y sin presupuestos esperando.
  UPDATE ordenes_trabajo
  SET estatus = 'en_proceso'
  WHERE id = p_orden_id
    AND estatus = 'espera_autorizacion'
    AND NOT EXISTS (
      SELECT 1 FROM orden_hallazgos WHERE orden_id = p_orden_id AND estado = 'pendiente'
    )
    AND NOT EXISTS (
      SELECT 1 FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'esperando'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION _salir_de_espera(uuid) FROM PUBLIC, anon, authenticated;

-- RPC para reportar hallazgo
CREATE OR REPLACE FUNCTION reportar_hallazgo(p_orden_id uuid, p_descripcion text)
RETURNS uuid AS $$
DECLARE
  v_hallazgo_id uuid;
  v_sede_id uuid;
BEGIN
  SELECT sede_id INTO v_sede_id FROM ordenes_trabajo WHERE id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden % no encontrada.', p_orden_id;
  END IF;

  IF NOT public.is_admin() AND NOT public.is_assigned_to_order(p_orden_id) THEN
    RAISE EXCEPTION 'Solo el personal asignado a la orden puede reportar hallazgos.';
  END IF;

  -- Inserta el hallazgo
  INSERT INTO orden_hallazgos (orden_id, sede_id, reportado_por, descripcion)
  VALUES (p_orden_id, v_sede_id, auth.uid(), p_descripcion)
  RETURNING id INTO v_hallazgo_id;

  -- Pone la orden en espera
  UPDATE ordenes_trabajo
  SET estatus = 'espera_autorizacion',
      motivo_autorizacion = p_descripcion
  WHERE id = p_orden_id AND estatus != 'espera_autorizacion';

  RETURN v_hallazgo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION reportar_hallazgo(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reportar_hallazgo(uuid, text) TO authenticated;

-- RPC para cotizar hallazgo
CREATE OR REPLACE FUNCTION cotizar_hallazgo(p_hallazgo_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE orden_hallazgos
  SET estado = 'cotizado',
      resuelto_por = auth.uid(),
      resuelto_en = now()
  WHERE id = p_hallazgo_id AND estado = 'pendiente';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION cotizar_hallazgo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cotizar_hallazgo(uuid) TO authenticated;

-- RPC para descartar hallazgo
CREATE OR REPLACE FUNCTION descartar_hallazgo(p_hallazgo_id uuid, p_en_reporte boolean, p_texto text)
RETURNS void AS $$
DECLARE
  v_orden_id uuid;
BEGIN
  UPDATE orden_hallazgos
  SET estado = 'descartado',
      en_reporte = p_en_reporte,
      texto_cliente = p_texto,
      resuelto_por = auth.uid(),
      resuelto_en = now()
  WHERE id = p_hallazgo_id AND estado = 'pendiente'
  RETURNING orden_id INTO v_orden_id;

  IF FOUND THEN
    PERFORM _salir_de_espera(v_orden_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION descartar_hallazgo(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION descartar_hallazgo(uuid, boolean, text) TO authenticated;

-- ------------------------------------------------------------------------------------
-- Modificaciones a las funciones de Presupuesto para Hallazgos (F6)
-- ------------------------------------------------------------------------------------

-- Reemplazo de enviar_presupuesto (original en 20260924)
CREATE OR REPLACE FUNCTION public.enviar_presupuesto(p_orden_id UUID, p_notificar BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p       presupuestos;
  v_drafts  BOOLEAN;
  v_correo  TEXT := 'no_solicitado';
  v_id      UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede enviar presupuestos.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;

  SELECT * INTO v_p FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'enviado' FOR UPDATE;
  v_drafts := EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'borrador')
           OR EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'borrador')
           OR EXISTS (SELECT 1 FROM orden_hallazgos WHERE orden_id = p_orden_id AND estado = 'cotizado' AND presupuesto_id IS NULL);

  IF v_p.id IS NULL THEN
    IF NOT v_drafts THEN
      RAISE EXCEPTION 'No hay trabajos sin autorizar para enviar al cliente.';
    END IF;
    v_p := public._crear_presupuesto(p_orden_id);
  ELSIF v_drafts THEN
    PERFORM public._agregar_borradores(v_p.id);
    SELECT * INTO v_p FROM presupuestos WHERE id = v_p.id;
  END IF;

  -- F6: Vincular hallazgos cotizados al presupuesto
  UPDATE orden_hallazgos SET presupuesto_id = v_p.id WHERE orden_id = p_orden_id AND estado = 'cotizado' AND presupuesto_id IS NULL;
  
  -- F6: Poner la orden en espera de autorización si estaba en proceso
  UPDATE ordenes_trabajo SET estatus = 'espera_autorizacion' WHERE id = p_orden_id AND estatus = 'en_proceso';

  PERFORM public.asegurar_enlace_orden(p_orden_id);

  IF p_notificar THEN
    v_id := public.encolar_correo_cliente(
      p_orden_id, 'presupuesto', jsonb_build_object('presupuesto_id', v_p.id),
      'presupuesto:' || v_p.id, INTERVAL '1 minute'
    );
    v_correo := CASE WHEN v_id IS NULL THEN 'sin_correo' ELSE 'encolado' END;
  END IF;

  RETURN jsonb_build_object(
    'presupuesto_id', v_p.id,
    'numero', v_p.numero,
    'lineas', array_length(public._lineas_pendientes(v_p.id), 1),
    'total', v_p.total_propuesto,
    'correo', v_correo
  );
END;
$$;
REVOKE ALL ON FUNCTION public.enviar_presupuesto(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_presupuesto(UUID, BOOLEAN) TO authenticated;

-- Reemplazo de cancelar_presupuesto (original en 20260924)
CREATE OR REPLACE FUNCTION public.cancelar_presupuesto(p_presupuesto_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p    presupuestos;
  v_prev TEXT := current_setting('restorify.presupuesto', true);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cancelar presupuestos.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_p FROM presupuestos WHERE id = p_presupuesto_id FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado <> 'enviado' THEN
    RAISE EXCEPTION 'Este presupuesto ya fue respondido o cancelado.';
  END IF;

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET estado = 'borrador', presupuesto_id = NULL
  WHERE presupuesto_id = v_p.id AND estado = 'pendiente';
  UPDATE orden_repuestos SET estado = 'borrador', presupuesto_id = NULL
  WHERE presupuesto_id = v_p.id AND estado = 'pendiente';
  PERFORM set_config('restorify.presupuesto', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  UPDATE presupuestos SET estado = 'cancelado', cancelado_en = NOW() WHERE id = v_p.id;

  -- F6: Desvincular hallazgos (vuelven a estado anterior o quedan sin presupuesto pero cotizados)
  UPDATE orden_hallazgos SET presupuesto_id = NULL WHERE presupuesto_id = v_p.id;
  
  -- F6: Salir de espera
  PERFORM public._salir_de_espera(v_p.orden_id);

  UPDATE cola_envios
  SET estado = 'omitido', ultimo_error = 'El presupuesto se canceló.'
  WHERE canal = 'email' AND plantilla = 'presupuesto' AND estado = 'pendiente'
    AND datos->>'presupuesto_id' = v_p.id::text;
END;
$$;
REVOKE ALL ON FUNCTION public.cancelar_presupuesto(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_presupuesto(UUID) TO authenticated;

-- Reemplazo de _resolver_presupuesto (original de 20260924, modificado en 20260929)
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

  -- F6: Salir de espera de autorización incluso si rechazó todo, para que la orden no quede trabada.
  BEGIN
    PERFORM public._salir_de_espera(v_p.orden_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_resolver_presupuesto estatus (%): %', v_p.id, SQLERRM;
  END;

  BEGIN
    d := public.datos_orden_aviso(v_p.orden_id);

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

-- F6: Reemplazo de trg_notify_auth_request para que no se notifique al admin de su propio presupuesto
-- Dispara solo si hay motivo.
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
       AND NEW.motivo_autorizacion IS NOT NULL -- F6: solo si hay motivo (omitir presupuestos enviados por el admin sin motivo)
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
