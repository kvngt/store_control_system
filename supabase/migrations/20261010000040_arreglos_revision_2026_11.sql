-- ====================================================================================
-- Revisión del 30/10 al 03/11/2026: seguimiento de las órdenes reales y revisión del código
-- (docs/bitacora.md, entrada del 03/11/2026). Cada función se reescribe ENTERA desde su versión
-- vigente (npm run db:donde -- <nombre>) y conserva su REVOKE/GRANT. Borrador de Gemini 3.8 Flash,
-- verificado contra la versión vigente de cada función.
--
-- 1. trg_encolar_traduccion (vigente: 037). La 037 agregó la rama de orden_proximo_servicio y
--    perdió la de orden_hallazgos (022). El trigger de hallazgos solo corre al cambiar
--    texto_cliente o en_reporte; caía en la rama de labor/repuestos, veía la descripción igual y
--    salía: lo que administración escribía para el cliente nunca se encolaba para traducir.
-- 2. _textos_cliente (vigente: 037): suma la sección de los puntos de inspección publicados.
-- 3. requiere_atencion (vigente: 038):
--    a) los correos al personal con error se cuentan en la sede de la persona;
--    b) grupo nuevo 'sin_autorizar': en proceso, en espera o terminada sin nada autorizado.
--       En producción había órdenes así: el técnico las avanzó y al entregar se cobraba $0.
-- 4. trg_set_numero_orden: REVOKE explícito. No era un hueco (CREATE OR REPLACE conserva los
--    permisos que quitó 20261002000001), pero la 037 la reemitió sin él.
-- 5. indicadores_taller (vigente: 037): las tareas completadas cuentan solo las autorizadas.
-- 6. datos_servicio (vigente: 038): la traducción de la nota es la del idioma del sticker.
-- 7. corregir_tiempo (vigente: 036): dos relojes abiertos de la misma persona dan un mensaje
--    para el taller, no el 23505 crudo.
-- 8. Fotos de una inspección publicada: lo que ya ve el cliente solo lo cambia administración
--    (como marcar_punto_inspeccion desde 037). Las políticas de orden_media no lo miraban.
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. Traducción automática: vuelve la rama de orden_hallazgos. Desde 037.
-- ------------------------------------------------------------------------------------
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

  ELSIF TG_TABLE_NAME = 'orden_hallazgos' THEN
    -- Solo observaciones enviadas al reporte del cliente
    IF NOT (NEW.en_reporte AND NULLIF(btrim(NEW.texto_cliente), '') IS NOT NULL) THEN
      RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.en_reporte
       AND NEW.texto_cliente IS NOT DISTINCT FROM OLD.texto_cliente THEN
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

-- ------------------------------------------------------------------------------------
-- 2. Textos del cliente: la sección de los puntos de inspección. Desde 037.
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
    -- La sección del punto ("Frenos", "Llantas"): el portal la traduce con tr(), pero nunca
    -- llegaba al diccionario y el cliente en inglés la veía en español.
    SELECT p.seccion FROM orden_inspeccion_puntos p
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

-- ------------------------------------------------------------------------------------
-- 3. Requiere atención: correos al personal por sede y grupo sin_autorizar. Desde 038.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.requiere_atencion(p_sede_id UUID DEFAULT NULL, p_hoy DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_hoy      DATE := COALESCE(
    p_hoy,
    (now() AT TIME ZONE COALESCE((SELECT s.zona_horaria FROM sedes s WHERE s.id = p_sede_id), 'America/New_York'))::date
  );
  v_grupos   JSONB;
  v_correos  INTEGER;
  v_vacio    CONSTANT JSONB := jsonb_build_object('total', 0, 'ordenes', '[]'::jsonb);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración ve lo que requiere atención.' USING ERRCODE = '42501';
  END IF;

  WITH abiertas AS (
    SELECT o.id, o.numero_orden, o.estatus, o.fecha_estimada_entrega, o.fecha_finalizacion, o.lista_para_entregar_en, o.creado_en
    FROM ordenes_trabajo o
    WHERE o.estatus <> 'entregado'
      AND (p_sede_id IS NULL OR o.sede_id = p_sede_id)
  ),
  -- Una fila por orden y grupo: cuántas cosas tiene esa orden y desde cuándo espera.
  por_orden AS (
    SELECT 'hallazgos'::text AS grupo, a.id, a.numero_orden, MIN(h.creado_en) AS desde, COUNT(*)::int AS n
    FROM abiertas a
    JOIN orden_hallazgos h ON h.orden_id = a.id
    WHERE h.estado = 'pendiente' OR (h.estado = 'cotizado' AND h.presupuesto_id IS NULL)
    GROUP BY a.id, a.numero_orden

    UNION ALL
    -- Líneas en borrador de órdenes sin presupuesto enviado esperando respuesta.
    SELECT 'por_autorizar'::text AS grupo, a.id, a.numero_orden, MIN(l.creado_en) AS desde, COUNT(*)::int AS n
    FROM abiertas a
    JOIN (
      SELECT orden_id, creado_en FROM orden_labor WHERE estado = 'borrador'
      UNION ALL
      SELECT orden_id, creado_en FROM orden_repuestos WHERE estado = 'borrador'
    ) l ON l.orden_id = a.id
    WHERE NOT EXISTS (
      SELECT 1 FROM presupuestos p WHERE p.orden_id = a.id AND p.estado = 'enviado'
    )
    GROUP BY a.id, a.numero_orden

    UNION ALL
    SELECT 'presupuestos'::text AS grupo, a.id, a.numero_orden, MIN(p.creado_en) AS desde, COUNT(*)::int AS n
    FROM abiertas a
    JOIN presupuestos p ON p.orden_id = a.id
    WHERE p.estado = 'enviado'
    GROUP BY a.id, a.numero_orden

    UNION ALL
    SELECT 'sin_tecnico'::text AS grupo, a.id, a.numero_orden, MIN(l.creado_en) AS desde, COUNT(*)::int AS n
    FROM abiertas a
    JOIN orden_labor l ON l.orden_id = a.id
    WHERE l.asignado_a IS NULL
      AND NOT l.reparto_heredado
      AND l.estado <> 'rechazado'
    GROUP BY a.id, a.numero_orden

    UNION ALL
    -- El técnico terminó y administración todavía no lo marca listo para entregar.
    SELECT 'por_revisar'::text AS grupo, a.id, a.numero_orden, COALESCE(a.fecha_finalizacion, NOW()) AS desde, 1 AS n
    FROM abiertas a
    WHERE a.estatus = 'finalizado' AND a.lista_para_entregar_en IS NULL

    UNION ALL
    SELECT 'vencidas'::text AS grupo, a.id, a.numero_orden, a.fecha_estimada_entrega::timestamptz AS desde, 1 AS n
    FROM abiertas a
    WHERE a.estatus <> 'finalizado'
      AND a.fecha_estimada_entrega < v_hoy

    UNION ALL
    -- Sugerencias de próximo servicio enviadas por el técnico pendientes de revisión
    SELECT 'sugerencias_servicio'::text AS grupo, a.id, a.numero_orden, ps.sugerido_en AS desde, 1 AS n
    FROM abiertas a
    JOIN public.orden_proximo_servicio ps ON ps.orden_id = a.id
    WHERE ps.sugerido_en IS NOT NULL

    UNION ALL
    -- En proceso, en espera o terminada sin ninguna línea autorizada (20261010000040): el técnico
    -- puede pasarla a "en proceso" y terminarla sin que nadie autorice, y al entregar no se
    -- cobraría nada. Desde que se abrió la orden.
    SELECT 'sin_autorizar'::text AS grupo, a.id, a.numero_orden, a.creado_en AS desde, 1 AS n
    FROM abiertas a
    WHERE a.estatus IN ('en_proceso', 'espera_autorizacion', 'finalizado')
      AND NOT EXISTS (
        SELECT 1 FROM public.orden_labor l WHERE l.orden_id = a.id AND l.estado = 'aprobado'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.orden_repuestos r WHERE r.orden_id = a.id AND r.estado = 'aprobado'
      )
  ),
  ordenadas AS (
    SELECT po.*, row_number() OVER (PARTITION BY po.grupo ORDER BY po.desde, po.numero_orden) AS rk
    FROM por_orden po
  )
  SELECT jsonb_object_agg(
           x.grupo,
           jsonb_build_object('total', x.total, 'ordenes', x.ordenes)
         )
  INTO v_grupos
  FROM (
    SELECT grupo,
           SUM(n)::int AS total,
           COALESCE(
             jsonb_agg(jsonb_build_object('id', id, 'numero_orden', numero_orden) ORDER BY rk)
               FILTER (WHERE rk <= 5),
             '[]'::jsonb
           ) AS ordenes
    FROM ordenadas
    GROUP BY grupo
  ) x;

  -- Los correos al personal (notificar, plantilla empleado) nacen sin orden_id: su sede es la de
  -- la persona. Antes, con una sede elegida, no se contaban nunca.
  SELECT COUNT(*)::int INTO v_correos
  FROM (
    SELECT DISTINCT COALESCE(c.clave_dedupe, c.id::text)
    FROM cola_envios c
    LEFT JOIN ordenes_trabajo o ON o.id = c.orden_id
    LEFT JOIN perfiles perf ON c.orden_id IS NULL AND lower(btrim(perf.email)) = lower(btrim(c.destinatario))
    WHERE c.canal = 'email'
      AND c.estado = 'error'
      AND c.creado_en >= NOW() - INTERVAL '72 hours'
      AND (p_sede_id IS NULL OR COALESCE(o.sede_id, perf.sede_id) = p_sede_id)
      AND (c.clave_dedupe IS NULL OR NOT EXISTS (
        SELECT 1 FROM cola_envios p
        WHERE p.clave_dedupe = c.clave_dedupe AND p.estado = 'pendiente'
      ))
  ) e;

  v_grupos := COALESCE(v_grupos, '{}'::jsonb);
  RETURN jsonb_build_object(
    'hallazgos',            COALESCE(v_grupos->'hallazgos', v_vacio),
    'por_autorizar',        COALESCE(v_grupos->'por_autorizar', v_vacio),
    'presupuestos',         COALESCE(v_grupos->'presupuestos', v_vacio),
    'sin_tecnico',          COALESCE(v_grupos->'sin_tecnico', v_vacio),
    'por_revisar',          COALESCE(v_grupos->'por_revisar', v_vacio),
    'vencidas',             COALESCE(v_grupos->'vencidas', v_vacio),
    'sugerencias_servicio', COALESCE(v_grupos->'sugerencias_servicio', v_vacio),
    'sin_autorizar',        COALESCE(v_grupos->'sin_autorizar', v_vacio),
    'correos',              jsonb_build_object('total', v_correos)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.requiere_atencion(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requiere_atencion(UUID, DATE) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 4. Número de orden: el REVOKE que la 037 no repitió.
-- ------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.trg_set_numero_orden() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 5. Indicadores: tareas completadas, solo las autorizadas. Desde 037.
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
        AND t_lab.estado = 'aprobado'
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

-- ------------------------------------------------------------------------------------
-- 6. Página del QR: la traducción del idioma del sticker. Desde 038.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.datos_servicio(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ps             public.orden_proximo_servicio;
  v_orden          public.ordenes_trabajo;
  v_sede           public.sedes;
  v_veh            public.vehiculos;
  v_idioma         TEXT;
  v_idioma_destino TEXT;
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

  v_idioma_destino := COALESCE(v_ps.idioma, v_idioma, 'en');

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
    'idioma', v_idioma_destino,
    -- La nota escrita a mano, con su traducción al idioma del sticker. Sin filtrar por idioma,
    -- jsonb_object_agg podía quedarse con la de otro idioma.
    'traducciones', COALESCE((
      SELECT jsonb_object_agg(t.texto_original, t.traduccion)
      FROM public.traducciones t
      WHERE t.sede_id = v_ps.sede_id
        AND t.idioma_destino = v_idioma_destino
        AND NULLIF(trim(v_ps.nota), '') IS NOT NULL
        AND t.md5_hash = md5(trim(v_ps.nota))
    ), '{}'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.datos_servicio(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_servicio(TEXT) TO service_role;

-- ------------------------------------------------------------------------------------
-- 7. Corregir un tiempo: mensaje claro con dos relojes abiertos. Desde 036.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corregir_tiempo(
  p_tiempo_id UUID,
  p_inicio    TIMESTAMPTZ,
  p_fin       TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
-- DEFINER: orden_labor_tiempos es de solo lectura por la API (17/10/2026).
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede corregir tiempos.'
      USING ERRCODE = '42501';
  END IF;

  IF p_inicio IS NULL THEN
    RAISE EXCEPTION 'La fecha y hora de inicio es requerida.' USING ERRCODE = '22023';
  END IF;

  IF p_fin IS NOT NULL AND p_fin < p_inicio THEN
    RAISE EXCEPTION 'La fecha de fin no puede ser anterior al inicio.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    UPDATE public.orden_labor_tiempos
    SET inicio = p_inicio,
        fin = p_fin
    WHERE id = p_tiempo_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Registro de tiempo no encontrado.' USING ERRCODE = '42501';
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      -- idx_orden_labor_tiempos_activo: un reloj abierto por persona. Antes salía el 23505 crudo.
      RAISE EXCEPTION 'Esa persona ya tiene otro reloj abierto. Ciérralo antes de dejar este sin fin.'
        USING ERRCODE = '22023';
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.corregir_tiempo(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_tiempo(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 8. Fotos de una inspección publicada: solo administración. Nueva.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_guard_inspeccion_media()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sin sesión (service_role, una limpieza interna) no hay persona a quien frenar.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orden_inspeccion_puntos p
    JOIN public.orden_inspecciones i ON i.id = p.inspeccion_id
    WHERE i.publicada_en IS NOT NULL
      AND p.id IN (
        CASE WHEN TG_OP <> 'INSERT' THEN OLD.inspeccion_punto_id END,
        CASE WHEN TG_OP <> 'DELETE' THEN NEW.inspeccion_punto_id END
      )
  ) THEN
    RAISE EXCEPTION 'La inspección ya está publicada para el cliente. Sus fotos solo las cambia administración.'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.trg_guard_inspeccion_media() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_inspeccion_media
  BEFORE INSERT OR DELETE OR UPDATE OF inspeccion_punto_id ON public.orden_media
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_inspeccion_media();
