-- 20261010000038_arreglos_segunda_ronda.sql
-- Lo que salió de la segunda ronda del QA del 19/10/2026 (docs/qa-2026-10-18.md §8) y vive en la base.
-- Cada función se reescribe entera desde su versión vigente (npm run db:donde -- <nombre>).
--
--   1. Finanzas: un admin podía borrar desde la API el cobro que el sistema asentó (un depósito, el pago al
--      entregar, el costo de un repuesto, el egreso de un pago de comisiones). La orden seguía diciendo que se
--      depositó, pero saldo_orden ya no lo contaba y al entregar se cobraba otra vez. Cada movimiento lleva su
--      origen ('manual' o 'sistema'; lo pone un trigger según quién escribe, no el cliente) y un admin solo
--      edita o borra los manuales y los de una importación bancaria (esa se deshace por su propia RPC).
--   2. aprobar_comision: una bolsa compartida reparte los centavos de la bolsa entera (tres técnicos al 35 % de
--      $1.000 sumaban $350,01).
--   3. pay_commissions y requiere_atencion: la fecha por omisión es la del taller, no CURRENT_DATE (UTC).
--   4. trg_avance_labor_match: fija search_path y no es llamable por la API.
--   5. Índices de las seis claves foráneas que no los tenían.
--   6. anon y authenticated ya no tienen TRUNCATE, TRIGGER ni REFERENCES en ninguna tabla.
--   7. _parqueo_calculo ya no se dice IMMUTABLE ni _diccionario_traducciones STABLE (supabase db lint).
--   8. Sticker de próximo servicio: programar bloquea la orden (dos admins a la vez ya no dan dos códigos y
--      el código existente nunca se pisa), el idioma que elige administración se guarda y la página del QR lo
--      usa, y un millaje negativo da un mensaje claro en vez de la violación del CHECK.

-- ------------------------------------------------------------------------------------
-- 1. Origen de los movimientos de finanzas
-- ------------------------------------------------------------------------------------
ALTER TABLE public.finanzas_movimientos
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual'
  CHECK (origen IN ('manual', 'sistema'));

-- Lo que ya estaba: el sistema asentó lo que no tiene quien lo registrara, lo que viene de un pago de
-- comisiones y los cobros ligados a una orden.
UPDATE public.finanzas_movimientos
SET origen = 'sistema'
WHERE importacion_id IS NULL
  AND (registrado_por IS NULL
       OR comision_pago_id IS NOT NULL
       OR (categoria = 'pago_cliente' AND referencia_orden_id IS NOT NULL));

-- Lo nuevo es del sistema salvo que lo escriba una persona directo por la API.
ALTER TABLE public.finanzas_movimientos ALTER COLUMN origen SET DEFAULT 'sistema';

-- INVOKER a propósito: current_user es el rol de quien escribe. Una función SECURITY DEFINER (el cobro al
-- entregar, el costo de repuestos, el pago de comisiones) escribe como su dueño, y una persona por la API,
-- como authenticated.
CREATE OR REPLACE FUNCTION public.trg_finanzas_origen()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.origen := CASE WHEN current_user IN ('authenticated', 'anon') THEN 'manual' ELSE 'sistema' END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_finanzas_origen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finanzas_origen ON public.finanzas_movimientos;
CREATE TRIGGER trg_finanzas_origen
  BEFORE INSERT ON public.finanzas_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.trg_finanzas_origen();

DROP POLICY IF EXISTS "finanzas_movimientos_admin" ON public.finanzas_movimientos;

CREATE POLICY "finanzas_movimientos_select" ON public.finanzas_movimientos
  FOR SELECT
  USING (((SELECT public.current_user_role()) = 'admin'::user_role));

CREATE POLICY "finanzas_movimientos_insert" ON public.finanzas_movimientos
  FOR INSERT
  WITH CHECK (((SELECT public.current_user_role()) = 'admin'::user_role));

-- Solo lo manual y lo importado: lo del sistema se corrige desde su origen (la orden, el pago).
CREATE POLICY "finanzas_movimientos_update" ON public.finanzas_movimientos
  FOR UPDATE
  USING (((SELECT public.current_user_role()) = 'admin'::user_role)
         AND (origen = 'manual' OR importacion_id IS NOT NULL))
  WITH CHECK (((SELECT public.current_user_role()) = 'admin'::user_role)
              AND (origen = 'manual' OR importacion_id IS NOT NULL));

CREATE POLICY "finanzas_movimientos_delete" ON public.finanzas_movimientos
  FOR DELETE
  USING (((SELECT public.current_user_role()) = 'admin'::user_role)
         AND (origen = 'manual' OR importacion_id IS NOT NULL));

-- ------------------------------------------------------------------------------------
-- 2. Comisión de una bolsa compartida
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprobar_comision(p_comision_id UUID, p_monto NUMERIC DEFAULT NULL, p_porcentaje NUMERIC DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c     comisiones;
  v_monto NUMERIC;
  d       JSONB;
  v_bolsa BIGINT;
  v_n     INTEGER;
  v_lugar INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aprobar comisiones.' USING ERRCODE = '42501';
  END IF;
  IF p_monto IS NOT NULL AND p_monto < 0 THEN
    RAISE EXCEPTION 'La comisión no puede ser negativa.' USING ERRCODE = '22023';
  END IF;
  IF p_porcentaje IS NOT NULL AND (p_porcentaje < 0 OR p_porcentaje > 100) THEN
    RAISE EXCEPTION 'El porcentaje tiene que estar entre 0 y 100.' USING ERRCODE = '22023';
  END IF;

  -- Bloqueada: un pago que entre al mismo tiempo no paga un monto que está cambiando.
  SELECT * INTO v_c FROM comisiones WHERE id = p_comision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa comisión ya no existe: vuelve a abrir la orden.' USING ERRCODE = 'P0002';
  END IF;
  IF v_c.pago_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esa comisión ya se pagó: no se puede cambiar.' USING ERRCODE = '42501';
  END IF;

  IF p_monto IS NULL AND p_porcentaje IS NOT NULL THEN
    IF v_c.labor_id IS NULL AND v_c.tecnicos > 1 THEN
      -- Bolsa compartida: los centavos de la bolsa entera se reparten entre sus filas, y a las
      -- primeras les toca el sobrante. Con la cuenta por fila, tres técnicos al 35 % de $1.000
      -- sumaban $350,01.
      v_bolsa := round(v_c.base_ganancia * p_porcentaje);
      v_n := v_c.tecnicos;
      SELECT COUNT(*)::int INTO v_lugar
      FROM comisiones x
      WHERE x.orden_id = v_c.orden_id
        AND x.especialidad IS NOT DISTINCT FROM v_c.especialidad
        AND x.labor_id IS NULL
        AND (x.usuario_id, x.id) < (v_c.usuario_id, v_c.id);
      v_monto := ((v_bolsa / v_n) + CASE WHEN v_lugar < (v_bolsa % v_n) THEN 1 ELSE 0 END)::NUMERIC / 100;
    ELSE
      v_monto := (round(v_c.base_ganancia * p_porcentaje / GREATEST(v_c.tecnicos, 1)) / 100)::NUMERIC(12,2);
    END IF;
  ELSE
    v_monto := COALESCE(round(p_monto, 2), v_c.monto);
  END IF;

  UPDATE comisiones
  SET estado = 'aceptada',
      monto = v_monto,
      porcentaje = COALESCE(p_porcentaje, porcentaje)
  WHERE id = p_comision_id;

  BEGIN
    d := public.datos_orden_aviso(v_c.orden_id);
    PERFORM public.notificar(
      ARRAY[v_c.usuario_id],
      'comision_generada',
      'Comisión aprobada · ' || (d->>'numero_orden'),
      '$' || to_char(v_monto, 'FM999,999,990.00') || ' por la mano de obra de ' ||
        COALESCE(NULLIF(d->>'vehiculo', ''), 'la orden'),
      d || jsonb_build_object('monto', v_monto),
      v_c.orden_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'aprobar_comision (aviso): %', SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.aprobar_comision(UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_comision(UUID, NUMERIC, NUMERIC) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 3. Fecha del taller por omisión
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_commissions(
  p_usuario_id      UUID,
  p_comision_ids    UUID[],
  p_fecha_pago      DATE DEFAULT NULL,
  p_metodo          TEXT DEFAULT 'cheque',
  p_numero_cheque   TEXT DEFAULT NULL,
  p_comprobante_url TEXT DEFAULT NULL,
  p_notas           TEXT DEFAULT NULL
)
RETURNS comision_pagos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total    NUMERIC;
  v_sedes    UUID[];
  v_sede     UUID;
  v_pago     comision_pagos;
  v_nombre   TEXT;
  v_asentado NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar pagos de comisiones.'
      USING ERRCODE = '42501';
  END IF;

  -- Dos administradores (o dos pestañas) pagando lo mismo: el segundo espera aquí y
  -- después no encuentra nada pendiente.
  PERFORM 1 FROM comisiones
  WHERE id = ANY(p_comision_ids) AND usuario_id = p_usuario_id
  ORDER BY id
  FOR UPDATE;

  SELECT COALESCE(SUM(monto), 0), array_agg(DISTINCT sede_id)
    INTO v_total, v_sedes
  FROM comisiones
  WHERE id = ANY(p_comision_ids)
    AND usuario_id = p_usuario_id
    AND pago_id IS NULL
    AND estado = 'aceptada';

  IF v_total <= 0 THEN
    IF EXISTS (
      SELECT 1 FROM comisiones
      WHERE id = ANY(p_comision_ids) AND usuario_id = p_usuario_id
        AND pago_id IS NULL AND estado = 'sugerida'
    ) THEN
      RAISE EXCEPTION 'Esas comisiones todavía no están aceptadas. Revísalas y acéptalas antes de pagarlas.'
        USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'No hay comisiones pendientes para pagar en esta selección.'
      USING ERRCODE = 'P0001';
  END IF;

  IF array_length(v_sedes, 1) > 1 THEN
    RAISE EXCEPTION 'No se pueden pagar en un solo cheque comisiones de sedes distintas.'
      USING ERRCODE = 'P0001';
  END IF;

  v_sede := v_sedes[1];

  INSERT INTO comision_pagos (
    sede_id, usuario_id, monto, fecha_pago, metodo, numero_cheque, comprobante_url, notas, pagado_por
  )
  VALUES (
    v_sede, p_usuario_id, v_total, COALESCE(p_fecha_pago, public.hoy_taller(v_sede)),
    COALESCE(NULLIF(btrim(p_metodo), ''), 'cheque'),
    NULLIF(btrim(p_numero_cheque), ''),
    NULLIF(btrim(p_comprobante_url), ''),
    NULLIF(btrim(p_notas), ''),
    auth.uid()
  )
  RETURNING * INTO v_pago;

  UPDATE comisiones
  SET pago_id = v_pago.id
  WHERE id = ANY(p_comision_ids)
    AND usuario_id = p_usuario_id
    AND pago_id IS NULL
    AND estado = 'aceptada';

  SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = p_usuario_id;

  -- Un egreso por orden: lo que este pago cubre de cada una (las dos bolsas de una misma
  -- persona en una orden van juntas).
  INSERT INTO finanzas_movimientos (
    sede_id, tipo, categoria, monto, descripcion, fecha, numero_cheque,
    registrado_por, comision_pago_id, referencia_orden_id
  )
  SELECT
    v_sede, 'egreso', 'planilla', SUM(c.monto),
    'Comisión ' || COALESCE(v_nombre, 'empleado') || ' - ' || o.numero_orden,
    v_pago.fecha_pago, v_pago.numero_cheque, auth.uid(), v_pago.id, c.orden_id
  FROM comisiones c
  JOIN ordenes_trabajo o ON o.id = c.orden_id
  WHERE c.pago_id = v_pago.id
  GROUP BY c.orden_id, o.numero_orden;

  -- Lo asentado tiene que ser exactamente lo pagado.
  SELECT COALESCE(SUM(monto), 0) INTO v_asentado
  FROM finanzas_movimientos WHERE comision_pago_id = v_pago.id;

  IF v_asentado <> v_total THEN
    RAISE EXCEPTION 'Los egresos del pago (%) no cuadran con el pago (%).', v_asentado, v_total
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_pago;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_commissions(UUID, UUID[], DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_commissions(UUID, UUID[], DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;

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

-- ------------------------------------------------------------------------------------
-- 4. Función de trigger sin permisos de RPC y con search_path
-- ------------------------------------------------------------------------------------
ALTER FUNCTION public.trg_avance_labor_match() SET search_path = public;
REVOKE ALL ON FUNCTION public.trg_avance_labor_match() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 5. Índices de claves foráneas
-- ------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orden_labor_trabajo ON public.orden_labor (trabajo_id, orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_repuestos_trabajo ON public.orden_repuestos (trabajo_id, orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_media_inspeccion_punto ON public.orden_media (inspeccion_punto_id, orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_inspecciones_creado_por ON public.orden_inspecciones (creado_por);
CREATE INDEX IF NOT EXISTS idx_orden_inspecciones_completada_por ON public.orden_inspecciones (completada_por);
CREATE INDEX IF NOT EXISTS idx_orden_inspeccion_puntos_actualizado_por ON public.orden_inspeccion_puntos (actualizado_por);

-- ------------------------------------------------------------------------------------
-- 6. Permisos de tabla que sobran
-- ------------------------------------------------------------------------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 7. Volatilidad honesta
-- ------------------------------------------------------------------------------------
ALTER FUNCTION public._parqueo_calculo(JSONB, DATE, DATE, DATE, JSONB) STABLE;
ALTER FUNCTION public._diccionario_traducciones(UUID) VOLATILE;

-- ------------------------------------------------------------------------------------
-- 8. Sticker de próximo servicio
-- ------------------------------------------------------------------------------------
ALTER TABLE public.orden_proximo_servicio
  ADD COLUMN IF NOT EXISTS idioma TEXT CHECK (idioma IS NULL OR idioma IN ('es', 'en'));

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

  IF p_millas IS NOT NULL AND p_millas < 0 THEN
    RAISE EXCEPTION 'El millaje no puede ser negativo.' USING ERRCODE = '22023';
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

-- La firma cambia (suma el idioma): se suelta la de cuatro argumentos para no dejar dos funciones.
DROP FUNCTION IF EXISTS public.programar_proximo_servicio(UUID, DATE, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.programar_proximo_servicio(
  p_orden_id UUID,
  p_fecha    DATE,
  p_millas   INTEGER,
  p_nota     TEXT,
  p_idioma   TEXT DEFAULT NULL
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

  -- Bloqueada: dos administradores que programan a la vez una orden sin código leían los dos NULL y
  -- generaban dos códigos; el segundo pisaba al primero y el sticker ya impreso quedaba muerto.
  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
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

  IF p_millas IS NOT NULL AND p_millas < 0 THEN
    RAISE EXCEPTION 'El millaje no puede ser negativo.' USING ERRCODE = '22023';
  END IF;

  IF p_millas IS NOT NULL AND v_orden.millas_ingreso IS NOT NULL AND p_millas < v_orden.millas_ingreso THEN
    RAISE EXCEPTION 'El millaje no puede ser menor que las millas de ingreso del vehículo (%).', v_orden.millas_ingreso
      USING ERRCODE = '22023';
  END IF;

  IF p_idioma IS NOT NULL AND p_idioma NOT IN ('es', 'en') THEN
    RAISE EXCEPTION 'El idioma del sticker tiene que ser es o en.' USING ERRCODE = '22023';
  END IF;

  -- Preservar token existente o generar uno nuevo de 64 hex
  SELECT token INTO v_token FROM public.orden_proximo_servicio WHERE orden_id = p_orden_id;
  IF v_token IS NULL THEN
    v_token := lower(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
  END IF;

  INSERT INTO public.orden_proximo_servicio (
    orden_id, sede_id,
    fecha, millas, nota, token, idioma, programado_por, programado_en,
    sugerido_fecha, sugerido_millas, sugerido_nota, sugerido_por, sugerido_en
  ) VALUES (
    v_orden.id, v_orden.sede_id,
    p_fecha, p_millas, v_nota, v_token, p_idioma, auth.uid(), NOW(),
    NULL, NULL, NULL, NULL, NULL
  )
  ON CONFLICT (orden_id) DO UPDATE SET
    fecha           = EXCLUDED.fecha,
    millas          = EXCLUDED.millas,
    nota            = EXCLUDED.nota,
    token           = COALESCE(orden_proximo_servicio.token, v_token),
    -- Sin idioma nuevo se queda el que ya tenía.
    idioma          = COALESCE(EXCLUDED.idioma, orden_proximo_servicio.idioma),
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

REVOKE ALL ON FUNCTION public.programar_proximo_servicio(UUID, DATE, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.programar_proximo_servicio(UUID, DATE, INTEGER, TEXT, TEXT) TO authenticated;

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
    -- El idioma que eligió administración para el sticker; sin él, el del cliente.
    'idioma', COALESCE(v_ps.idioma, v_idioma, 'en'),
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
