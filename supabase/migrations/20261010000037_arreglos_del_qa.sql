-- 20261010000037_arreglos_del_qa.sql
-- Lo que salió del QA del 18/10/2026 (docs/qa-2026-10-18.md) y vive en la base. Cada función se
-- reescribe entera desde su versión vigente (npm run db:donde -- <nombre>):
--
--   1. trg_set_numero_orden (20260831000000): LPAD(n, 3, '0') recorta lo que pasa de tres
--      dígitos, así que la orden 1000 del año salía como ORD-2026-100, chocaba con la 100 y no se
--      podía abrir más órdenes ese año. Del 1000 en adelante se escribe el número completo.
--   2. agregar_trabajo_del_catalogo (20261010000036): rechaza una orden entregada, como
--      quitar_trabajo e iniciar_reloj.
--   3. marcar_punto_inspeccion y completar_inspeccion (20261010000035): una inspección ya publicada
--      al cliente solo la cambia administración, y completarla dos veces no avisa dos veces.
--   4. La nota del próximo servicio se traduce para el cliente: entra en _textos_cliente, su
--      trigger encola la traducción y datos_servicio (la página del QR) manda la traducción.
--   5. Reloj (iniciar_reloj, detener_reloj, trg_labor_cerrar_reloj): un reloj olvidado ya no infla
--      las horas (al cerrarse por el siguiente reloj, por detenerlo o por marcar la tarea, no pasa
--      de _reloj_tope()); dos toques seguidos no dan el error crudo 23505; y la tarea se bloquea
--      mientras se abre el reloj.
--   6. indicadores_taller (20261010000036): la tarifa efectiva divide solo el dinero de las tareas
--      que tienen horas, y las horas de reloj de un técnico cuentan solo las órdenes de la sede.
--
-- Ninguna función nueva con permisos: _reloj_tope solo la llaman funciones SECURITY DEFINER.

-- ------------------------------------------------------------------------------------
-- 1. Número de orden
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_set_numero_orden()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year INT := EXTRACT(YEAR FROM NOW())::INT;
  next_seq INT;
  supplied_seq INT;
BEGIN
  IF NEW.numero_orden IS NULL OR NEW.numero_orden = '' THEN
    INSERT INTO numero_orden_contadores (anio, ultimo_numero)
    VALUES (current_year, 1)
    ON CONFLICT (anio) DO UPDATE SET ultimo_numero = numero_orden_contadores.ultimo_numero + 1
    RETURNING ultimo_numero INTO next_seq;

    NEW.numero_orden := 'ORD-' || current_year || '-' || CASE WHEN next_seq < 1000 THEN LPAD(next_seq::TEXT, 3, '0') ELSE next_seq::TEXT END;
  ELSIF NEW.numero_orden ~ '^ORD-\d{4}-\d+$' THEN
    -- A number was supplied directly instead of left for us to generate.
    -- Make sure the counter never falls behind it.
    supplied_seq := split_part(NEW.numero_orden, '-', 3)::INT;
    INSERT INTO numero_orden_contadores (anio, ultimo_numero)
    VALUES (split_part(NEW.numero_orden, '-', 2)::INT, supplied_seq)
    ON CONFLICT (anio) DO UPDATE
      SET ultimo_numero = GREATEST(numero_orden_contadores.ultimo_numero, supplied_seq);
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------------
-- 2. Catálogo en una orden entregada
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agregar_trabajo_del_catalogo(
  p_orden_id    UUID,
  p_catalogo_id UUID,
  p_asignado_a  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_orden      ordenes_trabajo;
  v_cat        catalogo_trabajos;
  v_trabajo_id UUID;
  v_rol        TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede agregar trabajos del catálogo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE = '42501';
  END IF;

  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'No se pueden agregar trabajos a una orden entregada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cat FROM public.catalogo_trabajos
  WHERE id = p_catalogo_id AND sede_id = v_orden.sede_id AND activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese trabajo del catálogo no es de la sede de esta orden o está desactivado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_asignado_a IS NOT NULL THEN
    SELECT rol INTO v_rol FROM public.perfiles WHERE id = p_asignado_a;
  END IF;

  INSERT INTO public.orden_trabajos (orden_id, titulo, catalogo_id, creado_por)
  VALUES (v_orden.id, v_cat.nombre, v_cat.id, auth.uid())
  RETURNING id INTO v_trabajo_id;

  INSERT INTO public.orden_labor (
    orden_id, trabajo_id, descripcion, costo, horas, especialidad, asignado_a, reparto_heredado
  )
  SELECT
    v_orden.id,
    v_trabajo_id,
    l.descripcion,
    l.precio,
    l.horas,
    l.especialidad,
    CASE
      WHEN l.especialidad = 'mecanica' AND v_rol = 'mecanico' THEN p_asignado_a
      WHEN l.especialidad = 'pintura' AND v_rol = 'pintor' THEN p_asignado_a
      ELSE NULL
    END,
    false
  FROM public.catalogo_trabajo_lineas l
  WHERE l.catalogo_id = v_cat.id AND l.tipo = 'mano_obra'
  ORDER BY l.posicion, l.id;

  INSERT INTO public.orden_repuestos (
    orden_id, trabajo_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal
  )
  SELECT
    v_orden.id,
    v_trabajo_id,
    l.descripcion,
    l.cantidad,
    COALESCE(l.costo_unitario, l.precio),
    l.precio,
    l.cantidad * l.precio
  FROM public.catalogo_trabajo_lineas l
  WHERE l.catalogo_id = v_cat.id AND l.tipo = 'repuesto'
  ORDER BY l.posicion, l.id;

  RETURN v_trabajo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agregar_trabajo_del_catalogo(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agregar_trabajo_del_catalogo(UUID, UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 3. Inspección publicada y aviso único
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_punto_inspeccion(
  p_punto_id UUID,
  p_estado   TEXT,
  p_nota     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_punto     RECORD;
  v_nota      TEXT;
  v_publicada BOOLEAN;
BEGIN
  IF p_estado IS NULL OR p_estado NOT IN ('pendiente', 'bien', 'atencion', 'urgente', 'no_aplica') THEN
    RAISE EXCEPTION 'Estado de punto no válido: %', p_estado
      USING ERRCODE = '22023';
  END IF;

  SELECT p.*, o.estatus AS orden_estatus
  INTO v_punto
  FROM public.orden_inspeccion_puntos p
  JOIN public.ordenes_trabajo o ON o.id = p.orden_id
  WHERE p.id = p_punto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Punto de inspección no encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_admin() OR public.is_assigned_to_order(v_punto.orden_id)) THEN
    RAISE EXCEPTION 'Solo el personal asignado a la orden o administración puede marcar puntos de inspección.'
      USING ERRCODE = '42501';
  END IF;

  IF v_punto.orden_estatus = 'entregado' THEN
    RAISE EXCEPTION 'No se pueden modificar puntos de una orden entregada.'
      USING ERRCODE = '42501';
  END IF;

  -- Publicada al cliente: lo que él ve solo lo cambia administración.
  SELECT (publicada_en IS NOT NULL) INTO v_publicada
  FROM public.orden_inspecciones WHERE id = v_punto.inspeccion_id;

  IF COALESCE(v_publicada, false) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'La inspección ya está publicada para el cliente. Solo administración puede cambiar sus puntos.'
      USING ERRCODE = '42501';
  END IF;

  v_nota := NULLIF(btrim(p_nota), '');
  IF v_nota IS NOT NULL AND char_length(v_nota) > 500 THEN
    RAISE EXCEPTION 'La nota debe tener 500 caracteres o menos.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.orden_inspeccion_puntos
  SET
    estado = p_estado,
    nota = v_nota,
    actualizado_por = auth.uid(),
    actualizado_en = now()
  WHERE id = p_punto_id;

  -- Si la inspección ya está publicada, la nota nueva también se traduce para el cliente.
  IF COALESCE(v_publicada, false) THEN
    BEGIN
      INSERT INTO cola_envios (canal, destinatario, plantilla, orden_id, enviar_despues_de)
      VALUES ('traduccion', 'gemini', 'auto', v_punto.orden_id, now() + interval '10 seconds')
      ON CONFLICT (orden_id) WHERE canal = 'traduccion' AND estado = 'pendiente'
      DO UPDATE SET enviar_despues_de = EXCLUDED.enviar_despues_de;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'marcar_punto_inspeccion traducción (%): %', v_punto.orden_id, SQLERRM;
    END;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_punto_inspeccion(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_punto_inspeccion(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.completar_inspeccion(p_inspeccion_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insp       RECORD;
  v_pendientes INTEGER;
  v_atencion   INTEGER;
  v_urgente    INTEGER;
BEGIN
  SELECT i.*, o.sede_id, o.numero_orden, o.estatus AS orden_estatus
  INTO v_insp
  FROM public.orden_inspecciones i
  JOIN public.ordenes_trabajo o ON o.id = i.orden_id
  WHERE i.id = p_inspeccion_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspección no encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_admin() OR public.is_assigned_to_order(v_insp.orden_id)) THEN
    RAISE EXCEPTION 'Solo el personal asignado a la orden o administración puede completar la inspección.'
      USING ERRCODE = '42501';
  END IF;

  IF v_insp.orden_estatus = 'entregado' THEN
    RAISE EXCEPTION 'No se puede completar la inspección de una orden entregada.'
      USING ERRCODE = '42501';
  END IF;

  -- Ya completada: otra llamada no repite el aviso a administración.
  IF v_insp.completada_en IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_pendientes
  FROM public.orden_inspeccion_puntos
  WHERE inspeccion_id = p_inspeccion_id AND estado = 'pendiente';

  IF v_pendientes > 0 THEN
    RAISE EXCEPTION 'Faltan % puntos por revisar.', v_pendientes
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.orden_inspecciones
  SET
    completada_en = now(),
    completada_por = auth.uid()
  WHERE id = p_inspeccion_id;

  SELECT
    COUNT(*) FILTER (WHERE estado = 'atencion')::int,
    COUNT(*) FILTER (WHERE estado = 'urgente')::int
  INTO v_atencion, v_urgente
  FROM public.orden_inspeccion_puntos
  WHERE inspeccion_id = p_inspeccion_id;

  BEGIN
    PERFORM public.notificar(
      public.admins_de_sede(v_insp.sede_id),
      'inspeccion_completada',
      'Inspección lista · ' || v_insp.numero_orden,
      format('%s en atención, %s urgente%s.', v_atencion, v_urgente, CASE WHEN v_urgente = 1 THEN '' ELSE 's' END),
      jsonb_build_object('inspeccion_id', p_inspeccion_id, 'atencion', v_atencion, 'urgente', v_urgente),
      v_insp.orden_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'completar_inspeccion avisos (%): %', p_inspeccion_id, SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.completar_inspeccion(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.completar_inspeccion(UUID) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 4. Nota del próximo servicio traducible
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._textos_cliente(p_orden_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_textos TEXT[];
BEGIN
  SELECT array_agg(DISTINCT nullif(trim(t.texto), '')) INTO v_textos
  FROM (
    SELECT descripcion AS texto FROM orden_labor WHERE orden_id = p_orden_id
    UNION ALL
    SELECT descripcion FROM orden_repuestos WHERE orden_id = p_orden_id
    UNION ALL
    SELECT descripcion FROM orden_avances WHERE orden_id = p_orden_id AND visible_cliente = true
    UNION ALL
    SELECT inspeccion_360_notas FROM ordenes_trabajo WHERE id = p_orden_id
    UNION ALL
    SELECT texto_cliente FROM orden_hallazgos
    WHERE orden_id = p_orden_id AND estado = 'descartado' AND en_reporte
    UNION ALL
    SELECT titulo FROM orden_trabajos WHERE orden_id = p_orden_id
    UNION ALL
    SELECT p.nombre FROM orden_inspeccion_puntos p
    JOIN orden_inspecciones i ON i.id = p.inspeccion_id
    WHERE i.orden_id = p_orden_id AND i.publicada_en IS NOT NULL
    UNION ALL
    SELECT p.nota FROM orden_inspeccion_puntos p
    JOIN orden_inspecciones i ON i.id = p.inspeccion_id
    WHERE i.orden_id = p_orden_id AND i.publicada_en IS NOT NULL
    UNION ALL
    SELECT nota FROM orden_proximo_servicio WHERE orden_id = p_orden_id AND token IS NOT NULL
  ) t
  WHERE nullif(trim(t.texto), '') IS NOT NULL;

  RETURN COALESCE(v_textos, ARRAY[]::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public._textos_cliente(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_encolar_traduccion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'ordenes_trabajo' THEN
    IF NEW.inspeccion_360_notas IS NOT DISTINCT FROM OLD.inspeccion_360_notas THEN
      RETURN NULL;
    END IF;
    v_orden_id := NEW.id;

  ELSIF TG_TABLE_NAME = 'orden_avances' THEN
    -- Solo lo que ve el cliente: un avance que nace visible, que se publica o que cambia de
    -- texto ya publicado.
    IF NOT COALESCE(NEW.visible_cliente, false) THEN
      RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.visible_cliente
       AND NEW.descripcion IS NOT DISTINCT FROM OLD.descripcion THEN
      RETURN NULL;
    END IF;
    v_orden_id := NEW.orden_id;

  ELSIF TG_TABLE_NAME = 'orden_proximo_servicio' THEN
    -- La nota que ve el cliente; la sugerida por el técnico es interna y no se traduce.
    IF NULLIF(btrim(NEW.nota), '') IS NULL THEN
      RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.nota IS NOT DISTINCT FROM OLD.nota THEN
        RETURN NULL;
      END IF;
    END IF;
    v_orden_id := NEW.orden_id;

  ELSE
    -- orden_labor y orden_repuestos: al crearse, o si cambia la descripción.
    IF TG_OP = 'UPDATE' AND NEW.descripcion IS NOT DISTINCT FROM OLD.descripcion THEN
      RETURN NULL;
    END IF;
    v_orden_id := NEW.orden_id;
  END IF;

  BEGIN
    -- Si ya había una pendiente, se corre al final: da unos segundos por si editan varias líneas.
    INSERT INTO cola_envios (canal, destinatario, plantilla, orden_id, enviar_despues_de)
    VALUES ('traduccion', 'gemini', 'auto', v_orden_id, now() + interval '10 seconds')
    ON CONFLICT (orden_id) WHERE canal = 'traduccion' AND estado = 'pendiente'
    DO UPDATE SET enviar_despues_de = EXCLUDED.enviar_despues_de;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_encolar_traduccion (orden %): %', v_orden_id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_encolar_traduccion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orden_proximo_servicio_traducir ON public.orden_proximo_servicio;
CREATE TRIGGER trg_orden_proximo_servicio_traducir
  AFTER INSERT OR UPDATE OF nota ON public.orden_proximo_servicio
  FOR EACH ROW EXECUTE FUNCTION public.trg_encolar_traduccion();

CREATE OR REPLACE FUNCTION public.datos_servicio(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ps     public.orden_proximo_servicio;
  v_orden  public.ordenes_trabajo;
  v_sede   public.sedes;
  v_veh    public.vehiculos;
  v_idioma TEXT;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_ps
  FROM public.orden_proximo_servicio
  WHERE token = p_token
    AND (fecha IS NOT NULL OR millas IS NOT NULL);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_trabajo WHERE id = v_ps.orden_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_sede FROM public.sedes WHERE id = v_ps.sede_id;
  SELECT * INTO v_veh FROM public.vehiculos WHERE id = v_orden.vehiculo_id;
  SELECT idioma INTO v_idioma FROM public.clientes WHERE id = v_orden.cliente_id;

  RETURN jsonb_build_object(
    'estado', 'ok',
    'taller', jsonb_build_object(
      'nombre', v_sede.nombre,
      'logo_url', v_sede.logo_url,
      'color', v_sede.color_tema,
      'telefonos', public._telefonos_sede(v_sede.telefonos)
    ),
    'vehiculo', jsonb_build_object(
      'anio', v_veh.anio,
      'marca', v_veh.marca,
      'modelo', v_veh.modelo,
      'color', v_veh.color
    ),
    'servicio', jsonb_build_object(
      'fecha', v_ps.fecha,
      'millas', v_ps.millas,
      'nota', v_ps.nota
    ),
    'idioma', COALESCE(v_idioma, 'en'),
    -- La nota escrita a mano, con su traducción si ya existe (como el reporte del portal).
    'traducciones', COALESCE((
      SELECT jsonb_object_agg(t.texto_original, t.traduccion)
      FROM public.traducciones t
      WHERE t.sede_id = v_ps.sede_id
        AND NULLIF(trim(v_ps.nota), '') IS NOT NULL
        AND t.md5_hash = md5(trim(v_ps.nota))
    ), '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.datos_servicio(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_servicio(TEXT) TO service_role;

-- Las notas que ya estaban escritas se traducen en la siguiente pasada del traductor.
INSERT INTO public.cola_envios (canal, destinatario, plantilla, orden_id, enviar_despues_de)
SELECT 'traduccion', 'gemini', 'auto', ps.orden_id, now() + interval '1 minute'
FROM public.orden_proximo_servicio ps
WHERE ps.token IS NOT NULL AND NULLIF(btrim(ps.nota), '') IS NOT NULL
ON CONFLICT (orden_id) WHERE canal = 'traduccion' AND estado = 'pendiente' DO NOTHING;

-- ------------------------------------------------------------------------------------
-- 5. Reloj
-- ------------------------------------------------------------------------------------
-- Cuánto puede durar un reloj abierto antes de que se cierre solo. Un reloj de más es lo que
-- pasa cuando alguien se olvida de detenerlo; administración puede corregir el tiempo si de
-- verdad fue más largo (corregir_tiempo).
CREATE OR REPLACE FUNCTION public._reloj_tope()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT interval '12 hours';
$$;

REVOKE ALL ON FUNCTION public._reloj_tope() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.iniciar_reloj(p_labor_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_labor     orden_labor;
  v_orden     ordenes_trabajo;
  v_tiempo_id UUID;
  v_ahora     TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para usar el reloj.' USING ERRCODE = '42501';
  END IF;

  -- Una persona abre un reloj a la vez: dos toques seguidos esperan su turno en vez de chocar con
  -- el índice único (23505).
  PERFORM pg_advisory_xact_lock(hashtextextended('reloj:' || auth.uid()::text, 0));

  -- Bloquea la tarea: si al mismo tiempo la marcan hecha, uno espera al otro y no queda un reloj
  -- abierto sobre una tarea cerrada.
  SELECT * INTO v_labor FROM public.orden_labor WHERE id = p_labor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea no encontrada.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_trabajo WHERE id = v_labor.orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_admin() OR v_labor.asignado_a = auth.uid()) THEN
    RAISE EXCEPTION 'Solo administración o el técnico asignado pueden iniciar el reloj.'
      USING ERRCODE = '42501';
  END IF;

  IF v_labor.estado <> 'aprobado' THEN
    RAISE EXCEPTION 'Solo se puede iniciar el reloj en tareas aprobadas.'
      USING ERRCODE = '42501';
  END IF;

  IF v_labor.completado_en IS NOT NULL THEN
    RAISE EXCEPTION 'La tarea ya está completada.'
      USING ERRCODE = '42501';
  END IF;

  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'No se puede iniciar el reloj en una orden entregada.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orden_labor_tiempos
  SET fin = LEAST(v_ahora, inicio + public._reloj_tope())
  WHERE usuario_id = auth.uid() AND fin IS NULL;

  INSERT INTO public.orden_labor_tiempos (
    labor_id, orden_id, usuario_id, inicio
  ) VALUES (
    v_labor.id, v_orden.id, auth.uid(), v_ahora
  )
  RETURNING id INTO v_tiempo_id;

  RETURN v_tiempo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_reloj(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_reloj(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.detener_reloj(p_labor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orden_labor_tiempos
  SET fin = LEAST(clock_timestamp(), inicio + public._reloj_tope())
  WHERE labor_id = p_labor_id AND usuario_id = auth.uid() AND fin IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.detener_reloj(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detener_reloj(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_labor_cerrar_reloj()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE public.orden_labor_tiempos
    SET fin = LEAST(clock_timestamp(), inicio + public._reloj_tope())
    WHERE labor_id = NEW.id AND fin IS NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_labor_cerrar_reloj(%): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_labor_cerrar_reloj() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 6. Indicadores
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.indicadores_taller(
  p_sede_id UUID,
  p_desde   DATE,
  p_hasta   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_zona_horaria            TEXT;
  v_zona                    TEXT;
  v_tarifa_hora_sede        NUMERIC;
  v_carros_recibidos        INTEGER;
  v_carros_entregados       INTEGER;
  v_ventas_mano_obra        NUMERIC;
  v_ventas_repuestos        NUMERIC;
  v_costo_repuestos         NUMERIC;
  v_descuentos              NUMERIC;
  v_ticket_promedio         NUMERIC;
  v_comisiones              NUMERIC;
  v_margen_mano_obra        NUMERIC;
  v_margen_repuestos        NUMERIC;
  v_horas_facturadas        NUMERIC;
  v_ventas_con_horas        NUMERIC;
  v_tarifa_efectiva         NUMERIC;
  v_horas_por_orden         NUMERIC;
  v_sum_propuesto           NUMERIC;
  v_sum_aprobado            NUMERIC;
  v_aprobacion_presupuestos NUMERIC;
  v_dias_promedio           NUMERIC;
  v_por_tecnico             JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede consultar los indicadores del taller.'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL THEN
    RAISE EXCEPTION 'Las fechas de inicio y fin del período son requeridas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_desde > p_hasta THEN
    RAISE EXCEPTION 'La fecha de inicio no puede ser posterior a la de fin.'
      USING ERRCODE = '22023';
  END IF;

  SELECT zona_horaria, tarifa_hora INTO v_zona_horaria, v_tarifa_hora_sede
  FROM public.sedes WHERE id = p_sede_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sede no encontrada.' USING ERRCODE = '42501';
  END IF;

  v_zona := COALESCE(v_zona_horaria, 'America/New_York');

  -- Órdenes recibidas en el período
  SELECT COUNT(*)::int INTO v_carros_recibidos
  FROM public.ordenes_trabajo o
  WHERE o.sede_id = p_sede_id
    AND ((o.fecha_ingreso::timestamptz AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta);

  -- Órdenes entregadas en el período
  WITH entregadas AS (
    SELECT o.id, o.fecha_ingreso, o.fecha_finalizacion
    FROM public.ordenes_trabajo o
    WHERE o.sede_id = p_sede_id
      AND o.estatus = 'entregado'
      AND o.fecha_finalizacion IS NOT NULL
      AND ((o.fecha_finalizacion AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta)
  )
  SELECT
    COUNT(*)::int,
    (SELECT COALESCE(SUM(l.costo), 0)
     FROM public.orden_labor l
     WHERE l.orden_id IN (SELECT id FROM entregadas) AND l.estado = 'aprobado'),
    (SELECT COALESCE(SUM(r.subtotal), 0)
     FROM public.orden_repuestos r
     WHERE r.orden_id IN (SELECT id FROM entregadas) AND r.estado = 'aprobado'),
    (SELECT COALESCE(SUM(r.costo_unitario * r.cantidad), 0)
     FROM public.orden_repuestos r
     WHERE r.orden_id IN (SELECT id FROM entregadas) AND r.estado = 'aprobado'),
    (SELECT COALESCE(SUM(m.descuento), 0)
     FROM public.orden_montos m
     WHERE m.orden_id IN (SELECT id FROM entregadas)),
    (SELECT COALESCE(SUM(c.monto), 0)
     FROM public.comisiones c
     WHERE c.orden_id IN (SELECT id FROM entregadas) AND (c.estado = 'aceptada' OR c.pago_id IS NOT NULL)),
    (SELECT COALESCE(SUM(l.horas), 0)
     FROM public.orden_labor l
     WHERE l.orden_id IN (SELECT id FROM entregadas) AND l.estado = 'aprobado'),
    (SELECT COALESCE(SUM(l.costo), 0)
     FROM public.orden_labor l
     WHERE l.orden_id IN (SELECT id FROM entregadas) AND l.estado = 'aprobado' AND l.horas > 0),
    (SELECT round(AVG(m.total_general), 2)
     FROM public.orden_montos m
     WHERE m.orden_id IN (SELECT id FROM entregadas)),
    (SELECT round(AVG(EXTRACT(EPOCH FROM (e.fecha_finalizacion - e.fecha_ingreso::timestamptz)) / 86400.0)::numeric, 1)
     FROM entregadas e
     WHERE e.fecha_ingreso IS NOT NULL AND e.fecha_finalizacion IS NOT NULL)
  INTO
    v_carros_entregados,
    v_ventas_mano_obra,
    v_ventas_repuestos,
    v_costo_repuestos,
    v_descuentos,
    v_comisiones,
    v_horas_facturadas,
    v_ventas_con_horas,
    v_ticket_promedio,
    v_dias_promedio
  FROM entregadas;

  -- Divisiones con protección de división por cero
  IF v_carros_entregados = 0 THEN
    v_ticket_promedio := NULL;
    v_horas_por_orden := NULL;
  ELSE
    v_horas_por_orden := round(v_horas_facturadas / v_carros_entregados, 2);
  END IF;

  IF v_ventas_mano_obra = 0 THEN
    v_margen_mano_obra := NULL;
  ELSE
    v_margen_mano_obra := round((v_ventas_mano_obra - v_comisiones) / v_ventas_mano_obra, 4);
  END IF;

  IF v_ventas_repuestos = 0 THEN
    v_margen_repuestos := NULL;
  ELSE
    v_margen_repuestos := round((v_ventas_repuestos - v_costo_repuestos) / v_ventas_repuestos, 4);
  END IF;

  IF v_horas_facturadas = 0 THEN
    v_tarifa_efectiva := NULL;
  ELSE
    -- Solo el dinero de las tareas que tienen horas: una tarea sin horas no debe inflar la tarifa.
    v_tarifa_efectiva := round(v_ventas_con_horas / v_horas_facturadas, 2);
  END IF;

  -- Aprobación de presupuestos respondidos en el período
  SELECT
    SUM(p.total_propuesto),
    SUM(p.total_aprobado)
  INTO v_sum_propuesto, v_sum_aprobado
  FROM public.presupuestos p
  WHERE p.sede_id = p_sede_id
    AND p.estado = 'respondido'
    AND p.respondido_en IS NOT NULL
    AND ((p.respondido_en AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta);

  IF COALESCE(v_sum_propuesto, 0) > 0 THEN
    v_aprobacion_presupuestos := round(v_sum_aprobado / v_sum_propuesto, 4);
  ELSE
    v_aprobacion_presupuestos := NULL;
  END IF;

  -- Desglose por técnico de la sede
  WITH entregadas AS (
    SELECT o.id
    FROM public.ordenes_trabajo o
    WHERE o.sede_id = p_sede_id
      AND o.estatus = 'entregado'
      AND o.fecha_finalizacion IS NOT NULL
      AND ((o.fecha_finalizacion AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'usuario_id', tec.usuario_id,
        'nombre', tec.nombre,
        'horas_facturadas', tec.horas_facturadas,
        'horas_reloj', tec.horas_reloj,
        'eficiencia', tec.eficiencia,
        'tareas_completadas', tec.tareas_completadas
      ) ORDER BY tec.nombre, tec.usuario_id
    ),
    '[]'::jsonb
  ) INTO v_por_tecnico
  FROM (
    SELECT
      p.id AS usuario_id,
      p.nombre_completo AS nombre,
      COALESCE(SUM(l.horas) FILTER (
        WHERE l.estado = 'aprobado' AND l.orden_id IN (SELECT id FROM entregadas)
      ), 0) AS horas_facturadas,
      COALESCE(rel.horas_reloj, 0) AS horas_reloj,
      CASE
        WHEN COALESCE(rel.horas_reloj, 0) > 0 THEN
          round(
            COALESCE(SUM(l.horas) FILTER (
              WHERE l.estado = 'aprobado' AND l.orden_id IN (SELECT id FROM entregadas)
            ), 0) / rel.horas_reloj,
            4
          )
        ELSE NULL
      END AS eficiencia,
      COALESCE(tar.tareas_completadas, 0) AS tareas_completadas
    FROM public.perfiles p
    LEFT JOIN public.orden_labor l ON l.asignado_a = p.id
    LEFT JOIN LATERAL (
      SELECT round(COALESCE(SUM(EXTRACT(EPOCH FROM (t.fin - t.inicio)) / 3600.0), 0)::numeric, 2) AS horas_reloj
      FROM public.orden_labor_tiempos t
      JOIN public.ordenes_trabajo t_ord_rel ON t_ord_rel.id = t.orden_id AND t_ord_rel.sede_id = p_sede_id
      WHERE t.usuario_id = p.id
        AND t.fin IS NOT NULL
        AND ((t.inicio AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta)
    ) rel ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS tareas_completadas
      FROM public.orden_labor t_lab
      JOIN public.ordenes_trabajo t_ord ON t_ord.id = t_lab.orden_id
      WHERE t_ord.sede_id = p_sede_id
        AND t_lab.asignado_a = p.id
        AND t_lab.completado_en IS NOT NULL
        AND ((t_lab.completado_en AT TIME ZONE v_zona)::date BETWEEN p_desde AND p_hasta)
    ) tar ON true
    WHERE p.sede_id = p_sede_id
      AND p.rol IN ('mecanico', 'pintor')
    GROUP BY p.id, p.nombre_completo, rel.horas_reloj, tar.tareas_completadas
  ) tec;

  RETURN jsonb_build_object(
    'carros_recibidos', v_carros_recibidos,
    'carros_entregados', v_carros_entregados,
    'ventas_mano_obra', v_ventas_mano_obra,
    'ventas_repuestos', v_ventas_repuestos,
    'costo_repuestos', v_costo_repuestos,
    'descuentos', v_descuentos,
    'ticket_promedio', v_ticket_promedio,
    'comisiones', v_comisiones,
    'margen_mano_obra', v_margen_mano_obra,
    'margen_repuestos', v_margen_repuestos,
    'horas_facturadas', v_horas_facturadas,
    'tarifa_efectiva', v_tarifa_efectiva,
    'horas_por_orden', v_horas_por_orden,
    'tarifa_hora_sede', v_tarifa_hora_sede,
    'aprobacion_presupuestos', v_aprobacion_presupuestos,
    'dias_promedio_en_taller', v_dias_promedio,
    'por_tecnico', v_por_tecnico
  );
END;
$$;

REVOKE ALL ON FUNCTION public.indicadores_taller(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.indicadores_taller(UUID, DATE, DATE) TO authenticated;
