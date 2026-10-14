-- ====================================================================================
-- RESTORIFY — Sticker térmico y página pública de próximo servicio (20261010000029)
-- ====================================================================================
-- Pedido del taller (14/10/2026):
--   * Imprimir sticker térmico de próximo servicio (Brother QL-810W, rollo DK-4205
--     removible de 62 mm x 50 mm) con QR para pegar en el parabrisas.
--   * El QR apunta a una página pública propia (/s/<código>), NUNCA al enlace del cliente
--     (/r/<token>): el enlace del cliente vence a los 90 días de la entrega y expone datos
--     personales (nombre, placa, VIN, montos, fotos) a cualquiera que escanee el parabrisas.
--   * La página /s/<código> no vence, no expone datos del cliente ni de dinero, y muestra
--     el taller, el vehículo, el próximo servicio con semáforo y botones para agendar por
--     WhatsApp o llamar.
--   * Roles y permisos: solo administración programa el servicio y emite el código; el
--     técnico asignado puede sugerir fecha/millas mientras la orden no esté entregada.
--
-- Reescrituras:
--   - datos_portal: agrega 'proximo_servicio' ({fecha, millas, nota} o null) al JSON del
--     reporte del cliente.
--   - requiere_atencion: suma el grupo 'sugerencias_servicio' para avisar a la administración
--     cuando un técnico envía una sugerencia.
--   - trg_historial: suma entidad 'proximo_servicio' para auditar cambios y sugerencias.
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. Tabla orden_proximo_servicio, RLS y permisos
-- ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orden_proximo_servicio (
  orden_id        UUID PRIMARY KEY REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  sede_id         UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  fecha           DATE,
  millas          INTEGER CHECK (millas IS NULL OR millas >= 0),
  nota            TEXT CHECK (nota IS NULL OR char_length(nota) <= 120),
  token           TEXT UNIQUE,
  programado_por  UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  programado_en   TIMESTAMPTZ,
  sugerido_fecha  DATE,
  sugerido_millas INTEGER CHECK (sugerido_millas IS NULL OR sugerido_millas >= 0),
  sugerido_nota   TEXT CHECK (sugerido_nota IS NULL OR char_length(sugerido_nota) <= 120),
  sugerido_por    UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  sugerido_en     TIMESTAMPTZ,
  CONSTRAINT orden_proximo_servicio_token_format CHECK (token IS NULL OR token ~ '^[0-9a-f]{64}$'),
  CONSTRAINT orden_proximo_servicio_programado_check CHECK ((fecha IS NULL AND millas IS NULL) = (token IS NULL))
);

ALTER TABLE public.orden_proximo_servicio ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orden_proximo_servicio FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orden_proximo_servicio TO authenticated;

DROP POLICY IF EXISTS orden_proximo_servicio_select ON public.orden_proximo_servicio;
CREATE POLICY orden_proximo_servicio_select ON public.orden_proximo_servicio
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[])
  );

-- ------------------------------------------------------------------------------------
-- 2. Publicación de tiempo real
-- ------------------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_proximo_servicio;

-- ------------------------------------------------------------------------------------
-- 3. Funciones nuevas
-- ------------------------------------------------------------------------------------

-- `hoy_taller(sede)` ya existe (20261010000017) y es interna: no se reescribe.

-- Sugerir próximo servicio (técnico asignado, orden no entregada)
CREATE OR REPLACE FUNCTION public.sugerir_proximo_servicio(
  p_orden_id UUID,
  p_fecha    DATE,
  p_millas   INTEGER,
  p_nota     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden ordenes_trabajo;
  v_nota  TEXT;
  d       JSONB;
BEGIN
  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE = '42501';
  END IF;

  -- Administración programa directo (`programar_proximo_servicio`); sugerir es del técnico asignado.
  IF public.is_admin() THEN
    RAISE EXCEPTION 'Administración programa el próximo servicio directamente.' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_orden_id = ANY((SELECT public.mis_ordenes_asignadas())::uuid[])) THEN
    RAISE EXCEPTION 'Solo un técnico asignado a la orden puede sugerir el próximo servicio.'
      USING ERRCODE = '42501';
  END IF;

  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'No se puede sugerir servicio en una orden ya entregada.'
      USING ERRCODE = '42501';
  END IF;

  v_nota := NULLIF(btrim(p_nota), '');
  IF length(v_nota) > 120 THEN
    RAISE EXCEPTION 'La nota no puede tener más de 120 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_fecha IS NULL AND p_millas IS NULL THEN
    RAISE EXCEPTION 'Debes indicar al menos la fecha o el millaje para el próximo servicio.'
      USING ERRCODE = '22023';
  END IF;

  IF p_fecha IS NOT NULL AND p_fecha < public.hoy_taller(v_orden.sede_id) THEN
    RAISE EXCEPTION 'La fecha del próximo servicio no puede ser anterior a hoy.'
      USING ERRCODE = '22023';
  END IF;

  IF p_millas IS NOT NULL AND v_orden.millas_ingreso IS NOT NULL AND p_millas < v_orden.millas_ingreso THEN
    RAISE EXCEPTION 'El millaje no puede ser menor que las millas de ingreso del vehículo (%).', v_orden.millas_ingreso
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.orden_proximo_servicio (
    orden_id, sede_id,
    sugerido_fecha, sugerido_millas, sugerido_nota, sugerido_por, sugerido_en
  ) VALUES (
    v_orden.id, v_orden.sede_id,
    p_fecha, p_millas, v_nota, auth.uid(), NOW()
  )
  ON CONFLICT (orden_id) DO UPDATE SET
    sugerido_fecha  = EXCLUDED.sugerido_fecha,
    sugerido_millas = EXCLUDED.sugerido_millas,
    sugerido_nota   = EXCLUDED.sugerido_nota,
    sugerido_por    = EXCLUDED.sugerido_por,
    sugerido_en     = EXCLUDED.sugerido_en;

  -- Notificar a la administración
  BEGIN
    d := public.datos_orden_aviso(v_orden.id);
    PERFORM public.notificar(
      public.admins_de_sede(v_orden.sede_id),
      'proximo_servicio_sugerido',
      'Próximo servicio sugerido · ' || v_orden.numero_orden,
      concat_ws(' — ', NULLIF(d->>'vehiculo', ''), NULLIF(d->>'cliente', ''), 'revisa la sugerencia del técnico'),
      d,
      v_orden.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notificar proximo_servicio_sugerido (%): %', v_orden.id, SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.sugerir_proximo_servicio(UUID, DATE, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sugerir_proximo_servicio(UUID, DATE, INTEGER, TEXT) TO authenticated;

-- Programar próximo servicio (solo administración)
CREATE OR REPLACE FUNCTION public.programar_proximo_servicio(
  p_orden_id UUID,
  p_fecha    DATE,
  p_millas   INTEGER,
  p_nota     TEXT
)
RETURNS public.orden_proximo_servicio
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden  ordenes_trabajo;
  v_token  TEXT;
  v_nota   TEXT;
  v_res    public.orden_proximo_servicio;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede programar el próximo servicio.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE = '42501';
  END IF;

  v_nota := NULLIF(btrim(p_nota), '');
  IF length(v_nota) > 120 THEN
    RAISE EXCEPTION 'La nota no puede tener más de 120 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_fecha IS NULL AND p_millas IS NULL THEN
    RAISE EXCEPTION 'Debes indicar al menos la fecha o el millaje para el próximo servicio.'
      USING ERRCODE = '22023';
  END IF;

  IF p_fecha IS NOT NULL AND p_fecha < public.hoy_taller(v_orden.sede_id) THEN
    RAISE EXCEPTION 'La fecha del próximo servicio no puede ser anterior a hoy.'
      USING ERRCODE = '22023';
  END IF;

  IF p_millas IS NOT NULL AND v_orden.millas_ingreso IS NOT NULL AND p_millas < v_orden.millas_ingreso THEN
    RAISE EXCEPTION 'El millaje no puede ser menor que las millas de ingreso del vehículo (%).', v_orden.millas_ingreso
      USING ERRCODE = '22023';
  END IF;

  -- Preservar token existente o generar uno nuevo de 64 hex
  SELECT token INTO v_token FROM public.orden_proximo_servicio WHERE orden_id = p_orden_id;
  IF v_token IS NULL THEN
    v_token := lower(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
  END IF;

  INSERT INTO public.orden_proximo_servicio (
    orden_id, sede_id,
    fecha, millas, nota, token, programado_por, programado_en,
    sugerido_fecha, sugerido_millas, sugerido_nota, sugerido_por, sugerido_en
  ) VALUES (
    v_orden.id, v_orden.sede_id,
    p_fecha, p_millas, v_nota, v_token, auth.uid(), NOW(),
    NULL, NULL, NULL, NULL, NULL
  )
  ON CONFLICT (orden_id) DO UPDATE SET
    fecha           = EXCLUDED.fecha,
    millas          = EXCLUDED.millas,
    nota            = EXCLUDED.nota,
    token           = v_token,
    programado_por  = EXCLUDED.programado_por,
    programado_en   = EXCLUDED.programado_en,
    sugerido_fecha  = NULL,
    sugerido_millas = NULL,
    sugerido_nota   = NULL,
    sugerido_por    = NULL,
    sugerido_en     = NULL
  RETURNING * INTO v_res;

  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.programar_proximo_servicio(UUID, DATE, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.programar_proximo_servicio(UUID, DATE, INTEGER, TEXT) TO authenticated;

-- Quitar próximo servicio programado (solo administración)
CREATE OR REPLACE FUNCTION public.quitar_proximo_servicio(p_orden_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede quitar el próximo servicio.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orden_proximo_servicio
  SET fecha = NULL,
      millas = NULL,
      nota = NULL,
      token = NULL,
      programado_por = NULL,
      programado_en = NULL
  WHERE orden_id = p_orden_id;
END;
$$;
REVOKE ALL ON FUNCTION public.quitar_proximo_servicio(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quitar_proximo_servicio(UUID) TO authenticated;

-- Descartar sugerencia de técnico (solo administración)
CREATE OR REPLACE FUNCTION public.descartar_sugerencia_proximo_servicio(p_orden_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede descartar la sugerencia.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orden_proximo_servicio
  SET sugerido_fecha  = NULL,
      sugerido_millas = NULL,
      sugerido_nota   = NULL,
      sugerido_por    = NULL,
      sugerido_en     = NULL
  WHERE orden_id = p_orden_id;
END;
$$;
REVOKE ALL ON FUNCTION public.descartar_sugerencia_proximo_servicio(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descartar_sugerencia_proximo_servicio(UUID) TO authenticated;

-- Consulta pública para /s/<código> (solo service_role)
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
    'idioma', COALESCE(v_idioma, 'en')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.datos_servicio(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_servicio(TEXT) TO service_role;

-- ------------------------------------------------------------------------------------
-- 4. Reescritura de funciones vigentes
-- ------------------------------------------------------------------------------------

-- datos_portal (vigente en 20261010000028): agrega proximo_servicio
CREATE OR REPLACE FUNCTION public.datos_portal(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace         orden_enlaces;
  v_orden          ordenes_trabajo;
  v_taller         JSONB;
  v_pagado         NUMERIC;
  v_montos         orden_montos;
  v_parq           JSONB;
  v_parqueo_portal JSONB := NULL;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado_enlace', 'no_encontrado');
  END IF;

  SELECT * INTO v_enlace FROM orden_enlaces WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado_enlace', 'no_encontrado');
  END IF;

  SELECT jsonb_build_object(
    'nombre', s.nombre,
    'direccion', s.direccion,
    'telefono', s.telefono,
    'telefonos', public._telefonos_sede(s.telefonos),
    'email', NULLIF(btrim(s.email_contacto), ''),
    'whatsapp', NULLIF(btrim(s.whatsapp), ''),
    'logo_url', s.logo_url,
    'color', s.color_tema
  ) INTO v_taller
  FROM sedes s WHERE s.id = v_enlace.sede_id;

  IF v_enlace.revocado_en IS NOT NULL THEN
    RETURN jsonb_build_object('estado_enlace', 'revocado', 'taller', v_taller);
  END IF;
  IF v_enlace.expira_en IS NOT NULL AND v_enlace.expira_en <= NOW() THEN
    RETURN jsonb_build_object('estado_enlace', 'vencido', 'taller', v_taller);
  END IF;

  UPDATE orden_enlaces
  SET accesos = accesos + 1, ultimo_acceso_en = NOW()
  WHERE id = v_enlace.id;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = v_enlace.orden_id;

  -- Recalcular parqueo antes de armar la cuenta si la orden no está entregada
  IF v_orden.estatus <> 'entregado' THEN
    BEGIN
      PERFORM public._recalcular_parqueo(v_orden.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'datos_portal recalcular_parqueo (%): %', v_orden.id, SQLERRM;
    END;
  END IF;

  SELECT * INTO v_montos FROM orden_montos WHERE orden_id = v_orden.id;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
  INTO v_pagado
  FROM finanzas_movimientos
  WHERE referencia_orden_id = v_orden.id AND categoria = 'pago_cliente' AND importacion_id IS NULL;

  -- Obtener información de parqueo para la cuenta
  BEGIN
    v_parq := public._parqueo_calcular(v_orden.id, NULL);
    IF v_parq->>'estado' NOT IN ('inactivo', 'sin_cobro', 'orden_previa') THEN
      v_parqueo_portal := jsonb_build_object(
        'estado', v_parq->>'estado',
        'inicio', v_parq->>'inicio',
        'dias', (v_parq->>'dias')::int,
        'monto', (v_parq->>'monto')::numeric,
        'detalle', v_parq->'detalle',
        'tope_aplicado', (v_parq->>'tope_aplicado')::boolean,
        'tarifa_inicial', (v_parq->>'tarifa_inicial')::numeric,
        'dias_gracia', (v_parq->>'dias_gracia')::int,
        'evento_inicio', v_parq->>'evento_inicio',
        'cobra_dia_evento', (v_parq->>'cobra_dia_evento')::boolean,
        'politica_es', v_parq->>'politica_es',
        'politica_en', v_parq->>'politica_en'
      );
    ELSE
      v_parqueo_portal := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_parqueo_portal := NULL;
  END;

  RETURN jsonb_build_object(
    'estado_enlace', 'ok',
    'taller', v_taller,
    'enlace', jsonb_build_object('expira_en', v_enlace.expira_en),
    'orden', jsonb_build_object(
      'numero', v_orden.numero_orden,
      'estatus', v_orden.estatus,
      'retirada_sin_reparar', v_orden.retirada_sin_reparar,
      'lista_para_entregar', v_orden.lista_para_entregar_en IS NOT NULL,
      'tipo_trabajo', v_orden.tipo_trabajo,
      'porcentaje_avance', v_orden.porcentaje_avance,
      'fecha_ingreso', v_orden.fecha_ingreso,
      'fecha_estimada_entrega', v_orden.fecha_estimada_entrega,
      'fecha_finalizacion', v_orden.fecha_finalizacion,
      'millas_ingreso', v_orden.millas_ingreso,
      'nivel_gasolina', v_orden.nivel_gasolina,
      'notas_recepcion', v_orden.inspeccion_360_notas,
      'firma_ruta', v_orden.firma_ruta,
      'firma_fecha', v_orden.firma_fecha
    ),
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre,
        'tiene_correo', public.es_correo_valido(c.email),
        'acepta_correos', c.acepta_correos,
        'idioma', c.idioma
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
    'traducciones', public._diccionario_traducciones(v_orden.id),
    'vehiculo', (
      SELECT jsonb_build_object(
        'marca', v.marca,
        'modelo', v.modelo,
        'anio', v.anio,
        'color', v.color,
        'placa', v.placa,
        'vin_final', right(v.vin, 6)
      )
      FROM vehiculos v WHERE v.id = v_orden.vehiculo_id
    ),
    'multimedia', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'tipo', m.tipo,
          'origen', m.origen,
          'avance_id', m.avance_id,
          'zona', m.zona,
          'ruta', m.ruta,
          'ruta_miniatura', m.ruta_miniatura,
          'mime', m.mime,
          'duracion_seg', m.duracion_seg,
          'ancho', m.ancho,
          'alto', m.alto,
          'creado_en', m.creado_en
        ) ORDER BY m.creado_en
      )
      FROM orden_media m
      WHERE m.orden_id = v_orden.id AND m.visible_cliente
    ), '[]'::jsonb),
    'avances', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'fecha', a.creado_en,
        'mensaje', NULLIF(btrim(a.descripcion), '')
      ) ORDER BY a.creado_en DESC)
      FROM orden_avances a
      WHERE a.orden_id = v_orden.id
        AND a.visible_cliente
        AND (
          NULLIF(btrim(a.descripcion), '') IS NOT NULL
          OR EXISTS (SELECT 1 FROM orden_media m WHERE m.avance_id = a.id AND m.visible_cliente)
        )
    ), '[]'::jsonb),
    'observaciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id,
        'fecha', h.resuelto_en,
        'texto', btrim(h.texto_cliente)
      ) ORDER BY h.resuelto_en, h.id)
      FROM orden_hallazgos h
      WHERE h.orden_id = v_orden.id
        AND h.estado = 'descartado'
        AND h.en_reporte
        AND NULLIF(btrim(h.texto_cliente), '') IS NOT NULL
    ), '[]'::jsonb),
    'esperando_repuestos', CASE WHEN v_orden.estatus = 'entregado' THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('descripcion', r.descripcion, 'desde', r.pedido_en) ORDER BY r.pedido_en, r.descripcion)
      FROM orden_repuestos r
      WHERE r.orden_id = v_orden.id AND r.estado_pedido = 'pedido' AND r.estado <> 'rechazado'
    ), '[]'::jsonb) END,
    'presupuesto', (
      SELECT jsonb_build_object(
        'id', p.id,
        'numero', p.numero,
        'enviado_en', p.creado_en,
        'total', p.total_propuesto,
        'lineas', COALESCE((
          SELECT jsonb_agg(l.linea ORDER BY l.creado_en, l.descripcion)
          FROM (
            SELECT lb.creado_en, lb.descripcion, jsonb_build_object(
              'id', lb.id, 'tipo', 'mano_obra', 'descripcion', lb.descripcion,
              'cantidad', 1, 'precio_unitario', lb.costo, 'monto', lb.costo
            ) AS linea
            FROM orden_labor lb WHERE lb.presupuesto_id = p.id AND lb.estado = 'pendiente'
            UNION ALL
            SELECT r.creado_en, r.descripcion, jsonb_build_object(
              'id', r.id, 'tipo', 'repuesto', 'descripcion', r.descripcion,
              'cantidad', r.cantidad, 'precio_unitario', r.precio_venta_unitario, 'monto', r.subtotal
            )
            FROM orden_repuestos r WHERE r.presupuesto_id = p.id AND r.estado = 'pendiente'
          ) l
        ), '[]'::jsonb)
      )
      FROM presupuestos p
      WHERE p.orden_id = v_orden.id AND p.estado = 'enviado'
    ),
    'presupuestos_respondidos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', p.numero,
        'respondido_en', p.respondido_en,
        'via', p.respondido_via,
        'nombre', p.respondido_por_nombre,
        'total_aprobado', p.total_aprobado,
        'autorizados', (SELECT COUNT(*) FROM orden_labor WHERE presupuesto_id = p.id AND estado = 'aprobado')
                     + (SELECT COUNT(*) FROM orden_repuestos WHERE presupuesto_id = p.id AND estado = 'aprobado'),
        'rechazados', (SELECT COUNT(*) FROM orden_labor WHERE presupuesto_id = p.id AND estado = 'rechazado')
                    + (SELECT COUNT(*) FROM orden_repuestos WHERE presupuesto_id = p.id AND estado = 'rechazado')
      ) ORDER BY p.numero DESC)
      FROM presupuestos p
      WHERE p.orden_id = v_orden.id AND p.estado = 'respondido'
    ), '[]'::jsonb),
    'cuenta', jsonb_build_object(
      'mano_obra', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('descripcion', l.descripcion, 'monto', l.costo) ORDER BY l.creado_en, l.descripcion)
        FROM orden_labor l WHERE l.orden_id = v_orden.id AND l.estado = 'aprobado'
      ), '[]'::jsonb),
      'repuestos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'descripcion', r.descripcion,
          'cantidad', r.cantidad,
          'precio_unitario', r.precio_venta_unitario,
          'subtotal', r.subtotal
        ) ORDER BY r.creado_en, r.descripcion)
        FROM orden_repuestos r WHERE r.orden_id = v_orden.id AND r.estado = 'aprobado'
      ), '[]'::jsonb),
      'no_autorizados', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('descripcion', x.descripcion, 'monto', x.monto) ORDER BY x.creado_en)
        FROM (
          SELECT descripcion, costo AS monto, creado_en FROM orden_labor WHERE orden_id = v_orden.id AND estado = 'rechazado'
          UNION ALL
          SELECT descripcion, subtotal, creado_en FROM orden_repuestos WHERE orden_id = v_orden.id AND estado = 'rechazado'
        ) x
      ), '[]'::jsonb),
      'parqueo', v_parqueo_portal,
      'total_mano_obra', v_orden.total_labor,
      'total_repuestos', COALESCE(v_montos.total_repuestos, 0),
      'subtotal', COALESCE(v_orden.total_labor, 0) + COALESCE(v_montos.total_repuestos, 0),
      'descuento', COALESCE(v_montos.descuento, 0),
      'total', COALESCE(v_montos.total_general, 0),
      'deposito', COALESCE(v_montos.deposito_inicial, 0),
      'pagado', v_pagado,
      'otros_pagos', round(v_pagado - COALESCE(v_montos.deposito_inicial, 0), 2),
      'saldo', round(COALESCE(v_montos.total_general, 0) - v_pagado, 2)
    ),
    'proximo_servicio', (
      SELECT CASE
        WHEN ps.fecha IS NOT NULL OR ps.millas IS NOT NULL THEN
          jsonb_build_object(
            'fecha', ps.fecha,
            'millas', ps.millas,
            'nota', ps.nota
          )
        ELSE NULL
      END
      FROM public.orden_proximo_servicio ps
      WHERE ps.orden_id = v_orden.id
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.datos_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_portal(TEXT) TO service_role;

-- requiere_atencion (vigente en 20261010000022): agrega sugerencias_servicio
CREATE OR REPLACE FUNCTION public.requiere_atencion(p_sede_id UUID DEFAULT NULL, p_hoy DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_hoy      DATE := COALESCE(p_hoy, CURRENT_DATE);
  v_grupos   JSONB;
  v_correos  INTEGER;
  v_vacio    CONSTANT JSONB := jsonb_build_object('total', 0, 'ordenes', '[]'::jsonb);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración ve lo que requiere atención.' USING ERRCODE = '42501';
  END IF;

  WITH abiertas AS (
    SELECT o.id, o.numero_orden, o.estatus, o.fecha_estimada_entrega, o.fecha_finalizacion, o.lista_para_entregar_en
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

  SELECT COUNT(*)::int INTO v_correos
  FROM (
    SELECT DISTINCT COALESCE(c.clave_dedupe, c.id::text)
    FROM cola_envios c
    LEFT JOIN ordenes_trabajo o ON o.id = c.orden_id
    WHERE c.canal = 'email'
      AND c.estado = 'error'
      AND c.creado_en >= NOW() - INTERVAL '72 hours'
      AND (p_sede_id IS NULL OR o.sede_id = p_sede_id)
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
    'correos',              jsonb_build_object('total', v_correos)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.requiere_atencion(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requiere_atencion(UUID, DATE) TO authenticated;

-- Historial: sumar 'proximo_servicio' a la restricción y al trigger
ALTER TABLE public.historial_orden DROP CONSTRAINT IF EXISTS historial_orden_entidad_check;
ALTER TABLE public.historial_orden ADD CONSTRAINT historial_orden_entidad_check
  CHECK (entidad IN ('orden', 'mano_obra', 'repuesto', 'asignacion', 'deposito', 'descuento',
                     'presupuesto', 'archivo', 'avance', 'parqueo', 'proximo_servicio'));

-- trg_historial (vigente en 20261010000028)
CREATE OR REPLACE FUNCTION public.trg_historial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes   JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_despues JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_fila    JSONB := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
  v_accion  TEXT := CASE TG_OP WHEN 'INSERT' THEN 'crear' WHEN 'UPDATE' THEN 'cambiar' ELSE 'borrar' END;
  v_entidad TEXT;
  v_campos  TEXT[];
  v_orden   UUID;
  v_resumen TEXT;
  v_cambios JSONB;
  v_numero  TEXT;
  v_sede    UUID;
  v_actor   UUID := auth.uid();
  v_nombre  TEXT;
BEGIN
  BEGIN
    v_orden := COALESCE(v_fila ->> 'orden_id', v_fila ->> 'id')::uuid;

    CASE TG_TABLE_NAME
      WHEN 'ordenes_trabajo' THEN
        v_entidad := 'orden';
        v_orden := (v_fila ->> 'id')::uuid;
        v_resumen := v_fila ->> 'numero_orden';
        v_campos := ARRAY[
          'estatus', 'porcentaje_avance', 'tipo_trabajo', 'fecha_estimada_entrega',
          'millas_ingreso', 'nivel_gasolina', 'inspeccion_360_notas', 'cliente_id',
          'vehiculo_id', 'firma_fecha', 'motivo_autorizacion', 'archivada_en',
          'retirada_sin_reparar', 'lista_para_entregar_en',
          'con_seguro', 'aseguradora', 'numero_reclamo'];
      WHEN 'orden_labor' THEN
        v_entidad := 'mano_obra';
        v_resumen := v_fila ->> 'descripcion';
        v_campos := ARRAY['descripcion', 'costo', 'especialidad', 'estado', 'completado_en', 'tecnico'];
        IF v_antes IS NOT NULL THEN
          v_antes := v_antes || jsonb_build_object('tecnico',
            (SELECT nombre_completo FROM perfiles WHERE id = (v_antes ->> 'asignado_a')::uuid));
        END IF;
        IF v_despues IS NOT NULL THEN
          v_despues := v_despues || jsonb_build_object('tecnico',
            (SELECT nombre_completo FROM perfiles WHERE id = (v_despues ->> 'asignado_a')::uuid));
        END IF;
      WHEN 'orden_repuestos' THEN
        v_entidad := 'repuesto';
        v_resumen := v_fila ->> 'descripcion';
        v_campos := ARRAY['descripcion', 'cantidad', 'precio_venta_unitario', 'costo_unitario', 'estado', 'estado_pedido'];
      WHEN 'orden_asignaciones' THEN
        v_entidad := 'asignacion';
        SELECT nombre_completo INTO v_resumen FROM perfiles WHERE id = (v_fila ->> 'usuario_id')::uuid;
        v_campos := ARRAY['tipo_tarea', 'reparto'];
        IF v_antes IS NOT NULL THEN
          v_antes := v_antes || jsonb_build_object('reparto', (v_antes ->> 'origen') = 'manual');
        END IF;
        IF v_despues IS NOT NULL THEN
          v_despues := v_despues || jsonb_build_object('reparto', (v_despues ->> 'origen') = 'manual');
        END IF;
      WHEN 'orden_montos' THEN
        IF TG_OP = 'UPDATE'
           AND (v_antes ->> 'deposito_inicial') IS NOT DISTINCT FROM (v_despues ->> 'deposito_inicial') THEN
          v_entidad := 'descuento';
          v_campos := ARRAY['descuento', 'descuento_motivo'];
        ELSE
          v_entidad := 'deposito';
          v_campos := ARRAY['deposito_inicial'];
        END IF;
      WHEN 'presupuestos' THEN
        v_entidad := 'presupuesto';
        v_resumen := v_fila ->> 'numero';
        v_campos := ARRAY['estado', 'total_propuesto', 'total_aprobado', 'respondido_via', 'respondido_por_nombre'];
      WHEN 'orden_media' THEN
        v_entidad := 'archivo';
        v_resumen := concat_ws(' · ', v_fila ->> 'tipo', v_fila ->> 'origen', v_fila ->> 'zona');
        v_campos := ARRAY['tipo', 'origen', 'zona', 'visible_cliente'];
      WHEN 'orden_avances' THEN
        v_entidad := 'avance';
        v_resumen := left(v_fila ->> 'descripcion', 120);
        v_campos := ARRAY['descripcion', 'visible_cliente'];
      WHEN 'orden_parqueo' THEN
        IF TG_OP = 'INSERT'
           AND (v_fila ->> 'tarifa_manual') IS NULL
           AND (v_fila ->> 'inicio_manual') IS NULL
           AND (v_fila ->> 'nota') IS NULL
           AND COALESCE((v_fila ->> 'dias_exonerados')::int, 0) = 0
           AND COALESCE((v_fila ->> 'cobrar')::boolean, true) = true THEN
          RETURN NULL;
        END IF;
        v_entidad := 'parqueo';
        v_resumen := 'Ajuste de parqueo';
        v_campos := ARRAY['cobrar', 'tarifa_manual', 'inicio_manual', 'dias_exonerados', 'nota'];
      WHEN 'orden_proximo_servicio' THEN
        v_entidad := 'proximo_servicio';
        v_resumen := 'Próximo servicio';
        v_campos := ARRAY['fecha', 'millas', 'nota', 'sugerido_fecha', 'sugerido_millas', 'sugerido_nota'];
      ELSE
        RETURN NULL;
    END CASE;

    v_cambios := CASE TG_OP
      WHEN 'UPDATE' THEN public._historial_diferencias(v_antes, v_despues, v_campos)
      WHEN 'INSERT' THEN public._historial_valores(v_despues, v_campos, 'despues')
      ELSE public._historial_valores(v_antes, v_campos, 'antes')
    END;

    IF TG_OP = 'UPDATE' AND v_cambios = '{}'::jsonb THEN
      RETURN NULL;
    END IF;

    IF TG_TABLE_NAME = 'ordenes_trabajo' THEN
      v_numero := v_fila ->> 'numero_orden';
      v_sede := (v_fila ->> 'sede_id')::uuid;
    ELSE
      SELECT numero_orden, sede_id INTO v_numero, v_sede FROM ordenes_trabajo WHERE id = v_orden;
      IF NOT FOUND THEN
        RETURN NULL;
      END IF;
    END IF;

    IF v_actor IS NOT NULL THEN
      SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = v_actor;
    END IF;

    INSERT INTO historial_orden (
      orden_id, numero_orden, sede_id, actor_id, actor_nombre, origen,
      entidad, entidad_id, accion, resumen, cambios
    ) VALUES (
      v_orden, v_numero, v_sede, v_actor, v_nombre,
      CASE auth.role() WHEN 'authenticated' THEN 'app' WHEN 'service_role' THEN 'portal' ELSE 'sistema' END,
      v_entidad,
      CASE WHEN TG_TABLE_NAME IN ('orden_montos', 'orden_proximo_servicio') THEN v_orden ELSE (v_fila ->> 'id')::uuid END,
      v_accion, v_resumen, v_cambios
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'historial_orden (%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_historial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_historial ON public.orden_proximo_servicio;
CREATE TRIGGER trg_historial
  AFTER INSERT OR UPDATE OF
    fecha, millas, nota, sugerido_fecha, sugerido_millas, sugerido_nota
  ON public.orden_proximo_servicio
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();
