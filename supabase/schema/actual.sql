-- ============================================================================
-- RESTORIFY — Esquema vigente del esquema `public` (SOLO LECTURA)
-- ============================================================================
-- Qué es: foto completa del estado actual de la base (tablas, funciones,
--         triggers, políticas RLS, vistas e índices del esquema `public`).
--
-- NO editar a mano: cualquier cambio manual se perderá al regenerar y hará
--                   fallar la verificación del CI.
-- NO es una migración ni se aplica contra ninguna base de datos.
-- La fuente de verdad que manda es `supabase/migrations/`.
--
-- Cómo regenerar después de añadir o cambiar una migración:
--   npm run db:schema
-- ============================================================================

SELECT pg_catalog.set_config('search_path', '', false);

CREATE SCHEMA IF NOT EXISTS "public";

ALTER SCHEMA "public" OWNER TO "pg_database_owner";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE TYPE "public"."order_status" AS ENUM (
    'recepcion',
    'en_proceso',
    'espera_autorizacion',
    'finalizado',
    'entregado'
);

ALTER TYPE "public"."order_status" OWNER TO "postgres";

CREATE TYPE "public"."task_status" AS ENUM (
    'pendiente',
    'en_curso',
    'completada'
);

ALTER TYPE "public"."task_status" OWNER TO "postgres";

CREATE TYPE "public"."transaction_category" AS ENUM (
    'pago_cliente',
    'compra_repuesto',
    'planilla',
    'gasto_operativo',
    'comision_bancaria'
);

ALTER TYPE "public"."transaction_category" OWNER TO "postgres";

CREATE TYPE "public"."transaction_type" AS ENUM (
    'ingreso',
    'egreso'
);

ALTER TYPE "public"."transaction_type" OWNER TO "postgres";

CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'mecanico',
    'pintor'
);

ALTER TYPE "public"."user_role" OWNER TO "postgres";

CREATE TYPE "public"."work_type" AS ENUM (
    'mecanica',
    'pintura',
    'combinado'
);

ALTER TYPE "public"."work_type" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_agregar_borradores"("p_presupuesto_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden UUID;
  v_prev  TEXT := current_setting('restorify.presupuesto', true);
  v_labor INTEGER;
  v_parts INTEGER;
BEGIN
  SELECT orden_id INTO v_orden FROM presupuestos WHERE id = p_presupuesto_id AND estado = 'enviado';
  IF v_orden IS NULL THEN
    RAISE EXCEPTION 'El presupuesto no está abierto.';
  END IF;

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET estado = 'pendiente', presupuesto_id = p_presupuesto_id
  WHERE orden_id = v_orden AND estado = 'borrador';
  GET DIAGNOSTICS v_labor = ROW_COUNT;
  UPDATE orden_repuestos SET estado = 'pendiente', presupuesto_id = p_presupuesto_id
  WHERE orden_id = v_orden AND estado = 'borrador';
  GET DIAGNOSTICS v_parts = ROW_COUNT;
  PERFORM set_config('restorify.presupuesto', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  UPDATE presupuestos
  SET total_propuesto =
        (SELECT COALESCE(SUM(costo), 0) FROM orden_labor WHERE presupuesto_id = p_presupuesto_id)
      + (SELECT COALESCE(SUM(subtotal), 0) FROM orden_repuestos WHERE presupuesto_id = p_presupuesto_id)
  WHERE id = p_presupuesto_id;

  RETURN v_labor + v_parts;
END;
$$;

ALTER FUNCTION "public"."_agregar_borradores"("p_presupuesto_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_avance_por_tareas"("p_orden_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN COUNT(*) = 0 THEN NULL
    WHEN COALESCE(SUM(costo), 0) > 0 THEN
      round(100 * COALESCE(SUM(costo) FILTER (WHERE completado_en IS NOT NULL), 0) / SUM(costo))::int
    ELSE
      round(100.0 * COUNT(*) FILTER (WHERE completado_en IS NOT NULL) / COUNT(*))::int
  END
  FROM orden_labor
  WHERE orden_id = p_orden_id AND estado = 'aprobado';
$$;

ALTER FUNCTION "public"."_avance_por_tareas"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_balance_orden"("p_orden_id" "uuid") RETURNS TABLE("total_orden" numeric, "cobrado" numeric, "costo_repuestos" numeric, "comisiones" numeric, "comisiones_pagadas" numeric, "margen" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH v AS (
    SELECT
      COALESCE((SELECT total_general FROM orden_montos WHERE orden_id = p_orden_id), 0) AS total_orden,
      -- Todo lo cobrado al cliente, como lo cuenta el saldo: depósito, pagos, devoluciones.
      COALESCE((
        SELECT SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END)
        FROM finanzas_movimientos
        WHERE referencia_orden_id = p_orden_id AND categoria = 'pago_cliente'
          AND importacion_id IS NULL
      ), 0) AS cobrado,
      -- El costo automático de las líneas: lo asientan los triggers, sin quién ni lote.
      COALESCE((
        SELECT SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END)
        FROM finanzas_movimientos
        WHERE referencia_orden_id = p_orden_id AND categoria = 'compra_repuesto'
          AND importacion_id IS NULL AND registrado_por IS NULL
      ), 0) AS costo_repuestos,
      COALESCE((SELECT SUM(monto) FROM comisiones WHERE orden_id = p_orden_id), 0) AS comisiones,
      COALESCE((SELECT SUM(monto) FROM comisiones WHERE orden_id = p_orden_id AND pago_id IS NOT NULL), 0) AS comisiones_pagadas
  )
  SELECT round(total_orden, 2), round(cobrado, 2), round(costo_repuestos, 2), round(comisiones, 2),
         round(comisiones_pagadas, 2), round(cobrado - costo_repuestos - comisiones, 2)
  FROM v;
$$;

ALTER FUNCTION "public"."_balance_orden"("p_orden_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."presupuestos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "numero" integer NOT NULL,
    "estado" "text" DEFAULT 'enviado'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enviado_por" "uuid",
    "total_propuesto" numeric(12,2) DEFAULT 0 NOT NULL,
    "respondido_en" timestamp with time zone,
    "respondido_via" "text",
    "respondido_por_nombre" "text",
    "respondido_por_perfil" "uuid",
    "total_aprobado" numeric(12,2),
    "comentario_cliente" "text",
    "nota_admin" "text",
    "ip" "text",
    "user_agent" "text",
    "cancelado_en" timestamp with time zone,
    "recordado_en" timestamp with time zone,
    CONSTRAINT "presupuestos_estado_check" CHECK (("estado" = ANY (ARRAY['enviado'::"text", 'respondido'::"text", 'cancelado'::"text"]))),
    CONSTRAINT "presupuestos_respondido_via_check" CHECK (("respondido_via" = ANY (ARRAY['cliente_portal'::"text", 'admin_telefono'::"text", 'admin_presencial'::"text", 'admin_whatsapp'::"text", 'firma_recepcion'::"text"])))
);

ALTER TABLE "public"."presupuestos" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_crear_presupuesto"("p_orden_id" "uuid") RETURNS "public"."presupuestos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sede   UUID;
  v_numero INTEGER;
  v_p      presupuestos;
BEGIN
  -- Bloquea la orden: dos presupuestos a la vez no se llevan el mismo número.
  SELECT sede_id INTO v_sede FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF v_sede IS NULL THEN
    RAISE EXCEPTION 'La orden % no existe.', p_orden_id;
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero FROM presupuestos WHERE orden_id = p_orden_id;

  INSERT INTO presupuestos (orden_id, sede_id, numero, enviado_por)
  VALUES (p_orden_id, v_sede, v_numero, (SELECT id FROM perfiles WHERE id = auth.uid()))
  RETURNING * INTO v_p;

  PERFORM public._agregar_borradores(v_p.id);
  SELECT * INTO v_p FROM presupuestos WHERE id = v_p.id;
  RETURN v_p;
END;
$$;

ALTER FUNCTION "public"."_crear_presupuesto"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_diccionario_traducciones"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sede_id UUID;
  v_textos  TEXT[];
  v_dict    JSONB;
BEGIN
  SELECT sede_id INTO v_sede_id FROM ordenes_trabajo WHERE id = p_orden_id;
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  v_textos := public._textos_cliente(p_orden_id);
  IF array_length(v_textos, 1) IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_object_agg(texto_original, traduccion) INTO v_dict
  FROM traducciones
  WHERE sede_id = v_sede_id
    AND idioma_destino = 'en'
    AND md5_hash = ANY (ARRAY(SELECT md5(t) FROM unnest(v_textos) t));

  RETURN COALESCE(v_dict, '{}'::jsonb);
END;
$$;

ALTER FUNCTION "public"."_diccionario_traducciones"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_estatus_cliente"("p_estatus" "public"."order_status", "p_lista" timestamp with time zone) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE WHEN p_estatus = 'finalizado' AND p_lista IS NULL THEN 'en_proceso' ELSE p_estatus::text END;
$$;

ALTER FUNCTION "public"."_estatus_cliente"("p_estatus" "public"."order_status", "p_lista" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_historial_diferencias"("p_antes" "jsonb", "p_despues" "jsonb", "p_campos" "text"[]) RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    jsonb_object_agg(c, jsonb_build_object('antes', p_antes -> c, 'despues', p_despues -> c)),
    '{}'::jsonb)
  FROM unnest(p_campos) AS c
  WHERE (p_antes -> c) IS DISTINCT FROM (p_despues -> c);
$$;

ALTER FUNCTION "public"."_historial_diferencias"("p_antes" "jsonb", "p_despues" "jsonb", "p_campos" "text"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_historial_valores"("p_fila" "jsonb", "p_campos" "text"[], "p_clave" "text") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(jsonb_object_agg(c, jsonb_build_object(p_clave, p_fila -> c)), '{}'::jsonb)
  FROM unnest(p_campos) AS c
  WHERE p_fila -> c IS NOT NULL
    AND p_fila -> c <> 'null'::jsonb
    AND p_fila -> c <> '""'::jsonb;
$$;

ALTER FUNCTION "public"."_historial_valores"("p_fila" "jsonb", "p_campos" "text"[], "p_clave" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_lineas_pendientes"("p_presupuesto_id" "uuid") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(array_agg(id ORDER BY id), '{}')
  FROM (
    SELECT id FROM orden_labor WHERE presupuesto_id = p_presupuesto_id AND estado = 'pendiente'
    UNION
    SELECT id FROM orden_repuestos WHERE presupuesto_id = p_presupuesto_id AND estado = 'pendiente'
  ) s;
$$;

ALTER FUNCTION "public"."_lineas_pendientes"("p_presupuesto_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_parqueo_calcular"("p_orden_id" "uuid", "p_hasta" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden                ordenes_trabajo;
  v_tz                   TEXT;
  v_cfg                  parqueo_config;
  v_ajustes              orden_parqueo;
  v_tipo_perfil          TEXT;
  v_perfil               parqueo_perfiles;
  v_tramos               JSONB := '[]'::jsonb;
  v_estado               TEXT;
  v_fecha_ingreso_taller DATE;
  v_fecha_evento         DATE;
  v_hasta                DATE;
  v_perfil_json          JSONB;
  v_ajustes_json         JSONB;
  v_calc                 JSONB;
  v_inicio               DATE;
  v_tarifa_inicial       NUMERIC := 0;
BEGIN
  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(btrim(zona_horaria), '') INTO v_tz FROM sedes WHERE id = v_orden.sede_id;
  SELECT * INTO v_cfg FROM parqueo_config WHERE sede_id = v_orden.sede_id;
  SELECT * INTO v_ajustes FROM orden_parqueo WHERE orden_id = p_orden_id;

  v_tipo_perfil := CASE WHEN v_orden.con_seguro THEN 'seguro' ELSE 'particular' END;
  SELECT * INTO v_perfil FROM parqueo_perfiles WHERE sede_id = v_orden.sede_id AND tipo = v_tipo_perfil;

  IF v_perfil.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('desde_dia', desde_dia, 'tarifa_diaria', tarifa_diaria)
      ORDER BY desde_dia
    ), '[]'::jsonb)
    INTO v_tramos
    FROM parqueo_tramos
    WHERE perfil_id = v_perfil.id;
  END IF;

  -- Tarifa inicial para avisos y cliente
  IF v_ajustes.tarifa_manual IS NOT NULL THEN
    v_tarifa_inicial := v_ajustes.tarifa_manual;
  ELSIF v_tramos IS NOT NULL AND jsonb_array_length(v_tramos) > 0 THEN
    v_tarifa_inicial := (v_tramos->0->>'tarifa_diaria')::numeric;
  ELSE
    v_tarifa_inicial := 0;
  END IF;

  -- Una orden entregada sin `fin_congelado` se entregó antes de este módulo: desde esta
  -- migración toda entrega lo fija (`entregar_orden` y, de red, `trg_parqueo_orden`). Nunca se
  -- vuelve a contar y se queda con lo guardado (nada, si no tiene fila). Sin esto, abrir una
  -- orden vieja con el módulo encendido y "vigente desde" en el pasado contaba el parqueo hasta
  -- hoy y asentaba un "cargo adicional" que nadie pagó (auditoría del 10/10/2026).
  IF v_orden.estatus = 'entregado' AND v_ajustes.fin_congelado IS NULL THEN
    RETURN jsonb_build_object(
      'inicio', v_ajustes.inicio_cobro,
      'dias', COALESCE(v_ajustes.dias_cobrados, 0),
      'monto', COALESCE(v_ajustes.monto, 0),
      'detalle', COALESCE(v_ajustes.detalle, '[]'::jsonb),
      'tope_aplicado', COALESCE(v_ajustes.tope_aplicado, false),
      'perfil', v_tipo_perfil,
      'estado', CASE WHEN COALESCE(v_ajustes.monto, 0) > 0 THEN 'cerrado' ELSE 'orden_previa' END,
      'tarifa_inicial', v_tarifa_inicial,
      'dias_gracia', COALESCE(v_perfil.dias_gracia, 0),
      'evento_inicio', v_perfil.evento_inicio,
      'cobra_dia_evento', COALESCE(v_perfil.cobra_dia_evento, false),
      'politica_es', v_cfg.politica_es,
      'politica_en', v_cfg.politica_en
    );
  END IF;

  -- 1. Evaluar si está inactivo
  IF v_cfg.habilitado IS NOT TRUE OR v_perfil.habilitado IS NOT TRUE OR v_cfg.sede_id IS NULL OR v_perfil.id IS NULL THEN
    v_estado := 'inactivo';
  -- 2. Sin cobro en esta orden
  ELSIF COALESCE(v_ajustes.cobrar, true) IS FALSE THEN
    v_estado := 'sin_cobro';
  ELSE
    v_fecha_ingreso_taller := (v_orden.fecha_ingreso AT TIME ZONE COALESCE(v_tz, 'America/New_York'))::date;
    -- 3. Orden previa a la vigencia
    IF v_cfg.vigente_desde IS NOT NULL AND v_fecha_ingreso_taller < v_cfg.vigente_desde AND NOT COALESCE(v_cfg.incluir_ordenes_previas, false) THEN
      v_estado := 'orden_previa';
    ELSE
      -- Determinar fecha del evento
      IF v_perfil.evento_inicio = 'ingreso' THEN
        v_fecha_evento := v_fecha_ingreso_taller;
      ELSIF v_perfil.evento_inicio = 'lista_para_entregar' THEN
        IF v_orden.lista_para_entregar_en IS NOT NULL THEN
          v_fecha_evento := (v_orden.lista_para_entregar_en AT TIME ZONE COALESCE(v_tz, 'America/New_York'))::date;
        ELSE
          v_fecha_evento := NULL;
        END IF;
      END IF;

      -- 4. Esperando evento (particular sin lista para entregar)
      IF v_fecha_evento IS NULL AND v_ajustes.inicio_manual IS NULL THEN
        v_estado := 'esperando';
      ELSE
        -- Fecha hasta
        IF v_orden.estatus = 'entregado' AND v_ajustes.fin_congelado IS NOT NULL THEN
          v_hasta := v_ajustes.fin_congelado;
        ELSE
          v_hasta := COALESCE(p_hasta, public.hoy_taller(v_orden.sede_id));
        END IF;

        v_perfil_json := jsonb_build_object(
          'cobra_dia_evento', v_perfil.cobra_dia_evento,
          'dias_gracia', v_perfil.dias_gracia,
          'gracia_dias_habiles', v_perfil.gracia_dias_habiles,
          'tope_dias', v_perfil.tope_dias,
          'tope_monto', v_perfil.tope_monto,
          'tramos', v_tramos
        );

        v_ajustes_json := jsonb_build_object(
          'tarifa_manual', v_ajustes.tarifa_manual,
          'inicio_manual', v_ajustes.inicio_manual,
          'dias_exonerados', COALESCE(v_ajustes.dias_exonerados, 0)
        );

        v_calc := public._parqueo_calculo(v_perfil_json, v_fecha_evento, v_hasta, v_cfg.vigente_desde, v_ajustes_json);
        v_inicio := NULLIF(v_calc->>'inicio', '')::date;

        IF v_orden.estatus = 'entregado' THEN
          v_estado := 'cerrado';
        ELSIF v_inicio IS NOT NULL AND v_inicio > public.hoy_taller(v_orden.sede_id) THEN
          v_estado := 'por_empezar';
        ELSE
          v_estado := 'acumulando';
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_estado IN ('inactivo', 'sin_cobro', 'orden_previa', 'esperando') THEN
    RETURN jsonb_build_object(
      'inicio', NULL,
      'dias', 0,
      'monto', 0,
      'detalle', '[]'::jsonb,
      'tope_aplicado', false,
      'perfil', v_tipo_perfil,
      'estado', v_estado,
      'tarifa_inicial', v_tarifa_inicial,
      'dias_gracia', COALESCE(v_perfil.dias_gracia, 0),
      'evento_inicio', v_perfil.evento_inicio,
      'cobra_dia_evento', COALESCE(v_perfil.cobra_dia_evento, false),
      'politica_es', v_cfg.politica_es,
      'politica_en', v_cfg.politica_en
    );
  ELSE
    RETURN jsonb_build_object(
      'inicio', v_inicio,
      'dias', COALESCE((v_calc->>'dias')::int, 0),
      'monto', COALESCE((v_calc->>'monto')::numeric, 0),
      'detalle', COALESCE(v_calc->'detalle', '[]'::jsonb),
      'tope_aplicado', COALESCE((v_calc->>'tope_aplicado')::boolean, false),
      'perfil', v_tipo_perfil,
      'estado', v_estado,
      'tarifa_inicial', v_tarifa_inicial,
      'dias_gracia', COALESCE(v_perfil.dias_gracia, 0),
      'evento_inicio', v_perfil.evento_inicio,
      'cobra_dia_evento', COALESCE(v_perfil.cobra_dia_evento, false),
      'politica_es', v_cfg.politica_es,
      'politica_en', v_cfg.politica_en
    );
  END IF;
END;
$$;

ALTER FUNCTION "public"."_parqueo_calcular"("p_orden_id" "uuid", "p_hasta" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_parqueo_calculo"("p_perfil" "jsonb", "p_fecha_evento" "date", "p_hasta" "date", "p_vigente_desde" "date" DEFAULT NULL::"date", "p_ajustes" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_gracia     INT := GREATEST(COALESCE((p_perfil->>'dias_gracia')::int, 0), 0);
  v_tope_dias  INT := NULLIF((p_perfil->>'tope_dias')::int, 0);
  v_tope_monto NUMERIC := NULLIF((p_perfil->>'tope_monto')::numeric, 0);
  v_ini_manual DATE := NULLIF(p_ajustes->>'inicio_manual', '')::date;
  v_tarifa_man NUMERIC := NULLIF(p_ajustes->>'tarifa_manual', '')::numeric;
  v_exonerados INT := GREATEST(COALESCE((p_ajustes->>'dias_exonerados')::int, 0), 0);
  v_inicio     DATE;
  v_dias       INT;
  v_monto      NUMERIC := 0;
  v_detalle    JSONB := '[]'::jsonb;
  v_tope       BOOLEAN := false;
BEGIN
  IF v_ini_manual IS NOT NULL THEN
    v_inicio := v_ini_manual;
  ELSIF p_fecha_evento IS NULL THEN
    RETURN jsonb_build_object('inicio', NULL, 'dias', 0, 'monto', 0, 'detalle', '[]'::jsonb, 'tope_aplicado', false);
  ELSE
    v_inicio := p_fecha_evento
      + CASE WHEN COALESCE((p_perfil->>'cobra_dia_evento')::boolean, false) THEN 0 ELSE 1 END;
    IF COALESCE((p_perfil->>'gracia_dias_habiles')::boolean, false) THEN
      WHILE v_gracia > 0 LOOP
        IF extract(isodow FROM v_inicio) < 6 THEN
          v_gracia := v_gracia - 1;
        END IF;
        v_inicio := v_inicio + 1;
      END LOOP;
    ELSE
      v_inicio := v_inicio + v_gracia;
    END IF;
    IF p_vigente_desde IS NOT NULL AND v_inicio < p_vigente_desde THEN
      v_inicio := p_vigente_desde;
    END IF;
  END IF;

  v_dias := GREATEST(p_hasta - v_inicio + 1 - v_exonerados, 0);
  IF v_tope_dias IS NOT NULL AND v_dias > v_tope_dias THEN
    v_dias := v_tope_dias;
    v_tope := true;
  END IF;

  IF v_dias > 0 THEN
    WITH t AS (
      SELECT (e->>'desde_dia')::int AS desde, (e->>'tarifa_diaria')::numeric AS tarifa
      FROM jsonb_array_elements(
        CASE WHEN v_tarifa_man IS NOT NULL
             THEN jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', v_tarifa_man))
             ELSE COALESCE(p_perfil->'tramos', '[]'::jsonb) END
      ) e
    ), r AS (
      SELECT desde, tarifa,
             LEAST(COALESCE(lead(desde) OVER (ORDER BY desde) - 1, v_dias), v_dias) AS hasta
      FROM t
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'desde_dia', desde, 'hasta_dia', hasta, 'dias', hasta - desde + 1,
             'tarifa', tarifa, 'subtotal', round((hasta - desde + 1) * tarifa, 2)
           ) ORDER BY desde), '[]'::jsonb),
           COALESCE(SUM(round((hasta - desde + 1) * tarifa, 2)), 0)
      INTO v_detalle, v_monto
    FROM r
    WHERE desde <= v_dias;
  END IF;

  IF v_tope_monto IS NOT NULL AND v_monto > v_tope_monto THEN
    v_monto := v_tope_monto;
    v_tope := true;
  END IF;

  RETURN jsonb_build_object('inicio', v_inicio, 'dias', v_dias, 'monto', round(v_monto, 2),
                            'detalle', v_detalle, 'tope_aplicado', v_tope);
END;
$$;

ALTER FUNCTION "public"."_parqueo_calculo"("p_perfil" "jsonb", "p_fecha_evento" "date", "p_hasta" "date", "p_vigente_desde" "date", "p_ajustes" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_recalcular_parqueo"("p_orden_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sede_id UUID;
  v_res     JSONB;
BEGIN
  SELECT sede_id INTO v_sede_id FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_res := public._parqueo_calcular(p_orden_id, NULL);
  IF v_res IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO orden_parqueo (
    orden_id, perfil, estado, inicio_cobro, dias_cobrados,
    monto, detalle, tope_aplicado, calculado_hasta, calculado_en
  ) VALUES (
    p_orden_id,
    v_res->>'perfil',
    v_res->>'estado',
    NULLIF(v_res->>'inicio', '')::date,
    COALESCE((v_res->>'dias')::int, 0),
    COALESCE((v_res->>'monto')::numeric, 0),
    COALESCE(v_res->'detalle', '[]'::jsonb),
    COALESCE((v_res->>'tope_aplicado')::boolean, false),
    public.hoy_taller(v_sede_id),
    NOW()
  )
  ON CONFLICT (orden_id) DO UPDATE SET
    perfil          = EXCLUDED.perfil,
    estado          = EXCLUDED.estado,
    inicio_cobro    = EXCLUDED.inicio_cobro,
    dias_cobrados   = EXCLUDED.dias_cobrados,
    monto           = EXCLUDED.monto,
    detalle         = EXCLUDED.detalle,
    tope_aplicado   = EXCLUDED.tope_aplicado,
    calculado_hasta = EXCLUDED.calculado_hasta,
    calculado_en    = EXCLUDED.calculado_en
  WHERE orden_parqueo.perfil IS DISTINCT FROM EXCLUDED.perfil
     OR orden_parqueo.estado IS DISTINCT FROM EXCLUDED.estado
     OR orden_parqueo.inicio_cobro IS DISTINCT FROM EXCLUDED.inicio_cobro
     OR orden_parqueo.dias_cobrados IS DISTINCT FROM EXCLUDED.dias_cobrados
     OR orden_parqueo.monto IS DISTINCT FROM EXCLUDED.monto
     OR orden_parqueo.detalle IS DISTINCT FROM EXCLUDED.detalle
     OR orden_parqueo.tope_aplicado IS DISTINCT FROM EXCLUDED.tope_aplicado;

  PERFORM public.recalculate_order_totals(p_orden_id);
END;
$$;

ALTER FUNCTION "public"."_recalcular_parqueo"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_reloj_tope"() RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT interval '12 hours';
$$;

ALTER FUNCTION "public"."_reloj_tope"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_reparto_comisiones"("p_orden_id" "uuid") RETURNS TABLE("usuario_id" "uuid", "especialidad" "text", "esquema" "text", "base" numeric, "porcentaje" numeric, "tecnicos" integer, "monto" numeric, "labor_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH o AS (
    SELECT o.id, COALESCE(s.comision_porcentaje, 0) AS tasa_sede
    FROM ordenes_trabajo o
    JOIN sedes s ON s.id = o.sede_id
    WHERE o.id = p_orden_id
  ),
  -- Reparto heredado: la bolsa de cada especialidad, entre los asignados a mano.
  bolsas AS (
    SELECT l.especialidad, SUM(l.costo) AS base
    FROM orden_labor l
    WHERE l.orden_id = p_orden_id AND l.estado = 'aprobado'
      AND l.asignado_a IS NULL AND l.reparto_heredado
    GROUP BY l.especialidad
  ),
  equipo AS (
    SELECT DISTINCT a.usuario_id, a.tipo_tarea AS especialidad
    FROM orden_asignaciones a
    WHERE a.orden_id = p_orden_id AND a.tipo_tarea IN ('mecanica', 'pintura')
      AND a.origen = 'manual'
  ),
  n AS (
    SELECT e.especialidad, COUNT(*)::INTEGER AS tecnicos FROM equipo e GROUP BY e.especialidad
  ),
  personas AS (
    SELECT
      e.usuario_id,
      e.especialidad,
      COALESCE(pp.esquema, 'comision') AS esquema,
      CASE WHEN COALESCE(pp.esquema, 'comision') = 'salario' THEN 0
           ELSE COALESCE(pp.comision_porcentaje, o.tasa_sede) END AS porcentaje,
      COALESCE(b.base, 0) AS base,
      n.tecnicos
    FROM equipo e
    CROSS JOIN o
    JOIN n ON n.especialidad = e.especialidad
    LEFT JOIN bolsas b ON b.especialidad = e.especialidad
    LEFT JOIN perfiles_pago pp ON pp.usuario_id = e.usuario_id
  ),
  exactos AS (
    -- Centavos de cada quien, con su fracción: su parte de la bolsa × su porcentaje.
    SELECT p.*, p.base * p.porcentaje / p.tecnicos AS exacto
    FROM personas p
  ),
  repartido AS (
    SELECT
      x.*,
      floor(x.exacto) AS piso,
      ROW_NUMBER() OVER (
        PARTITION BY x.especialidad
        ORDER BY (x.exacto - floor(x.exacto)) DESC, x.usuario_id
      ) AS turno,
      ROUND(SUM(x.exacto) OVER (PARTITION BY x.especialidad))
        - SUM(floor(x.exacto)) OVER (PARTITION BY x.especialidad) AS sobrantes
    FROM exactos x
  ),
  -- Por tarea: el costo de la línea × el porcentaje de su técnico.
  tareas AS (
    SELECT
      l.id,
      l.asignado_a,
      l.especialidad,
      l.costo,
      COALESCE(pp.esquema, 'comision') AS esquema,
      CASE WHEN COALESCE(pp.esquema, 'comision') = 'salario' THEN 0
           ELSE COALESCE(pp.comision_porcentaje, o.tasa_sede) END AS porcentaje
    FROM orden_labor l
    CROSS JOIN o
    LEFT JOIN perfiles_pago pp ON pp.usuario_id = l.asignado_a
    WHERE l.orden_id = p_orden_id AND l.estado = 'aprobado' AND l.asignado_a IS NOT NULL
  )
  SELECT
    r.usuario_id,
    r.especialidad,
    r.esquema,
    round(r.base, 2),
    r.porcentaje,
    r.tecnicos,
    ((r.piso + CASE WHEN r.turno <= r.sobrantes THEN 1 ELSE 0 END) / 100)::NUMERIC(12,2),
    NULL::UUID
  FROM repartido r
  UNION ALL
  SELECT
    t.asignado_a,
    t.especialidad,
    t.esquema,
    round(t.costo, 2),
    t.porcentaje,
    1,
    (ROUND(t.costo * t.porcentaje) / 100)::NUMERIC(12,2),
    t.id
  FROM tareas t;
$$;

ALTER FUNCTION "public"."_reparto_comisiones"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_resolver_presupuesto"("p_presupuesto_id" "uuid", "p_aprobadas" "uuid"[], "p_via" "text", "p_nombre" "text", "p_perfil" "uuid", "p_comentario" "text", "p_nota" "text", "p_ip" "text", "p_user_agent" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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

  -- si el cliente aprobó una línea de un trabajo, se aprueba el trabajo entero (20261010000034)
  IF cardinality(v_aprobadas) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT id), v_aprobadas)
    INTO v_aprobadas
    FROM (
      SELECT id FROM unnest(v_aprobadas) AS id
      UNION
      SELECT l.id
      FROM (
        SELECT id, trabajo_id FROM orden_labor WHERE presupuesto_id = v_p.id AND estado = 'pendiente'
        UNION ALL
        SELECT id, trabajo_id FROM orden_repuestos WHERE presupuesto_id = v_p.id AND estado = 'pendiente'
      ) l
      WHERE l.trabajo_id IS NOT NULL
        AND l.trabajo_id IN (
          SELECT trabajo_id FROM orden_labor WHERE presupuesto_id = v_p.id AND estado = 'pendiente' AND id = ANY (v_aprobadas) AND trabajo_id IS NOT NULL
          UNION
          SELECT trabajo_id FROM orden_repuestos WHERE presupuesto_id = v_p.id AND estado = 'pendiente' AND id = ANY (v_aprobadas) AND trabajo_id IS NOT NULL
        )
    ) sub;
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

    -- A los técnicos de la orden, también si no se autorizó nada: el mecánico que reportó el
    -- trabajo tiene que saber que no se hace (06/10/2026).
    IF v_n_aprob + v_n_rech > 0 THEN
      PERFORM public.notificar(
        ARRAY(SELECT DISTINCT usuario_id FROM orden_asignaciones WHERE orden_id = v_p.orden_id),
        'presupuesto_respondido',
        CASE WHEN v_n_aprob > 0 THEN 'Trabajos autorizados · ' ELSE 'Trabajo no autorizado · ' END
          || (d->>'numero_orden'),
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
$_$;

ALTER FUNCTION "public"."_resolver_presupuesto"("p_presupuesto_id" "uuid", "p_aprobadas" "uuid"[], "p_via" "text", "p_nombre" "text", "p_perfil" "uuid", "p_comentario" "text", "p_nota" "text", "p_ip" "text", "p_user_agent" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_saldo_orden"("p_orden_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE((SELECT total_general FROM orden_montos WHERE orden_id = p_orden_id), 0)
       - COALESCE((
           SELECT SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END)
           FROM finanzas_movimientos
           WHERE referencia_orden_id = p_orden_id AND categoria = 'pago_cliente'
             AND importacion_id IS NULL
         ), 0);
$$;

ALTER FUNCTION "public"."_saldo_orden"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_salir_de_espera"("p_orden_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE ordenes_trabajo
  SET estatus = 'en_proceso'
  WHERE id = p_orden_id
    AND estatus = 'espera_autorizacion'
    AND NOT EXISTS (
      SELECT 1 FROM orden_hallazgos WHERE orden_id = p_orden_id AND estado = 'pendiente'
    )
    AND NOT EXISTS (
      SELECT 1 FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'enviado'
    );
END;
$$;

ALTER FUNCTION "public"."_salir_de_espera"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_sembrar_plantilla_inspeccion"("p_sede_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plantilla_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inspeccion_plantillas
    WHERE sede_id = p_sede_id AND predeterminada = true
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.inspeccion_plantillas (sede_id, nombre, activo, predeterminada)
  VALUES (p_sede_id, 'Inspección multipunto', true, true)
  RETURNING id INTO v_plantilla_id;

  INSERT INTO public.inspeccion_plantilla_puntos (plantilla_id, seccion, nombre, posicion) VALUES
    -- Frenos
    (v_plantilla_id, 'Frenos', 'Pastillas delanteras', 1),
    (v_plantilla_id, 'Frenos', 'Pastillas traseras', 2),
    (v_plantilla_id, 'Frenos', 'Discos', 3),
    (v_plantilla_id, 'Frenos', 'Líquido de frenos', 4),
    -- Llantas
    (v_plantilla_id, 'Llantas', 'Profundidad', 5),
    (v_plantilla_id, 'Llantas', 'Presión', 6),
    (v_plantilla_id, 'Llantas', 'Desgaste irregular / alineación', 7),
    -- Fluidos
    (v_plantilla_id, 'Fluidos', 'Aceite de motor', 8),
    (v_plantilla_id, 'Fluidos', 'Refrigerante', 9),
    (v_plantilla_id, 'Fluidos', 'Líquido de transmisión', 10),
    (v_plantilla_id, 'Fluidos', 'Líquido de dirección', 11),
    (v_plantilla_id, 'Fluidos', 'Líquido limpiaparabrisas', 12),
    -- Suspensión y dirección
    (v_plantilla_id, 'Suspensión y dirección', 'Amortiguadores', 13),
    (v_plantilla_id, 'Suspensión y dirección', 'Terminales y rótulas', 14),
    (v_plantilla_id, 'Suspensión y dirección', 'Fugas', 15),
    -- Luces
    (v_plantilla_id, 'Luces', 'Faros', 16),
    (v_plantilla_id, 'Luces', 'Luces de freno', 17),
    (v_plantilla_id, 'Luces', 'Direccionales', 18),
    -- Batería y bandas
    (v_plantilla_id, 'Batería y bandas', 'Batería', 19),
    (v_plantilla_id, 'Batería y bandas', 'Bandas', 20),
    -- Filtros
    (v_plantilla_id, 'Filtros', 'Filtro de aire', 21),
    (v_plantilla_id, 'Filtros', 'Filtro de cabina', 22),
    -- Vidrios y carrocería
    (v_plantilla_id, 'Vidrios y carrocería', 'Plumas limpiaparabrisas', 23),
    (v_plantilla_id, 'Vidrios y carrocería', 'Parabrisas', 24),
    (v_plantilla_id, 'Vidrios y carrocería', 'Pintura y golpes', 25);
END;
$$;

ALTER FUNCTION "public"."_sembrar_plantilla_inspeccion"("p_sede_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_telefonos_sede"("p_telefonos" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'label', COALESCE(btrim(e.v->>'label'), ''),
      'numero', btrim(e.v->>'numero'),
      'tipo', CASE WHEN e.v->>'tipo' = 'celular' THEN 'celular' ELSE 'oficina' END,
      'whatsapp', COALESCE(e.v->'whatsapp' = 'true'::jsonb, false)
    ) ORDER BY e.n
  ), '[]'::jsonb)
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_telefonos) = 'array' THEN p_telefonos ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(v, n)
  WHERE jsonb_typeof(e.v) = 'object'
    AND NULLIF(btrim(e.v->>'numero'), '') IS NOT NULL;
$$;

ALTER FUNCTION "public"."_telefonos_sede"("p_telefonos" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."_textos_cliente"("p_orden_id" "uuid") RETURNS "text"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."_textos_cliente"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."admins_de_sede"("p_sede_id" "uuid") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT array_agg(id) FROM perfiles WHERE rol = 'admin' AND sede_id = p_sede_id),
    (SELECT array_agg(id) FROM perfiles WHERE rol = 'admin'),
    ARRAY[]::UUID[]
  );
$$;

ALTER FUNCTION "public"."admins_de_sede"("p_sede_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."agregar_trabajo_del_catalogo"("p_orden_id" "uuid", "p_catalogo_id" "uuid", "p_asignado_a" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."agregar_trabajo_del_catalogo"("p_orden_id" "uuid", "p_catalogo_id" "uuid", "p_asignado_a" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."ajustar_parqueo_orden"("p_orden_id" "uuid", "p_ajustes" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tarifa_man NUMERIC;
  v_dias_exon  INT;
  v_ini_man    DATE;
  v_nota       TEXT;
  v_cobrar     BOOLEAN;
  v_actual     orden_parqueo;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ajustar el parqueo de una orden.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_actual FROM orden_parqueo WHERE orden_id = p_orden_id;

  IF p_ajustes ? 'tarifa_manual' THEN
    IF p_ajustes->>'tarifa_manual' IS NULL OR btrim(p_ajustes->>'tarifa_manual') = '' THEN
      v_tarifa_man := NULL;
    ELSE
      v_tarifa_man := (p_ajustes->>'tarifa_manual')::numeric;
      IF v_tarifa_man < 0 THEN
        RAISE EXCEPTION 'La tarifa manual no puede ser negativa.' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    v_tarifa_man := v_actual.tarifa_manual;
  END IF;

  IF p_ajustes ? 'dias_exonerados' THEN
    IF p_ajustes->>'dias_exonerados' IS NULL OR btrim(p_ajustes->>'dias_exonerados') = '' THEN
      v_dias_exon := 0;
    ELSE
      v_dias_exon := (p_ajustes->>'dias_exonerados')::int;
      IF v_dias_exon < 0 THEN
        RAISE EXCEPTION 'Los días exonerados no pueden ser negativos.' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    v_dias_exon := COALESCE(v_actual.dias_exonerados, 0);
  END IF;

  IF p_ajustes ? 'inicio_manual' THEN
    v_ini_man := NULLIF(btrim(p_ajustes->>'inicio_manual'), '')::date;
  ELSE
    v_ini_man := v_actual.inicio_manual;
  END IF;

  IF p_ajustes ? 'nota' THEN
    v_nota := NULLIF(btrim(p_ajustes->>'nota'), '');
  ELSE
    v_nota := v_actual.nota;
  END IF;

  IF p_ajustes ? 'cobrar' THEN
    v_cobrar := COALESCE((p_ajustes->>'cobrar')::boolean, true);
  ELSE
    v_cobrar := COALESCE(v_actual.cobrar, true);
  END IF;

  INSERT INTO orden_parqueo (
    orden_id, cobrar, tarifa_manual, inicio_manual, dias_exonerados, nota
  ) VALUES (
    p_orden_id, v_cobrar, v_tarifa_man, v_ini_man, v_dias_exon, v_nota
  )
  ON CONFLICT (orden_id) DO UPDATE SET
    cobrar          = EXCLUDED.cobrar,
    tarifa_manual   = EXCLUDED.tarifa_manual,
    inicio_manual   = EXCLUDED.inicio_manual,
    dias_exonerados = EXCLUDED.dias_exonerados,
    nota            = EXCLUDED.nota;

  PERFORM public._recalcular_parqueo(p_orden_id);

  RETURN public.parqueo_de_orden(p_orden_id);
END;
$$;

ALTER FUNCTION "public"."ajustar_parqueo_orden"("p_orden_id" "uuid", "p_ajustes" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."aplicar_descuento"("p_orden_id" "uuid", "p_monto" numeric DEFAULT NULL::numeric, "p_motivo" "text" DEFAULT NULL::"text", "p_porcentaje" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_montos   orden_montos;
  v_subtotal NUMERIC;
  v_monto    NUMERIC;
  v_motivo   TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aplicar descuentos.' USING ERRCODE = '42501';
  END IF;
  IF p_porcentaje IS NOT NULL AND (p_porcentaje < 0 OR p_porcentaje > 100) THEN
    RAISE EXCEPTION 'El porcentaje tiene que estar entre 0 y 100.' USING ERRCODE = '22023';
  END IF;
  IF p_porcentaje IS NULL AND COALESCE(p_monto, 0) < 0 THEN
    RAISE EXCEPTION 'El descuento no puede ser negativo.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  SELECT * INTO v_montos FROM orden_montos WHERE orden_id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE((SELECT SUM(costo) FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'aprobado'), 0)
       + COALESCE((SELECT SUM(subtotal) FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'aprobado'), 0)
    INTO v_subtotal;

  v_monto := round(
    CASE WHEN p_porcentaje IS NOT NULL THEN v_subtotal * p_porcentaje / 100 ELSE COALESCE(p_monto, 0) END,
    2
  );

  IF v_monto > v_subtotal THEN
    RAISE EXCEPTION 'El descuento no puede ser mayor que lo autorizado (%).', to_char(v_subtotal, 'FM$999,999,990.00')
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('restorify.descuento', 'on', true);
  UPDATE orden_montos
  SET descuento = v_monto,
      descuento_motivo = CASE WHEN v_monto > 0 THEN v_motivo END
  WHERE orden_id = p_orden_id;
  PERFORM set_config('restorify.descuento', 'off', true);

  PERFORM public.recalculate_order_totals(p_orden_id);

  RETURN jsonb_build_object(
    'descuento', v_monto,
    'total', (SELECT total_general FROM orden_montos WHERE orden_id = p_orden_id)
  );
END;
$_$;

ALTER FUNCTION "public"."aplicar_descuento"("p_orden_id" "uuid", "p_monto" numeric, "p_motivo" "text", "p_porcentaje" numeric) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."app_schema_version"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(MAX(version), '') FROM supabase_migrations.schema_migrations;
$$;

ALTER FUNCTION "public"."app_schema_version"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."app_schema_version"() IS 'The newest migration version applied to this database, so a deployed client
   can detect that it is running against a schema older than the one it was
   built for. Returns an empty string when no migrations are recorded.';

CREATE OR REPLACE FUNCTION "public"."aprobar_comision"("p_comision_id" "uuid", "p_monto" numeric DEFAULT NULL::numeric, "p_porcentaje" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;

ALTER FUNCTION "public"."aprobar_comision"("p_comision_id" "uuid", "p_monto" numeric, "p_porcentaje" numeric) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."aprobar_comisiones"("p_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_n      INTEGER;
  v_grupos JSONB;
  r        RECORD;
  d        JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aprobar comisiones.' USING ERRCODE = '42501';
  END IF;

  -- Bloqueadas, en orden: un pago que entre al mismo tiempo espera.
  PERFORM 1 FROM comisiones WHERE id = ANY(COALESCE(p_ids, '{}')) ORDER BY id FOR UPDATE;

  WITH a AS (
    UPDATE comisiones
    SET estado = 'aceptada'
    WHERE id = ANY(COALESCE(p_ids, '{}'))
      AND pago_id IS NULL
      AND estado = 'sugerida'
    RETURNING orden_id, usuario_id, monto
  ),
  g AS (
    SELECT orden_id, usuario_id, SUM(monto) AS monto, COUNT(*) AS n
    FROM a GROUP BY orden_id, usuario_id
  )
  SELECT COALESCE(SUM(n), 0)::int,
         COALESCE(jsonb_agg(jsonb_build_object('orden_id', orden_id, 'usuario_id', usuario_id, 'monto', monto)), '[]'::jsonb)
    INTO v_n, v_grupos
  FROM g;

  FOR r IN
    SELECT * FROM jsonb_to_recordset(v_grupos) AS x(orden_id UUID, usuario_id UUID, monto NUMERIC)
  LOOP
    BEGIN
      d := public.datos_orden_aviso(r.orden_id);
      PERFORM public.notificar(
        ARRAY[r.usuario_id],
        'comision_generada',
        'Comisión aprobada · ' || (d->>'numero_orden'),
        '$' || to_char(r.monto, 'FM999,999,990.00') || ' por la mano de obra de ' ||
          COALESCE(NULLIF(d->>'vehiculo', ''), 'la orden'),
        d || jsonb_build_object('monto', r.monto),
        r.orden_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'aprobar_comisiones (aviso): %', SQLERRM;
    END;
  END LOOP;

  RETURN v_n;
END;
$_$;

ALTER FUNCTION "public"."aprobar_comisiones"("p_ids" "uuid"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."archivos_huerfanos"("p_limit" integer DEFAULT 500) RETURNS TABLE("nombre" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'orden_media'
    AND o.created_at < NOW() - INTERVAL '7 days'
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.ordenes_trabajo t
        WHERE t.id::text = (storage.foldername(o.name))[2]
      )
      OR (
        o.name NOT LIKE '%/firma-%'
        AND NOT EXISTS (
          SELECT 1 FROM public.orden_media m
          WHERE m.ruta = o.name OR m.ruta_miniatura = o.name
        )
      )
    )
  ORDER BY o.created_at
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

ALTER FUNCTION "public"."archivos_huerfanos"("p_limit" integer) OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_enlaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creado_por" "uuid",
    "expira_en" timestamp with time zone,
    "revocado_en" timestamp with time zone,
    "ultimo_acceso_en" timestamp with time zone,
    "accesos" integer DEFAULT 0 NOT NULL,
    "revocado_por" "uuid",
    CONSTRAINT "orden_enlaces_token_check" CHECK (("token" ~ '^[0-9a-f]{64}$'::"text"))
);

ALTER TABLE "public"."orden_enlaces" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."asegurar_enlace_orden"("p_orden_id" "uuid") RETURNS "public"."orden_enlaces"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_enlace  orden_enlaces;
  v_sede    UUID;
  v_estatus order_status;
BEGIN
  SELECT * INTO v_enlace FROM orden_enlaces WHERE orden_id = p_orden_id AND revocado_en IS NULL;
  IF FOUND THEN
    IF v_enlace.expira_en IS NULL OR v_enlace.expira_en > NOW() THEN
      RETURN v_enlace;
    END IF;
    -- Vencido: se retira para que no quede un enlace muerto como el activo.
    UPDATE orden_enlaces SET revocado_en = NOW() WHERE id = v_enlace.id;
  END IF;

  -- Los caminos automáticos no recrean un enlace que administración desactivó a mano.
  IF COALESCE(current_setting('restorify.crear_enlace_manual', true), 'off') <> 'on'
     AND NOT EXISTS (
       SELECT 1 FROM orden_enlaces WHERE orden_id = p_orden_id AND revocado_en IS NULL
     )
     AND COALESCE((
       SELECT e.revocado_por IS NOT NULL
       FROM orden_enlaces e
       WHERE e.orden_id = p_orden_id
       ORDER BY COALESCE(e.revocado_en, e.creado_en) DESC, e.creado_en DESC, e.id DESC
       LIMIT 1
     ), false) THEN
    RETURN NULL;
  END IF;

  SELECT sede_id, estatus INTO v_sede, v_estatus FROM ordenes_trabajo WHERE id = p_orden_id;
  IF v_sede IS NULL THEN
    RAISE EXCEPTION 'La orden % no existe.', p_orden_id;
  END IF;

  INSERT INTO orden_enlaces (orden_id, sede_id, token, creado_por, expira_en)
  VALUES (
    p_orden_id,
    v_sede,
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    (SELECT id FROM perfiles WHERE id = auth.uid()),
    CASE WHEN v_estatus = 'entregado' THEN NOW() + INTERVAL '90 days' END
  )
  ON CONFLICT (orden_id) WHERE revocado_en IS NULL DO NOTHING
  RETURNING * INTO v_enlace;

  -- Otra transacción lo creó en el mismo instante: se usa ese.
  IF v_enlace.id IS NULL THEN
    SELECT * INTO v_enlace FROM orden_enlaces WHERE orden_id = p_orden_id AND revocado_en IS NULL;
  END IF;

  RETURN v_enlace;
END;
$$;

ALTER FUNCTION "public"."asegurar_enlace_orden"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."balance_orden"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  b RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el balance de una orden.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO b FROM public._balance_orden(p_orden_id);

  RETURN jsonb_build_object(
    'total_orden', b.total_orden,
    'cobrado', b.cobrado,
    'costo_repuestos', b.costo_repuestos,
    'comisiones', b.comisiones,
    'comisiones_pagadas', b.comisiones_pagadas,
    'margen', b.margen,
    -- Lo vinculado a la orden que el margen no cuenta: compras del banco, movimientos a mano,
    -- gastos. Se muestra para no perderlo de vista, sin restarlo dos veces.
    'otros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', f.id, 'fecha', f.fecha, 'tipo', f.tipo, 'categoria', f.categoria,
               'descripcion', f.descripcion, 'monto', f.monto, 'importado', f.importacion_id IS NOT NULL
             ) ORDER BY f.fecha, f.creado_en)
      FROM finanzas_movimientos f
      WHERE f.referencia_orden_id = p_orden_id
        AND f.categoria <> 'pago_cliente'
        AND f.comision_pago_id IS NULL
        AND NOT (f.categoria = 'compra_repuesto' AND f.importacion_id IS NULL AND f.registrado_por IS NULL)
    ), '[]'::jsonb)
  );
END;
$$;

ALTER FUNCTION "public"."balance_orden"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."borrar_plantilla_inspeccion"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede borrar plantillas de inspección.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.inspeccion_plantillas WHERE id = p_id;
END;
$$;

ALTER FUNCTION "public"."borrar_plantilla_inspeccion"("p_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."borrar_tiempo"("p_tiempo_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede borrar tiempos.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.orden_labor_tiempos WHERE id = p_tiempo_id;
END;
$$;

ALTER FUNCTION "public"."borrar_tiempo"("p_tiempo_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."borrar_trabajo_catalogo"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede borrar trabajos del catálogo.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.catalogo_trabajos WHERE id = p_id;
END;
$$;

ALTER FUNCTION "public"."borrar_trabajo_catalogo"("p_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."cancelar_presupuesto"("p_presupuesto_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."cancelar_presupuesto"("p_presupuesto_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."catalogo_de_trabajos"("p_sede_id" "uuid", "p_incluir_inactivos" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_resultado JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede consultar el catálogo de trabajos.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'activo', c.activo,
        'total', COALESCE(lin.total, 0),
        'lineas', COALESCE(lin.lineas, '[]'::jsonb)
      ) ORDER BY c.nombre, c.id
    ),
    '[]'::jsonb
  ) INTO v_resultado
  FROM public.catalogo_trabajos c
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(
        CASE
          WHEN l.tipo = 'mano_obra' THEN l.precio
          ELSE l.cantidad * l.precio
        END
      ), 0) AS total,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'catalogo_id', l.catalogo_id,
            'tipo', l.tipo,
            'descripcion', l.descripcion,
            'especialidad', l.especialidad,
            'horas', l.horas,
            'cantidad', l.cantidad,
            'precio', l.precio,
            'costo_unitario', l.costo_unitario,
            'posicion', l.posicion
          ) ORDER BY l.posicion, l.id
        ),
        '[]'::jsonb
      ) AS lineas
    FROM public.catalogo_trabajo_lineas l
    WHERE l.catalogo_id = c.id
  ) lin ON true
  WHERE c.sede_id = p_sede_id
    AND (p_incluir_inactivos OR c.activo = true);

  RETURN v_resultado;
END;
$$;

ALTER FUNCTION "public"."catalogo_de_trabajos"("p_sede_id" "uuid", "p_incluir_inactivos" boolean) OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."cola_envios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canal" "text" NOT NULL,
    "destinatario" "text" NOT NULL,
    "plantilla" "text" NOT NULL,
    "datos" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "orden_id" "uuid",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "intentos" integer DEFAULT 0 NOT NULL,
    "ultimo_error" "text",
    "enviar_despues_de" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bloqueado_en" timestamp with time zone,
    "clave_dedupe" "text",
    "proveedor_id" "text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enviado_en" timestamp with time zone,
    CONSTRAINT "cola_envios_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'procesando'::"text", 'enviado'::"text", 'omitido'::"text", 'error'::"text"])))
);

ALTER TABLE "public"."cola_envios" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."claim_outbox"("p_limit" integer DEFAULT 25) RETURNS SETOF "public"."cola_envios"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Una invocación que murió a mitad (timeout, despliegue) deja filas tomadas;
  -- después de 5 minutos vuelven a estar disponibles. Al quinto intento que muere
  -- así, la fila queda en error: algo en ella rompe la función y reintentar no lo
  -- arregla.
  UPDATE cola_envios
  SET estado = CASE WHEN intentos >= 5 THEN 'error' ELSE 'pendiente' END,
      ultimo_error = CASE
        WHEN intentos >= 5 THEN left(COALESCE(ultimo_error || ' · ', '') || 'El envío se interrumpió 5 veces.', 1000)
        ELSE ultimo_error
      END,
      bloqueado_en = NULL
  WHERE estado = 'procesando' AND bloqueado_en < NOW() - INTERVAL '5 minutes';

  RETURN QUERY
  UPDATE cola_envios c
  SET estado = 'procesando', intentos = c.intentos + 1, bloqueado_en = NOW()
  WHERE c.id IN (
    SELECT id FROM cola_envios
    WHERE estado = 'pendiente' AND enviar_despues_de <= NOW()
    ORDER BY enviar_despues_de, creado_en
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.*;
END;
$$;

ALTER FUNCTION "public"."claim_outbox"("p_limit" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."cleanup_order_finance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM finanzas_movimientos
  WHERE referencia_orden_id = OLD.id
    AND importacion_id IS NULL;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."cleanup_order_finance"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."comisiones_estimadas"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_admin BOOLEAN := public.is_admin();
  v_yo    UUID := auth.uid();
  v_res   JSONB;
BEGIN
  IF NOT v_admin AND NOT (p_orden_id = ANY (public.mis_ordenes_asignadas())) THEN
    RAISE EXCEPTION 'Solo el personal asignado ve la comisión de esta orden.' USING ERRCODE = '42501';
  END IF;

  WITH r AS (
    SELECT rr.*, c.id AS comision_id, c.estado AS c_estado, c.monto AS c_monto,
           c.porcentaje AS c_porcentaje, c.pago_id AS c_pago
    FROM public._reparto_comisiones(p_orden_id) rr
    LEFT JOIN comisiones c
      ON c.orden_id = p_orden_id
     AND c.usuario_id = rr.usuario_id
     AND c.especialidad = rr.especialidad
     AND c.labor_id IS NOT DISTINCT FROM rr.labor_id
    WHERE v_admin OR rr.usuario_id = v_yo
  ),
  v AS (
    SELECT r.*,
      CASE WHEN r.c_estado = 'aceptada' OR r.c_pago IS NOT NULL THEN r.c_monto
           WHEN v_admin THEN COALESCE(r.c_monto, r.monto) END AS monto_visible,
      CASE WHEN r.c_estado = 'aceptada' OR r.c_pago IS NOT NULL THEN r.c_porcentaje
           WHEN v_admin THEN COALESCE(r.c_porcentaje, r.porcentaje) END AS porcentaje_visible,
      CASE WHEN r.c_estado = 'aceptada' OR r.c_pago IS NOT NULL THEN 'aceptada' ELSE 'sugerida' END AS estado
    FROM r
  )
  SELECT jsonb_build_object(
    'bolsas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'especialidad', b.especialidad,
               'base', CASE WHEN v_admin THEN round(b.base, 2) END,
               'tecnicos', (
                 SELECT COUNT(DISTINCT a.usuario_id) FROM orden_asignaciones a
                 WHERE a.orden_id = p_orden_id AND a.tipo_tarea = b.especialidad
                   AND a.origen = 'manual'
               )
             ) ORDER BY b.especialidad)
      FROM (
        SELECT l.especialidad, SUM(l.costo) AS base
        FROM orden_labor l
        WHERE l.orden_id = p_orden_id AND l.estado = 'aprobado'
          AND l.asignado_a IS NULL AND l.reparto_heredado
        GROUP BY l.especialidad
      ) b
    ), '[]'::jsonb),
    'reparto', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'usuario_id', g.usuario_id,
               'especialidad', g.especialidad,
               'esquema', g.esquema,
               'porcentaje', g.porcentaje,
               'tecnicos', g.tecnicos,
               'monto', g.monto,
               'heredado', g.heredado,
               'tareas', g.tareas,
               'comision_id', g.comision_id,
               'estado', g.estado
             ) ORDER BY g.especialidad, g.usuario_id)
      FROM (
        SELECT
          v.usuario_id,
          v.especialidad,
          min(v.esquema) AS esquema,
          CASE WHEN bool_and(v.porcentaje_visible IS NOT NULL) THEN max(v.porcentaje_visible) END AS porcentaje,
          COALESCE(max(v.tecnicos) FILTER (WHERE v.labor_id IS NULL), 1) AS tecnicos,
          CASE WHEN bool_and(v.monto_visible IS NOT NULL) THEN SUM(v.monto_visible) END AS monto,
          bool_or(v.labor_id IS NULL) AS heredado,
          COUNT(v.labor_id)::INTEGER AS tareas,
          (array_agg(v.comision_id) FILTER (WHERE v.labor_id IS NULL))[1] AS comision_id,
          COALESCE((array_agg(v.estado) FILTER (WHERE v.labor_id IS NULL))[1], 'sugerida') AS estado
        FROM v
        GROUP BY v.usuario_id, v.especialidad
      ) g
    ), '[]'::jsonb),
    'mi_total', CASE
      WHEN v_admin THEN COALESCE((
        SELECT SUM(COALESCE(v.c_monto, v.monto)) FROM v
        WHERE v.usuario_id = v_yo AND v.esquema <> 'salario'
      ), 0)
      ELSE COALESCE((
        SELECT SUM(c.monto) FROM comisiones c
        WHERE c.orden_id = p_orden_id AND c.usuario_id = v_yo
          AND (c.estado = 'aceptada' OR c.pago_id IS NOT NULL)
      ), 0)
    END,
    'tareas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'labor_id', v.labor_id,
               'descripcion', l.descripcion,
               'especialidad', v.especialidad,
               'usuario_id', v.usuario_id,
               'esquema', v.esquema,
               'base', CASE WHEN v_admin THEN v.base END,
               'porcentaje', v.porcentaje_visible,
               'monto', v.monto_visible,
               'comision_id', v.comision_id,
               'estado', v.estado
             ) ORDER BY l.creado_en, l.id)
      FROM v
      JOIN orden_labor l ON l.id = v.labor_id
      WHERE v.labor_id IS NOT NULL
    ), '[]'::jsonb),
    'sin_asignar', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'labor_id', l.id,
               'descripcion', l.descripcion,
               'especialidad', l.especialidad,
               'costo', l.costo,
               'estado', l.estado
             ) ORDER BY l.creado_en, l.id)
      FROM orden_labor l
      WHERE l.orden_id = p_orden_id AND l.asignado_a IS NULL
        AND NOT l.reparto_heredado AND l.estado <> 'rechazado'
    ), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

ALTER FUNCTION "public"."comisiones_estimadas"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."completar_inspeccion"("p_inspeccion_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."completar_inspeccion"("p_inspeccion_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."corregir_tiempo"("p_tiempo_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."corregir_tiempo"("p_tiempo_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."cotizar_hallazgo"("p_hallazgo_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_h orden_hallazgos;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cotizar un trabajo adicional.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_h FROM orden_hallazgos WHERE id = p_hallazgo_id FOR UPDATE;
  IF v_h.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ese trabajo adicional.' USING ERRCODE = 'P0002';
  END IF;
  IF v_h.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'Este trabajo adicional ya se resolvió.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = v_h.orden_id AND estatus = 'entregado') THEN
    RAISE EXCEPTION 'La orden ya fue entregada.' USING ERRCODE = '42501';
  END IF;

  UPDATE orden_hallazgos
  SET estado = 'cotizado', resuelto_por = auth.uid(), resuelto_en = NOW()
  WHERE id = v_h.id;

  RETURN jsonb_build_object('hallazgo_id', v_h.id, 'orden_id', v_h.orden_id, 'descripcion', v_h.descripcion);
END;
$$;

ALTER FUNCTION "public"."cotizar_hallazgo"("p_hallazgo_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."crear_enlace_cliente"("p_orden_id" "uuid") RETURNS "public"."orden_enlaces"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_enlace orden_enlaces;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede compartir el enlace del cliente.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('restorify.crear_enlace_manual', 'on', true);
  v_enlace := public.asegurar_enlace_orden(p_orden_id);
  PERFORM set_config('restorify.crear_enlace_manual', 'off', true);

  RETURN v_enlace;
END;
$$;

ALTER FUNCTION "public"."crear_enlace_cliente"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."ordenes_trabajo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero_orden" "text" NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "vehiculo_id" "uuid" NOT NULL,
    "tipo_trabajo" "public"."work_type" NOT NULL,
    "estatus" "public"."order_status" DEFAULT 'recepcion'::"public"."order_status" NOT NULL,
    "millas_ingreso" integer NOT NULL,
    "nivel_gasolina" "text" NOT NULL,
    "inspeccion_360_notas" "text",
    "fecha_ingreso" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fecha_estimada_entrega" "date" NOT NULL,
    "fecha_finalizacion" timestamp with time zone,
    "porcentaje_avance" integer DEFAULT 0 NOT NULL,
    "total_labor" numeric(10,2) DEFAULT 0 NOT NULL,
    "creado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "firma_ruta" "text",
    "firma_fecha" timestamp with time zone,
    "motivo_autorizacion" "text",
    "recordado_entrega_en" timestamp with time zone,
    "archivada_en" timestamp with time zone,
    "retirada_sin_reparar" boolean DEFAULT false NOT NULL,
    "lista_para_entregar_en" timestamp with time zone,
    "lista_para_entregar_por" "uuid",
    "con_seguro" boolean DEFAULT false NOT NULL,
    "aseguradora" "text",
    "numero_reclamo" "text",
    "marcas_danos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "ordenes_motivo_autorizacion_largo" CHECK ((("motivo_autorizacion" IS NULL) OR ("length"("motivo_autorizacion") <= 1000))),
    CONSTRAINT "ordenes_trabajo_archivada_solo_entregada" CHECK ((("archivada_en" IS NULL) OR ("estatus" = 'entregado'::"public"."order_status"))),
    CONSTRAINT "ordenes_trabajo_marcas_danos_validas" CHECK ((("jsonb_typeof"("marcas_danos") = 'array'::"text") AND ("jsonb_array_length"("marcas_danos") <= 60) AND (NOT "jsonb_path_exists"("marcas_danos", '$[*]?((((((((((((@.type() != "object" || !(exists (@."vista"))) || !(exists (@."tipo"))) || !(exists (@."x"))) || !(exists (@."y"))) || !((((@."vista" == "superior" || @."vista" == "frontal") || @."vista" == "trasera") || @."vista" == "izquierda") || @."vista" == "derecha")) || !((((@."tipo" == "golpe" || @."tipo" == "rayon") || @."tipo" == "pintura") || @."tipo" == "roto") || @."tipo" == "otro")) || @."x".type() != "number") || @."y".type() != "number") || @."x" < 0) || @."x" > 1) || @."y" < 0) || @."y" > 1)'::"jsonpath")))),
    CONSTRAINT "ordenes_trabajo_millas_ingreso_no_negativa" CHECK (("millas_ingreso" >= 0)),
    CONSTRAINT "ordenes_trabajo_porcentaje_avance_rango" CHECK ((("porcentaje_avance" >= 0) AND ("porcentaje_avance" <= 100))),
    CONSTRAINT "ordenes_trabajo_seguro_datos_check" CHECK (("con_seguro" OR (("aseguradora" IS NULL) AND ("numero_reclamo" IS NULL))))
);

ALTER TABLE "public"."ordenes_trabajo" OWNER TO "postgres";

COMMENT ON COLUMN "public"."ordenes_trabajo"."retirada_sin_reparar" IS 'La orden se cerró sin hacer el trabajo (retirar_sin_reparar). Solo con estatus entregado.';

CREATE OR REPLACE FUNCTION "public"."create_work_order"("p_order" "jsonb", "p_labor" "jsonb" DEFAULT '[]'::"jsonb", "p_parts" "jsonb" DEFAULT '[]'::"jsonb", "p_assignments" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "public"."ordenes_trabajo"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_order      ordenes_trabajo;
  v_admin      BOOLEAN := public.is_admin();
  v_deposito   NUMERIC := GREATEST(COALESCE(NULLIF(btrim(COALESCE(p_order->>'deposito_inicial', '')), '')::numeric, 0), 0);
  -- Opcionales (la app anterior no los manda).
  v_metodo     TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_metodo', '')), '');
  v_cheque     TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_numero_cheque', '')), '');
  v_ruta       TEXT := NULLIF(btrim(COALESCE(p_order->>'deposito_comprobante_ruta', '')), '');
  v_borradores UUID[];
  v_mapa       JSONB := '{}'::jsonb;
  t            JSONB;
  v_trabajo_id UUID;
BEGIN
  INSERT INTO ordenes_trabajo (
    sede_id,
    cliente_id,
    vehiculo_id,
    tipo_trabajo,
    estatus,
    millas_ingreso,
    nivel_gasolina,
    inspeccion_360_notas,
    fecha_estimada_entrega,
    porcentaje_avance,
    creado_por,
    con_seguro,
    aseguradora,
    numero_reclamo,
    marcas_danos
  )
  VALUES (
    (p_order->>'sede_id')::uuid,
    (p_order->>'cliente_id')::uuid,
    (p_order->>'vehiculo_id')::uuid,
    (p_order->>'tipo_trabajo')::work_type,
    'recepcion',
    COALESCE(NULLIF(btrim(COALESCE(p_order->>'millas_ingreso', '')), '')::int, 0),
    p_order->>'nivel_gasolina',
    COALESCE(p_order->>'inspeccion_360_notas', ''),
    (p_order->>'fecha_estimada_entrega')::date,
    0,
    (p_order->>'creado_por')::uuid,
    COALESCE((p_order->>'con_seguro')::boolean, false),
    NULLIF(btrim(COALESCE(p_order->>'aseguradora', '')), ''),
    NULLIF(btrim(COALESCE(p_order->>'numero_reclamo', '')), ''),
    CASE WHEN jsonb_typeof(p_order->'marcas_danos') = 'array' THEN p_order->'marcas_danos' ELSE '[]'::jsonb END
  )
  RETURNING * INTO v_order;
  -- trg_order_montos_create ya dejó la fila de montos en cero.

  IF v_admin THEN
    -- El depósito, validado como en `entregar_orden` (después del INSERT: a quien no puede
    -- abrir órdenes lo rechaza primero la política). Con monto, el método es opcional mientras
    -- la app anterior siga publicada; el cheque y el comprobante, siempre.
    IF v_deposito > 0 THEN
      IF v_metodo IS NOT NULL AND v_metodo NOT IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque') THEN
        RAISE EXCEPTION 'Elige cómo dejó el depósito el cliente: efectivo, tarjeta, Zelle, transferencia o cheque.'
          USING ERRCODE = '22023';
      END IF;
      IF v_metodo IS NULL AND (v_cheque IS NOT NULL OR v_ruta IS NOT NULL) THEN
        RAISE EXCEPTION 'Elige cómo dejó el depósito el cliente: efectivo, tarjeta, Zelle, transferencia o cheque.'
          USING ERRCODE = '22023';
      END IF;
      -- El comprobante es un archivo del bucket privado, en la carpeta de la sede de la orden.
      IF v_ruta IS NOT NULL AND v_ruta NOT LIKE v_order.sede_id::text || '/%' THEN
        RAISE EXCEPTION 'El comprobante debe guardarse en la carpeta de la sede de la orden.'
          USING ERRCODE = '42501';
      END IF;
      -- Un número de cheque solo tiene sentido en un cheque.
      IF v_metodo IS DISTINCT FROM 'cheque' THEN
        v_cheque := NULL;
      END IF;

      -- `trg_order_deposit_sync` lo usa para el movimiento "Depósito inicial" de ESTA orden
      -- y lo limpia; se limpia también aquí por si el UPDATE no llegara a asentarlo.
      PERFORM set_config(
        'restorify.deposito',
        jsonb_build_object(
          'orden_id', v_order.id,
          'metodo', v_metodo,
          'numero_cheque', v_cheque,
          'comprobante_ruta', v_ruta
        )::text,
        true
      );
      UPDATE orden_montos SET deposito_inicial = v_deposito WHERE orden_id = v_order.id;
      PERFORM set_config('restorify.deposito', '', true);
    END IF;

    -- Trabajos agrupados (20261010000034)
    IF jsonb_typeof(p_order->'trabajos') = 'array' THEN
      FOR t IN SELECT * FROM jsonb_array_elements(p_order->'trabajos')
      LOOP
        IF NULLIF(btrim(COALESCE(t->>'grupo', '')), '') IS NOT NULL AND NULLIF(btrim(COALESCE(t->>'titulo', '')), '') IS NOT NULL THEN
          INSERT INTO orden_trabajos (orden_id, titulo, catalogo_id, creado_por)
          VALUES (
            v_order.id,
            btrim(t->>'titulo'),
            (
              SELECT c.id
              FROM catalogo_trabajos c
              WHERE c.id = CASE
                WHEN (t->>'catalogo_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (t->>'catalogo_id')::uuid
                ELSE NULL
              END
                AND c.sede_id = v_order.sede_id
            ),
            (p_order->>'creado_por')::uuid
          )
          RETURNING id INTO v_trabajo_id;

          v_mapa := v_mapa || jsonb_build_object(t->>'grupo', v_trabajo_id);
        END IF;
      END LOOP;
    END IF;

    -- Cada línea puede traer su técnico. Sin `reparto_heredado`: con técnico, fuera del
    -- reparto (como `setLaborTechnician`); sin técnico, el reparto heredado de siempre.
    -- Horas leídas de item->>'horas' (20261010000036).
    INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, reparto_heredado, trabajo_id)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'costo')::numeric, 0), 0),
      NULLIF(btrim(COALESCE(item->>'horas', '')), '')::numeric,
      CASE WHEN item->>'especialidad' IN ('mecanica', 'pintura') THEN item->>'especialidad' END,
      t.tecnico,
      COALESCE((item->>'reparto_heredado')::boolean, t.tecnico IS NULL),
      (v_mapa ->> (item->>'grupo'))::uuid
    FROM jsonb_array_elements(COALESCE(p_labor, '[]'::jsonb)) AS item
    CROSS JOIN LATERAL (
      SELECT NULLIF(btrim(COALESCE(item->>'asignado_a', '')), '')::uuid AS tecnico
    ) AS t;

    -- El costo, si lo mandan y no es negativo; si no, el precio.
    INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal, trabajo_id)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1),
      COALESCE(
        NULLIF(GREATEST(COALESCE(NULLIF(btrim(COALESCE(item->>'costo_unitario', '')), '')::numeric, -1), -1), -1),
        COALESCE((item->>'precio_venta_unitario')::numeric, 0)
      ),
      COALESCE((item->>'precio_venta_unitario')::numeric, 0),
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1) * COALESCE((item->>'precio_venta_unitario')::numeric, 0),
      (v_mapa ->> (item->>'grupo'))::uuid
    FROM jsonb_array_elements(COALESCE(p_parts, '[]'::jsonb)) AS item;

    -- Quien ya entró por una tarea de arriba (origen 'tarea') no se vuelve a agregar: una
    -- segunda fila 'manual' lo metería al reparto heredado sin que nadie lo decidiera.
    INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, estatus_tarea)
    SELECT DISTINCT v_order.id, a.usuario_id, a.tipo_tarea, 'pendiente'::task_status
    FROM (
      SELECT (item->>'usuario_id')::uuid AS usuario_id, item->>'tipo_tarea' AS tipo_tarea
      FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) AS item
    ) AS a
    WHERE NOT EXISTS (
      SELECT 1 FROM orden_asignaciones x
      WHERE x.orden_id = v_order.id AND x.usuario_id = a.usuario_id
    );

    -- Si se solicitó autorizar en recepción y la orden tiene líneas en borrador,
    -- se autorizan en el acto en persona a nombre del cliente.
    IF COALESCE((p_order->>'autorizado_en_recepcion')::boolean, false) THEN
      SELECT COALESCE(array_agg(id), '{}') INTO v_borradores
      FROM (
        SELECT id FROM orden_labor WHERE orden_id = v_order.id AND estado = 'borrador'
        UNION ALL
        SELECT id FROM orden_repuestos WHERE orden_id = v_order.id AND estado = 'borrador'
      ) AS b;

      IF cardinality(v_borradores) > 0 THEN
        PERFORM public.registrar_autorizacion(
          v_order.id,
          v_borradores,
          v_borradores,
          'admin_presencial',
          NULL,
          'Autorizado al recibir el vehículo.'
        );
      END IF;
    END IF;
  ELSE
    INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, estatus_tarea)
    VALUES (
      v_order.id,
      auth.uid(),
      CASE WHEN public.current_user_role() = 'pintor' THEN 'pintura' ELSE 'mecanica' END,
      'pendiente'
    );
  END IF;

  SELECT * INTO v_order FROM ordenes_trabajo WHERE id = v_order.id;
  RETURN v_order;
END;
$_$;

ALTER FUNCTION "public"."create_work_order"("p_order" "jsonb", "p_labor" "jsonb", "p_parts" "jsonb", "p_assignments" "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."create_work_order"("p_order" "jsonb", "p_labor" "jsonb", "p_parts" "jsonb", "p_assignments" "jsonb") IS 'Creates a work order together with its labor, parts and assignments in a
   single transaction. Runs as the caller (SECURITY INVOKER) so RLS applies
   unchanged. Returns the order with its trigger-computed totals.';

CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT rol FROM perfiles WHERE id = auth.uid();
$$;

ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."current_user_sede_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT sede_id FROM perfiles WHERE id = auth.uid();
$$;

ALTER FUNCTION "public"."current_user_sede_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."datos_correo"("p_cola_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_job            cola_envios;
  v_orden          ordenes_trabajo;
  v_enlace         orden_enlaces;
  v_parq_json      JSONB;
  v_parqueo_correo JSONB := NULL;
BEGIN
  SELECT * INTO v_job FROM cola_envios WHERE id = p_cola_id AND canal = 'email';
  IF NOT FOUND OR v_job.orden_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = v_job.orden_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_enlace := public.asegurar_enlace_orden(v_orden.id);
  IF v_enlace.id IS NULL THEN
    UPDATE cola_envios
    SET estado = 'omitido',
        ultimo_error = 'El enlace del cliente fue desactivado manualmente.'
    WHERE id = p_cola_id;
    RETURN NULL;
  END IF;

  BEGIN
    v_parq_json := public._parqueo_calcular(v_orden.id, NULL);
    IF (SELECT avisar_cliente FROM parqueo_config WHERE sede_id = v_orden.sede_id) IS TRUE
       AND v_parq_json->>'estado' IN ('por_empezar', 'acumulando') THEN
      v_parqueo_correo := jsonb_build_object(
        'estado', v_parq_json->>'estado',
        'inicio', v_parq_json->>'inicio',
        'tarifa_inicial', (v_parq_json->>'tarifa_inicial')::numeric
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_parqueo_correo := NULL;
  END;

  RETURN jsonb_build_object(
    'token', v_enlace.token,
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre,
        'email', lower(btrim(c.email)),
        'email_valido', public.es_correo_valido(c.email),
        'acepta_correos', c.acepta_correos,
        'idioma', c.idioma
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
    -- Texto original → inglés (las líneas del presupuesto en un correo en inglés).
    'traducciones', public._diccionario_traducciones(v_orden.id),
    'taller', (
      SELECT jsonb_build_object(
        'nombre', s.nombre,
        'direccion', s.direccion,
        'telefono', s.telefono,
        'telefonos', public._telefonos_sede(s.telefonos),
        'email', CASE WHEN public.es_correo_valido(s.email_contacto) THEN lower(btrim(s.email_contacto)) END,
        'whatsapp', NULLIF(btrim(s.whatsapp), ''),
        'logo_url', s.logo_url,
        'color', s.color_tema
      )
      FROM sedes s WHERE s.id = v_orden.sede_id
    ),
    'orden', jsonb_build_object(
      'numero', v_orden.numero_orden,
      'estatus', public._estatus_cliente(v_orden.estatus, v_orden.lista_para_entregar_en),
      'retirada_sin_reparar', v_orden.retirada_sin_reparar,
      'fecha_ingreso', v_orden.fecha_ingreso,
      'fecha_estimada_entrega', v_orden.fecha_estimada_entrega
    ),
    'vehiculo', (
      SELECT btrim(concat_ws(' ', v.anio::text, v.marca, v.modelo))
      FROM vehiculos v WHERE v.id = v_orden.vehiculo_id
    ),
    'ultimo_estatus_enviado', (
      SELECT datos->>'estatus_enviado'
      FROM cola_envios
      WHERE orden_id = v_orden.id AND canal = 'email' AND plantilla = 'estatus' AND estado = 'enviado'
      ORDER BY enviado_en DESC NULLS LAST
      LIMIT 1
    ),
    'parqueo', v_parqueo_correo,
    'presupuesto', CASE WHEN v_job.datos ? 'presupuesto_id' THEN (
      SELECT jsonb_build_object(
        'numero', p.numero,
        'estado', p.estado,
        'via', p.respondido_via,
        'total_propuesto', p.total_propuesto,
        'total_aprobado', p.total_aprobado,
        'lineas', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('descripcion', l.descripcion, 'monto', l.monto, 'estado', l.estado) ORDER BY l.creado_en)
          FROM (
            SELECT descripcion, costo AS monto, estado, creado_en FROM orden_labor WHERE presupuesto_id = p.id
            UNION ALL
            SELECT descripcion, subtotal, estado, creado_en FROM orden_repuestos WHERE presupuesto_id = p.id
          ) l
        ), '[]'::jsonb)
      )
      FROM presupuestos p
      WHERE p.id = (v_job.datos->>'presupuesto_id')::uuid
    ) END
  );
END;
$$;

ALTER FUNCTION "public"."datos_correo"("p_cola_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."datos_orden_aviso"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'orden_id', o.id,
    'numero_orden', o.numero_orden,
    'sede_id', o.sede_id,
    'vehiculo', btrim(concat_ws(' ', v.anio::text, v.marca, v.modelo)),
    'cliente', c.nombre
  )
  FROM ordenes_trabajo o
  LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
  LEFT JOIN clientes c ON c.id = o.cliente_id
  WHERE o.id = p_orden_id;
$$;

ALTER FUNCTION "public"."datos_orden_aviso"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."datos_portal"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
    RETURN jsonb_build_object(
      'estado_enlace', 'vencido',
      'taller', v_taller,
      'cliente', (
        SELECT jsonb_build_object(
          'tiene_correo', public.es_correo_valido(c.email),
          'acepta_correos', c.acepta_correos
        )
        FROM ordenes_trabajo o
        JOIN clientes c ON c.id = o.cliente_id
        WHERE o.id = v_enlace.orden_id
      )
    );
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
      'marcas_danos', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'vista', m->>'vista',
            'x', (m->>'x')::numeric,
            'y', (m->>'y')::numeric,
            'tipo', m->>'tipo'
          )
        )
        FROM jsonb_array_elements(COALESCE(v_orden.marcas_danos, '[]'::jsonb)) AS m
      ), '[]'::jsonb),
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
          'inspeccion_punto_id', m.inspeccion_punto_id,
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
      WHERE m.orden_id = v_orden.id
        AND (
          m.visible_cliente
          -- La foto de un punto sale con su inspección publicada, y solo la de un punto que
          -- el cliente ve (no los pendientes ni los "no aplica").
          OR (m.origen = 'inspeccion' AND EXISTS (
            SELECT 1
            FROM public.orden_inspeccion_puntos p
            JOIN public.orden_inspecciones i ON i.id = p.inspeccion_id
            WHERE p.id = m.inspeccion_punto_id
              AND i.publicada_en IS NOT NULL
              AND p.estado IN ('urgente', 'atencion', 'bien')
          ))
        )
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
        'trabajos', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', tj.id,
              'titulo', tj.titulo,
              'total', tj.total
            ) ORDER BY tj.creado_en, tj.titulo
          )
          FROM (
            SELECT
              ot.id,
              ot.titulo,
              ot.creado_en,
              SUM(x.monto) AS total
            FROM (
              SELECT lb.trabajo_id, lb.costo AS monto
              FROM orden_labor lb
              WHERE lb.presupuesto_id = p.id AND lb.estado = 'pendiente' AND lb.trabajo_id IS NOT NULL
              UNION ALL
              SELECT r.trabajo_id, r.subtotal AS monto
              FROM orden_repuestos r
              WHERE r.presupuesto_id = p.id AND r.estado = 'pendiente' AND r.trabajo_id IS NOT NULL
            ) x
            JOIN orden_trabajos ot ON ot.id = x.trabajo_id
            GROUP BY ot.id, ot.titulo, ot.creado_en
          ) tj
        ), '[]'::jsonb),
        'lineas', COALESCE((
          SELECT jsonb_agg(l.linea ORDER BY l.creado_en, l.descripcion)
          FROM (
            SELECT lb.creado_en, lb.descripcion, jsonb_build_object(
              'id', lb.id, 'tipo', 'mano_obra', 'descripcion', lb.descripcion,
              'cantidad', 1, 'precio_unitario', lb.costo, 'monto', lb.costo,
              'trabajo_id', lb.trabajo_id, 'trabajo', ot.titulo
            ) AS linea
            FROM orden_labor lb
            LEFT JOIN orden_trabajos ot ON ot.id = lb.trabajo_id
            WHERE lb.presupuesto_id = p.id AND lb.estado = 'pendiente'
            UNION ALL
            SELECT r.creado_en, r.descripcion, jsonb_build_object(
              'id', r.id, 'tipo', 'repuesto', 'descripcion', r.descripcion,
              'cantidad', r.cantidad, 'precio_unitario', r.precio_venta_unitario, 'monto', r.subtotal,
              'trabajo_id', r.trabajo_id, 'trabajo', ot.titulo
            )
            FROM orden_repuestos r
            LEFT JOIN orden_trabajos ot ON ot.id = r.trabajo_id
            WHERE r.presupuesto_id = p.id AND r.estado = 'pendiente'
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
    ),
    'inspeccion', (
      SELECT jsonb_build_object(
        'nombre', i.nombre,
        'completada_en', i.completada_en,
        'resumen', jsonb_build_object(
          'urgente', COALESCE((SELECT COUNT(*)::int FROM public.orden_inspeccion_puntos WHERE inspeccion_id = i.id AND estado = 'urgente'), 0),
          'atencion', COALESCE((SELECT COUNT(*)::int FROM public.orden_inspeccion_puntos WHERE inspeccion_id = i.id AND estado = 'atencion'), 0),
          'bien', COALESCE((SELECT COUNT(*)::int FROM public.orden_inspeccion_puntos WHERE inspeccion_id = i.id AND estado = 'bien'), 0)
        ),
        'puntos', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'seccion', p.seccion,
              'nombre', p.nombre,
              'estado', p.estado,
              'nota', p.nota
            )
            ORDER BY
              CASE p.estado
                WHEN 'urgente' THEN 1
                WHEN 'atencion' THEN 2
                WHEN 'bien' THEN 3
                ELSE 4
              END,
              p.posicion,
              p.id
          )
          FROM public.orden_inspeccion_puntos p
          WHERE p.inspeccion_id = i.id
            AND p.estado IN ('urgente', 'atencion', 'bien')
        ), '[]'::jsonb)
      )
      FROM public.orden_inspecciones i
      WHERE i.orden_id = v_orden.id
        AND i.publicada_en IS NOT NULL
    )
  );
END;
$_$;

ALTER FUNCTION "public"."datos_portal"("p_token" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."datos_servicio"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
    -- El diccionario siempre traduce hacia 'en' (como _diccionario_traducciones) para que
    -- el cliente pueda cambiar el sticker a inglés aunque el idioma inicial sea 'es'.
    'traducciones', COALESCE((
      SELECT jsonb_object_agg(t.texto_original, t.traduccion)
      FROM public.traducciones t
      WHERE t.sede_id = v_ps.sede_id
        AND t.idioma_destino = 'en'
        AND NULLIF(trim(v_ps.nota), '') IS NOT NULL
        AND t.md5_hash = md5(trim(v_ps.nota))
    ), '{}'::jsonb)
  );
END;
$_$;

ALTER FUNCTION "public"."datos_servicio"("p_token" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_sede_cascade"("p_sede_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_fallback_sede UUID;
  v_impact        JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar una sede.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sedes WHERE id = p_sede_id) THEN
    RAISE EXCEPTION 'La sede ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  -- Where the staff of this sede end up. Preferring the caller's own sede keeps
  -- them somewhere the admin is already looking.
  SELECT id INTO v_fallback_sede
  FROM sedes
  WHERE id <> p_sede_id
  ORDER BY (id = (SELECT sede_id FROM perfiles WHERE id = auth.uid())) DESC, nombre
  LIMIT 1;

  IF v_fallback_sede IS NULL AND EXISTS (SELECT 1 FROM perfiles WHERE sede_id = p_sede_id) THEN
    RAISE EXCEPTION 'No puedes eliminar la última sede: los empleados quedarían sin taller. Crea otra sede primero.'
      USING ERRCODE = 'P0001';
  END IF;

  v_impact := public.sede_delete_impact(p_sede_id);

  -- Order matters: children before parents, and finance rows before the orders
  -- they point at so `referencia_orden_id` is never left dangling.
  DELETE FROM finanzas_movimientos WHERE sede_id = p_sede_id;

  DELETE FROM finanzas_movimientos
  WHERE referencia_orden_id IN (SELECT id FROM ordenes_trabajo WHERE sede_id = p_sede_id);

  -- comisiones / comision_pagos cascade from sedes and from ordenes_trabajo,
  -- but the payment rows reference perfiles with RESTRICT, so they go first.
  DELETE FROM comision_pagos WHERE sede_id = p_sede_id;
  DELETE FROM comisiones WHERE sede_id = p_sede_id;

  -- orden_labor / orden_repuestos / orden_asignaciones / orden_avances all
  -- cascade from ordenes_trabajo.
  -- Borrar la sede entera es lo único que borra órdenes entregadas
  -- (trg_guard_order_delete_entregada, 20261010000041): la bandera vive solo en esta transacción.
  PERFORM set_config('restorify.borrar_sede', 'on', true);
  DELETE FROM ordenes_trabajo WHERE sede_id = p_sede_id;
  PERFORM set_config('restorify.borrar_sede', 'off', true);

  -- vehiculos cascade from clientes.
  DELETE FROM clientes WHERE sede_id = p_sede_id;

  DELETE FROM finanzas_importaciones WHERE sede_id = p_sede_id;

  UPDATE perfiles SET sede_id = v_fallback_sede WHERE sede_id = p_sede_id;

  DELETE FROM sedes WHERE id = p_sede_id;

  RETURN v_impact || jsonb_build_object('empleados_reasignados', v_impact->'empleados');
END;
$$;

ALTER FUNCTION "public"."delete_sede_cascade"("p_sede_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_sede_cascade"("p_sede_id" "uuid") IS 'Deletes a workshop together with its customers, vehicles, orders, finance
   movements and commissions. Employees are moved to another workshop rather
   than deleted. Admin-only; refuses when it would leave staff with no sede.';

CREATE OR REPLACE FUNCTION "public"."descartar_hallazgo"("p_hallazgo_id" "uuid", "p_en_reporte" boolean, "p_texto" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_h     orden_hallazgos;
  v_texto TEXT := NULLIF(btrim(COALESCE(p_texto, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede descartar un trabajo adicional.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_h FROM orden_hallazgos WHERE id = p_hallazgo_id FOR UPDATE;
  IF v_h.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ese trabajo adicional.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = v_h.orden_id AND estatus = 'entregado'
  ) THEN
    RAISE EXCEPTION 'La orden ya fue entregada: su reporte ya no se cambia.' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_h.estado = 'pendiente' OR (v_h.estado = 'cotizado' AND v_h.presupuesto_id IS NULL)) THEN
    RAISE EXCEPTION 'Este trabajo adicional ya se resolvió.' USING ERRCODE = '42501';
  END IF;
  IF length(v_texto) > 1000 THEN
    RAISE EXCEPTION 'El texto para el cliente es demasiado largo (máximo 1000 caracteres).' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_en_reporte, false) AND v_texto IS NULL THEN
    RAISE EXCEPTION 'Escribe el texto que verá el cliente en su reporte.' USING ERRCODE = '42501';
  END IF;

  UPDATE orden_hallazgos
  SET estado = 'descartado',
      en_reporte = COALESCE(p_en_reporte, false),
      texto_cliente = v_texto,
      resuelto_por = auth.uid(),
      resuelto_en = NOW()
  WHERE id = v_h.id;

  PERFORM public._salir_de_espera(v_h.orden_id);
END;
$$;

ALTER FUNCTION "public"."descartar_hallazgo"("p_hallazgo_id" "uuid", "p_en_reporte" boolean, "p_texto" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."descartar_sugerencia_proximo_servicio"("p_orden_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."descartar_sugerencia_proximo_servicio"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."deshacer_importacion_estado_cuenta"("p_importacion_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_movimientos INTEGER;
  v_lote        INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede deshacer una importación.' USING ERRCODE = '42501';
  END IF;
  IF p_importacion_id IS NULL THEN
    RAISE EXCEPTION 'Falta la importación que se quiere deshacer.';
  END IF;

  -- El lote se bloquea antes de tocar los movimientos: dos personas deshaciendo la misma
  -- importación a la vez borrarían las mismas filas, y la segunda reportaría un número de
  -- movimientos que no borró ella. Es el mismo cuidado que `pay_commissions`.
  PERFORM 1 FROM finanzas_importaciones WHERE id = p_importacion_id FOR UPDATE;

  DELETE FROM finanzas_movimientos WHERE importacion_id = p_importacion_id;
  GET DIAGNOSTICS v_movimientos = ROW_COUNT;

  DELETE FROM finanzas_importaciones WHERE id = p_importacion_id;
  GET DIAGNOSTICS v_lote = ROW_COUNT;

  IF v_lote = 0 THEN
    RAISE EXCEPTION 'La importación ya no existe o no tienes permiso para deshacerla.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_movimientos;
END;
$$;

ALTER FUNCTION "public"."deshacer_importacion_estado_cuenta"("p_importacion_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."detener_reloj"("p_labor_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.orden_labor_tiempos
  SET fin = LEAST(clock_timestamp(), inicio + public._reloj_tope())
  WHERE labor_id = p_labor_id AND usuario_id = auth.uid() AND fin IS NULL;
END;
$$;

ALTER FUNCTION "public"."detener_reloj"("p_labor_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."dispatch_outbox_if_due"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cola_envios
    WHERE (estado = 'pendiente' AND enviar_despues_de <= NOW())
       OR (estado = 'procesando' AND bloqueado_en < NOW() - INTERVAL '5 minutes')
  ) THEN
    PERFORM public.invoke_edge_function('process-outbox');
  END IF;
END;
$$;

ALTER FUNCTION "public"."dispatch_outbox_if_due"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."eliminar_push"("p_endpoint" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM push_suscripciones WHERE endpoint = p_endpoint AND usuario_id = auth.uid();
$$;

ALTER FUNCTION "public"."eliminar_push"("p_endpoint" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."encolar_correo_cliente"("p_orden_id" "uuid", "p_plantilla" "text", "p_datos" "jsonb" DEFAULT '{}'::"jsonb", "p_clave_dedupe" "text" DEFAULT NULL::"text", "p_espera" interval DEFAULT '00:00:00'::interval) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- Si el enlace más reciente fue desactivado a mano, no se crea uno nuevo ni se manda el correo.
  IF NOT EXISTS (
       SELECT 1 FROM orden_enlaces WHERE orden_id = p_orden_id AND revocado_en IS NULL
     )
     AND COALESCE((
       SELECT e.revocado_por IS NOT NULL
       FROM orden_enlaces e
       WHERE e.orden_id = p_orden_id
       ORDER BY COALESCE(e.revocado_en, e.creado_en) DESC, e.creado_en DESC, e.id DESC
       LIMIT 1
     ), false) THEN
    INSERT INTO cola_envios (
      canal, destinatario, plantilla, datos, orden_id, estado, ultimo_error, enviar_despues_de, clave_dedupe
    )
    VALUES (
      'email', lower(v_email), p_plantilla, COALESCE(p_datos, '{}'::jsonb), p_orden_id,
      'omitido', 'El enlace del cliente fue desactivado manualmente.', NOW() + p_espera, p_clave_dedupe
    );
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

ALTER FUNCTION "public"."encolar_correo_cliente"("p_orden_id" "uuid", "p_plantilla" "text", "p_datos" "jsonb", "p_clave_dedupe" "text", "p_espera" interval) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."entregar_orden"("p_orden_id" "uuid", "p_metodo" "text" DEFAULT NULL::"text", "p_numero_cheque" "text" DEFAULT NULL::"text", "p_comprobante_ruta" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden   RECORD;
  v_saldo   NUMERIC;
  v_metodo  TEXT := NULLIF(btrim(COALESCE(p_metodo, '')), '');
  v_cheque  TEXT := NULLIF(btrim(COALESCE(p_numero_cheque, '')), '');
  v_ruta    TEXT := NULLIF(btrim(COALESCE(p_comprobante_ruta, '')), '');
  v_mov_id  UUID;
  v_tipo    TEXT;
  v_hoy     DATE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede entregar una orden.' USING ERRCODE = '42501';
  END IF;

  -- Bloquea la orden: dos clics, o dos pestañas, no asientan dos pagos.
  SELECT id, sede_id, numero_orden, estatus INTO v_orden
  FROM ordenes_trabajo WHERE id = p_orden_id
  FOR UPDATE;

  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada.' USING ERRCODE = '42501';
  END IF;

  -- El parqueo hasta hoy entra al total antes de calcular el saldo: el cobro final lo lleva.
  PERFORM public._recalcular_parqueo(p_orden_id);

  v_saldo := round(public._saldo_orden(p_orden_id), 2);
  v_hoy := public.hoy_taller(v_orden.sede_id);

  IF abs(v_saldo) > 0.01 THEN
    IF v_metodo IS NULL OR v_metodo NOT IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque') THEN
      RAISE EXCEPTION 'Elige cómo pagó el cliente: efectivo, tarjeta, Zelle, transferencia o cheque.' USING ERRCODE = '22023';
    END IF;
    IF v_metodo = 'cheque' AND v_cheque IS NULL AND v_ruta IS NULL THEN
      RAISE EXCEPTION 'Anota el número del cheque o sube su foto.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- El comprobante es un archivo del bucket privado, en la carpeta de la sede de la orden.
  IF v_ruta IS NOT NULL AND v_ruta NOT LIKE v_orden.sede_id::text || '/%' THEN
    RAISE EXCEPTION 'El comprobante debe guardarse en la carpeta de la sede de la orden.' USING ERRCODE = '42501';
  END IF;

  IF v_saldo > 0.01 THEN
    v_tipo := 'ingreso';
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id,
      registrado_por, metodo_pago, numero_cheque, comprobante_ruta
    ) VALUES (
      v_orden.sede_id, 'ingreso', 'pago_cliente', v_saldo,
      'Pago final - ' || v_orden.numero_orden, v_hoy, p_orden_id,
      auth.uid(), v_metodo, v_cheque, v_ruta
    ) RETURNING id INTO v_mov_id;
  ELSIF v_saldo < -0.01 THEN
    v_tipo := 'egreso';
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id,
      registrado_por, metodo_pago, numero_cheque, comprobante_ruta
    ) VALUES (
      v_orden.sede_id, 'egreso', 'pago_cliente', -v_saldo,
      'Devolución al cliente - ' || v_orden.numero_orden, v_hoy, p_orden_id,
      auth.uid(), v_metodo, v_cheque, v_ruta
    ) RETURNING id INTO v_mov_id;
  END IF;

  -- El parqueo ya va en el saldo de arriba: queda fijo en hoy. Se fija aquí y no solo en
  -- `trg_parqueo_orden` (que atrapa sus errores): si esto falla, se deshace la entrega entera en
  -- vez de quedar una orden entregada sin congelar.
  INSERT INTO orden_parqueo (orden_id, fin_congelado)
  VALUES (p_orden_id, v_hoy)
  ON CONFLICT (orden_id) DO UPDATE SET fin_congelado = EXCLUDED.fin_congelado;

  -- Con el pago ya asentado, `handle_order_delivery_payment` calcula un restante de cero. Si
  -- algo lo impide (un presupuesto esperando al cliente, `trg_guard_entrega_con_presupuesto`),
  -- la excepción deshace también el pago de arriba. La marca de retirada solo la enciende
  -- `retirar_sin_reparar` (y `trg_guard_retirada` no deja hacerlo de otra forma).
  UPDATE ordenes_trabajo
  SET estatus = 'entregado', fecha_finalizacion = NOW(), porcentaje_avance = 100,
      retirada_sin_reparar = COALESCE(current_setting('restorify.retirada', true), 'off') = 'on'
  WHERE id = p_orden_id;

  RETURN jsonb_build_object('saldo', v_saldo, 'tipo', v_tipo, 'movimiento_id', v_mov_id);
END;
$$;

ALTER FUNCTION "public"."entregar_orden"("p_orden_id" "uuid", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."enviar_presupuesto"("p_orden_id" "uuid", "p_notificar" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
           OR EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'borrador');

  IF v_p.id IS NULL THEN
    IF NOT v_drafts THEN
      RAISE EXCEPTION 'No hay trabajos sin autorizar para enviar al cliente.';
    END IF;
    v_p := public._crear_presupuesto(p_orden_id);
  ELSIF v_drafts THEN
    PERFORM public._agregar_borradores(v_p.id);
    SELECT * INTO v_p FROM presupuestos WHERE id = v_p.id;
  END IF;

  -- F6: los hallazgos cotizados salen con este presupuesto.
  UPDATE orden_hallazgos SET presupuesto_id = v_p.id
  WHERE orden_id = p_orden_id AND estado = 'cotizado' AND presupuesto_id IS NULL;

  -- F6: mientras el cliente decide, la orden está en pausa. Solo desde "en proceso": una
  -- orden en recepción o terminada no se mueve por enviar un presupuesto.
  UPDATE ordenes_trabajo SET estatus = 'espera_autorizacion'
  WHERE id = p_orden_id AND estatus = 'en_proceso';

  PERFORM public.asegurar_enlace_orden(p_orden_id);

  IF p_notificar THEN
    -- Un minuto con clave única: si el admin agrega otra línea y vuelve a enviar,
    -- el cliente recibe un solo correo con todo.
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

ALTER FUNCTION "public"."enviar_presupuesto"("p_orden_id" "uuid", "p_notificar" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."enviar_reporte_cliente"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_enlace orden_enlaces;
  v_id     UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede enviar el reporte al cliente.' USING ERRCODE = '42501';
  END IF;

  v_enlace := public.asegurar_enlace_orden(p_orden_id);
  v_id := public.encolar_correo_cliente(p_orden_id, 'reporte', '{}'::jsonb, 'reporte:' || p_orden_id, INTERVAL '1 minute');

  RETURN jsonb_build_object(
    'correo', CASE WHEN v_id IS NULL THEN 'sin_correo' ELSE 'encolado' END,
    'token', v_enlace.token
  );
END;
$$;

ALTER FUNCTION "public"."enviar_reporte_cliente"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."es_correo_valido"("p_email" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
  SELECT p_email IS NOT NULL AND btrim(p_email) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
$_$;

ALTER FUNCTION "public"."es_correo_valido"("p_email" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."finish_outbox"("p_id" "uuid", "p_estado" "text", "p_error" "text" DEFAULT NULL::"text", "p_proveedor_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_intentos INTEGER;
BEGIN
  SELECT intentos INTO v_intentos FROM cola_envios WHERE id = p_id;

  IF p_estado = 'reintentar' THEN
    IF COALESCE(v_intentos, 0) >= 5 THEN
      UPDATE cola_envios
      SET estado = 'error', ultimo_error = left(p_error, 1000), bloqueado_en = NULL
      WHERE id = p_id;
    ELSE
      UPDATE cola_envios
      SET estado = 'pendiente',
          ultimo_error = left(p_error, 1000),
          bloqueado_en = NULL,
          enviar_despues_de = NOW() + (INTERVAL '1 minute' * power(4, GREATEST(COALESCE(v_intentos, 1) - 1, 0)))
      WHERE id = p_id;
    END IF;
    RETURN;
  END IF;

  IF p_estado NOT IN ('enviado', 'omitido', 'error') THEN
    RAISE EXCEPTION 'Estado de envío inválido: %', p_estado;
  END IF;

  UPDATE cola_envios
  SET estado = p_estado,
      ultimo_error = left(p_error, 1000),
      proveedor_id = COALESCE(p_proveedor_id, proveedor_id),
      bloqueado_en = NULL,
      enviado_en = CASE WHEN p_estado = 'enviado' THEN NOW() ELSE enviado_en END
  WHERE id = p_id;
END;
$$;

ALTER FUNCTION "public"."finish_outbox"("p_id" "uuid", "p_estado" "text", "p_error" "text", "p_proveedor_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."guardar_config_parqueo"("p_sede_id" "uuid", "p_config" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_vigente    DATE;
  v_perfiles   JSONB;
  v_tipo       TEXT;
  v_perf       JSONB;
  v_tramos     JSONB;
  v_tramo      RECORD;
  v_perfil_id  UUID;
  v_desde_prev INT;
  v_primer_t   NUMERIC;
  v_hab        BOOLEAN;
  v_actual     parqueo_config;
  v_habilitado BOOLEAN := COALESCE((p_config->>'habilitado')::boolean, false);
  v_hoy        DATE;
  r            RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede configurar el parqueo.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sedes WHERE id = p_sede_id) THEN
    RAISE EXCEPTION 'Esa sede no existe.' USING ERRCODE = 'P0002';
  END IF;

  v_perfiles := p_config->'perfiles';
  IF v_perfiles IS NULL OR NOT (v_perfiles ? 'seguro') OR NOT (v_perfiles ? 'particular') THEN
    RAISE EXCEPTION 'La configuración debe incluir los perfiles seguro y particular.' USING ERRCODE = '22023';
  END IF;

  -- Validar ambos perfiles
  FOREACH v_tipo IN ARRAY ARRAY['seguro', 'particular'] LOOP
    v_perf := v_perfiles->v_tipo;
    v_hab := COALESCE((v_perf->>'habilitado')::boolean, true);

    IF COALESCE(v_perf->>'evento_inicio', '') NOT IN ('ingreso', 'lista_para_entregar') THEN
      RAISE EXCEPTION 'Elige cuándo empieza a contar el parqueo: la llegada del vehículo o cuando está listo para entregar.' USING ERRCODE = '22023';
    END IF;

    IF (v_perf->>'dias_gracia')::int < 0 OR (v_perf->>'dias_gracia')::int > 365 THEN
      RAISE EXCEPTION 'Los días de gracia deben estar entre 0 y 365.' USING ERRCODE = '22023';
    END IF;

    IF COALESCE((v_perf->>'tope_dias')::int, 0) < 0 OR COALESCE((v_perf->>'tope_monto')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Los topes de parqueo no pueden ser negativos.' USING ERRCODE = '22023';
    END IF;

    v_tramos := v_perf->'tramos';
    IF v_tramos IS NULL OR jsonb_array_length(v_tramos) = 0 THEN
      RAISE EXCEPTION 'Cada perfil de parqueo debe tener al menos un tramo de tarifa.' USING ERRCODE = '22023';
    END IF;

    v_desde_prev := 0;
    v_primer_t := NULL;
    FOR v_tramo IN
      SELECT (e->>'desde_dia')::int AS desde_dia, (e->>'tarifa_diaria')::numeric AS tarifa_diaria
      FROM jsonb_array_elements(v_tramos) AS e
    LOOP
      IF v_desde_prev = 0 AND v_tramo.desde_dia <> 1 THEN
        RAISE EXCEPTION 'El primer tramo de parqueo debe iniciar en el día 1.' USING ERRCODE = '22023';
      END IF;
      IF v_tramo.desde_dia <= v_desde_prev THEN
        RAISE EXCEPTION 'Los días de inicio de los tramos deben ser crecientes y sin duplicados.' USING ERRCODE = '22023';
      END IF;
      IF v_tramo.tarifa_diaria < 0 THEN
        RAISE EXCEPTION 'La tarifa diaria no puede ser negativa.' USING ERRCODE = '22023';
      END IF;
      IF v_primer_t IS NULL THEN
        v_primer_t := v_tramo.tarifa_diaria;
      END IF;
      v_desde_prev := v_tramo.desde_dia;
    END LOOP;

    IF v_hab AND (v_primer_t IS NULL OR v_primer_t <= 0) THEN
      RAISE EXCEPTION 'Un perfil de parqueo habilitado debe tener una tarifa mayor a 0 en su primer tramo.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- "Vigente desde": sin fecha, hoy. Nunca en el pasado al encender el módulo ni para atrás de
  -- la que ya tenía: existe para que encender el cobro no les cobre a las órdenes que ya están en
  -- el taller días que ya pasaron (auditoría del 10/10/2026). La misma fecha se puede volver a
  -- guardar, o moverla hacia adelante. Para cobrar días anteriores a una orden en particular
  -- está su "inicio manual" (`ajustar_parqueo_orden`), que queda en el historial.
  SELECT * INTO v_actual FROM parqueo_config WHERE sede_id = p_sede_id;
  v_hoy := public.hoy_taller(p_sede_id);
  v_vigente := NULLIF(p_config->>'vigente_desde', '')::date;
  IF v_habilitado AND v_vigente IS NULL THEN
    v_vigente := v_hoy;
  END IF;
  IF v_habilitado AND v_vigente < v_hoy
     AND (v_actual.habilitado IS NOT TRUE
          OR v_actual.vigente_desde IS NULL
          OR v_vigente < v_actual.vigente_desde) THEN
    RAISE EXCEPTION 'El cobro de parqueo no puede empezar antes de hoy. Para cobrar días anteriores a una orden, usa su inicio manual.'
      USING ERRCODE = '22023';
  END IF;

  -- 1. Guardar config de sede
  INSERT INTO parqueo_config (
    sede_id, habilitado, vigente_desde, incluir_ordenes_previas, avisar_cliente,
    politica_es, politica_en, actualizado_en, actualizado_por
  ) VALUES (
    p_sede_id,
    v_habilitado,
    v_vigente,
    COALESCE((p_config->>'incluir_ordenes_previas')::boolean, false),
    COALESCE((p_config->>'avisar_cliente')::boolean, true),
    NULLIF(btrim(p_config->>'politica_es'), ''),
    NULLIF(btrim(p_config->>'politica_en'), ''),
    NOW(),
    auth.uid()
  )
  ON CONFLICT (sede_id) DO UPDATE SET
    habilitado              = EXCLUDED.habilitado,
    vigente_desde           = EXCLUDED.vigente_desde,
    incluir_ordenes_previas = EXCLUDED.incluir_ordenes_previas,
    avisar_cliente          = EXCLUDED.avisar_cliente,
    politica_es             = EXCLUDED.politica_es,
    politica_en             = EXCLUDED.politica_en,
    actualizado_en          = EXCLUDED.actualizado_en,
    actualizado_por         = EXCLUDED.actualizado_por;

  -- 2. Guardar perfiles y tramos
  FOREACH v_tipo IN ARRAY ARRAY['seguro', 'particular'] LOOP
    v_perf := v_perfiles->v_tipo;

    INSERT INTO parqueo_perfiles (
      sede_id, tipo, habilitado, evento_inicio, cobra_dia_evento, dias_gracia,
      gracia_dias_habiles, tope_dias, tope_monto
    ) VALUES (
      p_sede_id,
      v_tipo,
      COALESCE((v_perf->>'habilitado')::boolean, true),
      v_perf->>'evento_inicio',
      COALESCE((v_perf->>'cobra_dia_evento')::boolean, false),
      COALESCE((v_perf->>'dias_gracia')::int, 0),
      COALESCE((v_perf->>'gracia_dias_habiles')::boolean, false),
      NULLIF((v_perf->>'tope_dias')::int, 0),
      NULLIF((v_perf->>'tope_monto')::numeric, 0)
    )
    ON CONFLICT (sede_id, tipo) DO UPDATE SET
      habilitado          = EXCLUDED.habilitado,
      evento_inicio       = EXCLUDED.evento_inicio,
      cobra_dia_evento    = EXCLUDED.cobra_dia_evento,
      dias_gracia         = EXCLUDED.dias_gracia,
      gracia_dias_habiles = EXCLUDED.gracia_dias_habiles,
      tope_dias           = EXCLUDED.tope_dias,
      tope_monto          = EXCLUDED.tope_monto
    RETURNING id INTO v_perfil_id;

    DELETE FROM parqueo_tramos WHERE perfil_id = v_perfil_id;

    INSERT INTO parqueo_tramos (perfil_id, desde_dia, tarifa_diaria)
    SELECT v_perfil_id, (e->>'desde_dia')::int, (e->>'tarifa_diaria')::numeric
    FROM jsonb_array_elements(v_perf->'tramos') AS e;
  END LOOP;

  -- 3. Recalcular todas las órdenes no entregadas de la sede
  FOR r IN SELECT id FROM ordenes_trabajo WHERE sede_id = p_sede_id AND estatus <> 'entregado' LOOP
    PERFORM public._recalcular_parqueo(r.id);
  END LOOP;

  RETURN public.parqueo_config_sede(p_sede_id);
END;
$$;

ALTER FUNCTION "public"."guardar_config_parqueo"("p_sede_id" "uuid", "p_config" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."guardar_plantilla_inspeccion"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_predeterminada" boolean, "p_puntos" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede guardar plantillas de inspección.'
      USING ERRCODE = '42501';
  END IF;

  IF p_nombre IS NULL OR char_length(btrim(p_nombre)) = 0 OR char_length(p_nombre) > 120 THEN
    RAISE EXCEPTION 'El nombre no puede estar vacío y debe tener 120 caracteres o menos.'
      USING ERRCODE = '22023';
  END IF;

  IF p_puntos IS NULL OR jsonb_typeof(p_puntos) <> 'array' OR jsonb_array_length(p_puntos) = 0 THEN
    RAISE EXCEPTION 'Una plantilla de inspección necesita al menos un punto.'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_predeterminada, false) THEN
    UPDATE public.inspeccion_plantillas
    SET predeterminada = false, actualizado_en = now()
    WHERE sede_id = p_sede_id AND predeterminada = true AND (p_id IS NULL OR id <> p_id);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.inspeccion_plantillas (
      sede_id, nombre, activo, predeterminada
    ) VALUES (
      p_sede_id, btrim(p_nombre), COALESCE(p_activo, true), COALESCE(p_predeterminada, false)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.inspeccion_plantillas
    SET
      nombre = btrim(p_nombre),
      activo = COALESCE(p_activo, true),
      predeterminada = COALESCE(p_predeterminada, false),
      actualizado_en = now()
    WHERE id = p_id AND sede_id = p_sede_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plantilla de inspección no encontrada en esta sede.'
        USING ERRCODE = '42501';
    END IF;

    v_id := p_id;
    DELETE FROM public.inspeccion_plantilla_puntos WHERE plantilla_id = v_id;
  END IF;

  INSERT INTO public.inspeccion_plantilla_puntos (
    plantilla_id, seccion, nombre, posicion
  )
  SELECT
    v_id,
    btrim(elem->>'seccion'),
    btrim(elem->>'nombre'),
    COALESCE((elem->>'posicion')::int, (idx - 1)::int)
  FROM jsonb_array_elements(p_puntos) WITH ORDINALITY AS t(elem, idx);

  RETURN v_id;
END;
$$;

ALTER FUNCTION "public"."guardar_plantilla_inspeccion"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_predeterminada" boolean, "p_puntos" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."guardar_trabajo_catalogo"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_lineas" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede guardar trabajos en el catálogo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_nombre IS NULL OR char_length(btrim(p_nombre)) = 0 OR char_length(p_nombre) > 120 THEN
    RAISE EXCEPTION 'El nombre no puede estar vacío y debe tener 120 caracteres o menos.'
      USING ERRCODE = '22023';
  END IF;

  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Un trabajo del catálogo necesita al menos una línea.'
      USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.catalogo_trabajos (sede_id, nombre, activo, creado_por)
    VALUES (p_sede_id, btrim(p_nombre), COALESCE(p_activo, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.catalogo_trabajos
    SET nombre = btrim(p_nombre),
        activo = COALESCE(p_activo, true),
        actualizado_en = now()
    WHERE id = p_id AND sede_id = p_sede_id
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Trabajo del catálogo no encontrado.' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.catalogo_trabajo_lineas WHERE catalogo_id = v_id;
  END IF;

  INSERT INTO public.catalogo_trabajo_lineas (
    catalogo_id,
    tipo,
    descripcion,
    especialidad,
    horas,
    cantidad,
    precio,
    costo_unitario,
    posicion
  )
  SELECT
    v_id,
    elem->>'tipo',
    btrim(elem->>'descripcion'),
    CASE WHEN elem->>'tipo' = 'mano_obra' THEN elem->>'especialidad' ELSE NULL END,
    CASE
      WHEN elem->>'tipo' = 'mano_obra' AND NULLIF(btrim(COALESCE(elem->>'horas', '')), '') IS NOT NULL
      THEN (elem->>'horas')::numeric
      ELSE NULL
    END,
    CASE WHEN elem->>'tipo' = 'mano_obra' THEN 1 ELSE GREATEST(COALESCE((elem->>'cantidad')::int, 1), 1) END,
    GREATEST(COALESCE((elem->>'precio')::numeric, 0), 0),
    CASE
      WHEN elem->>'tipo' = 'repuesto' AND elem->>'costo_unitario' IS NOT NULL AND btrim(elem->>'costo_unitario') <> ''
      THEN GREATEST((elem->>'costo_unitario')::numeric, 0)
      ELSE NULL
    END,
    COALESCE((elem->>'posicion')::int, (pos - 1)::int)
  FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS arr(elem, pos);

  RETURN v_id;
END;
$$;

ALTER FUNCTION "public"."guardar_trabajo_catalogo"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_lineas" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."guardar_traducciones"("p_sede_id" "uuid", "p_idioma_destino" "text", "p_textos" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO traducciones (sede_id, md5_hash, idioma_destino, texto_original, traduccion)
  SELECT
    p_sede_id,
    md5(t->>'original'),
    p_idioma_destino,
    t->>'original',
    t->>'traduccion'
  FROM jsonb_array_elements(p_textos) AS t
  ON CONFLICT (sede_id, md5_hash, idioma_destino)
  DO UPDATE SET
    traduccion = EXCLUDED.traduccion,
    actualizado_en = now()
  WHERE traducciones.origen = 'auto';
END;
$$;

ALTER FUNCTION "public"."guardar_traducciones"("p_sede_id" "uuid", "p_idioma_destino" "text", "p_textos" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_delivered_order_adjustment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  ord              RECORD;
  already_recorded NUMERIC;
  delta            NUMERIC;
BEGIN
  IF NEW.total_general IS NOT DISTINCT FROM OLD.total_general THEN
    RETURN NEW;
  END IF;

  SELECT id, sede_id, numero_orden, estatus INTO ord
  FROM ordenes_trabajo WHERE id = NEW.orden_id;

  IF ord.estatus IS DISTINCT FROM 'entregado' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
  INTO already_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = ord.id AND categoria = 'pago_cliente' AND importacion_id IS NULL;

  delta := NEW.total_general - already_recorded;

  IF ABS(delta) > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id,
      (CASE WHEN delta > 0 THEN 'ingreso' ELSE 'egreso' END)::transaction_type,
      'pago_cliente',
      ABS(delta),
      CASE WHEN delta > 0 THEN 'Ajuste por cargo adicional - ' ELSE 'Reembolso por ajuste - ' END
        || ord.numero_orden,
      public.hoy_taller(ord.sede_id),
      ord.id
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."handle_delivered_order_adjustment"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_order_delivery_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  remaining NUMERIC;
BEGIN
  IF NEW.estatus = 'entregado' AND (OLD.estatus IS DISTINCT FROM 'entregado') THEN
    remaining := round(public._saldo_orden(NEW.id), 2);

    IF remaining > 0.01 THEN
      INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
      VALUES (
        NEW.sede_id, 'ingreso', 'pago_cliente', remaining,
        'Pago final - ' || NEW.numero_orden, public.hoy_taller(NEW.sede_id), NEW.id
      );
    ELSIF remaining < -0.01 THEN
      INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
      VALUES (
        NEW.sede_id, 'egreso', 'pago_cliente', -remaining,
        'Devolución al cliente - ' || NEW.numero_orden, public.hoy_taller(NEW.sede_id), NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."handle_order_delivery_payment"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."hoy_taller"("p_sede_id" "uuid" DEFAULT NULL::"uuid") RETURNS "date"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tz TEXT;
BEGIN
  SELECT NULLIF(btrim(zona_horaria), '') INTO v_tz FROM sedes WHERE id = p_sede_id;
  BEGIN
    RETURN (NOW() AT TIME ZONE COALESCE(v_tz, 'America/New_York'))::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN (NOW() AT TIME ZONE 'America/New_York')::date;
  END;
END;
$$;

ALTER FUNCTION "public"."hoy_taller"("p_sede_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."importar_estado_cuenta"("p_importacion" "jsonb", "p_movimientos" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id   UUID;
  v_sede UUID := (p_importacion->>'sede_id')::uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede importar estados de cuenta.' USING ERRCODE = '42501';
  END IF;
  IF v_sede IS NULL THEN
    RAISE EXCEPTION 'Falta la sede del estado de cuenta.';
  END IF;
  IF jsonb_typeof(p_movimientos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_movimientos) = 0 THEN
    RAISE EXCEPTION 'No hay movimientos para importar.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_movimientos) mv
    WHERE (mv->>'monto') IS NULL OR (mv->>'monto')::numeric < 0 OR (mv->>'fecha') IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay movimientos sin monto, con monto negativo o sin fecha.';
  END IF;

  BEGIN
    INSERT INTO finanzas_importaciones (sede_id, nombre_archivo, ruta_archivo, importado_por, total_transacciones, hash_archivo)
    VALUES (
      v_sede,
      p_importacion->>'nombre_archivo',
      p_importacion->>'ruta_archivo',
      auth.uid(),
      jsonb_array_length(p_movimientos),
      NULLIF(p_importacion->>'hash_archivo', '')
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Este estado de cuenta ya se importó.' USING ERRCODE = '23505';
  END;

  INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, numero_cheque, registrado_por, importacion_id)
  SELECT
    v_sede,
    (mv->>'tipo')::transaction_type,
    (mv->>'categoria')::transaction_category,
    (mv->>'monto')::numeric,
    COALESCE(mv->>'descripcion', ''),
    (mv->>'fecha')::date,
    NULLIF(btrim(mv->>'numero_cheque'), ''),
    auth.uid(),
    v_id
  FROM jsonb_array_elements(p_movimientos) mv;

  RETURN v_id;
END;
$$;

ALTER FUNCTION "public"."importar_estado_cuenta"("p_importacion" "jsonb", "p_movimientos" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."indicadores_taller"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."indicadores_taller"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."iniciar_inspeccion"("p_orden_id" "uuid", "p_plantilla_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden         ordenes_trabajo;
  v_plantilla     inspeccion_plantillas;
  v_inspeccion_id UUID;
BEGIN
  SELECT * INTO v_orden FROM public.ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_admin() OR public.is_assigned_to_order(p_orden_id)) THEN
    RAISE EXCEPTION 'Solo el personal asignado a la orden o administración puede iniciar la inspección.'
      USING ERRCODE = '42501';
  END IF;

  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'No se puede modificar una orden entregada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_inspeccion_id FROM public.orden_inspecciones WHERE orden_id = p_orden_id;
  IF v_inspeccion_id IS NOT NULL THEN
    RETURN v_inspeccion_id;
  END IF;

  IF p_plantilla_id IS NOT NULL THEN
    SELECT * INTO v_plantilla FROM public.inspeccion_plantillas
    WHERE id = p_plantilla_id AND sede_id = v_orden.sede_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Esa plantilla de inspección no es de la sede de esta orden o no existe.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO v_plantilla FROM public.inspeccion_plantillas
    WHERE sede_id = v_orden.sede_id AND predeterminada = true;

    IF NOT FOUND THEN
      SELECT * INTO v_plantilla FROM public.inspeccion_plantillas
      WHERE sede_id = v_orden.sede_id AND activo = true
      ORDER BY creado_en ASC
      LIMIT 1;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No hay una plantilla de inspección configurada para esta sede.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.orden_inspecciones (
    orden_id, plantilla_id, nombre, creado_por
  ) VALUES (
    v_orden.id, v_plantilla.id, v_plantilla.nombre, auth.uid()
  ) RETURNING id INTO v_inspeccion_id;

  INSERT INTO public.orden_inspeccion_puntos (
    inspeccion_id, orden_id, seccion, nombre, posicion, estado
  )
  SELECT
    v_inspeccion_id,
    v_orden.id,
    p.seccion,
    p.nombre,
    p.posicion,
    'pendiente'
  FROM public.inspeccion_plantilla_puntos p
  WHERE p.plantilla_id = v_plantilla.id
  ORDER BY p.posicion, p.id;

  RETURN v_inspeccion_id;
END;
$$;

ALTER FUNCTION "public"."iniciar_inspeccion"("p_orden_id" "uuid", "p_plantilla_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."iniciar_reloj"("p_labor_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  IF v_orden.estatus = 'finalizado' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'La orden ya está terminada. Si falta algo, pide a administración que la reabra.'
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

ALTER FUNCTION "public"."iniciar_reloj"("p_labor_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."invoke_edge_function"("p_name" "text", "p_body" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'restorify_project_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'restorify_functions_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    -- Sin configurar (entorno local, o recién desplegado): los avisos esperan en
    -- la cola en vez de fallar la operación que los generó.
    RETURN NULL;
  END IF;

  RETURN net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-restorify-secret', v_secret),
    body := p_body,
    timeout_milliseconds := 10000
  );
EXCEPTION WHEN OTHERS THEN
  -- Un aviso que no se pudo despachar nunca debe tumbar, por ejemplo, la
  -- asignación de un técnico. El cron lo vuelve a intentar.
  RAISE WARNING 'invoke_edge_function(%): %', p_name, SQLERRM;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."invoke_edge_function"("p_name" "text", "p_body" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE((SELECT rol FROM perfiles WHERE id = auth.uid()) = 'admin', false);
$$;

ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_assigned_to_order"("p_orden_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM orden_asignaciones a
    JOIN ordenes_trabajo o ON o.id = a.orden_id
    WHERE a.orden_id = p_orden_id
      AND a.usuario_id = auth.uid()
      AND o.sede_id = public.current_user_sede_id()
  );
$$;

ALTER FUNCTION "public"."is_assigned_to_order"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."marcar_estatus_enviado"("p_cola_id" "uuid", "p_estatus" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE cola_envios
  SET datos = datos || jsonb_build_object('estatus_enviado', p_estatus)
  WHERE id = p_cola_id;
$$;

ALTER FUNCTION "public"."marcar_estatus_enviado"("p_cola_id" "uuid", "p_estatus" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."marcar_labor_completada"("p_labor_id" "uuid", "p_completado" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden_id UUID;
  v_sede     UUID;
  v_estatus  order_status;
  v_estado   TEXT;
  v_asignado UUID;
  v_desc     TEXT;
  v_antes    TIMESTAMPTZ;
  v_en       TIMESTAMPTZ;
  v_por      UUID;
  v_admin    BOOLEAN := public.is_admin();
  d          JSONB;
BEGIN
  -- FOR UPDATE OF l: la fila de la línea queda bloqueada, no la de la orden.
  SELECT l.orden_id, o.sede_id, o.estatus, l.estado, l.asignado_a, l.descripcion, l.completado_en
  INTO v_orden_id, v_sede, v_estatus, v_estado, v_asignado, v_desc, v_antes
  FROM orden_labor l
  JOIN ordenes_trabajo o ON o.id = l.orden_id
  WHERE l.id = p_labor_id
  FOR UPDATE OF l;

  IF v_orden_id IS NULL THEN
    RAISE EXCEPTION 'Esa línea de trabajo ya no existe.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    v_admin
    OR (v_sede = public.current_user_sede_id() AND public.is_assigned_to_order(v_orden_id))
  ) THEN
    RAISE EXCEPTION 'Solo el personal asignado puede marcar el trabajo de esta orden. Pide a administración que te asigne.'
      USING ERRCODE = '42501';
  END IF;

  -- Una tarea con técnico es de ese técnico.
  IF NOT v_admin AND v_asignado IS NOT NULL AND v_asignado IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Esta tarea está asignada a otro técnico. Solo esa persona o administración pueden marcarla.'
      USING ERRCODE = '42501';
  END IF;

  IF v_estatus = 'entregado' AND NOT v_admin THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  -- Una orden terminada ya la revisa administración (y quizá ya se le avisó al cliente): el
  -- técnico no le quita una tarea hecha. Marcar una que quedó sin marcar sí puede (06/11/2026).
  IF v_estatus = 'finalizado' AND NOT v_admin AND NOT p_completado THEN
    RAISE EXCEPTION 'La orden ya está terminada. Si falta algo, pide a administración que la reabra.'
      USING ERRCODE = '42501';
  END IF;

  -- COALESCE por los datos anteriores a la fase 5, que no tenían `estado`.
  IF COALESCE(v_estado, 'aprobado') <> 'aprobado' THEN
    RAISE EXCEPTION 'Solo se puede marcar un trabajo que el cliente ya autorizó.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE orden_labor
  SET completado_en  = CASE WHEN p_completado THEN NOW() END,
      completado_por = CASE WHEN p_completado THEN auth.uid() END
  WHERE id = p_labor_id
  RETURNING completado_en, completado_por INTO v_en, v_por;

  -- Aviso a administración cuando un técnico termina una tarea (no al volver a marcarla).
  IF p_completado AND NOT v_admin AND v_antes IS NULL THEN
    BEGIN
      d := public.datos_orden_aviso(v_orden_id) || jsonb_build_object(
        'labor_id', p_labor_id,
        'descripcion', v_desc,
        'usuario_id', auth.uid(),
        'tecnico', (SELECT nombre_completo FROM perfiles WHERE id = auth.uid())
      );
      PERFORM public.notificar(
        public.admins_de_sede(v_sede),
        'tarea_completada',
        'Tarea hecha · ' || (d->>'numero_orden'),
        concat_ws(': ', NULLIF(d->>'tecnico', ''), v_desc),
        d,
        v_orden_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'marcar_labor_completada (aviso): %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('id', p_labor_id, 'completado_en', v_en, 'completado_por', v_por);
END;
$$;

ALTER FUNCTION "public"."marcar_labor_completada"("p_labor_id" "uuid", "p_completado" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."marcar_lista_para_entregar"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden ordenes_trabajo;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede marcar una orden lista para entregar.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estatus <> 'finalizado' THEN
    RAISE EXCEPTION 'Solo una orden finalizada se marca lista para entregar.' USING ERRCODE = '22023';
  END IF;
  -- Marcarla dos veces no avisa dos veces.
  IF v_orden.lista_para_entregar_en IS NOT NULL THEN
    RETURN jsonb_build_object('lista_para_entregar_en', v_orden.lista_para_entregar_en, 'ya_estaba', true);
  END IF;

  PERFORM set_config('restorify.lista', 'on', true);
  UPDATE ordenes_trabajo
  SET lista_para_entregar_en = NOW(), lista_para_entregar_por = auth.uid()
  WHERE id = p_orden_id
  RETURNING lista_para_entregar_en INTO v_orden.lista_para_entregar_en;
  PERFORM set_config('restorify.lista', 'off', true);

  -- El correo "Su vehículo está listo": al momento (el taller ya lo revisó).
  BEGIN
    PERFORM public.encolar_correo_cliente(
      p_orden_id, 'estatus', jsonb_build_object('estatus', 'finalizado'), 'estatus:' || p_orden_id, INTERVAL '0 seconds'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'marcar_lista_para_entregar (correo): %', SQLERRM;
  END;

  RETURN jsonb_build_object('lista_para_entregar_en', v_orden.lista_para_entregar_en, 'ya_estaba', false);
END;
$$;

ALTER FUNCTION "public"."marcar_lista_para_entregar"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."marcar_punto_inspeccion"("p_punto_id" "uuid", "p_estado" "text", "p_nota" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."marcar_punto_inspeccion"("p_punto_id" "uuid", "p_estado" "text", "p_nota" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."margen_ordenes"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date", "p_limite" integer DEFAULT 25, "p_desplazamiento" integer DEFAULT 0, "p_tz" "text" DEFAULT 'America/New_York'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(btrim(p_tz), ''), 'America/New_York');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el margen de las órdenes.' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH o AS (
      SELECT o.id, o.numero_orden, o.fecha_finalizacion, c.nombre AS cliente
      FROM ordenes_trabajo o
      LEFT JOIN clientes c ON c.id = o.cliente_id
      WHERE o.estatus = 'entregado'
        AND (p_sede_id IS NULL OR o.sede_id = p_sede_id)
        AND (o.fecha_finalizacion AT TIME ZONE v_tz)::date >= p_desde
        AND (o.fecha_finalizacion AT TIME ZONE v_tz)::date < p_hasta
    ),
    b AS (
      SELECT o.*, x.*
      FROM o CROSS JOIN LATERAL public._balance_orden(o.id) x
    )
    SELECT jsonb_build_object(
      'total_filas', (SELECT COUNT(*) FROM b),
      'sumas', (
        SELECT jsonb_build_object(
          'cobrado', COALESCE(SUM(cobrado), 0),
          'costo_repuestos', COALESCE(SUM(costo_repuestos), 0),
          'comisiones', COALESCE(SUM(comisiones), 0),
          'margen', COALESCE(SUM(margen), 0)
        ) FROM b
      ),
      'filas', COALESCE((
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.fecha_finalizacion DESC, p.id)
        FROM (
          SELECT id, numero_orden, cliente, fecha_finalizacion, total_orden, cobrado,
                 costo_repuestos, comisiones, margen
          FROM b
          ORDER BY fecha_finalizacion DESC, id
          LIMIT GREATEST(LEAST(COALESCE(p_limite, 25), 100), 1)
          OFFSET GREATEST(COALESCE(p_desplazamiento, 0), 0)
        ) p
      ), '[]'::jsonb)
    )
  );
END;
$$;

ALTER FUNCTION "public"."margen_ordenes"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date", "p_limite" integer, "p_desplazamiento" integer, "p_tz" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."mis_ordenes_asignadas"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(array_agg(DISTINCT a.orden_id), '{}'::uuid[])
  FROM orden_asignaciones a
  JOIN ordenes_trabajo o ON o.id = a.orden_id
  WHERE a.usuario_id = auth.uid()
    AND o.sede_id = public.current_user_sede_id();
$$;

ALTER FUNCTION "public"."mis_ordenes_asignadas"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notificar"("p_usuarios" "uuid"[], "p_tipo" "text", "p_titulo" "text", "p_cuerpo" "text", "p_datos" "jsonb" DEFAULT '{}'::"jsonb", "p_orden_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_sede   UUID;
  v_url    TEXT;
  v_count  INTEGER := 0;
  v_pushes INTEGER := 0;
  v_grupo  TEXT;
  v_email  TEXT;
  r        RECORD;
BEGIN
  IF p_usuarios IS NULL OR array_length(p_usuarios, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT sede_id INTO v_sede FROM ordenes_trabajo WHERE id = p_orden_id;
  v_url := CASE WHEN p_orden_id IS NOT NULL THEN '/work-orders?open=' || p_orden_id::text ELSE '/' END;
  -- Qué avisos llevan además correo, y cuáles se juntan en uno.
  v_grupo := CASE
    WHEN p_tipo IN ('asignacion', 'tarea_asignada') THEN 'asignacion'
    WHEN p_tipo = 'presupuesto_respondido' THEN 'presupuesto:' || COALESCE(p_datos->>'presupuesto_id', '')
  END;

  FOR r IN
    INSERT INTO notificaciones (usuario_id, sede_id, tipo, titulo, cuerpo, datos, orden_id, url)
    SELECT DISTINCT u, v_sede, p_tipo, p_titulo, COALESCE(p_cuerpo, ''), COALESCE(p_datos, '{}'::jsonb), p_orden_id, v_url
    FROM unnest(p_usuarios) AS u
    WHERE u IS NOT NULL
      AND u IS DISTINCT FROM v_actor
    RETURNING id, usuario_id, titulo, cuerpo, url
  LOOP
    v_count := v_count + 1;
    IF EXISTS (SELECT 1 FROM push_suscripciones WHERE usuario_id = r.usuario_id) THEN
      INSERT INTO cola_envios (canal, destinatario, plantilla, datos, orden_id)
      VALUES (
        'push',
        r.usuario_id::text,
        'notificacion',
        jsonb_build_object(
          'notificacion_id', r.id,
          'titulo', r.titulo,
          'cuerpo', r.cuerpo,
          'url', r.url,
          -- Un tag por orden y tipo: dos avisos iguales seguidos se reemplazan
          -- en la bandeja del teléfono en vez de apilarse.
          'tag', p_tipo || ':' || COALESCE(p_orden_id::text, r.id::text)
        ),
        p_orden_id
      );
      v_pushes := v_pushes + 1;
    END IF;

    -- El correo al técnico (06/10/2026). En su propio bloque: un correo que no se pudo
    -- encolar no deja sin aviso en la campana ni frena la operación.
    IF v_grupo IS NOT NULL AND p_orden_id IS NOT NULL THEN
      BEGIN
        SELECT lower(btrim(p.email)) INTO v_email
        FROM perfiles p
        WHERE p.id = r.usuario_id AND p.rol IN ('mecanico', 'pintor');
        IF public.es_correo_valido(v_email) THEN
          INSERT INTO cola_envios (canal, destinatario, plantilla, datos, orden_id, clave_dedupe, enviar_despues_de)
          VALUES (
            'email',
            v_email,
            'empleado',
            jsonb_build_object(
              'usuario_id', r.usuario_id,
              'sede_id', v_sede,
              'orden', p_orden_id,
              'numero_orden', p_datos->>'numero_orden',
              'vehiculo', p_datos->>'vehiculo',
              'tipo', p_tipo,
              'titulo', r.titulo,
              'url', r.url,
              'lineas', jsonb_build_array(r.cuerpo)
            ),
            NULL,
            'empleado:' || r.usuario_id::text || ':' || p_orden_id::text || ':' || v_grupo,
            NOW() + INTERVAL '2 minutes'
          )
          ON CONFLICT (clave_dedupe) WHERE clave_dedupe IS NOT NULL AND estado = 'pendiente'
          DO UPDATE SET datos = jsonb_set(
            cola_envios.datos,
            '{lineas}',
            COALESCE(cola_envios.datos->'lineas', '[]'::jsonb) || to_jsonb(EXCLUDED.datos->'lineas'->>0)
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notificar correo al técnico (%): %', r.usuario_id, SQLERRM;
      END;
    END IF;
  END LOOP;

  IF v_pushes > 0 THEN
    PERFORM public.invoke_edge_function('process-outbox');
  END IF;

  RETURN v_count;
END;
$$;

ALTER FUNCTION "public"."notificar"("p_usuarios" "uuid"[], "p_tipo" "text", "p_titulo" "text", "p_cuerpo" "text", "p_datos" "jsonb", "p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notificar_cliente_avance"("p_orden_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede avisar al cliente.' USING ERRCODE = '42501';
  END IF;

  v_id := public.encolar_correo_cliente(p_orden_id, 'avance', '{}'::jsonb, 'avance:' || p_orden_id, INTERVAL '1 minute');
  RETURN CASE WHEN v_id IS NULL THEN 'sin_correo' ELSE 'encolado' END;
END;
$$;

ALTER FUNCTION "public"."notificar_cliente_avance"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."ordenes_esperando_autorizacion"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.orden_id
  FROM presupuestos p
  WHERE p.estado = 'enviado'
    AND (public.is_admin() OR p.orden_id = ANY (public.mis_ordenes_asignadas()));
$$;

ALTER FUNCTION "public"."ordenes_esperando_autorizacion"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."ordenes_esperando_repuestos"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT r.orden_id
  FROM orden_repuestos r
  JOIN ordenes_trabajo o ON o.id = r.orden_id
  WHERE r.estado_pedido = 'pedido'
    AND r.estado <> 'rechazado'
    AND o.estatus <> 'entregado'
    AND (public.is_admin() OR r.orden_id = ANY (public.mis_ordenes_asignadas()));
$$;

ALTER FUNCTION "public"."ordenes_esperando_repuestos"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."parqueo_config_sede"("p_sede_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cfg       parqueo_config;
  v_seguro    parqueo_perfiles;
  v_part      parqueo_perfiles;
  v_tr_seguro JSONB := '[]'::jsonb;
  v_tr_part   JSONB := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver la configuración de parqueo.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM parqueo_config WHERE sede_id = p_sede_id;
  SELECT * INTO v_seguro FROM parqueo_perfiles WHERE sede_id = p_sede_id AND tipo = 'seguro';
  SELECT * INTO v_part FROM parqueo_perfiles WHERE sede_id = p_sede_id AND tipo = 'particular';

  IF v_seguro.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('desde_dia', desde_dia, 'tarifa_diaria', tarifa_diaria)
      ORDER BY desde_dia
    ), '[]'::jsonb)
    INTO v_tr_seguro
    FROM parqueo_tramos WHERE perfil_id = v_seguro.id;
  ELSE
    v_tr_seguro := jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 0));
  END IF;

  IF v_part.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('desde_dia', desde_dia, 'tarifa_diaria', tarifa_diaria)
      ORDER BY desde_dia
    ), '[]'::jsonb)
    INTO v_tr_part
    FROM parqueo_tramos WHERE perfil_id = v_part.id;
  ELSE
    v_tr_part := jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 0));
  END IF;

  RETURN jsonb_build_object(
    'sede_id', p_sede_id,
    'habilitado', COALESCE(v_cfg.habilitado, false),
    'vigente_desde', v_cfg.vigente_desde,
    'incluir_ordenes_previas', COALESCE(v_cfg.incluir_ordenes_previas, false),
    'avisar_cliente', COALESCE(v_cfg.avisar_cliente, true),
    'politica_es', v_cfg.politica_es,
    'politica_en', v_cfg.politica_en,
    'perfiles', jsonb_build_object(
      'seguro', jsonb_build_object(
        'habilitado', COALESCE(v_seguro.habilitado, true),
        'evento_inicio', COALESCE(v_seguro.evento_inicio, 'ingreso'),
        'cobra_dia_evento', COALESCE(v_seguro.cobra_dia_evento, true),
        'dias_gracia', COALESCE(v_seguro.dias_gracia, 0),
        'gracia_dias_habiles', COALESCE(v_seguro.gracia_dias_habiles, false),
        'tope_dias', v_seguro.tope_dias,
        'tope_monto', v_seguro.tope_monto,
        'tramos', v_tr_seguro
      ),
      'particular', jsonb_build_object(
        'habilitado', COALESCE(v_part.habilitado, true),
        'evento_inicio', COALESCE(v_part.evento_inicio, 'lista_para_entregar'),
        'cobra_dia_evento', COALESCE(v_part.cobra_dia_evento, false),
        'dias_gracia', COALESCE(v_part.dias_gracia, 2),
        'gracia_dias_habiles', COALESCE(v_part.gracia_dias_habiles, false),
        'tope_dias', v_part.tope_dias,
        'tope_monto', v_part.tope_monto,
        'tramos', v_tr_part
      )
    )
  );
END;
$$;

ALTER FUNCTION "public"."parqueo_config_sede"("p_sede_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."parqueo_de_orden"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_parq        orden_parqueo;
  v_calculado   JSONB;
  v_estatus     order_status;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar el parqueo de una orden.' USING ERRCODE = '42501';
  END IF;

  SELECT estatus INTO v_estatus FROM ordenes_trabajo WHERE id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  -- Consultar una orden entregada nunca escribe: su parqueo quedó fijo al entregarla. Solo
  -- `ajustar_parqueo_orden` lo cambia después, a propósito y con historial.
  IF v_estatus <> 'entregado' THEN
    PERFORM public._recalcular_parqueo(p_orden_id);
  END IF;

  SELECT * INTO v_parq FROM orden_parqueo WHERE orden_id = p_orden_id;
  v_calculado := public._parqueo_calcular(p_orden_id, NULL);

  RETURN jsonb_build_object(
    'orden_id', p_orden_id,
    'cobrar', COALESCE(v_parq.cobrar, true),
    'tarifa_manual', v_parq.tarifa_manual,
    'inicio_manual', v_parq.inicio_manual,
    'dias_exonerados', COALESCE(v_parq.dias_exonerados, 0),
    'nota', v_parq.nota,
    'perfil', COALESCE(v_parq.perfil, v_calculado->>'perfil'),
    'estado', COALESCE(v_parq.estado, v_calculado->>'estado'),
    'inicio_cobro', COALESCE(v_parq.inicio_cobro, NULLIF(v_calculado->>'inicio', '')::date),
    'fin_congelado', v_parq.fin_congelado,
    'dias_cobrados', COALESCE(v_parq.dias_cobrados, (v_calculado->>'dias')::int, 0),
    'monto', COALESCE(v_parq.monto, (v_calculado->>'monto')::numeric, 0),
    'detalle', COALESCE(v_parq.detalle, v_calculado->'detalle', '[]'::jsonb),
    'tope_aplicado', COALESCE(v_parq.tope_aplicado, (v_calculado->>'tope_aplicado')::boolean, false),
    'calculado_hasta', v_parq.calculado_hasta,
    'calculado_en', v_parq.calculado_en,
    'tarifa_inicial', (v_calculado->>'tarifa_inicial')::numeric,
    'dias_gracia', (v_calculado->>'dias_gracia')::int,
    'evento_inicio', v_calculado->>'evento_inicio',
    'cobra_dia_evento', (v_calculado->>'cobra_dia_evento')::boolean
  );
END;
$$;

ALTER FUNCTION "public"."parqueo_de_orden"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."comision_pagos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "fecha_pago" "date" DEFAULT CURRENT_DATE NOT NULL,
    "metodo" "text" DEFAULT 'cheque'::"text" NOT NULL,
    "numero_cheque" "text",
    "comprobante_url" "text",
    "notas" "text",
    "pagado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "comision_pagos_monto_check" CHECK (("monto" > (0)::numeric))
);

ALTER TABLE "public"."comision_pagos" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."pay_commissions"("p_usuario_id" "uuid", "p_comision_ids" "uuid"[], "p_fecha_pago" "date" DEFAULT NULL::"date", "p_metodo" "text" DEFAULT 'cheque'::"text", "p_numero_cheque" "text" DEFAULT NULL::"text", "p_comprobante_url" "text" DEFAULT NULL::"text", "p_notas" "text" DEFAULT NULL::"text") RETURNS "public"."comision_pagos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  -- El método del pago va también en el egreso (20261010000045): Finanzas y el CSV del contador
  -- muestran el método de cada movimiento, y estos salían sin él. `comision_pagos.metodo` es texto
  -- libre; aquí solo entra si es uno de los que admite `finanzas_movimientos` (si no, queda vacío:
  -- el espejo en Finanzas nunca tumba el pago).
  INSERT INTO finanzas_movimientos (
    sede_id, tipo, categoria, monto, descripcion, fecha, metodo_pago, numero_cheque,
    registrado_por, comision_pago_id, referencia_orden_id
  )
  SELECT
    v_sede, 'egreso', 'planilla', SUM(c.monto),
    'Comisión ' || COALESCE(v_nombre, 'empleado') || ' - ' || o.numero_orden,
    v_pago.fecha_pago,
    CASE WHEN v_pago.metodo IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque') THEN v_pago.metodo END,
    v_pago.numero_cheque, auth.uid(), v_pago.id, c.orden_id
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

ALTER FUNCTION "public"."pay_commissions"("p_usuario_id" "uuid", "p_comision_ids" "uuid"[], "p_fecha_pago" "date", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_url" "text", "p_notas" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."plantillas_inspeccion"("p_sede_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_resultado JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede consultar las plantillas de inspección.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'nombre', t.nombre,
        'activo', t.activo,
        'predeterminada', t.predeterminada,
        'creado_en', t.creado_en,
        'actualizado_en', t.actualizado_en,
        'puntos', COALESCE(pts.puntos, '[]'::jsonb)
      ) ORDER BY t.predeterminada DESC, t.nombre, t.id
    ),
    '[]'::jsonb
  ) INTO v_resultado
  FROM public.inspeccion_plantillas t
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'seccion', p.seccion,
        'nombre', p.nombre,
        'posicion', p.posicion
      ) ORDER BY p.posicion, p.id
    ) AS puntos
    FROM public.inspeccion_plantilla_puntos p
    WHERE p.plantilla_id = t.id
  ) pts ON true
  WHERE t.sede_id = p_sede_id;

  RETURN v_resultado;
END;
$$;

ALTER FUNCTION "public"."plantillas_inspeccion"("p_sede_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."preferencia_correos_portal"("p_token" "text", "p_acepta" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_enlace  orden_enlaces;
  v_cliente UUID;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_acepta IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  -- Vale con un enlace vencido solo para darse de baja (p_acepta = false).
  SELECT * INTO v_enlace FROM orden_enlaces WHERE token = p_token AND revocado_en IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF p_acepta AND v_enlace.expira_en IS NOT NULL AND v_enlace.expira_en <= NOW() THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT cliente_id INTO v_cliente FROM ordenes_trabajo WHERE id = v_enlace.orden_id;

  UPDATE clientes
  SET acepta_correos = p_acepta,
      correos_baja_en = CASE WHEN p_acepta THEN NULL ELSE NOW() END
  WHERE id = v_cliente;

  IF NOT p_acepta THEN
    UPDATE cola_envios
    SET estado = 'omitido', ultimo_error = 'El cliente pidió no recibir correos.'
    WHERE canal = 'email' AND estado = 'pendiente'
      AND orden_id IN (SELECT id FROM ordenes_trabajo WHERE cliente_id = v_cliente);
  END IF;

  RETURN jsonb_build_object('ok', true, 'acepta_correos', p_acepta);
END;
$_$;

ALTER FUNCTION "public"."preferencia_correos_portal"("p_token" "text", "p_acepta" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."preferencia_idioma_portal"("p_token" "text", "p_idioma" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_enlace  orden_enlaces;
  v_cliente UUID;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_idioma IS NULL OR p_idioma NOT IN ('es', 'en') THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO v_enlace
  FROM orden_enlaces
  WHERE token = p_token
    AND revocado_en IS NULL
    AND (expira_en IS NULL OR expira_en > NOW());
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT cliente_id INTO v_cliente FROM ordenes_trabajo WHERE id = v_enlace.orden_id;
  UPDATE clientes SET idioma = p_idioma WHERE id = v_cliente AND idioma IS DISTINCT FROM p_idioma;

  RETURN jsonb_build_object('ok', true, 'idioma', p_idioma);
END;
$_$;

ALTER FUNCTION "public"."preferencia_idioma_portal"("p_token" "text", "p_idioma" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."probar_push"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para probar las notificaciones.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM push_suscripciones WHERE usuario_id = auth.uid()) THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM cola_envios
    WHERE canal = 'push' AND plantilla = 'prueba' AND destinatario = auth.uid()::text
      AND creado_en > NOW() - INTERVAL '1 minute'
  ) THEN
    RETURN TRUE;
  END IF;

  INSERT INTO cola_envios (canal, destinatario, plantilla, datos)
  VALUES (
    'push',
    auth.uid()::text,
    'prueba',
    jsonb_build_object(
      'titulo', 'Notificaciones activas',
      'cuerpo', 'Así te van a llegar las órdenes asignadas y los trabajos autorizados.',
      'url', '/settings',
      'tag', 'prueba'
    )
  );
  PERFORM public.invoke_edge_function('process-outbox');
  RETURN TRUE;
END;
$$;

ALTER FUNCTION "public"."probar_push"() OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_proximo_servicio" (
    "orden_id" "uuid" NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "fecha" "date",
    "millas" integer,
    "nota" "text",
    "token" "text",
    "programado_por" "uuid",
    "programado_en" timestamp with time zone,
    "sugerido_fecha" "date",
    "sugerido_millas" integer,
    "sugerido_nota" "text",
    "sugerido_por" "uuid",
    "sugerido_en" timestamp with time zone,
    "idioma" "text",
    CONSTRAINT "orden_proximo_servicio_idioma_check" CHECK ((("idioma" IS NULL) OR ("idioma" = ANY (ARRAY['es'::"text", 'en'::"text"])))),
    CONSTRAINT "orden_proximo_servicio_millas_check" CHECK ((("millas" IS NULL) OR ("millas" >= 0))),
    CONSTRAINT "orden_proximo_servicio_nota_check" CHECK ((("nota" IS NULL) OR ("char_length"("nota") <= 120))),
    CONSTRAINT "orden_proximo_servicio_programado_check" CHECK (((("fecha" IS NULL) AND ("millas" IS NULL)) = ("token" IS NULL))),
    CONSTRAINT "orden_proximo_servicio_sugerido_millas_check" CHECK ((("sugerido_millas" IS NULL) OR ("sugerido_millas" >= 0))),
    CONSTRAINT "orden_proximo_servicio_sugerido_nota_check" CHECK ((("sugerido_nota" IS NULL) OR ("char_length"("sugerido_nota") <= 120))),
    CONSTRAINT "orden_proximo_servicio_token_format" CHECK ((("token" IS NULL) OR ("token" ~ '^[0-9a-f]{64}$'::"text")))
);

ALTER TABLE "public"."orden_proximo_servicio" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."programar_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text", "p_idioma" "text" DEFAULT NULL::"text") RETURNS "public"."orden_proximo_servicio"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."programar_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text", "p_idioma" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."publicar_inspeccion"("p_inspeccion_id" "uuid", "p_publicar" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_insp orden_inspecciones;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede publicar la inspección.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_insp FROM public.orden_inspecciones WHERE id = p_inspeccion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspección no encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_publicar THEN
    IF v_insp.completada_en IS NULL THEN
      RAISE EXCEPTION 'No se puede publicar una inspección sin completar.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.orden_inspecciones
    SET publicada_en = now()
    WHERE id = p_inspeccion_id;

    -- Lo publicado entra a la traducción automática (nombres y notas de los puntos, por
    -- _textos_cliente), como las líneas y los avances: si falla, solo avisa.
    BEGIN
      INSERT INTO cola_envios (canal, destinatario, plantilla, orden_id, enviar_despues_de)
      VALUES ('traduccion', 'gemini', 'auto', v_insp.orden_id, now() + interval '10 seconds')
      ON CONFLICT (orden_id) WHERE canal = 'traduccion' AND estado = 'pendiente'
      DO UPDATE SET enviar_despues_de = EXCLUDED.enviar_despues_de;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'publicar_inspeccion traducción (%): %', v_insp.orden_id, SQLERRM;
    END;
  ELSE
    UPDATE public.orden_inspecciones
    SET publicada_en = NULL
    WHERE id = p_inspeccion_id;
  END IF;
END;
$$;

ALTER FUNCTION "public"."publicar_inspeccion"("p_inspeccion_id" "uuid", "p_publicar" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."purge_old_notifications"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM notificaciones WHERE leida_en IS NOT NULL AND creado_en < NOW() - INTERVAL '60 days';
  DELETE FROM notificaciones WHERE creado_en < NOW() - INTERVAL '180 days';
  DELETE FROM cola_envios WHERE estado IN ('enviado', 'omitido') AND creado_en < NOW() - INTERVAL '90 days';
$$;

ALTER FUNCTION "public"."purge_old_notifications"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."quitar_proximo_servicio"("p_orden_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."quitar_proximo_servicio"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."quitar_trabajo"("p_trabajo_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden_id UUID;
  v_orden    ordenes_trabajo;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede quitar trabajos.'
      USING ERRCODE = '42501';
  END IF;

  SELECT ot.orden_id INTO v_orden_id
  FROM public.orden_trabajos ot
  WHERE ot.id = p_trabajo_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_orden FROM public.ordenes_trabajo WHERE id = v_orden_id FOR UPDATE;

  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'No se pueden quitar trabajos de una orden entregada.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.orden_labor WHERE trabajo_id = p_trabajo_id;
  DELETE FROM public.orden_repuestos WHERE trabajo_id = p_trabajo_id;
  DELETE FROM public.orden_trabajos WHERE id = p_trabajo_id;
END;
$$;

ALTER FUNCTION "public"."quitar_trabajo"("p_trabajo_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recalcular_parqueo_pendiente"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r       RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT o.id
    FROM ordenes_trabajo o
    JOIN parqueo_config c ON c.sede_id = o.sede_id
    WHERE c.habilitado = true AND o.estatus <> 'entregado'
  LOOP
    BEGIN
      PERFORM public._recalcular_parqueo(r.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'recalcular_parqueo_pendiente orden %: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

ALTER FUNCTION "public"."recalcular_parqueo_pendiente"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recalculate_order_totals"("target_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  labor_total NUMERIC;
  parts_total NUMERIC;
  v_descuento NUMERIC;
  v_parqueo   NUMERIC;
  v_total     NUMERIC;
BEGIN
  PERFORM 1 FROM ordenes_trabajo WHERE id = target_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(costo), 0) INTO labor_total
  FROM orden_labor WHERE orden_id = target_order_id AND estado = 'aprobado';
  SELECT COALESCE(SUM(subtotal), 0) INTO parts_total
  FROM orden_repuestos WHERE orden_id = target_order_id AND estado = 'aprobado';
  SELECT COALESCE(descuento, 0) INTO v_descuento
  FROM orden_montos WHERE orden_id = target_order_id;
  SELECT COALESCE(monto, 0) INTO v_parqueo
  FROM orden_parqueo WHERE orden_id = target_order_id;

  v_total := GREATEST(labor_total + parts_total - COALESCE(v_descuento, 0), 0) + COALESCE(v_parqueo, 0);

  PERFORM set_config('restorify.recalc', 'on', true);

  UPDATE ordenes_trabajo
  SET total_labor = labor_total
  WHERE id = target_order_id
    AND total_labor IS DISTINCT FROM labor_total;

  UPDATE orden_montos
  SET total_repuestos = parts_total,
      total_general   = v_total,
      actualizado_en  = NOW()
  WHERE orden_id = target_order_id
    AND (total_repuestos IS DISTINCT FROM parts_total
      OR total_general   IS DISTINCT FROM v_total);

  PERFORM set_config('restorify.recalc', 'off', true);
END;
$$;

ALTER FUNCTION "public"."recalculate_order_totals"("target_order_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recordar_ordenes_vencidas"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
      -- La fecha del taller, no la del servidor: una orden que vence hoy no está vencida
      -- todavía aunque en UTC ya sea mañana.
      AND fecha_estimada_entrega < public.hoy_taller(sede_id)
      AND (recordado_entrega_en IS NULL OR recordado_entrega_en < NOW() - INTERVAL '20 hours')
    FOR UPDATE SKIP LOCKED
  LOOP
    d := public.datos_orden_aviso(r.id);
    v_dias := GREATEST(1, (public.hoy_taller(r.sede_id) - r.fecha_estimada_entrega));

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

ALTER FUNCTION "public"."recordar_ordenes_vencidas"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recordar_presupuestos_sin_respuesta"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  r       RECORD;
  d       JSONB;
  v_dias  INTEGER;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT * FROM presupuestos
    WHERE estado = 'enviado'
      AND creado_en < NOW() - INTERVAL '24 hours'
      AND (recordado_en IS NULL OR recordado_en < NOW() - INTERVAL '20 hours')
    FOR UPDATE SKIP LOCKED
  LOOP
    d := public.datos_orden_aviso(r.orden_id);
    v_dias := GREATEST(1, floor(EXTRACT(EPOCH FROM NOW() - r.creado_en) / 86400)::int);
    PERFORM public.notificar(
      public.admins_de_sede(r.sede_id),
      'presupuesto_sin_respuesta',
      'Presupuesto sin respuesta · ' || (d->>'numero_orden'),
      format('Enviado hace %s día(s) por %s. Llama al cliente o registra su autorización.', v_dias, to_char(r.total_propuesto, 'FM$999,999,990.00')),
      d || jsonb_build_object('presupuesto_id', r.id, 'dias', v_dias),
      r.orden_id
    );
    UPDATE presupuestos SET recordado_en = NOW() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$_$;

ALTER FUNCTION "public"."recordar_presupuestos_sin_respuesta"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."regenerar_enlace_cliente"("p_orden_id" "uuid") RETURNS "public"."orden_enlaces"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_enlace orden_enlaces;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el enlace del cliente.' USING ERRCODE = '42501';
  END IF;

  UPDATE orden_enlaces SET revocado_en = NOW() WHERE orden_id = p_orden_id AND revocado_en IS NULL;

  PERFORM set_config('restorify.crear_enlace_manual', 'on', true);
  v_enlace := public.asegurar_enlace_orden(p_orden_id);
  PERFORM set_config('restorify.crear_enlace_manual', 'off', true);

  RETURN v_enlace;
END;
$$;

ALTER FUNCTION "public"."regenerar_enlace_cliente"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."registrar_anticipo"("p_orden_id" "uuid", "p_monto" numeric, "p_metodo" "text", "p_numero_cheque" "text" DEFAULT NULL::"text", "p_comprobante_ruta" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden  RECORD;
  v_monto  NUMERIC := round(COALESCE(p_monto, 0), 2);
  v_metodo TEXT := NULLIF(btrim(COALESCE(p_metodo, '')), '');
  v_cheque TEXT := NULLIF(btrim(COALESCE(p_numero_cheque, '')), '');
  v_ruta   TEXT := NULLIF(btrim(COALESCE(p_comprobante_ruta, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar un anticipo.' USING ERRCODE = '42501';
  END IF;
  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El anticipo tiene que ser mayor que cero.' USING ERRCODE = '22023';
  END IF;
  IF v_metodo IS NULL OR v_metodo NOT IN ('efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque') THEN
    RAISE EXCEPTION 'Elige cómo pagó el cliente: efectivo, tarjeta, Zelle, transferencia o cheque.' USING ERRCODE = '22023';
  END IF;
  IF v_metodo = 'cheque' AND v_cheque IS NULL AND v_ruta IS NULL THEN
    RAISE EXCEPTION 'Anota el número del cheque o sube su foto.' USING ERRCODE = '22023';
  END IF;
  IF v_metodo IS DISTINCT FROM 'cheque' THEN
    v_cheque := NULL;
  END IF;

  SELECT o.id, o.sede_id, o.estatus INTO v_orden
  FROM ordenes_trabajo o WHERE o.id = p_orden_id
  FOR UPDATE;
  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada: su saldo se cobró al entregar.' USING ERRCODE = 'P0001';
  END IF;
  IF v_ruta IS NOT NULL AND v_ruta NOT LIKE v_orden.sede_id::text || '/%' THEN
    RAISE EXCEPTION 'El comprobante debe guardarse en la carpeta de la sede de la orden.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config(
    'restorify.deposito',
    jsonb_build_object('orden_id', p_orden_id, 'anticipo', true, 'metodo', v_metodo,
                       'numero_cheque', v_cheque, 'comprobante_ruta', v_ruta)::text,
    true
  );
  UPDATE orden_montos SET deposito_inicial = COALESCE(deposito_inicial, 0) + v_monto WHERE orden_id = p_orden_id;
  PERFORM set_config('restorify.deposito', '', true);

  RETURN jsonb_build_object(
    'anticipos', (SELECT deposito_inicial FROM orden_montos WHERE orden_id = p_orden_id),
    'saldo', round(public._saldo_orden(p_orden_id), 2)
  );
END;
$$;

ALTER FUNCTION "public"."registrar_anticipo"("p_orden_id" "uuid", "p_monto" numeric, "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."registrar_autorizacion"("p_orden_id" "uuid", "p_aprobadas" "uuid"[], "p_lineas" "uuid"[], "p_via" "text", "p_nombre" "text" DEFAULT NULL::"text", "p_nota" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_p       presupuestos;
  v_vistas  UUID[];
  v_actual  UUID[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar autorizaciones.' USING ERRCODE = '42501';
  END IF;
  IF p_via NOT IN ('admin_telefono', 'admin_presencial', 'admin_whatsapp') THEN
    RAISE EXCEPTION 'Indica cómo autorizó el cliente: teléfono, en persona o WhatsApp.';
  END IF;

  PERFORM 1 FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;

  SELECT * INTO v_p FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'enviado' FOR UPDATE;
  IF v_p.id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'borrador')
       AND NOT EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'borrador') THEN
      RAISE EXCEPTION 'No hay trabajos por autorizar en esta orden.';
    END IF;
    v_p := public._crear_presupuesto(p_orden_id);
  ELSE
    PERFORM public._agregar_borradores(v_p.id);
  END IF;

  v_actual := public._lineas_pendientes(v_p.id);
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_vistas FROM unnest(COALESCE(p_lineas, '{}')) AS x;

  IF v_actual IS DISTINCT FROM v_vistas THEN
    RAISE EXCEPTION 'Los trabajos de la orden cambiaron mientras registrabas la autorización. Vuelve a abrirla.';
  END IF;
  IF NOT (COALESCE(p_aprobadas, '{}') <@ v_actual) THEN
    RAISE EXCEPTION 'Una de las líneas autorizadas no pertenece a esta orden.';
  END IF;

  RETURN public._resolver_presupuesto(
    v_p.id, p_aprobadas, p_via,
    COALESCE(NULLIF(btrim(p_nombre), ''), (SELECT c.nombre FROM ordenes_trabajo o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = p_orden_id)),
    auth.uid(), NULL, p_nota, NULL, NULL
  );
END;
$$;

ALTER FUNCTION "public"."registrar_autorizacion"("p_orden_id" "uuid", "p_aprobadas" "uuid"[], "p_lineas" "uuid"[], "p_via" "text", "p_nombre" "text", "p_nota" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."registrar_push"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para activar las notificaciones.' USING ERRCODE = '42501';
  END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://' THEN
    RAISE EXCEPTION 'Suscripción push inválida.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO push_suscripciones (usuario_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET usuario_id = EXCLUDED.usuario_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        ultimo_error = NULL,
        actualizado_en = NOW();
END;
$$;

ALTER FUNCTION "public"."registrar_push"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reintentar_correos_fallidos"("p_horas" integer DEFAULT 72) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede reintentar los correos.' USING ERRCODE = '42501';
  END IF;

  WITH candidatos AS (
    -- Un candidato por clave (el más nuevo); los que no tienen clave, cada uno el suyo.
    SELECT DISTINCT ON (COALESCE(c.clave_dedupe, c.id::text)) c.id
    FROM cola_envios c
    WHERE c.canal = 'email'
      AND c.estado = 'error'
      AND c.creado_en >= NOW() - make_interval(hours => LEAST(GREATEST(COALESCE(p_horas, 72), 1), 720))
      AND (c.clave_dedupe IS NULL OR NOT EXISTS (
        SELECT 1 FROM cola_envios p
        WHERE p.clave_dedupe = c.clave_dedupe AND p.estado = 'pendiente'
      ))
    ORDER BY COALESCE(c.clave_dedupe, c.id::text), c.creado_en DESC
  )
  UPDATE cola_envios
  SET estado = 'pendiente',
      intentos = 0,
      ultimo_error = NULL,
      bloqueado_en = NULL,
      enviar_despues_de = NOW()
  WHERE id IN (SELECT id FROM candidatos);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

ALTER FUNCTION "public"."reintentar_correos_fallidos"("p_horas" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reintentar_envio"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_fila cola_envios;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede reintentar un correo.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fila FROM cola_envios WHERE id = p_id FOR UPDATE;

  IF NOT FOUND OR v_fila.canal <> 'email' THEN
    RAISE EXCEPTION 'Ese correo ya no existe.' USING ERRCODE = '42501';
  END IF;

  IF v_fila.estado <> 'error' THEN
    RAISE EXCEPTION 'Solo se puede reintentar un correo que falló.' USING ERRCODE = '42501';
  END IF;

  IF v_fila.clave_dedupe IS NOT NULL AND EXISTS (
    SELECT 1 FROM cola_envios
    WHERE clave_dedupe = v_fila.clave_dedupe AND estado = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'Ya hay un correo igual esperando para salir.' USING ERRCODE = '42501';
  END IF;

  UPDATE cola_envios
  SET estado = 'pendiente',
      intentos = 0,
      ultimo_error = NULL,
      bloqueado_en = NULL,
      enviar_despues_de = NOW()
  WHERE id = p_id;
END;
$$;

ALTER FUNCTION "public"."reintentar_envio"("p_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."renombrar_trabajo"("p_trabajo_id" "uuid", "p_titulo" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede renombrar trabajos.'
      USING ERRCODE = '42501';
  END IF;

  IF p_titulo IS NULL OR char_length(btrim(p_titulo)) = 0 OR char_length(p_titulo) > 120 THEN
    RAISE EXCEPTION 'El título no puede estar vacío y debe tener 120 caracteres o menos.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.orden_trabajos
  SET titulo = btrim(p_titulo)
  WHERE id = p_trabajo_id;
END;
$$;

ALTER FUNCTION "public"."renombrar_trabajo"("p_trabajo_id" "uuid", "p_titulo" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reportar_hallazgo"("p_orden_id" "uuid", "p_descripcion" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden   ordenes_trabajo;
  v_desc    TEXT := NULLIF(btrim(left(COALESCE(p_descripcion, ''), 1000)), '');
  v_id      UUID;
  v_avance  UUID;
  v_prev    TEXT := current_setting('restorify.hallazgo', true);
  v_quien   TEXT;
  d         JSONB;
BEGIN
  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id FOR UPDATE;
  -- Para un técnico, una orden ajena no existe: el mismo mensaje en los dos casos.
  IF v_orden.id IS NULL OR NOT public.is_assigned_to_order(p_orden_id) THEN
    RAISE EXCEPTION 'Solo el personal asignado a la orden puede reportar trabajo adicional.'
      USING ERRCODE = '42501';
  END IF;
  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;
  -- Pausar una orden finalizada sería reabrirla por la puerta de atrás.
  IF v_orden.estatus = 'finalizado' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'La orden ya está finalizada. Solo un administrador puede reabrirla.'
      USING ERRCODE = '42501';
  END IF;
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Escribe qué encontraste y qué hay que hacer.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('restorify.hallazgo', 'on', true);

  -- El avance interno donde caen las fotos. Nace sin publicar y el técnico no lo puede
  -- publicar (trg_avance_hallazgo_interno).
  INSERT INTO orden_avances (orden_id, usuario_id, descripcion, visible_cliente)
  VALUES (p_orden_id, auth.uid(), v_desc, false)
  RETURNING id INTO v_avance;

  INSERT INTO orden_hallazgos (orden_id, sede_id, reportado_por, descripcion, avance_id)
  VALUES (p_orden_id, v_orden.sede_id, auth.uid(), v_desc, v_avance)
  RETURNING id INTO v_id;

  -- La pausa. Si ya esperaba (otro hallazgo, un presupuesto enviado), no se toca: el
  -- motivo que ya tiene sigue siendo cierto.
  UPDATE ordenes_trabajo
  SET estatus = 'espera_autorizacion', motivo_autorizacion = v_desc
  WHERE id = p_orden_id AND estatus <> 'espera_autorizacion';

  PERFORM set_config('restorify.hallazgo', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  BEGIN
    d := public.datos_orden_aviso(p_orden_id);
    SELECT nombre_completo INTO v_quien FROM perfiles WHERE id = auth.uid();
    PERFORM public.notificar(
      public.admins_de_sede(v_orden.sede_id),
      'hallazgo_reportado',
      'Trabajo adicional reportado · ' || v_orden.numero_orden,
      COALESCE(v_quien, 'Un técnico') || ': ' || left(v_desc, 200),
      d || jsonb_build_object('actor', v_quien, 'hallazgo_id', v_id, 'descripcion', left(v_desc, 200)),
      p_orden_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'reportar_hallazgo aviso (%): %', v_id, SQLERRM;
  END;

  RETURN jsonb_build_object('hallazgo_id', v_id, 'avance_id', v_avance);
END;
$$;

ALTER FUNCTION "public"."reportar_hallazgo"("p_orden_id" "uuid", "p_descripcion" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."repuestos_de_orden"("p_orden_id" "uuid") RETURNS TABLE("id" "uuid", "descripcion" "text", "cantidad" integer, "estado" "text", "estado_pedido" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT r.id, r.descripcion, r.cantidad, r.estado, r.estado_pedido
  FROM orden_repuestos r
  WHERE r.orden_id = p_orden_id
    AND (public.is_admin() OR r.orden_id = ANY (public.mis_ordenes_asignadas()))
  ORDER BY r.creado_en, r.descripcion;
$$;

ALTER FUNCTION "public"."repuestos_de_orden"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."requiere_atencion"("p_sede_id" "uuid" DEFAULT NULL::"uuid", "p_hoy" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."requiere_atencion"("p_sede_id" "uuid", "p_hoy" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."responder_presupuesto_portal"("p_token" "text", "p_presupuesto_id" "uuid", "p_aprobadas" "uuid"[], "p_lineas" "uuid"[], "p_nombre" "text", "p_comentario" "text", "p_ip" "text", "p_user_agent" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_enlace orden_enlaces;
  v_p      presupuestos;
  v_vistas UUID[];
  v_actual UUID[];
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  END IF;

  SELECT * INTO v_enlace FROM orden_enlaces
  WHERE token = p_token AND revocado_en IS NULL AND (expira_en IS NULL OR expira_en > NOW());
  IF v_enlace.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  END IF;

  SELECT * INTO v_p FROM presupuestos
  WHERE id = p_presupuesto_id AND orden_id = v_enlace.orden_id
  FOR UPDATE;
  IF v_p.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrado');
  END IF;
  IF v_p.estado <> 'enviado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', CASE WHEN v_p.estado = 'cancelado' THEN 'cancelado' ELSE 'ya_respondido' END);
  END IF;

  IF length(btrim(COALESCE(p_nombre, ''))) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nombre_requerido');
  END IF;

  v_actual := public._lineas_pendientes(v_p.id);
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_vistas FROM unnest(COALESCE(p_lineas, '{}')) AS x;
  IF v_actual IS DISTINCT FROM v_vistas THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'presupuesto_cambio');
  END IF;
  IF NOT (COALESCE(p_aprobadas, '{}') <@ v_actual) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lineas_invalidas');
  END IF;

  RETURN jsonb_build_object('ok', true) || public._resolver_presupuesto(
    v_p.id, p_aprobadas, 'cliente_portal', p_nombre, NULL, p_comentario, NULL, p_ip, p_user_agent
  );
END;
$_$;

ALTER FUNCTION "public"."responder_presupuesto_portal"("p_token" "text", "p_presupuesto_id" "uuid", "p_aprobadas" "uuid"[], "p_lineas" "uuid"[], "p_nombre" "text", "p_comentario" "text", "p_ip" "text", "p_user_agent" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."resumen_empleado"("p_usuario_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el resumen de un empleado.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'comisiones_pendientes', COALESCE((
      SELECT round(SUM(monto), 2) FROM comisiones WHERE usuario_id = p_usuario_id AND pago_id IS NULL
    ), 0),
    'comisiones_pagadas', COALESCE((
      SELECT round(SUM(monto), 2) FROM comisiones WHERE usuario_id = p_usuario_id AND pago_id IS NOT NULL
    ), 0),
    'ultimo_pago', (
      SELECT MAX(fecha_pago) FROM comision_pagos WHERE usuario_id = p_usuario_id
    ),
    'ordenes_activas', (
      SELECT COUNT(DISTINCT a.orden_id) FROM orden_asignaciones a
      JOIN ordenes_trabajo o ON o.id = a.orden_id
      WHERE a.usuario_id = p_usuario_id AND o.estatus NOT IN ('finalizado', 'entregado')
    ),
    'ordenes_entregadas', (
      SELECT COUNT(DISTINCT a.orden_id) FROM orden_asignaciones a
      JOIN ordenes_trabajo o ON o.id = a.orden_id
      WHERE a.usuario_id = p_usuario_id AND o.estatus = 'entregado'
    )
  );
END;
$$;

ALTER FUNCTION "public"."resumen_empleado"("p_usuario_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."resumen_importaciones"("p_sede_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración ve los estados de cuenta.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'importacion_id', x.importacion_id,
             'desde', x.desde,
             'hasta', x.hasta,
             'movimientos', x.n,
             'ingresos', x.ingresos,
             'egresos', x.egresos
           ) ORDER BY x.desde DESC NULLS LAST)
    FROM (
      SELECT importacion_id,
             MIN(fecha) AS desde,
             MAX(fecha) AS hasta,
             COUNT(*)::int AS n,
             round(COALESCE(SUM(monto) FILTER (WHERE tipo = 'ingreso'), 0), 2) AS ingresos,
             round(COALESCE(SUM(monto) FILTER (WHERE tipo = 'egreso'), 0), 2) AS egresos
      FROM finanzas_movimientos
      WHERE importacion_id IS NOT NULL
        AND (p_sede_id IS NULL OR sede_id = p_sede_id)
      GROUP BY importacion_id
    ) x
  ), '[]'::jsonb);
END;
$$;

ALTER FUNCTION "public"."resumen_importaciones"("p_sede_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."resumen_mis_comisiones"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'por_cobrar', COALESCE((
      SELECT SUM(monto) FROM comisiones
      WHERE usuario_id = auth.uid() AND estado = 'aceptada' AND pago_id IS NULL
    ), 0),
    'pagado_mes', COALESCE((
      SELECT SUM(p.monto) FROM comision_pagos p
      WHERE p.usuario_id = auth.uid()
        AND date_trunc('month', p.fecha_pago) = date_trunc('month', public.hoy_taller(p.sede_id))
    ), 0),
    'pagado_total', COALESCE((
      SELECT SUM(monto) FROM comision_pagos WHERE usuario_id = auth.uid()
    ), 0),
    'pagos', (SELECT COUNT(*) FROM comision_pagos WHERE usuario_id = auth.uid())
  );
$$;

ALTER FUNCTION "public"."resumen_mis_comisiones"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."resumen_panel"("p_sede_id" "uuid", "p_hoy" "date", "p_tz" "text" DEFAULT 'America/New_York'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH p AS (
    SELECT date_trunc('month', p_hoy)::date                        AS mes_ini,
           (date_trunc('month', p_hoy) + INTERVAL '1 month')::date AS mes_fin,
           COALESCE(NULLIF(btrim(p_tz), ''), 'America/New_York')   AS tz
  ),
  o AS (
    SELECT estatus, fecha_finalizacion, retirada_sin_reparar FROM ordenes_trabajo
    WHERE p_sede_id IS NULL OR sede_id = p_sede_id
  ),
  m AS (
    SELECT tipo, monto, fecha FROM finanzas_movimientos
    WHERE (p_sede_id IS NULL OR sede_id = p_sede_id)
      AND importacion_id IS NULL
  ),
  meses AS (
    SELECT (date_trunc('month', p_hoy) - make_interval(months => g))::date AS ini
    FROM generate_series(5, 0, -1) AS g
  )
  SELECT jsonb_build_object(
    'ordenes_activas', (SELECT COUNT(*) FROM o WHERE estatus NOT IN ('finalizado', 'entregado')),
    'ordenes_finalizadas_mes', (
      SELECT COUNT(*) FROM o, p
      WHERE o.estatus IN ('finalizado', 'entregado')
        AND NOT o.retirada_sin_reparar
        AND o.fecha_finalizacion IS NOT NULL
        AND (o.fecha_finalizacion AT TIME ZONE p.tz)::date >= p.mes_ini
        AND (o.fecha_finalizacion AT TIME ZONE p.tz)::date <  p.mes_fin
    ),
    'ingresos_mes', (SELECT COALESCE(SUM(monto), 0) FROM m, p WHERE tipo = 'ingreso' AND fecha >= p.mes_ini AND fecha < p.mes_fin),
    'egresos_mes',  (SELECT COALESCE(SUM(monto), 0) FROM m, p WHERE tipo = 'egreso'  AND fecha >= p.mes_ini AND fecha < p.mes_fin),
    'ingresos_total', (SELECT COALESCE(SUM(monto), 0) FROM m WHERE tipo = 'ingreso'),
    'egresos_total',  (SELECT COALESCE(SUM(monto), 0) FROM m WHERE tipo = 'egreso'),
    'clientes_nuevos_mes', (
      SELECT COUNT(*) FROM clientes c, p
      WHERE (p_sede_id IS NULL OR c.sede_id = p_sede_id)
        AND (c.creado_en AT TIME ZONE p.tz)::date >= p.mes_ini
        AND (c.creado_en AT TIME ZONE p.tz)::date <  p.mes_fin
    ),
    'ordenes_por_estatus', (
      SELECT jsonb_build_object(
        'recepcion',           COUNT(*) FILTER (WHERE estatus = 'recepcion'),
        'en_proceso',          COUNT(*) FILTER (WHERE estatus = 'en_proceso'),
        'espera_autorizacion', COUNT(*) FILTER (WHERE estatus = 'espera_autorizacion'),
        'finalizado',          COUNT(*) FILTER (WHERE estatus = 'finalizado'),
        'entregado',           COUNT(*) FILTER (WHERE estatus = 'entregado')
      ) FROM o
    ),
    'ingresos_por_mes', (
      SELECT jsonb_agg(jsonb_build_object(
        'mes_inicio', x.ini,
        'ingresos', (SELECT COALESCE(SUM(monto), 0) FROM m WHERE tipo = 'ingreso' AND fecha >= x.ini AND fecha < (x.ini + INTERVAL '1 month')::date),
        'egresos',  (SELECT COALESCE(SUM(monto), 0) FROM m WHERE tipo = 'egreso'  AND fecha >= x.ini AND fecha < (x.ini + INTERVAL '1 month')::date)
      ) ORDER BY x.ini)
      FROM meses x
    )
  );
$$;

ALTER FUNCTION "public"."resumen_panel"("p_sede_id" "uuid", "p_hoy" "date", "p_tz" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."retirar_sin_reparar"("p_orden_id" "uuid", "p_cobro" numeric DEFAULT 0, "p_concepto" "text" DEFAULT NULL::"text", "p_metodo" "text" DEFAULT NULL::"text", "p_numero_cheque" "text" DEFAULT NULL::"text", "p_comprobante_ruta" "text" DEFAULT NULL::"text", "p_conservar" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden     RECORD;
  v_cobro     NUMERIC := round(COALESCE(p_cobro, 0), 2);
  v_concepto  TEXT := COALESCE(NULLIF(btrim(COALESCE(p_concepto, '')), ''), 'Diagnóstico');
  v_conservar UUID[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_conservar, '{}')) x WHERE x IS NOT NULL);
  v_validas   INTEGER;
  v_p         UUID;
  v_prev      TEXT := current_setting('restorify.presupuesto', true);
  v_res       JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cerrar una orden.' USING ERRCODE = '42501';
  END IF;
  IF v_cobro < 0 THEN
    RAISE EXCEPTION 'Lo que se cobra no puede ser negativo.' USING ERRCODE = '22023';
  END IF;

  SELECT id, sede_id, estatus INTO v_orden
  FROM ordenes_trabajo WHERE id = p_orden_id
  FOR UPDATE;
  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_orden.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada.' USING ERRCODE = '42501';
  END IF;

  -- Solo se conserva lo autorizado de esta orden: una línea ajena o sin autorizar no se cobra.
  SELECT (SELECT COUNT(*) FROM orden_labor WHERE orden_id = p_orden_id AND estado = 'aprobado' AND id = ANY(v_conservar))
       + (SELECT COUNT(*) FROM orden_repuestos WHERE orden_id = p_orden_id AND estado = 'aprobado' AND id = ANY(v_conservar))
    INTO v_validas;
  IF v_validas <> COALESCE(array_length(v_conservar, 1), 0) THEN
    RAISE EXCEPTION 'Solo se pueden cobrar trabajos autorizados de esta orden.' USING ERRCODE = '22023';
  END IF;

  FOR v_p IN SELECT id FROM presupuestos WHERE orden_id = p_orden_id AND estado = 'enviado' LOOP
    PERFORM public.cancelar_presupuesto(v_p);
  END LOOP;

  UPDATE orden_hallazgos
  SET estado = 'descartado', en_reporte = false, resuelto_por = auth.uid(), resuelto_en = NOW()
  WHERE orden_id = p_orden_id AND estado = 'pendiente';

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET estado = 'rechazado', decidido_en = NOW()
  WHERE orden_id = p_orden_id AND estado = 'aprobado' AND NOT (id = ANY(v_conservar));
  UPDATE orden_repuestos SET estado = 'rechazado', decidido_en = NOW()
  WHERE orden_id = p_orden_id AND estado = 'aprobado' AND NOT (id = ANY(v_conservar));
  -- Lo que se cobra se hizo.
  UPDATE orden_labor
  SET completado_en = COALESCE(completado_en, NOW()), completado_por = COALESCE(completado_por, auth.uid())
  WHERE orden_id = p_orden_id AND id = ANY(v_conservar);
  IF v_cobro > 0 THEN
    INSERT INTO orden_labor (orden_id, descripcion, costo, estado, decidido_en, reparto_heredado, completado_en, completado_por)
    VALUES (p_orden_id, v_concepto, v_cobro, 'aprobado', NOW(), false, NOW(), auth.uid());
  END IF;
  PERFORM set_config('restorify.presupuesto', COALESCE(NULLIF(v_prev, ''), 'off'), true);

  -- Sin descuento: lo que se cobra es exactamente lo conservado más la revisión.
  IF EXISTS (SELECT 1 FROM orden_montos WHERE orden_id = p_orden_id AND descuento > 0) THEN
    PERFORM set_config('restorify.descuento', 'on', true);
    UPDATE orden_montos SET descuento = 0, descuento_motivo = NULL WHERE orden_id = p_orden_id;
    PERFORM set_config('restorify.descuento', 'off', true);
    PERFORM public.recalculate_order_totals(p_orden_id);
  END IF;

  PERFORM set_config('restorify.retirada', 'on', true);
  v_res := public.entregar_orden(p_orden_id, p_metodo, p_numero_cheque, p_comprobante_ruta);
  PERFORM set_config('restorify.retirada', 'off', true);

  RETURN v_res;
END;
$$;

ALTER FUNCTION "public"."retirar_sin_reparar"("p_orden_id" "uuid", "p_cobro" numeric, "p_concepto" "text", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text", "p_conservar" "uuid"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reverse_order_delivery_finance"("target_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  ord            RECORD;
  v_deposito     NUMERIC;
  paid_recorded  NUMERIC;
  cost_recorded  NUMERIC;
  delta          NUMERIC;
  v_hoy          DATE;
BEGIN
  SELECT id, sede_id, numero_orden INTO ord
  FROM ordenes_trabajo WHERE id = target_order_id;

  IF ord.id IS NULL THEN
    RETURN;
  END IF;

  v_hoy := public.hoy_taller(ord.sede_id);

  SELECT COALESCE(deposito_inicial, 0) INTO v_deposito
  FROM orden_montos WHERE orden_id = target_order_id;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
    INTO paid_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id
    AND categoria = 'pago_cliente'
    AND importacion_id IS NULL;

  delta := paid_recorded - COALESCE(v_deposito, 0);

  IF delta > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'egreso', 'pago_cliente', delta,
      'Reversión de entrega - ' || ord.numero_orden, v_hoy, target_order_id
    );
  ELSIF delta < -0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'ingreso', 'pago_cliente', -delta,
      'Reversión de devolución - ' || ord.numero_orden, v_hoy, target_order_id
    );
  END IF;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END), 0)
    INTO cost_recorded
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id
    AND categoria = 'compra_repuesto'
    AND importacion_id IS NULL
    AND registrado_por IS NULL;

  IF cost_recorded > 0.01 THEN
    INSERT INTO finanzas_movimientos (
      sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id
    )
    VALUES (
      ord.sede_id, 'ingreso', 'compra_repuesto', cost_recorded,
      'Reversión de costo de repuestos - ' || ord.numero_orden, v_hoy, target_order_id
    );
  END IF;
END;
$$;

ALTER FUNCTION "public"."reverse_order_delivery_finance"("target_order_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."revocar_enlace_cliente"("p_orden_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede desactivar el enlace del cliente.' USING ERRCODE = '42501';
  END IF;

  UPDATE orden_enlaces
  SET revocado_en = NOW(),
      revocado_por = auth.uid()
  WHERE orden_id = p_orden_id
    AND revocado_en IS NULL;

  -- Si había correos pendientes en ráfaga para esta orden, se omiten de una vez.
  UPDATE cola_envios
  SET estado = 'omitido',
      ultimo_error = 'El enlace del cliente fue desactivado manualmente.'
  WHERE orden_id = p_orden_id
    AND canal = 'email'
    AND estado = 'pendiente';
END;
$$;

ALTER FUNCTION "public"."revocar_enlace_cliente"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."saldo_orden"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total NUMERIC;
  v_saldo NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el saldo de una orden.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(total_general, 0) INTO v_total FROM orden_montos WHERE orden_id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  v_saldo := round(public._saldo_orden(p_orden_id), 2);
  RETURN jsonb_build_object(
    'total', round(v_total, 2),
    'cobrado', round(v_total - v_saldo, 2),
    'saldo', v_saldo
  );
END;
$$;

ALTER FUNCTION "public"."saldo_orden"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."saldo_retiro"("p_orden_id" "uuid", "p_cobro" numeric DEFAULT 0, "p_conservar" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cobrado  NUMERIC;
  v_extra    NUMERIC := round(GREATEST(COALESCE(p_cobro, 0), 0), 2);
  v_trabajos NUMERIC;
  v_parqueo  NUMERIC;
  v_cobro    NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el saldo de una orden.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = p_orden_id) THEN
    RAISE EXCEPTION 'Esa orden ya no existe.' USING ERRCODE = 'P0002';
  END IF;

  SELECT round(COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0), 2)
    INTO v_cobrado
  FROM finanzas_movimientos
  WHERE referencia_orden_id = p_orden_id AND categoria = 'pago_cliente' AND importacion_id IS NULL;

  SELECT round(
           COALESCE((SELECT SUM(costo) FROM orden_labor
                     WHERE orden_id = p_orden_id AND estado = 'aprobado' AND id = ANY(COALESCE(p_conservar, '{}'))), 0)
         + COALESCE((SELECT SUM(subtotal) FROM orden_repuestos
                     WHERE orden_id = p_orden_id AND estado = 'aprobado' AND id = ANY(COALESCE(p_conservar, '{}'))), 0),
         2)
    INTO v_trabajos;

  SELECT round(COALESCE(monto, 0), 2)
    INTO v_parqueo
  FROM orden_parqueo
  WHERE orden_id = p_orden_id;

  v_parqueo := COALESCE(v_parqueo, 0);
  v_cobro := v_trabajos + v_extra + v_parqueo;

  RETURN jsonb_build_object(
    'cobrado', v_cobrado,
    'trabajos', v_trabajos,
    'revision', v_extra,
    'parqueo', v_parqueo,
    'cobro', v_cobro,
    'saldo', v_cobro - v_cobrado
  );
END;
$$;

ALTER FUNCTION "public"."saldo_retiro"("p_orden_id" "uuid", "p_cobro" numeric, "p_conservar" "uuid"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sede_delete_impact"("p_sede_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar esta información.'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'ordenes',      (SELECT COUNT(*) FROM ordenes_trabajo WHERE sede_id = p_sede_id),
    'clientes',     (SELECT COUNT(*) FROM clientes WHERE sede_id = p_sede_id),
    'vehiculos',    (SELECT COUNT(*) FROM vehiculos v
                       JOIN clientes c ON c.id = v.cliente_id
                      WHERE c.sede_id = p_sede_id),
    'movimientos',  (SELECT COUNT(*) FROM finanzas_movimientos WHERE sede_id = p_sede_id),
    'empleados',    (SELECT COUNT(*) FROM perfiles WHERE sede_id = p_sede_id),
    'otras_sedes',  (SELECT COUNT(*) FROM sedes WHERE id <> p_sede_id)
  ) INTO result;

  RETURN result;
END;
$$;

ALTER FUNCTION "public"."sede_delete_impact"("p_sede_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sugerir_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."sugerir_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sync_order_commissions"("target_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_estatus  order_status;
  v_sede     UUID;
BEGIN
  SELECT estatus, sede_id INTO v_estatus, v_sede
  FROM ordenes_trabajo WHERE id = target_order_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_estatus <> 'entregado' THEN
    DELETE FROM comisiones WHERE orden_id = target_order_id AND pago_id IS NULL;
    RETURN;
  END IF;

  DELETE FROM comisiones c
  WHERE c.orden_id = target_order_id
    AND c.pago_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public._reparto_comisiones(target_order_id) r
      WHERE r.usuario_id = c.usuario_id
        AND r.especialidad = c.especialidad
        AND r.labor_id IS NOT DISTINCT FROM c.labor_id
        AND r.esquema <> 'salario' AND r.monto > 0
    );

  INSERT INTO comisiones (orden_id, usuario_id, sede_id, especialidad, labor_id, base_ganancia, porcentaje, tecnicos, monto, estado)
  SELECT target_order_id, r.usuario_id, v_sede, r.especialidad, r.labor_id, r.base, r.porcentaje, r.tecnicos, r.monto, 'sugerida'
  FROM public._reparto_comisiones(target_order_id) r
  WHERE r.esquema <> 'salario' AND r.monto > 0
  ON CONFLICT ON CONSTRAINT comisiones_orden_usuario_especialidad_tarea_key DO UPDATE
    SET base_ganancia = EXCLUDED.base_ganancia,
        porcentaje    = EXCLUDED.porcentaje,
        tecnicos      = EXCLUDED.tecnicos,
        monto         = EXCLUDED.monto,
        sede_id       = EXCLUDED.sede_id
    WHERE comisiones.pago_id IS NULL AND comisiones.estado = 'sugerida';
END;
$$;

ALTER FUNCTION "public"."sync_order_commissions"("target_order_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sync_order_parts_expense"("target_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  ord        RECORD;
  cost_total NUMERIC;
  already    NUMERIC;
  delta      NUMERIC;
BEGIN
  SELECT id, sede_id, numero_orden, estatus INTO ord
  FROM ordenes_trabajo WHERE id = target_order_id;

  IF ord.id IS NULL OR ord.estatus <> 'entregado' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(cantidad * costo_unitario), 0) INTO cost_total
  FROM orden_repuestos WHERE orden_id = target_order_id AND estado = 'aprobado';

  SELECT COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END), 0) INTO already
  FROM finanzas_movimientos
  WHERE referencia_orden_id = target_order_id AND categoria = 'compra_repuesto'
    AND importacion_id IS NULL AND registrado_por IS NULL;

  delta := cost_total - already;

  IF ABS(delta) > 0.01 THEN
    INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
    VALUES (
      ord.sede_id,
      (CASE WHEN delta > 0 THEN 'egreso' ELSE 'ingreso' END)::transaction_type,
      'compra_repuesto',
      ABS(delta),
      CASE WHEN delta > 0 THEN 'Costo de repuestos - ' ELSE 'Ajuste de costo de repuestos - ' END || ord.numero_orden,
      public.hoy_taller(ord.sede_id),
      target_order_id
    );
  END IF;
END;
$$;

ALTER FUNCTION "public"."sync_order_parts_expense"("target_order_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trabajos_de_orden"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_resultado JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede consultar los trabajos de la orden.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'titulo', t.titulo,
        'catalogo_id', t.catalogo_id,
        'total', COALESCE(tot.total, 0),
        'total_aprobado', COALESCE(tot.total_aprobado, 0),
        'lineas', COALESCE(tot.lineas, 0)
      ) ORDER BY t.creado_en, t.id
    ),
    '[]'::jsonb
  ) INTO v_resultado
  FROM public.orden_trabajos t
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(l.monto) FILTER (WHERE l.estado <> 'rechazado'), 0) AS total,
      COALESCE(SUM(l.monto) FILTER (WHERE l.estado = 'aprobado'), 0) AS total_aprobado,
      COUNT(*)::int AS lineas
    FROM (
      SELECT estado, costo AS monto FROM public.orden_labor WHERE trabajo_id = t.id
      UNION ALL
      SELECT estado, subtotal AS monto FROM public.orden_repuestos WHERE trabajo_id = t.id
    ) l
  ) tot ON true
  WHERE t.orden_id = p_orden_id;

  RETURN v_resultado;
END;
$$;

ALTER FUNCTION "public"."trabajos_de_orden"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trabajos_pendientes_vehiculo"("p_vehiculo_id" "uuid", "p_excluir_orden" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración ve los trabajos pendientes de un vehículo.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.fecha DESC, x.descripcion)
    FROM (
      SELECT * FROM (
        SELECT 'mano_obra'::text AS tipo, l.descripcion, l.costo AS monto, o.id AS orden_id, o.numero_orden,
               COALESCE(l.decidido_en, l.creado_en) AS fecha, o.retirada_sin_reparar AS retirada
        FROM orden_labor l JOIN ordenes_trabajo o ON o.id = l.orden_id
        WHERE o.vehiculo_id = p_vehiculo_id AND l.estado = 'rechazado'
          AND (p_excluir_orden IS NULL OR o.id <> p_excluir_orden)
        UNION ALL
        SELECT 'repuesto', r.descripcion, r.subtotal, o.id, o.numero_orden,
               COALESCE(r.decidido_en, r.creado_en), o.retirada_sin_reparar
        FROM orden_repuestos r JOIN ordenes_trabajo o ON o.id = r.orden_id
        WHERE o.vehiculo_id = p_vehiculo_id AND r.estado = 'rechazado'
          AND (p_excluir_orden IS NULL OR o.id <> p_excluir_orden)
        UNION ALL
        SELECT 'inspeccion'::text AS tipo, p.nombre AS descripcion, NULL::numeric AS monto, o.id AS orden_id, o.numero_orden,
               COALESCE(p.actualizado_en, i.completada_en, i.creado_en) AS fecha, o.retirada_sin_reparar AS retirada
        FROM orden_inspeccion_puntos p
        JOIN orden_inspecciones i ON i.id = p.inspeccion_id
        JOIN ordenes_trabajo o ON o.id = p.orden_id
        WHERE o.vehiculo_id = p_vehiculo_id
          AND i.completada_en IS NOT NULL
          AND p.estado IN ('atencion', 'urgente')
          AND (p_excluir_orden IS NULL OR o.id <> p_excluir_orden)
      ) t
      ORDER BY fecha DESC, descripcion
      LIMIT 20
    ) x
  ), '[]'::jsonb);
END;
$$;

ALTER FUNCTION "public"."trabajos_pendientes_vehiculo"("p_vehiculo_id" "uuid", "p_excluir_orden" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."traducciones_orden"("p_orden_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() AND NOT (p_orden_id = ANY (public.mis_ordenes_asignadas())) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN public._diccionario_traducciones(p_orden_id);
END;
$$;

ALTER FUNCTION "public"."traducciones_orden"("p_orden_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."traducciones_portal"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden_id UUID;
BEGIN
  SELECT orden_id INTO v_orden_id
  FROM orden_enlaces
  WHERE token = p_token
    AND revocado_en IS NULL
    AND (expira_en IS NULL OR expira_en > now());
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN public._diccionario_traducciones(v_orden_id);
END;
$$;

ALTER FUNCTION "public"."traducciones_portal"("p_token" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_asignacion_toma_tareas"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

ALTER FUNCTION "public"."trg_asignacion_toma_tareas"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_avance_hallazgo_interno"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.visible_cliente AND NOT COALESCE(OLD.visible_cliente, false)
     AND auth.role() = 'authenticated' AND NOT public.is_admin()
     AND EXISTS (SELECT 1 FROM orden_hallazgos WHERE avance_id = NEW.id) THEN
    RAISE EXCEPTION 'Lo que reportaste como trabajo adicional es interno: administración decide qué ve el cliente.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_avance_hallazgo_interno"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_avance_labor_match"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.labor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM orden_labor WHERE id = NEW.labor_id AND orden_id = NEW.orden_id) THEN
      RAISE EXCEPTION 'La tarea % no pertenece a la orden %.', NEW.labor_id, NEW.orden_id
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_avance_labor_match"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_avance_por_tareas"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orden UUID := COALESCE(NEW.orden_id, OLD.orden_id);
  v_avance INTEGER;
BEGIN
  BEGIN
    v_avance := public._avance_por_tareas(v_orden);
    IF v_avance IS NOT NULL THEN
      UPDATE ordenes_trabajo
      SET porcentaje_avance = v_avance
      WHERE id = v_orden
        AND estatus NOT IN ('finalizado', 'entregado')
        AND porcentaje_avance IS DISTINCT FROM v_avance;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_avance_por_tareas: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."trg_avance_por_tareas"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_check_orden_sede"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  cliente_sede UUID;
  vehiculo_sede UUID;
BEGIN
  SELECT sede_id INTO cliente_sede FROM clientes WHERE id = NEW.cliente_id;
  SELECT sede_id INTO vehiculo_sede FROM vehiculos WHERE id = NEW.vehiculo_id;

  IF cliente_sede IS DISTINCT FROM NEW.sede_id THEN
    RAISE EXCEPTION 'El cliente pertenece a otra sede.';
  END IF;
  IF vehiculo_sede IS DISTINCT FROM NEW.sede_id THEN
    RAISE EXCEPTION 'El vehículo pertenece a otra sede.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_check_orden_sede"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_commissions_on_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.sync_order_commissions(COALESCE(NEW.orden_id, OLD.orden_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."trg_commissions_on_assignment"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_commissions_on_labor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Una línea nueva nace en borrador; solo cuenta si entró ya aprobada (sistema).
    IF NEW.estado = 'aprobado' THEN
      PERFORM public.sync_order_commissions(NEW.orden_id);
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_order_commissions(OLD.orden_id);
    RETURN NULL;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.costo IS DISTINCT FROM OLD.costo
     OR NEW.asignado_a IS DISTINCT FROM OLD.asignado_a
     OR NEW.reparto_heredado IS DISTINCT FROM OLD.reparto_heredado
     OR NEW.especialidad IS DISTINCT FROM OLD.especialidad
     OR NEW.orden_id IS DISTINCT FROM OLD.orden_id THEN
    PERFORM public.sync_order_commissions(NEW.orden_id);
    IF NEW.orden_id IS DISTINCT FROM OLD.orden_id THEN
      PERFORM public.sync_order_commissions(OLD.orden_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."trg_commissions_on_labor"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_commissions_on_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.estatus IS DISTINCT FROM OLD.estatus THEN
    PERFORM public.sync_order_commissions(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_commissions_on_order"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_commissions_on_pay_scheme"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  o RECORD;
BEGIN
  FOR o IN
    SELECT DISTINCT orden_id FROM comisiones
    WHERE usuario_id = COALESCE(NEW.usuario_id, OLD.usuario_id) AND pago_id IS NULL
  LOOP
    PERFORM public.sync_order_commissions(o.orden_id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."trg_commissions_on_pay_scheme"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_commissions_on_rate_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  o RECORD;
BEGIN
  IF NEW.comision_porcentaje IS DISTINCT FROM OLD.comision_porcentaje THEN
    FOR o IN
      SELECT DISTINCT orden_id FROM comisiones
      WHERE sede_id = NEW.id AND pago_id IS NULL
    LOOP
      PERFORM public.sync_order_commissions(o.orden_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_commissions_on_rate_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_create_order_montos"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO orden_montos (orden_id) VALUES (NEW.id)
  ON CONFLICT (orden_id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_create_order_montos"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_desarchivar_al_reabrir"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.estatus IS DISTINCT FROM 'entregado' THEN
    NEW.archivada_en := NULL;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_desarchivar_al_reabrir"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_encolar_traduccion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."trg_encolar_traduccion"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_enlace_al_crear_orden"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

ALTER FUNCTION "public"."trg_enlace_al_crear_orden"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_finanzas_origen"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.origen := CASE WHEN current_user IN ('authenticated', 'anon') THEN 'manual' ELSE 'sistema' END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_finanzas_origen"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_asignacion_con_tareas"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_nombre TEXT;
  v_tareas INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.origen IS DISTINCT FROM OLD.origen OR NEW.tipo_tarea IS DISTINCT FROM OLD.tipo_tarea)
       AND EXISTS (
         SELECT 1 FROM comisiones
         WHERE orden_id = OLD.orden_id AND labor_id IS NULL AND pago_id IS NOT NULL
           AND especialidad IN (OLD.tipo_tarea, NEW.tipo_tarea)
       ) THEN
      RAISE EXCEPTION 'El reparto de % de esta orden ya se pagó: no se cambia quién entra en él. Deshaz ese pago en Comisiones primero.',
        CASE WHEN 'pintura' IN (OLD.tipo_tarea, NEW.tipo_tarea) AND 'mecanica' IN (OLD.tipo_tarea, NEW.tipo_tarea)
             THEN 'mecánica o pintura'
             WHEN 'pintura' IN (OLD.tipo_tarea, NEW.tipo_tarea) THEN 'pintura' ELSE 'mecánica' END
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Borrar la orden o al empleado arrastra sus asignaciones: eso no es "quitarlo de la orden".
  IF NOT EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = OLD.orden_id)
     OR NOT EXISTS (SELECT 1 FROM perfiles WHERE id = OLD.usuario_id) THEN
    RETURN OLD;
  END IF;

  -- Con otra asignación en la misma orden (las dos especialidades) sigue viéndola.
  IF EXISTS (
    SELECT 1 FROM orden_asignaciones
    WHERE orden_id = OLD.orden_id AND usuario_id = OLD.usuario_id AND id <> OLD.id
  ) THEN
    RETURN OLD;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_tareas
  FROM orden_labor WHERE orden_id = OLD.orden_id AND asignado_a = OLD.usuario_id;

  IF v_tareas > 0 THEN
    SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = OLD.usuario_id;
    RAISE EXCEPTION '% tiene % tarea(s) en esta orden. Asígnalas a otra persona antes de quitarlo de la orden.',
      COALESCE(v_nombre, 'Este técnico'), v_tareas
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."trg_guard_asignacion_con_tareas"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_delivered_order_children"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_estatus order_status;
BEGIN
  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT estatus INTO v_estatus
  FROM ordenes_trabajo
  WHERE id = COALESCE(NEW.orden_id, OLD.orden_id);

  IF v_estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."trg_guard_delivered_order_children"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_entrega_con_presupuesto"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.estatus = 'entregado' AND OLD.estatus IS DISTINCT FROM 'entregado'
     AND EXISTS (SELECT 1 FROM presupuestos WHERE orden_id = NEW.id AND estado = 'enviado') THEN
    RAISE EXCEPTION 'La orden tiene un presupuesto esperando respuesta del cliente. Registra la autorización o cancela el presupuesto antes de entregar.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_entrega_con_presupuesto"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_inspeccion_media"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."trg_guard_inspeccion_media"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_labor_tecnico"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sede_orden UUID;
  v_rol        user_role;
  v_sede_tec   UUID;
  v_pagada     BOOLEAN := false;
  v_bolsa      BOOLEAN := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    -- La comisión de esta tarea ya se pagó…
    v_pagada := EXISTS (
      SELECT 1 FROM comisiones WHERE labor_id = OLD.id AND pago_id IS NOT NULL
    );
    -- …o es una línea heredada aprobada y la bolsa de su especialidad ya se pagó: moverla
    -- a un técnico la pagaría dos veces.
    v_bolsa := OLD.asignado_a IS NULL AND OLD.reparto_heredado AND OLD.estado = 'aprobado'
      AND EXISTS (
        SELECT 1 FROM comisiones
        WHERE orden_id = OLD.orden_id AND especialidad = OLD.especialidad
          AND labor_id IS NULL AND pago_id IS NOT NULL
      );
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Borrar la orden arrastra sus líneas (y `trg_order_delete_paid_guard` ya impide borrar
    -- una orden con comisiones pagadas).
    IF (v_pagada OR v_bolsa) AND EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = OLD.orden_id) THEN
      RAISE EXCEPTION 'La comisión de este trabajo ya se pagó. Deshaz ese pago en Comisiones antes de quitarlo.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- Una línea no se muda de orden. Ninguna pantalla lo hace, y por la API pagaba dos veces lo
  -- ya pagado: la fila pagada se queda en la orden vieja y en la nueva nacía otra pendiente
  -- (la llave de `comisiones` lleva el `orden_id`).
  IF TG_OP = 'UPDATE' AND NEW.orden_id IS DISTINCT FROM OLD.orden_id THEN
    RAISE EXCEPTION 'Un trabajo no se puede mover a otra orden. Quítalo de esta y agrégalo en la otra.'
      USING ERRCODE = '42501';
  END IF;

  -- Quién puede tener una tarea: un mecánico o pintor de la sede de la orden.
  IF NEW.asignado_a IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.asignado_a IS DISTINCT FROM OLD.asignado_a) THEN
    SELECT sede_id INTO v_sede_orden FROM ordenes_trabajo WHERE id = NEW.orden_id;
    SELECT rol, sede_id INTO v_rol, v_sede_tec FROM perfiles WHERE id = NEW.asignado_a;
    IF v_rol IS NULL OR v_rol NOT IN ('mecanico', 'pintor') OR v_sede_tec IS DISTINCT FROM v_sede_orden THEN
      RAISE EXCEPTION 'Una tarea solo se puede asignar a un mecánico o pintor de la sede de la orden.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.asignado_a IS DISTINCT FROM OLD.asignado_a
          OR NEW.especialidad IS DISTINCT FROM OLD.especialidad
          OR NEW.reparto_heredado IS DISTINCT FROM OLD.reparto_heredado)
     -- ON DELETE SET NULL al borrar al empleado: no es una reasignación.
     AND NOT (NEW.asignado_a IS NULL AND OLD.asignado_a IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM perfiles WHERE id = OLD.asignado_a)) THEN
    IF v_pagada THEN
      RAISE EXCEPTION 'La comisión de esta tarea ya se pagó. Para cambiarle el técnico o la especialidad, deshaz ese pago en Comisiones.'
        USING ERRCODE = '42501';
    END IF;
    IF v_bolsa THEN
      RAISE EXCEPTION 'La comisión de % de esta orden ya se pagó con el reparto anterior. Deshaz ese pago en Comisiones antes de cambiarle el técnico o la especialidad a este trabajo.',
        CASE OLD.especialidad WHEN 'pintura' THEN 'pintura' ELSE 'mecánica' END
        USING ERRCODE = '42501';
    END IF;
    -- …ni entrar a una bolsa heredada que ya se pagó (otra especialidad, volver al reparto,
    -- quitarle el técnico a una línea con reparto): lo pagado no se recalcula, así que su
    -- comisión no la cobraría nadie, y la línea quedaría atrapada por la regla de arriba.
    -- Aprobar una línea (cambia solo el estado) no pasa por aquí: el presupuesto no se traba.
    IF NEW.asignado_a IS NULL AND NEW.reparto_heredado AND NEW.estado = 'aprobado'
       AND NOT (OLD.asignado_a IS NULL AND OLD.reparto_heredado AND OLD.estado = 'aprobado'
                AND OLD.especialidad IS NOT DISTINCT FROM NEW.especialidad)
       AND EXISTS (
         SELECT 1 FROM comisiones
         WHERE orden_id = NEW.orden_id AND especialidad = NEW.especialidad
           AND labor_id IS NULL AND pago_id IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'La comisión de % de esta orden ya se pagó con el reparto anterior: este trabajo no puede entrar a ese reparto. Deshaz ese pago en Comisiones o asígnale un técnico.',
        CASE NEW.especialidad WHEN 'pintura' THEN 'pintura' ELSE 'mecánica' END
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_labor_tecnico"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_linea_presupuesto"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sistema BOOLEAN := COALESCE(current_setting('restorify.presupuesto', true), 'off') = 'on';
  -- Lo que se puede cambiar sin tocar lo cotizado: a quién y a qué bolsa va la comisión, lo
  -- que costó la pieza y si ya llegó.
  v_internos CONSTANT TEXT[] := ARRAY[
    'especialidad', 'asignado_a', 'reparto_heredado',
    'costo_unitario', 'estado_pedido', 'pedido_en', 'recibido_en'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Toda línea nueva nace como borrador, diga lo que diga quien la inserta.
    IF NOT v_sistema THEN
      NEW.estado := 'borrador';
      NEW.presupuesto_id := NULL;
      NEW.decidido_en := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Borrar la orden (o la sede) arrastra sus líneas: eso no es "quitar una línea
    -- de un presupuesto abierto".
    IF OLD.estado = 'pendiente' AND NOT v_sistema
       AND EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = OLD.orden_id)
       AND EXISTS (SELECT 1 FROM presupuestos WHERE id = OLD.presupuesto_id AND estado = 'enviado') THEN
      RAISE EXCEPTION 'Esta línea es parte de un presupuesto que espera respuesta del cliente. Cancela el presupuesto para quitarla.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF v_sistema THEN
    RETURN NEW;
  END IF;

  -- Solo lo interno: no toca lo cotizado.
  IF (to_jsonb(NEW) - v_internos) = (to_jsonb(OLD) - v_internos) THEN
    RETURN NEW;
  END IF;

  -- ON DELETE SET NULL de un presupuesto que se borra con su orden.
  IF NEW.presupuesto_id IS NULL AND OLD.presupuesto_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM presupuestos WHERE id = OLD.presupuesto_id) THEN
    RETURN NEW;
  END IF;

  IF OLD.estado = 'pendiente' THEN
    RAISE EXCEPTION 'Esta línea es parte de un presupuesto que espera respuesta del cliente. Cancela el presupuesto para modificarla.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.presupuesto_id IS DISTINCT FROM OLD.presupuesto_id
     OR NEW.decidido_en IS DISTINCT FROM OLD.decidido_en THEN
    RAISE EXCEPTION 'El estado de una línea lo cambian el presupuesto, la firma de recepción o una autorización registrada.'
      USING ERRCODE = '42501';
  END IF;

  -- Corregir una línea rechazada (otro precio, otra pieza) es volver a cotizarla:
  -- regresa a borrador para presentársela de nuevo al cliente.
  IF OLD.estado = 'rechazado' THEN
    NEW.estado := 'borrador';
    NEW.presupuesto_id := NULL;
    NEW.decidido_en := NULL;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_linea_presupuesto"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_lista_para_entregar"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.lista_para_entregar_en := NULL;
    NEW.lista_para_entregar_por := NULL;
    RETURN NEW;
  END IF;

  IF NEW.estatus NOT IN ('finalizado', 'entregado') THEN
    NEW.lista_para_entregar_en := NULL;
    NEW.lista_para_entregar_por := NULL;
  ELSIF (NEW.lista_para_entregar_en IS DISTINCT FROM OLD.lista_para_entregar_en
         OR NEW.lista_para_entregar_por IS DISTINCT FROM OLD.lista_para_entregar_por)
        AND COALESCE(current_setting('restorify.lista', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Una orden queda lista para entregar solo con "Marcar listo para entregar".'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_lista_para_entregar"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_notificacion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.titulo IS DISTINCT FROM OLD.titulo
     OR NEW.cuerpo IS DISTINCT FROM OLD.cuerpo
     OR NEW.datos IS DISTINCT FROM OLD.datos
     OR NEW.orden_id IS DISTINCT FROM OLD.orden_id
     OR NEW.url IS DISTINCT FROM OLD.url
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en THEN
    RAISE EXCEPTION 'Solo se puede marcar un aviso como leído.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_notificacion"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_orden_media"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.orden_id IS DISTINCT FROM OLD.orden_id
     OR NEW.sede_id IS DISTINCT FROM OLD.sede_id
     OR NEW.avance_id IS DISTINCT FROM OLD.avance_id
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.origen IS DISTINCT FROM OLD.origen
     OR NEW.ruta IS DISTINCT FROM OLD.ruta
     OR NEW.ruta_miniatura IS DISTINCT FROM OLD.ruta_miniatura
     OR NEW.mime IS DISTINCT FROM OLD.mime
     OR NEW.bytes IS DISTINCT FROM OLD.bytes
     OR NEW.duracion_seg IS DISTINCT FROM OLD.duracion_seg
     OR NEW.subido_por IS DISTINCT FROM OLD.subido_por
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en THEN
    RAISE EXCEPTION 'Solo se puede cambiar la visibilidad o la zona de un archivo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_orden_media"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_order_delete_entregada"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.estatus = 'entregado'
     AND auth.uid() IS NOT NULL
     AND COALESCE(current_setting('restorify.borrar_sede', true), '') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Una orden entregada no se borra: lleva el cobro, el costo de los repuestos y las comisiones. Archívala para sacarla de la lista.'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL
     AND COALESCE(current_setting('restorify.borrar_sede', true), '') IS DISTINCT FROM 'on'
     AND EXISTS (
       SELECT 1
       FROM public.finanzas_movimientos
       WHERE referencia_orden_id = OLD.id
         AND importacion_id IS NULL
     ) THEN
    RAISE EXCEPTION 'Esta orden ya tiene dinero registrado en Finanzas. Para cancelarla usa «Retirada sin reparar», que registra la devolución.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."trg_guard_order_delete_entregada"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_order_delete_paid"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM comisiones WHERE orden_id = OLD.id AND pago_id IS NOT NULL) THEN
    RAISE EXCEPTION 'La orden % tiene comisiones que ya se pagaron. Deshaz ese pago en Comisiones antes de borrarla.', OLD.numero_orden
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."trg_guard_order_delete_paid"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_order_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  NEW.numero_orden       := NULL;
  NEW.estatus            := 'recepcion';
  NEW.porcentaje_avance  := 0;
  NEW.total_labor        := 0;
  NEW.fecha_finalizacion := NULL;
  NEW.firma_ruta         := NULL;
  NEW.firma_fecha        := NULL;
  NEW.fecha_ingreso      := NOW();
  NEW.creado_en          := NOW();
  NEW.creado_por         := auth.uid();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_order_insert"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_order_money"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.estatus = 'entregado' AND OLD.estatus IS DISTINCT FROM 'entregado' THEN
    RAISE EXCEPTION 'Sólo un administrador puede marcar una orden como entregada.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.numero_orden IS DISTINCT FROM OLD.numero_orden
     OR NEW.sede_id IS DISTINCT FROM OLD.sede_id THEN
    RAISE EXCEPTION 'Sólo un administrador puede cambiar la sede o el número de una orden.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(current_setting('restorify.recalc', true), 'off') <> 'on'
     AND NEW.total_labor IS DISTINCT FROM OLD.total_labor THEN
    RAISE EXCEPTION 'Los totales de una orden los calcula el sistema a partir de sus líneas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_order_money"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_order_montos"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_estatus order_status;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.orden_id IS DISTINCT FROM OLD.orden_id THEN
    RAISE EXCEPTION 'No se puede mover los montos a otra orden.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(current_setting('restorify.recalc', true), 'off') <> 'on'
     AND (NEW.total_repuestos IS DISTINCT FROM OLD.total_repuestos
       OR NEW.total_general   IS DISTINCT FROM OLD.total_general) THEN
    RAISE EXCEPTION 'Los totales de una orden los calcula el sistema a partir de sus líneas.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(current_setting('restorify.descuento', true), 'off') <> 'on'
     AND (NEW.descuento IS DISTINCT FROM OLD.descuento
       OR NEW.descuento_motivo IS DISTINCT FROM OLD.descuento_motivo) THEN
    RAISE EXCEPTION 'El descuento se aplica desde la orden, con "Aplicar descuento".'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.deposito_inicial IS DISTINCT FROM OLD.deposito_inicial THEN
    SELECT estatus INTO v_estatus FROM ordenes_trabajo WHERE id = NEW.orden_id;
    IF v_estatus = 'entregado' THEN
      RAISE EXCEPTION 'La orden ya fue entregada: su depósito no se puede cambiar.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_order_montos"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_order_technician"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'porcentaje_avance',
    'total_labor', 'motivo_autorizacion'
  ];
  v_estados_tecnico CONSTANT order_status[] := ARRAY[
    'en_proceso', 'espera_autorizacion', 'finalizado'
  ]::order_status[];
BEGIN
  -- Normalización
  NEW.motivo_autorizacion := NULLIF(btrim(left(COALESCE(NEW.motivo_autorizacion, ''), 1000)), '');
  IF NEW.estatus IS DISTINCT FROM 'espera_autorizacion' THEN
    NEW.motivo_autorizacion := NULL;
  END IF;

  -- La firma es un archivo de la carpeta de ESTA orden en el bucket privado.
  IF NEW.firma_ruta IS DISTINCT FROM OLD.firma_ruta
     AND NEW.firma_ruta IS NOT NULL
     AND NEW.firma_ruta NOT LIKE NEW.sede_id::text || '/' || NEW.id::text || '/%' THEN
    RAISE EXCEPTION 'La firma debe guardarse en la carpeta de esta orden.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF OLD.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_assigned_to_order(OLD.id) THEN
    RAISE EXCEPTION 'Solo el personal asignado puede modificar esta orden. Pide a administración que te asigne.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.estatus = 'finalizado' AND NEW.estatus IS DISTINCT FROM OLD.estatus THEN
    RAISE EXCEPTION 'La orden ya está finalizada. Solo un administrador puede reabrirla.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.estatus IS DISTINCT FROM OLD.estatus
     AND NOT (NEW.estatus = ANY (v_estados_tecnico)) THEN
    IF NEW.estatus = 'recepcion' THEN
      RAISE EXCEPTION 'Solo un administrador puede devolver una orden a Recepción.'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Solo un administrador puede poner la orden en ese estado.'
      USING ERRCODE = '42501';
  END IF;

  -- Decisión del dueño (04/11/2026): el técnico no empieza ni termina una orden hasta que el
  -- cliente autorice algo. Antes podía, y se terminaban órdenes que al entregarse cobraban $0
  -- (ORD-2026-005 y ORD-2026-010). La primera autorización la pasa sola a en_proceso
  -- (trg_quote_starts_order); administración sí puede mover una orden sin nada autorizado
  -- (garantía, cortesía), y para eso está el grupo sin_autorizar de requiere_atencion.
  IF NEW.estatus IS DISTINCT FROM OLD.estatus
     AND NEW.estatus IN ('en_proceso', 'finalizado')
     AND NOT EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = NEW.id AND estado = 'aprobado')
     AND NOT EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = NEW.id AND estado = 'aprobado') THEN
    RAISE EXCEPTION 'El cliente todavía no autoriza ningún trabajo de esta orden. No se puede empezar ni terminar hasta que administración registre la autorización.'
      USING ERRCODE = '42501';
  END IF;

  -- REGLAS NUEVAS DE ESPERA DE AUTORIZACIÓN (F6)
  IF NEW.estatus = 'espera_autorizacion' AND OLD.estatus IS DISTINCT FROM 'espera_autorizacion' THEN
    IF NOT EXISTS (SELECT 1 FROM orden_hallazgos WHERE orden_id = NEW.id AND estado = 'pendiente') THEN
      RAISE EXCEPTION 'Solo puedes pedir autorización reportando trabajo adicional.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.estatus = 'espera_autorizacion' AND NEW.estatus IS DISTINCT FROM 'espera_autorizacion' THEN
    IF EXISTS (
      SELECT 1 FROM orden_hallazgos WHERE orden_id = NEW.id AND (estado = 'pendiente' OR (estado = 'cotizado' AND presupuesto_id IS NULL))
    ) OR EXISTS (
      SELECT 1 FROM presupuestos WHERE orden_id = NEW.id AND estado = 'enviado'
    ) THEN
      RAISE EXCEPTION 'La orden no puede salir de espera de autorización mientras haya hallazgos pendientes o presupuestos enviados.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.estatus = 'espera_autorizacion' AND NEW.motivo_autorizacion IS NULL THEN
    RAISE EXCEPTION 'Escribe por qué la orden necesita autorización.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.firma_ruta IS DISTINCT FROM OLD.firma_ruta
     OR NEW.firma_fecha IS DISTINCT FROM OLD.firma_fecha THEN
    RAISE EXCEPTION 'La firma del cliente la toma administración en la recepción.'
      USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - v_permitidas) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar los datos de recepción de una orden.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$_$;

ALTER FUNCTION "public"."trg_guard_order_technician"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_perfil_privilegios"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- No end-user JWT on the request means this is a trusted maintenance path:
  -- the service-role key (create-employee / delete-employee) or plain SQL run
  -- by a migration or seed. Those must stay able to fix up a profile.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'No puedes cambiar el identificador de un perfil.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de un usuario.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.sede_id IS DISTINCT FROM OLD.sede_id THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la sede de un usuario.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el correo de un usuario.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_perfil_privilegios"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_retirada"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.retirada_sin_reparar := false;
    RETURN NEW;
  END IF;

  IF NEW.estatus IS DISTINCT FROM 'entregado' THEN
    NEW.retirada_sin_reparar := false;
  ELSIF NEW.retirada_sin_reparar IS DISTINCT FROM OLD.retirada_sin_reparar
        AND COALESCE(current_setting('restorify.retirada', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Una orden queda "Retirada sin reparar" solo al cerrarla con esa opción.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_retirada"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_guard_row_owner_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.orden_id IS DISTINCT FROM OLD.orden_id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
    RAISE EXCEPTION 'No se puede mover a otra orden ni a otra persona. Elimínalo y créalo de nuevo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_guard_row_owner_immutable"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_historial"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
          'con_seguro', 'aseguradora', 'numero_reclamo', 'marcas_danos'];
      WHEN 'orden_labor' THEN
        v_entidad := 'mano_obra';
        v_resumen := v_fila ->> 'descripcion';
        v_campos := ARRAY['descripcion', 'costo', 'horas', 'especialidad', 'estado', 'completado_en', 'tecnico'];
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

ALTER FUNCTION "public"."trg_historial"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_labor_cerrar_reloj"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."trg_labor_cerrar_reloj"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_labor_especialidad"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.especialidad IS NULL THEN
    SELECT CASE tipo_trabajo WHEN 'pintura' THEN 'pintura' ELSE 'mecanica' END
      INTO NEW.especialidad
    FROM ordenes_trabajo WHERE id = NEW.orden_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_labor_especialidad"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_labor_tecnico_asignado"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_nuevo BOOLEAN := NEW.asignado_a IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.asignado_a IS DISTINCT FROM OLD.asignado_a);
  -- A quien se la quitan, si sigue existiendo (borrar al empleado pone `asignado_a` en nulo).
  v_quitado UUID := CASE WHEN TG_OP = 'UPDATE' AND OLD.asignado_a IS DISTINCT FROM NEW.asignado_a
                          AND EXISTS (SELECT 1 FROM perfiles WHERE id = OLD.asignado_a)
                         THEN OLD.asignado_a END;
  d JSONB;
BEGIN
  -- Fuera del bloque de avisos: sin esta fila el técnico no ve su tarea.
  IF v_nuevo AND NOT EXISTS (
    SELECT 1 FROM orden_asignaciones WHERE orden_id = NEW.orden_id AND usuario_id = NEW.asignado_a
  ) THEN
    INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, estatus_tarea, origen)
    VALUES (NEW.orden_id, NEW.asignado_a, NEW.especialidad, 'pendiente', 'tarea');
  END IF;

  BEGIN
    IF v_nuevo OR v_quitado IS NOT NULL THEN
      d := public.datos_orden_aviso(NEW.orden_id)
        || jsonb_build_object('labor_id', NEW.id, 'descripcion', NEW.descripcion, 'especialidad', NEW.especialidad);
    END IF;

    IF v_quitado IS NOT NULL THEN
      PERFORM public.notificar(
        ARRAY[v_quitado],
        'tarea_reasignada',
        'Tarea reasignada · ' || (d->>'numero_orden'),
        NEW.descripcion || ' ya no está a tu cargo',
        d,
        NEW.orden_id
      );
    END IF;

    IF v_nuevo THEN
      PERFORM public.notificar(
        ARRAY[NEW.asignado_a],
        'tarea_asignada',
        'Nueva tarea · ' || (d->>'numero_orden'),
        concat_ws(' — ', NEW.descripcion, NULLIF(d->>'vehiculo', '')),
        d,
        NEW.orden_id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_labor_tecnico_asignado: %', SQLERRM;
  END;

  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."trg_labor_tecnico_asignado"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_marcas_danos_firmadas"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.firma_ruta IS NOT NULL AND NEW.marcas_danos IS DISTINCT FROM OLD.marcas_danos THEN
    RAISE EXCEPTION 'El cliente ya firmó la recepción: los daños marcados no se pueden cambiar.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_marcas_danos_firmadas"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_notify_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  d JSONB;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.origen IS DISTINCT FROM 'tarea' THEN
        d := public.datos_orden_aviso(NEW.orden_id);
        PERFORM public.notificar(
          ARRAY[NEW.usuario_id],
          'asignacion',
          'Nueva orden asignada · ' || (d->>'numero_orden'),
          concat_ws(' — ', NULLIF(d->>'vehiculo', ''), NULLIF(d->>'cliente', '')),
          d,
          NEW.orden_id
        );
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      d := public.datos_orden_aviso(OLD.orden_id);
      -- Si la orden se está borrando entera, o el empleado, no queda nada que avisar.
      IF d IS NOT NULL AND EXISTS (SELECT 1 FROM perfiles WHERE id = OLD.usuario_id) THEN
        PERFORM public.notificar(
          ARRAY[OLD.usuario_id],
          'desasignacion',
          'Ya no estás asignado · ' || (d->>'numero_orden'),
          NULLIF(d->>'vehiculo', ''),
          d,
          OLD.orden_id
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_assignment: %', SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."trg_notify_assignment"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_notify_auth_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  d JSONB;
BEGIN
  BEGIN
    IF NEW.estatus = 'espera_autorizacion'
       AND NEW.motivo_autorizacion IS NOT NULL -- F6: un presupuesto del admin no trae motivo
       AND COALESCE(current_setting('restorify.hallazgo', true), '') <> 'on'
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

ALTER FUNCTION "public"."trg_notify_auth_request"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_notify_commission"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  r RECORD;
  d JSONB;
BEGIN
  FOR r IN
    SELECT n.orden_id, n.usuario_id, SUM(n.monto) AS monto
    FROM nuevas n
    WHERE n.estado = 'aceptada'
    GROUP BY n.orden_id, n.usuario_id
  LOOP
    BEGIN
      d := public.datos_orden_aviso(r.orden_id);
      PERFORM public.notificar(
        ARRAY[r.usuario_id],
        'comision_generada',
        'Comisión generada · ' || (d->>'numero_orden'),
        '$' || to_char(r.monto, 'FM999,999,990.00') || ' por la mano de obra de ' ||
          COALESCE(NULLIF(d->>'vehiculo', ''), 'la orden'),
        d || jsonb_build_object('monto', r.monto),
        r.orden_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trg_notify_commission: %', SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$_$;

ALTER FUNCTION "public"."trg_notify_commission"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_notify_order_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  d       JSONB;
  v_quien TEXT;
BEGIN
  BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      d := public.datos_orden_aviso(NEW.id);
      SELECT nombre_completo INTO v_quien FROM perfiles WHERE id = auth.uid();
      PERFORM public.notificar(
        public.admins_de_sede(NEW.sede_id),
        'recepcion_tecnico',
        'Recepción registrada · ' || NEW.numero_orden,
        COALESCE(v_quien, 'Un técnico') || ' recibió ' || COALESCE(NULLIF(d->>'vehiculo', ''), 'un vehículo') || '. Falta cotizar.',
        d || jsonb_build_object('actor', v_quien),
        NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_order_created: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_notify_order_created"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_notify_order_finished"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  d JSONB;
BEGIN
  BEGIN
    IF NEW.estatus = 'finalizado' AND OLD.estatus IS DISTINCT FROM 'finalizado' THEN
      d := public.datos_orden_aviso(NEW.id);
      PERFORM public.notificar(
        public.admins_de_sede(NEW.sede_id),
        'orden_finalizada',
        'Trabajo terminado · ' || NEW.numero_orden,
        concat_ws(' — ', NULLIF(d->>'vehiculo', ''), NULLIF(d->>'cliente', ''), 'revísala y márcala lista para entregar'),
        d,
        NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_order_finished: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_notify_order_finished"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_notify_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  d       JSONB;
  v_quien TEXT;
  v_texto TEXT;
BEGIN
  BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin()
       AND COALESCE(current_setting('restorify.hallazgo', true), '') <> 'on' THEN
      d := public.datos_orden_aviso(NEW.orden_id);
      SELECT nombre_completo INTO v_quien FROM perfiles WHERE id = NEW.usuario_id;
      v_texto := NULLIF(btrim(NEW.descripcion), '');
      PERFORM public.notificar(
        public.admins_de_sede((d->>'sede_id')::uuid),
        'avance_tecnico',
        'Nuevo avance · ' || (d->>'numero_orden'),
        COALESCE(v_quien, 'Un técnico') || ': ' ||
          COALESCE(left(v_texto, 120), 'agregó archivos. Revisa si hay algo para mostrar al cliente.'),
        d || jsonb_build_object('actor', v_quien, 'avance_id', NEW.id),
        NEW.orden_id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_progress: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_notify_progress"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_notify_repuesto_recibido"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  d JSONB;
  v_tecnicos UUID[];
BEGIN
  BEGIN
    IF NEW.estado_pedido = 'recibido' AND OLD.estado_pedido IS DISTINCT FROM 'recibido' THEN
      SELECT array_agg(DISTINCT usuario_id) INTO v_tecnicos
      FROM orden_asignaciones WHERE orden_id = NEW.orden_id;
      IF v_tecnicos IS NOT NULL THEN
        d := public.datos_orden_aviso(NEW.orden_id);
        PERFORM public.notificar(
          v_tecnicos,
          'repuesto_recibido',
          'Llegó un repuesto · ' || (d->>'numero_orden'),
          NEW.descripcion || COALESCE(' — ' || NULLIF(d->>'vehiculo', ''), ''),
          d || jsonb_build_object('descripcion', NEW.descripcion),
          NEW.orden_id
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_repuesto_recibido: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."trg_notify_repuesto_recibido"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_order_delivery_reversal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.estatus = 'entregado' AND NEW.estatus IS DISTINCT FROM 'entregado' THEN
    PERFORM public.reverse_order_delivery_finance(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_order_delivery_reversal"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_order_deposit_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  ord      RECORD;
  previo   NUMERIC;
  delta    NUMERIC;
  v_cfg    JSONB;
  v_metodo TEXT;
  v_cheque TEXT;
  v_ruta   TEXT;
  v_desc   TEXT;
BEGIN
  previo := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.deposito_inicial, 0) ELSE 0 END;
  delta := COALESCE(NEW.deposito_inicial, 0) - previo;

  IF ABS(delta) <= 0.01 THEN
    RETURN NEW;
  END IF;

  SELECT id, sede_id, numero_orden, creado_por INTO ord
  FROM ordenes_trabajo WHERE id = NEW.orden_id;

  v_desc := CASE WHEN previo = 0 THEN 'Depósito inicial - ' ELSE 'Ajuste de depósito - ' END;

  -- El depósito del alta o un anticipo, y solo con los datos de esta misma orden. Otro ajuste
  -- queda sin método, como antes.
  IF delta > 0 THEN
    v_cfg := NULLIF(current_setting('restorify.deposito', true), '')::jsonb;
    IF v_cfg IS NOT NULL AND v_cfg->>'orden_id' = NEW.orden_id::text
       AND (previo = 0 OR COALESCE((v_cfg->>'anticipo')::boolean, false)) THEN
      IF COALESCE((v_cfg->>'anticipo')::boolean, false) THEN
        v_desc := 'Anticipo - ';
      END IF;
      v_metodo := NULLIF(v_cfg->>'metodo', '');
      v_cheque := NULLIF(v_cfg->>'numero_cheque', '');
      v_ruta   := NULLIF(v_cfg->>'comprobante_ruta', '');
      -- Segunda capa: `create_work_order` ya lo validó.
      IF v_ruta IS NOT NULL AND v_ruta NOT LIKE ord.sede_id::text || '/%' THEN
        RAISE EXCEPTION 'El comprobante debe guardarse en la carpeta de la sede de la orden.'
          USING ERRCODE = '42501';
      END IF;
      PERFORM set_config('restorify.deposito', '', true);
    END IF;
  END IF;

  INSERT INTO finanzas_movimientos (
    sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id, registrado_por,
    metodo_pago, numero_cheque, comprobante_ruta
  )
  VALUES (
    ord.sede_id,
    (CASE WHEN delta > 0 THEN 'ingreso' ELSE 'egreso' END)::transaction_type,
    'pago_cliente',
    ABS(delta),
    v_desc || ord.numero_orden,
    public.hoy_taller(ord.sede_id),
    ord.id,
    COALESCE(auth.uid(), ord.creado_por),
    v_metodo,
    v_cheque,
    v_ruta
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_order_deposit_sync"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_parqueo_orden"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.estatus = 'entregado' AND OLD.estatus IS DISTINCT FROM 'entregado' THEN
      INSERT INTO orden_parqueo (orden_id, fin_congelado)
      VALUES (NEW.id, public.hoy_taller(NEW.sede_id))
      ON CONFLICT (orden_id) DO UPDATE SET fin_congelado = public.hoy_taller(NEW.sede_id);
    ELSIF NEW.estatus IS DISTINCT FROM 'entregado' AND OLD.estatus = 'entregado' THEN
      UPDATE orden_parqueo SET fin_congelado = NULL WHERE orden_id = NEW.id;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.estatus = 'entregado' THEN
      INSERT INTO orden_parqueo (orden_id, fin_congelado)
      VALUES (NEW.id, public.hoy_taller(NEW.sede_id))
      ON CONFLICT (orden_id) DO UPDATE SET fin_congelado = public.hoy_taller(NEW.sede_id);
    END IF;
  END IF;

  PERFORM public._recalcular_parqueo(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_parqueo_orden (%): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_parqueo_orden"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_part_cost_follows_price"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.costo_unitario := COALESCE(NEW.costo_unitario, NEW.precio_venta_unitario, 0);
  ELSIF NEW.costo_unitario IS NOT DISTINCT FROM OLD.costo_unitario
        AND OLD.costo_unitario IS NOT DISTINCT FROM OLD.precio_venta_unitario THEN
    NEW.costo_unitario := COALESCE(NEW.precio_venta_unitario, 0);
  END IF;

  NEW.costo_unitario := COALESCE(NEW.costo_unitario, 0);
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_part_cost_follows_price"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_parts_expense_on_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.sync_order_parts_expense(COALESCE(NEW.orden_id, OLD.orden_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."trg_parts_expense_on_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_parts_expense_on_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.estatus = 'entregado' AND OLD.estatus IS DISTINCT FROM 'entregado' THEN
    PERFORM public.sync_order_parts_expense(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_parts_expense_on_delivery"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_perfiles_pago_sello"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.actualizado_en := now();
  NEW.actualizado_por := auth.uid();
  IF NEW.esquema = 'salario' THEN
    NEW.comision_porcentaje := NULL;
  ELSIF NEW.esquema = 'comision' THEN
    NEW.salario_monto := NULL;
    NEW.salario_periodo := NULL;
  ELSIF NEW.esquema = 'mixto' THEN
    IF NEW.salario_monto IS NULL THEN
      RAISE EXCEPTION 'Escribe el salario del pago mixto.' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_perfiles_pago_sello"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_portal_on_order_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

ALTER FUNCTION "public"."trg_portal_on_order_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_prepare_orden_media"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sede    UUID;
  v_prefijo TEXT;
BEGIN
  SELECT sede_id INTO v_sede FROM ordenes_trabajo WHERE id = NEW.orden_id;
  IF v_sede IS NULL THEN
    RAISE EXCEPTION 'La orden % no existe.', NEW.orden_id;
  END IF;

  IF NEW.avance_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM orden_avances WHERE id = NEW.avance_id AND orden_id = NEW.orden_id
  ) THEN
    RAISE EXCEPTION 'El avance no pertenece a esta orden.';
  END IF;

  -- La fila solo puede describir un archivo de la carpeta de su propia orden.
  -- Sin esto, una fila podía apuntar a un archivo de otra orden de la sede y
  -- publicarlo en el reporte equivocado.
  v_prefijo := v_sede::text || '/' || NEW.orden_id::text || '/';
  IF left(NEW.ruta, length(v_prefijo)) <> v_prefijo
     OR (NEW.ruta_miniatura IS NOT NULL AND left(NEW.ruta_miniatura, length(v_prefijo)) <> v_prefijo) THEN
    RAISE EXCEPTION 'La ruta del archivo no corresponde a la orden.' USING ERRCODE = '42501';
  END IF;

  NEW.sede_id := v_sede;
  NEW.subido_por := COALESCE(auth.uid(), NEW.subido_por);
  NEW.visible_cliente := CASE
    -- Una nota de voz de la recepción es el taller hablando: la publica un admin (20261010000003).
    WHEN NEW.origen = 'recepcion' AND NEW.tipo = 'audio' THEN false
    WHEN NEW.origen = 'recepcion' THEN true
    ELSE COALESCE((SELECT a.visible_cliente FROM orden_avances a WHERE a.id = NEW.avance_id), false)
  END;
  NEW.proveedor := 'supabase';
  NEW.creado_en := NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_prepare_orden_media"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_presupuesto_empieza_orden"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

ALTER FUNCTION "public"."trg_presupuesto_empieza_orden"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_publicar_archivos_avance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE orden_media
  SET visible_cliente = NEW.visible_cliente
  WHERE avance_id = NEW.id
    AND visible_cliente IS DISTINCT FROM NEW.visible_cliente;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."trg_publicar_archivos_avance"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_recalc_labor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.recalculate_order_totals(COALESCE(NEW.orden_id, OLD.orden_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."trg_recalc_labor"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_recalc_parts_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.recalculate_order_totals(COALESCE(NEW.orden_id, OLD.orden_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."trg_recalc_parts_totals"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_repuesto_pedido"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estado_pedido IS NOT DISTINCT FROM OLD.estado_pedido THEN
    RETURN NEW;
  END IF;
  IF NEW.estado_pedido IS NULL THEN
    NEW.pedido_en := NULL;
    NEW.recibido_en := NULL;
  ELSIF NEW.estado_pedido = 'pedido' THEN
    NEW.pedido_en := NOW();
    NEW.recibido_en := NULL;
  ELSE
    NEW.pedido_en := COALESCE(NEW.pedido_en, NOW());
    NEW.recibido_en := NOW();
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_repuesto_pedido"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_sede_inspeccion_plantilla"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  BEGIN
    PERFORM public._sembrar_plantilla_inspeccion(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_sede_inspeccion_plantilla (%): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_sede_inspeccion_plantilla"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_set_numero_orden"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;

ALTER FUNCTION "public"."trg_set_numero_orden"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_set_part_subtotal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.subtotal := NEW.cantidad * NEW.precio_venta_unitario;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_set_part_subtotal"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_set_progress_on_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.estatus IN ('finalizado', 'entregado') THEN
    NEW.porcentaje_avance := 100;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_set_progress_on_status"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trg_set_vehiculo_sede"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  SELECT sede_id INTO NEW.sede_id FROM clientes WHERE id = NEW.cliente_id;
  IF NEW.sede_id IS NULL THEN
    RAISE EXCEPTION 'El cliente % no existe o no tiene sede asignada.', NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trg_set_vehiculo_sede"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."usuarios_con_push"() RETURNS TABLE("usuario_id" "uuid", "dispositivos" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar esto.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.usuario_id, COUNT(*)::INTEGER
    FROM push_suscripciones s
    GROUP BY s.usuario_id;
END;
$$;

ALTER FUNCTION "public"."usuarios_con_push"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."vista_previa_parqueo"("p_perfil" "jsonb", "p_fecha_evento" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver la vista previa del parqueo.' USING ERRCODE = '42501';
  END IF;

  RETURN public._parqueo_calculo(
    p_perfil,
    p_fecha_evento,
    p_hasta,
    NULL,
    '{}'::jsonb
  );
END;
$$;

ALTER FUNCTION "public"."vista_previa_parqueo"("p_perfil" "jsonb", "p_fecha_evento" "date", "p_hasta" "date") OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."catalogo_trabajo_lineas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "catalogo_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "descripcion" "text" NOT NULL,
    "especialidad" "text",
    "cantidad" integer DEFAULT 1 NOT NULL,
    "precio" numeric DEFAULT 0 NOT NULL,
    "costo_unitario" numeric,
    "posicion" integer DEFAULT 0 NOT NULL,
    "horas" numeric(6,2),
    CONSTRAINT "catalogo_trabajo_lineas_cantidad_check" CHECK (("cantidad" >= 1)),
    CONSTRAINT "catalogo_trabajo_lineas_costo_unitario_check" CHECK (("costo_unitario" >= (0)::numeric)),
    CONSTRAINT "catalogo_trabajo_lineas_descripcion_check" CHECK ((("char_length"("btrim"("descripcion")) > 0) AND ("char_length"("descripcion") <= 200))),
    CONSTRAINT "catalogo_trabajo_lineas_especialidad_check" CHECK (("especialidad" = ANY (ARRAY['mecanica'::"text", 'pintura'::"text"]))),
    CONSTRAINT "catalogo_trabajo_lineas_forma_check" CHECK (((("tipo" = 'mano_obra'::"text") AND ("especialidad" IS NOT NULL) AND ("cantidad" = 1) AND ("costo_unitario" IS NULL)) OR (("tipo" = 'repuesto'::"text") AND ("especialidad" IS NULL) AND ("horas" IS NULL)))),
    CONSTRAINT "catalogo_trabajo_lineas_horas_check" CHECK (("horas" >= (0)::numeric)),
    CONSTRAINT "catalogo_trabajo_lineas_precio_check" CHECK (("precio" >= (0)::numeric)),
    CONSTRAINT "catalogo_trabajo_lineas_tipo_check" CHECK (("tipo" = ANY (ARRAY['mano_obra'::"text", 'repuesto'::"text"])))
);

ALTER TABLE "public"."catalogo_trabajo_lineas" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."catalogo_trabajos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "creado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "catalogo_trabajos_nombre_check" CHECK ((("char_length"("btrim"("nombre")) > 0) AND ("char_length"("nombre") <= 120)))
);

ALTER TABLE "public"."catalogo_trabajos" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "telefono" "text" NOT NULL,
    "email" "text" NOT NULL,
    "direccion" "text" NOT NULL,
    "notas_crm" "text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acepta_correos" boolean DEFAULT true NOT NULL,
    "correos_baja_en" timestamp with time zone,
    "idioma" "text" DEFAULT 'en'::"text" NOT NULL,
    CONSTRAINT "clientes_email_formato" CHECK ((("email" IS NULL) OR ("btrim"("email") = ''::"text") OR ("btrim"("email") ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::"text"))),
    CONSTRAINT "clientes_idioma_check" CHECK (("idioma" = ANY (ARRAY['es'::"text", 'en'::"text"])))
);

ALTER TABLE "public"."clientes" OWNER TO "postgres";

COMMENT ON COLUMN "public"."clientes"."idioma" IS 'Idioma de los correos y, si no eligió otro en el navegador, del enlace: es | en.';

CREATE TABLE IF NOT EXISTS "public"."comisiones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "base_ganancia" numeric(12,2) NOT NULL,
    "porcentaje" numeric(5,2) NOT NULL,
    "tecnicos" integer NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "pago_id" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "especialidad" "text" NOT NULL,
    "labor_id" "uuid",
    "estado" "text" DEFAULT 'sugerida'::"text" NOT NULL,
    CONSTRAINT "comisiones_especialidad_check" CHECK (("especialidad" = ANY (ARRAY['mecanica'::"text", 'pintura'::"text"]))),
    CONSTRAINT "comisiones_estado_check" CHECK (("estado" = ANY (ARRAY['sugerida'::"text", 'aceptada'::"text"]))),
    CONSTRAINT "comisiones_tecnicos_check" CHECK (("tecnicos" > 0))
);

ALTER TABLE "public"."comisiones" OWNER TO "postgres";

COMMENT ON COLUMN "public"."comisiones"."labor_id" IS 'La tarea que paga esta comisión. Nulo = reparto heredado por especialidad.';

CREATE TABLE IF NOT EXISTS "public"."finanzas_importaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "nombre_archivo" "text" NOT NULL,
    "ruta_archivo" "text" NOT NULL,
    "fecha_importacion" timestamp with time zone DEFAULT "now"() NOT NULL,
    "importado_por" "uuid",
    "total_transacciones" integer DEFAULT 0 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hash_archivo" "text"
);

ALTER TABLE "public"."finanzas_importaciones" OWNER TO "postgres";

COMMENT ON COLUMN "public"."finanzas_importaciones"."hash_archivo" IS 'SHA-256 of the imported PDF, computed in the browser. Null on batches
   imported before this column existed.';

CREATE TABLE IF NOT EXISTS "public"."finanzas_movimientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "tipo" "public"."transaction_type" NOT NULL,
    "categoria" "public"."transaction_category" NOT NULL,
    "monto" numeric(10,2) NOT NULL,
    "descripcion" "text" NOT NULL,
    "fecha" "date" NOT NULL,
    "referencia_orden_id" "uuid",
    "registrado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "importacion_id" "uuid",
    "numero_cheque" "text",
    "comision_pago_id" "uuid",
    "metodo_pago" "text",
    "comprobante_ruta" "text",
    "origen" "text" DEFAULT 'sistema'::"text" NOT NULL,
    CONSTRAINT "finanzas_movimientos_metodo_pago_check" CHECK ((("metodo_pago" IS NULL) OR ("metodo_pago" = ANY (ARRAY['efectivo'::"text", 'tarjeta'::"text", 'zelle'::"text", 'transferencia'::"text", 'cheque'::"text"])))),
    CONSTRAINT "finanzas_movimientos_monto_no_negativo" CHECK (("monto" >= (0)::numeric)),
    CONSTRAINT "finanzas_movimientos_origen_check" CHECK (("origen" = ANY (ARRAY['manual'::"text", 'sistema'::"text"])))
);

ALTER TABLE "public"."finanzas_movimientos" OWNER TO "postgres";

COMMENT ON COLUMN "public"."finanzas_movimientos"."metodo_pago" IS 'Cómo pagó (o cómo se le devolvió) el cliente: efectivo, tarjeta, zelle, transferencia o cheque.';

COMMENT ON COLUMN "public"."finanzas_movimientos"."comprobante_ruta" IS 'Foto del cheque o de la transferencia, en el bucket privado comprobantes (<sede>/...).';

CREATE TABLE IF NOT EXISTS "public"."finanzas_reglas_categorizacion" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patron" "text" NOT NULL,
    "categoria" "public"."transaction_category" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prioridad" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "public"."finanzas_reglas_categorizacion" OWNER TO "postgres";

COMMENT ON COLUMN "public"."finanzas_reglas_categorizacion"."prioridad" IS 'Higher wins. Ties are broken by the longer (more specific) pattern.';

CREATE TABLE IF NOT EXISTS "public"."historial_orden" (
    "id" bigint NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "numero_orden" "text",
    "sede_id" "uuid",
    "ocurrido_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid",
    "actor_nombre" "text",
    "origen" "text" NOT NULL,
    "entidad" "text" NOT NULL,
    "entidad_id" "uuid",
    "accion" "text" NOT NULL,
    "resumen" "text",
    "cambios" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "historial_orden_accion_check" CHECK (("accion" = ANY (ARRAY['crear'::"text", 'cambiar'::"text", 'borrar'::"text"]))),
    CONSTRAINT "historial_orden_entidad_check" CHECK (("entidad" = ANY (ARRAY['orden'::"text", 'mano_obra'::"text", 'repuesto'::"text", 'asignacion'::"text", 'deposito'::"text", 'descuento'::"text", 'presupuesto'::"text", 'archivo'::"text", 'avance'::"text", 'parqueo'::"text", 'proximo_servicio'::"text"]))),
    CONSTRAINT "historial_orden_origen_check" CHECK (("origen" = ANY (ARRAY['app'::"text", 'portal'::"text", 'sistema'::"text"])))
);

ALTER TABLE "public"."historial_orden" OWNER TO "postgres";

ALTER TABLE "public"."historial_orden" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."historial_orden_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."inspeccion_plantilla_puntos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plantilla_id" "uuid" NOT NULL,
    "seccion" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "posicion" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "inspeccion_plantilla_puntos_nombre_check" CHECK ((("char_length"("btrim"("nombre")) > 0) AND ("char_length"("nombre") <= 120))),
    CONSTRAINT "inspeccion_plantilla_puntos_seccion_check" CHECK ((("char_length"("btrim"("seccion")) > 0) AND ("char_length"("seccion") <= 120)))
);

ALTER TABLE "public"."inspeccion_plantilla_puntos" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."inspeccion_plantillas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "predeterminada" boolean DEFAULT false NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inspeccion_plantillas_nombre_check" CHECK ((("char_length"("btrim"("nombre")) > 0) AND ("char_length"("nombre") <= 120)))
);

ALTER TABLE "public"."inspeccion_plantillas" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."notificaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "sede_id" "uuid",
    "tipo" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "cuerpo" "text" DEFAULT ''::"text" NOT NULL,
    "datos" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "orden_id" "uuid",
    "url" "text",
    "leida_en" timestamp with time zone,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."notificaciones" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."numero_orden_contadores" (
    "anio" integer NOT NULL,
    "ultimo_numero" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "public"."numero_orden_contadores" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_asignaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "tipo_tarea" "text" NOT NULL,
    "estatus_tarea" "public"."task_status" DEFAULT 'pendiente'::"public"."task_status" NOT NULL,
    "fecha_asignacion" timestamp with time zone DEFAULT "now"() NOT NULL,
    "origen" "text" DEFAULT 'manual'::"text" NOT NULL,
    CONSTRAINT "orden_asignaciones_origen_check" CHECK (("origen" = ANY (ARRAY['manual'::"text", 'tarea'::"text"]))),
    CONSTRAINT "orden_asignaciones_tipo_tarea_check" CHECK (("tipo_tarea" = ANY (ARRAY['mecanica'::"text", 'pintura'::"text"])))
);

ALTER TABLE "public"."orden_asignaciones" OWNER TO "postgres";

COMMENT ON COLUMN "public"."orden_asignaciones"."origen" IS 'manual = lo asignó administración (entra al reparto heredado por especialidad); tarea = se agregó solo al darle una tarea (cobra por sus tareas).';

CREATE TABLE IF NOT EXISTS "public"."orden_avances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "usuario_id" "uuid",
    "descripcion" "text" DEFAULT ''::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visible_cliente" boolean DEFAULT false NOT NULL,
    "labor_id" "uuid"
);

ALTER TABLE "public"."orden_avances" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_hallazgos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "reportado_por" "uuid" NOT NULL,
    "descripcion" "text" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "en_reporte" boolean DEFAULT false NOT NULL,
    "texto_cliente" "text",
    "resuelto_por" "uuid",
    "resuelto_en" timestamp with time zone,
    "presupuesto_id" "uuid",
    "avance_id" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "orden_hallazgos_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'cotizado'::"text", 'descartado'::"text"])))
);

ALTER TABLE "public"."orden_hallazgos" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_inspeccion_puntos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspeccion_id" "uuid" NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "seccion" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "posicion" integer DEFAULT 0 NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "nota" "text",
    "actualizado_por" "uuid",
    "actualizado_en" timestamp with time zone,
    CONSTRAINT "orden_inspeccion_puntos_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'bien'::"text", 'atencion'::"text", 'urgente'::"text", 'no_aplica'::"text"]))),
    CONSTRAINT "orden_inspeccion_puntos_nombre_check" CHECK ((("char_length"("btrim"("nombre")) > 0) AND ("char_length"("nombre") <= 120))),
    CONSTRAINT "orden_inspeccion_puntos_nota_check" CHECK ((("nota" IS NULL) OR ("char_length"("nota") <= 500))),
    CONSTRAINT "orden_inspeccion_puntos_seccion_check" CHECK ((("char_length"("btrim"("seccion")) > 0) AND ("char_length"("seccion") <= 120)))
);

ALTER TABLE "public"."orden_inspeccion_puntos" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_inspecciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "plantilla_id" "uuid",
    "nombre" "text" NOT NULL,
    "creado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completada_en" timestamp with time zone,
    "completada_por" "uuid",
    "publicada_en" timestamp with time zone,
    CONSTRAINT "orden_inspecciones_nombre_check" CHECK ((("char_length"("btrim"("nombre")) > 0) AND ("char_length"("nombre") <= 120)))
);

ALTER TABLE "public"."orden_inspecciones" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_labor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "descripcion" "text" NOT NULL,
    "costo" numeric(10,2) NOT NULL,
    "estado" "text" DEFAULT 'borrador'::"text" NOT NULL,
    "presupuesto_id" "uuid",
    "decidido_en" timestamp with time zone,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completado_en" timestamp with time zone,
    "completado_por" "uuid",
    "especialidad" "text" NOT NULL,
    "asignado_a" "uuid",
    "reparto_heredado" boolean DEFAULT false NOT NULL,
    "trabajo_id" "uuid",
    "horas" numeric(6,2),
    CONSTRAINT "orden_labor_costo_no_negativo" CHECK (("costo" >= (0)::numeric)),
    CONSTRAINT "orden_labor_especialidad_check" CHECK (("especialidad" = ANY (ARRAY['mecanica'::"text", 'pintura'::"text"]))),
    CONSTRAINT "orden_labor_estado_valido" CHECK (("estado" = ANY (ARRAY['borrador'::"text", 'pendiente'::"text", 'aprobado'::"text", 'rechazado'::"text"]))),
    CONSTRAINT "orden_labor_horas_check" CHECK (("horas" >= (0)::numeric))
);

ALTER TABLE "public"."orden_labor" OWNER TO "postgres";

COMMENT ON COLUMN "public"."orden_labor"."asignado_a" IS 'El técnico de esta tarea: cobra su comisión. Nulo = sin técnico (nadie cobra) o, si reparto_heredado, el reparto por especialidad.';

COMMENT ON COLUMN "public"."orden_labor"."reparto_heredado" IS 'true = línea anterior a la comisión por tarea: sin técnico, se reparte por especialidad entre los asignados a mano. La app nueva crea las líneas con false.';

CREATE TABLE IF NOT EXISTS "public"."orden_labor_tiempos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "labor_id" "uuid" NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "inicio" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fin" timestamp with time zone,
    CONSTRAINT "orden_labor_tiempos_fin_check" CHECK ((("fin" IS NULL) OR ("fin" >= "inicio")))
);

ALTER TABLE "public"."orden_labor_tiempos" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "avance_id" "uuid",
    "tipo" "text" NOT NULL,
    "origen" "text" NOT NULL,
    "zona" "text",
    "ruta" "text" NOT NULL,
    "ruta_miniatura" "text",
    "mime" "text" NOT NULL,
    "bytes" bigint NOT NULL,
    "duracion_seg" numeric(6,1),
    "ancho" integer,
    "alto" integer,
    "visible_cliente" boolean DEFAULT false NOT NULL,
    "proveedor" "text" DEFAULT 'supabase'::"text" NOT NULL,
    "subido_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inspeccion_punto_id" "uuid",
    CONSTRAINT "orden_media_bytes_check" CHECK (("bytes" > 0)),
    CONSTRAINT "orden_media_duracion" CHECK ((("tipo" = 'foto'::"text") OR (("duracion_seg" IS NOT NULL) AND ("duracion_seg" <= (121)::numeric)))),
    CONSTRAINT "orden_media_origen_check" CHECK (("origen" = ANY (ARRAY['recepcion'::"text", 'avance'::"text", 'inspeccion'::"text"]))),
    CONSTRAINT "orden_media_origen_coherente" CHECK (((("origen" = 'avance'::"text") = ("avance_id" IS NOT NULL)) AND (("origen" = 'inspeccion'::"text") = ("inspeccion_punto_id" IS NOT NULL)))),
    CONSTRAINT "orden_media_tipo_check" CHECK (("tipo" = ANY (ARRAY['foto'::"text", 'video'::"text", 'audio'::"text"])))
);

ALTER TABLE "public"."orden_media" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_montos" (
    "orden_id" "uuid" NOT NULL,
    "total_repuestos" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_general" numeric(10,2) DEFAULT 0 NOT NULL,
    "deposito_inicial" numeric(10,2) DEFAULT 0 NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "descuento" numeric(12,2) DEFAULT 0 NOT NULL,
    "descuento_motivo" "text",
    CONSTRAINT "orden_montos_deposito_inicial_check" CHECK (("deposito_inicial" >= (0)::numeric)),
    CONSTRAINT "orden_montos_descuento_check" CHECK (("descuento" >= (0)::numeric))
);

ALTER TABLE "public"."orden_montos" OWNER TO "postgres";

COMMENT ON COLUMN "public"."orden_montos"."descuento" IS 'Descuento al cliente, absorbido por el taller: baja total_general, no la mano de obra ni las comisiones.';

CREATE TABLE IF NOT EXISTS "public"."orden_parqueo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "cobrar" boolean DEFAULT true NOT NULL,
    "tarifa_manual" numeric(12,2),
    "inicio_manual" "date",
    "dias_exonerados" integer DEFAULT 0 NOT NULL,
    "nota" "text",
    "perfil" "text",
    "estado" "text" DEFAULT 'inactivo'::"text" NOT NULL,
    "inicio_cobro" "date",
    "fin_congelado" "date",
    "dias_cobrados" integer DEFAULT 0 NOT NULL,
    "monto" numeric(12,2) DEFAULT 0 NOT NULL,
    "detalle" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tope_aplicado" boolean DEFAULT false NOT NULL,
    "calculado_hasta" "date",
    "calculado_en" timestamp with time zone,
    CONSTRAINT "orden_parqueo_dias_exonerados_check" CHECK (("dias_exonerados" >= 0)),
    CONSTRAINT "orden_parqueo_estado_check" CHECK (("estado" = ANY (ARRAY['inactivo'::"text", 'sin_cobro'::"text", 'orden_previa'::"text", 'esperando'::"text", 'por_empezar'::"text", 'acumulando'::"text", 'cerrado'::"text"]))),
    CONSTRAINT "orden_parqueo_perfil_check" CHECK (("perfil" = ANY (ARRAY['seguro'::"text", 'particular'::"text"]))),
    CONSTRAINT "orden_parqueo_tarifa_manual_check" CHECK (("tarifa_manual" >= (0)::numeric))
);

ALTER TABLE "public"."orden_parqueo" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."orden_repuestos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "descripcion" "text" NOT NULL,
    "numero_parte" "text",
    "cantidad" integer DEFAULT 1 NOT NULL,
    "costo_unitario" numeric(10,2) NOT NULL,
    "precio_venta_unitario" numeric(10,2) NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "estado" "text" DEFAULT 'borrador'::"text" NOT NULL,
    "presupuesto_id" "uuid",
    "decidido_en" timestamp with time zone,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "estado_pedido" "text",
    "pedido_en" timestamp with time zone,
    "recibido_en" timestamp with time zone,
    "trabajo_id" "uuid",
    CONSTRAINT "orden_repuestos_cantidad_positiva" CHECK (("cantidad" >= 1)),
    CONSTRAINT "orden_repuestos_estado_pedido_check" CHECK ((("estado_pedido" IS NULL) OR ("estado_pedido" = ANY (ARRAY['pedido'::"text", 'recibido'::"text"])))),
    CONSTRAINT "orden_repuestos_estado_valido" CHECK (("estado" = ANY (ARRAY['borrador'::"text", 'pendiente'::"text", 'aprobado'::"text", 'rechazado'::"text"]))),
    CONSTRAINT "orden_repuestos_precio_no_negativo" CHECK (("precio_venta_unitario" >= (0)::numeric))
);

ALTER TABLE "public"."orden_repuestos" OWNER TO "postgres";

COMMENT ON COLUMN "public"."orden_repuestos"."estado_pedido" IS 'pedido: la orden espera esta pieza; recibido: ya llegó. Nulo: no se sigue.';

CREATE TABLE IF NOT EXISTS "public"."orden_trabajos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "catalogo_id" "uuid",
    "creado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "orden_trabajos_titulo_check" CHECK ((("char_length"("btrim"("titulo")) > 0) AND ("char_length"("titulo") <= 120)))
);

ALTER TABLE "public"."orden_trabajos" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."parqueo_config" (
    "sede_id" "uuid" NOT NULL,
    "habilitado" boolean DEFAULT false NOT NULL,
    "vigente_desde" "date",
    "incluir_ordenes_previas" boolean DEFAULT false NOT NULL,
    "avisar_cliente" boolean DEFAULT true NOT NULL,
    "politica_es" "text",
    "politica_en" "text",
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_por" "uuid"
);

ALTER TABLE "public"."parqueo_config" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."parqueo_perfiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "habilitado" boolean DEFAULT true NOT NULL,
    "evento_inicio" "text" NOT NULL,
    "cobra_dia_evento" boolean NOT NULL,
    "dias_gracia" integer DEFAULT 0 NOT NULL,
    "gracia_dias_habiles" boolean DEFAULT false NOT NULL,
    "tope_dias" integer,
    "tope_monto" numeric(12,2),
    CONSTRAINT "parqueo_perfiles_dias_gracia_check" CHECK ((("dias_gracia" >= 0) AND ("dias_gracia" <= 365))),
    CONSTRAINT "parqueo_perfiles_evento_inicio_check" CHECK (("evento_inicio" = ANY (ARRAY['ingreso'::"text", 'lista_para_entregar'::"text"]))),
    CONSTRAINT "parqueo_perfiles_tipo_check" CHECK (("tipo" = ANY (ARRAY['seguro'::"text", 'particular'::"text"]))),
    CONSTRAINT "parqueo_perfiles_tope_dias_check" CHECK (("tope_dias" > 0)),
    CONSTRAINT "parqueo_perfiles_tope_monto_check" CHECK (("tope_monto" > (0)::numeric))
);

ALTER TABLE "public"."parqueo_perfiles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."parqueo_tramos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "perfil_id" "uuid" NOT NULL,
    "desde_dia" integer NOT NULL,
    "tarifa_diaria" numeric(12,2) NOT NULL,
    CONSTRAINT "parqueo_tramos_desde_dia_check" CHECK (("desde_dia" >= 1)),
    CONSTRAINT "parqueo_tramos_tarifa_diaria_check" CHECK (("tarifa_diaria" >= (0)::numeric))
);

ALTER TABLE "public"."parqueo_tramos" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."perfiles" (
    "id" "uuid" NOT NULL,
    "nombre_completo" "text" NOT NULL,
    "rol" "public"."user_role" NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "telefono" "text",
    "email" "text" NOT NULL,
    "avatar_url" "text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."perfiles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."perfiles_pago" (
    "usuario_id" "uuid" NOT NULL,
    "esquema" "text" DEFAULT 'comision'::"text" NOT NULL,
    "comision_porcentaje" numeric(5,2),
    "salario_monto" numeric(12,2),
    "salario_periodo" "text",
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_por" "uuid",
    CONSTRAINT "perfiles_pago_comision_porcentaje_check" CHECK ((("comision_porcentaje" IS NULL) OR (("comision_porcentaje" >= (0)::numeric) AND ("comision_porcentaje" <= (100)::numeric)))),
    CONSTRAINT "perfiles_pago_esquema_check" CHECK (("esquema" = ANY (ARRAY['comision'::"text", 'salario'::"text", 'mixto'::"text"]))),
    CONSTRAINT "perfiles_pago_salario_monto_check" CHECK ((("salario_monto" IS NULL) OR ("salario_monto" >= (0)::numeric))),
    CONSTRAINT "perfiles_pago_salario_periodo_check" CHECK ((("salario_periodo" IS NULL) OR ("salario_periodo" = ANY (ARRAY['semanal'::"text", 'quincenal'::"text", 'mensual'::"text"]))))
);

ALTER TABLE "public"."perfiles_pago" OWNER TO "postgres";

COMMENT ON TABLE "public"."perfiles_pago" IS 'Esquema de pago de cada empleado: comisión (con su porcentaje o el de la sede) o salario. Sin fila = comisión con el porcentaje de la sede.';

CREATE TABLE IF NOT EXISTS "public"."push_suscripciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "ultimo_error" "text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."push_suscripciones" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."sedes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "direccion" "text" NOT NULL,
    "telefono" "text" NOT NULL,
    "fecha_creacion" timestamp with time zone DEFAULT "now"() NOT NULL,
    "capacidad" integer DEFAULT 10 NOT NULL,
    "color_tema" "text",
    "logo_url" "text",
    "comision_porcentaje" numeric(5,2) DEFAULT 35 NOT NULL,
    "email_contacto" "text",
    "whatsapp" "text",
    "zona_horaria" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "telefonos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tarifa_hora" numeric(10,2),
    CONSTRAINT "sedes_color_tema_hex" CHECK ((("color_tema" IS NULL) OR ("color_tema" ~* '^#[0-9a-f]{6}$'::"text"))),
    CONSTRAINT "sedes_comision_porcentaje_rango" CHECK ((("comision_porcentaje" >= (0)::numeric) AND ("comision_porcentaje" <= (100)::numeric))),
    CONSTRAINT "sedes_email_contacto_formato" CHECK ((("email_contacto" IS NULL) OR ("btrim"("email_contacto") = ''::"text") OR ("btrim"("email_contacto") ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::"text"))),
    CONSTRAINT "sedes_tarifa_hora_check" CHECK (("tarifa_hora" >= (0)::numeric)),
    CONSTRAINT "sedes_telefonos_es_arreglo" CHECK (("jsonb_typeof"("telefonos") = 'array'::"text"))
);

ALTER TABLE "public"."sedes" OWNER TO "postgres";

COMMENT ON COLUMN "public"."sedes"."zona_horaria" IS 'Zona horaria del taller (IANA). Fecha de los movimientos automáticos y de los recordatorios.';

CREATE TABLE IF NOT EXISTS "public"."traducciones" (
    "sede_id" "uuid" NOT NULL,
    "md5_hash" "text" NOT NULL,
    "idioma_destino" "text" NOT NULL,
    "texto_original" "text" NOT NULL,
    "traduccion" "text" NOT NULL,
    "origen" "text" DEFAULT 'auto'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "traducciones_idioma_destino_check" CHECK (("idioma_destino" = ANY (ARRAY['es'::"text", 'en'::"text"]))),
    CONSTRAINT "traducciones_origen_check" CHECK (("origen" = ANY (ARRAY['auto'::"text", 'manual'::"text"])))
);

ALTER TABLE "public"."traducciones" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."vehiculos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "marca" "text" NOT NULL,
    "modelo" "text" NOT NULL,
    "anio" integer NOT NULL,
    "vin" "text" NOT NULL,
    "placa" "text",
    "color" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sede_id" "uuid" NOT NULL,
    "placa_estado" "text",
    CONSTRAINT "vehiculos_placa_estado_requiere_placa" CHECK ((("placa_estado" IS NULL) OR ("placa" IS NOT NULL)))
);

ALTER TABLE "public"."vehiculos" OWNER TO "postgres";

COMMENT ON COLUMN "public"."vehiculos"."placa_estado" IS 'Two-letter US state/territory code that issued the plate (NULL when unknown).';

ALTER TABLE ONLY "public"."catalogo_trabajo_lineas"
    ADD CONSTRAINT "catalogo_trabajo_lineas_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."catalogo_trabajos"
    ADD CONSTRAINT "catalogo_trabajos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."cola_envios"
    ADD CONSTRAINT "cola_envios_canal_check" CHECK (("canal" = ANY (ARRAY['push'::"text", 'email'::"text", 'traduccion'::"text"]))) NOT VALID;

ALTER TABLE ONLY "public"."cola_envios"
    ADD CONSTRAINT "cola_envios_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."comision_pagos"
    ADD CONSTRAINT "comision_pagos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."comisiones"
    ADD CONSTRAINT "comisiones_orden_usuario_especialidad_tarea_key" UNIQUE NULLS NOT DISTINCT ("orden_id", "usuario_id", "especialidad", "labor_id");

ALTER TABLE ONLY "public"."comisiones"
    ADD CONSTRAINT "comisiones_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."finanzas_importaciones"
    ADD CONSTRAINT "finanzas_importaciones_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."finanzas_movimientos"
    ADD CONSTRAINT "finanzas_movimientos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."finanzas_reglas_categorizacion"
    ADD CONSTRAINT "finanzas_reglas_categorizacion_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."historial_orden"
    ADD CONSTRAINT "historial_orden_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."inspeccion_plantilla_puntos"
    ADD CONSTRAINT "inspeccion_plantilla_puntos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."inspeccion_plantillas"
    ADD CONSTRAINT "inspeccion_plantillas_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."notificaciones"
    ADD CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."numero_orden_contadores"
    ADD CONSTRAINT "numero_orden_contadores_pkey" PRIMARY KEY ("anio");

ALTER TABLE ONLY "public"."orden_asignaciones"
    ADD CONSTRAINT "orden_asignaciones_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_asignaciones"
    ADD CONSTRAINT "orden_asignaciones_unica" UNIQUE ("orden_id", "usuario_id", "tipo_tarea");

ALTER TABLE ONLY "public"."orden_avances"
    ADD CONSTRAINT "orden_avances_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_enlaces"
    ADD CONSTRAINT "orden_enlaces_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_enlaces"
    ADD CONSTRAINT "orden_enlaces_token_key" UNIQUE ("token");

ALTER TABLE "public"."orden_hallazgos"
    ADD CONSTRAINT "orden_hallazgos_descripcion_largo" CHECK ((("length"("btrim"("descripcion")) >= 1) AND ("length"("btrim"("descripcion")) <= 1000))) NOT VALID;

ALTER TABLE ONLY "public"."orden_hallazgos"
    ADD CONSTRAINT "orden_hallazgos_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."orden_hallazgos"
    ADD CONSTRAINT "orden_hallazgos_texto_cliente" CHECK (((("texto_cliente" IS NULL) OR ("length"("texto_cliente") <= 1000)) AND ((NOT "en_reporte") OR (NULLIF("btrim"("texto_cliente"), ''::"text") IS NOT NULL)))) NOT VALID;

ALTER TABLE ONLY "public"."orden_inspeccion_puntos"
    ADD CONSTRAINT "orden_inspeccion_puntos_id_orden_id_unique" UNIQUE ("id", "orden_id");

ALTER TABLE ONLY "public"."orden_inspeccion_puntos"
    ADD CONSTRAINT "orden_inspeccion_puntos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_inspecciones"
    ADD CONSTRAINT "orden_inspecciones_orden_id_unique" UNIQUE ("orden_id");

ALTER TABLE ONLY "public"."orden_inspecciones"
    ADD CONSTRAINT "orden_inspecciones_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_labor"
    ADD CONSTRAINT "orden_labor_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_labor_tiempos"
    ADD CONSTRAINT "orden_labor_tiempos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_media"
    ADD CONSTRAINT "orden_media_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_media"
    ADD CONSTRAINT "orden_media_ruta_key" UNIQUE ("ruta");

ALTER TABLE ONLY "public"."orden_montos"
    ADD CONSTRAINT "orden_montos_pkey" PRIMARY KEY ("orden_id");

ALTER TABLE ONLY "public"."orden_parqueo"
    ADD CONSTRAINT "orden_parqueo_orden_id_key" UNIQUE ("orden_id");

ALTER TABLE ONLY "public"."orden_parqueo"
    ADD CONSTRAINT "orden_parqueo_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_proximo_servicio"
    ADD CONSTRAINT "orden_proximo_servicio_pkey" PRIMARY KEY ("orden_id");

ALTER TABLE ONLY "public"."orden_proximo_servicio"
    ADD CONSTRAINT "orden_proximo_servicio_token_key" UNIQUE ("token");

ALTER TABLE "public"."orden_repuestos"
    ADD CONSTRAINT "orden_repuestos_costo_unitario_check" CHECK (("costo_unitario" >= (0)::numeric)) NOT VALID;

ALTER TABLE ONLY "public"."orden_repuestos"
    ADD CONSTRAINT "orden_repuestos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orden_trabajos"
    ADD CONSTRAINT "orden_trabajos_id_orden_id_unique" UNIQUE ("id", "orden_id");

ALTER TABLE ONLY "public"."orden_trabajos"
    ADD CONSTRAINT "orden_trabajos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_numero_orden_key" UNIQUE ("numero_orden");

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parqueo_config"
    ADD CONSTRAINT "parqueo_config_pkey" PRIMARY KEY ("sede_id");

ALTER TABLE ONLY "public"."parqueo_perfiles"
    ADD CONSTRAINT "parqueo_perfiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parqueo_perfiles"
    ADD CONSTRAINT "parqueo_perfiles_sede_id_tipo_key" UNIQUE ("sede_id", "tipo");

ALTER TABLE ONLY "public"."parqueo_tramos"
    ADD CONSTRAINT "parqueo_tramos_perfil_id_desde_dia_key" UNIQUE ("perfil_id", "desde_dia");

ALTER TABLE ONLY "public"."parqueo_tramos"
    ADD CONSTRAINT "parqueo_tramos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_email_key" UNIQUE ("email");

ALTER TABLE ONLY "public"."perfiles_pago"
    ADD CONSTRAINT "perfiles_pago_pkey" PRIMARY KEY ("usuario_id");

ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_orden_id_numero_key" UNIQUE ("orden_id", "numero");

ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."push_suscripciones"
    ADD CONSTRAINT "push_suscripciones_endpoint_key" UNIQUE ("endpoint");

ALTER TABLE ONLY "public"."push_suscripciones"
    ADD CONSTRAINT "push_suscripciones_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."sedes"
    ADD CONSTRAINT "sedes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."traducciones"
    ADD CONSTRAINT "traducciones_pkey" PRIMARY KEY ("sede_id", "md5_hash", "idioma_destino");

ALTER TABLE ONLY "public"."vehiculos"
    ADD CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id");

CREATE INDEX "comision_pagos_sede_idx" ON "public"."comision_pagos" USING "btree" ("sede_id", "fecha_pago" DESC);

CREATE INDEX "comision_pagos_usuario_idx" ON "public"."comision_pagos" USING "btree" ("usuario_id", "fecha_pago" DESC);

CREATE INDEX "comisiones_sede_idx" ON "public"."comisiones" USING "btree" ("sede_id", "creado_en" DESC);

CREATE INDEX "comisiones_usuario_pendiente_idx" ON "public"."comisiones" USING "btree" ("usuario_id") WHERE ("pago_id" IS NULL);

CREATE INDEX "idx_catalogo_trabajo_lineas_catalogo_id" ON "public"."catalogo_trabajo_lineas" USING "btree" ("catalogo_id");

CREATE INDEX "idx_catalogo_trabajos_creado_por" ON "public"."catalogo_trabajos" USING "btree" ("creado_por");

CREATE INDEX "idx_catalogo_trabajos_sede_id" ON "public"."catalogo_trabajos" USING "btree" ("sede_id");

CREATE UNIQUE INDEX "idx_catalogo_trabajos_sede_nombre" ON "public"."catalogo_trabajos" USING "btree" ("sede_id", "lower"("btrim"("nombre")));

CREATE INDEX "idx_clientes_sede" ON "public"."clientes" USING "btree" ("sede_id");

CREATE INDEX "idx_cola_envios_orden" ON "public"."cola_envios" USING "btree" ("orden_id", "creado_en" DESC);

CREATE INDEX "idx_cola_envios_pendientes" ON "public"."cola_envios" USING "btree" ("enviar_despues_de") WHERE ("estado" = 'pendiente'::"text");

CREATE INDEX "idx_comision_pagos_pagado_por" ON "public"."comision_pagos" USING "btree" ("pagado_por");

CREATE INDEX "idx_comisiones_labor" ON "public"."comisiones" USING "btree" ("labor_id") WHERE ("labor_id" IS NOT NULL);

CREATE INDEX "idx_comisiones_pago" ON "public"."comisiones" USING "btree" ("pago_id");

CREATE UNIQUE INDEX "idx_finanzas_importaciones_hash" ON "public"."finanzas_importaciones" USING "btree" ("sede_id", "hash_archivo") WHERE ("hash_archivo" IS NOT NULL);

CREATE INDEX "idx_finanzas_importaciones_importado_por" ON "public"."finanzas_importaciones" USING "btree" ("importado_por");

CREATE INDEX "idx_finanzas_movimientos_comision_pago" ON "public"."finanzas_movimientos" USING "btree" ("comision_pago_id") WHERE ("comision_pago_id" IS NOT NULL);

CREATE INDEX "idx_finanzas_movimientos_importacion" ON "public"."finanzas_movimientos" USING "btree" ("importacion_id");

CREATE INDEX "idx_finanzas_movimientos_orden" ON "public"."finanzas_movimientos" USING "btree" ("referencia_orden_id") WHERE ("referencia_orden_id" IS NOT NULL);

CREATE INDEX "idx_finanzas_movimientos_registrado_por" ON "public"."finanzas_movimientos" USING "btree" ("registrado_por");

CREATE INDEX "idx_finanzas_movimientos_sede_fecha" ON "public"."finanzas_movimientos" USING "btree" ("sede_id", "fecha" DESC);

CREATE INDEX "idx_historial_orden_orden" ON "public"."historial_orden" USING "btree" ("orden_id", "ocurrido_en" DESC, "id" DESC);

CREATE INDEX "idx_inspeccion_plantilla_puntos_plantilla_id" ON "public"."inspeccion_plantilla_puntos" USING "btree" ("plantilla_id");

CREATE INDEX "idx_inspeccion_plantillas_sede_id" ON "public"."inspeccion_plantillas" USING "btree" ("sede_id");

CREATE UNIQUE INDEX "idx_inspeccion_plantillas_sede_predeterminada" ON "public"."inspeccion_plantillas" USING "btree" ("sede_id") WHERE ("predeterminada" = true);

CREATE INDEX "idx_notificaciones_no_leidas" ON "public"."notificaciones" USING "btree" ("usuario_id") WHERE ("leida_en" IS NULL);

CREATE INDEX "idx_notificaciones_orden" ON "public"."notificaciones" USING "btree" ("orden_id");

CREATE INDEX "idx_notificaciones_sede" ON "public"."notificaciones" USING "btree" ("sede_id");

CREATE INDEX "idx_notificaciones_usuario" ON "public"."notificaciones" USING "btree" ("usuario_id", "creado_en" DESC);

CREATE INDEX "idx_orden_asignaciones_orden" ON "public"."orden_asignaciones" USING "btree" ("orden_id");

CREATE INDEX "idx_orden_asignaciones_usuario" ON "public"."orden_asignaciones" USING "btree" ("usuario_id", "orden_id");

CREATE INDEX "idx_orden_avances_labor_id" ON "public"."orden_avances" USING "btree" ("labor_id");

CREATE INDEX "idx_orden_avances_orden_id" ON "public"."orden_avances" USING "btree" ("orden_id");

CREATE INDEX "idx_orden_avances_usuario" ON "public"."orden_avances" USING "btree" ("usuario_id");

CREATE INDEX "idx_orden_enlaces_creado_por" ON "public"."orden_enlaces" USING "btree" ("creado_por");

CREATE INDEX "idx_orden_enlaces_revocado_por" ON "public"."orden_enlaces" USING "btree" ("revocado_por");

CREATE INDEX "idx_orden_enlaces_sede" ON "public"."orden_enlaces" USING "btree" ("sede_id");

CREATE INDEX "idx_orden_hallazgos_avance_id" ON "public"."orden_hallazgos" USING "btree" ("avance_id") WHERE ("avance_id" IS NOT NULL);

CREATE INDEX "idx_orden_hallazgos_orden_id" ON "public"."orden_hallazgos" USING "btree" ("orden_id");

CREATE INDEX "idx_orden_hallazgos_presupuesto_id" ON "public"."orden_hallazgos" USING "btree" ("presupuesto_id");

CREATE INDEX "idx_orden_hallazgos_reportado_por" ON "public"."orden_hallazgos" USING "btree" ("reportado_por");

CREATE INDEX "idx_orden_hallazgos_resuelto_por" ON "public"."orden_hallazgos" USING "btree" ("resuelto_por");

CREATE INDEX "idx_orden_hallazgos_sede_id" ON "public"."orden_hallazgos" USING "btree" ("sede_id");

CREATE INDEX "idx_orden_inspeccion_puntos_actualizado_por" ON "public"."orden_inspeccion_puntos" USING "btree" ("actualizado_por");

CREATE INDEX "idx_orden_inspeccion_puntos_inspeccion_id" ON "public"."orden_inspeccion_puntos" USING "btree" ("inspeccion_id");

CREATE INDEX "idx_orden_inspeccion_puntos_orden_id" ON "public"."orden_inspeccion_puntos" USING "btree" ("orden_id");

CREATE INDEX "idx_orden_inspecciones_completada_por" ON "public"."orden_inspecciones" USING "btree" ("completada_por");

CREATE INDEX "idx_orden_inspecciones_creado_por" ON "public"."orden_inspecciones" USING "btree" ("creado_por");

CREATE INDEX "idx_orden_inspecciones_orden_id" ON "public"."orden_inspecciones" USING "btree" ("orden_id");

CREATE INDEX "idx_orden_inspecciones_plantilla_id" ON "public"."orden_inspecciones" USING "btree" ("plantilla_id");

CREATE INDEX "idx_orden_labor_asignado" ON "public"."orden_labor" USING "btree" ("asignado_a", "orden_id") WHERE ("asignado_a" IS NOT NULL);

CREATE INDEX "idx_orden_labor_completado_por" ON "public"."orden_labor" USING "btree" ("completado_por");

CREATE INDEX "idx_orden_labor_orden" ON "public"."orden_labor" USING "btree" ("orden_id");

CREATE INDEX "idx_orden_labor_presupuesto" ON "public"."orden_labor" USING "btree" ("presupuesto_id") WHERE ("presupuesto_id" IS NOT NULL);

CREATE UNIQUE INDEX "idx_orden_labor_tiempos_activo" ON "public"."orden_labor_tiempos" USING "btree" ("usuario_id") WHERE ("fin" IS NULL);

CREATE INDEX "idx_orden_labor_tiempos_labor_id" ON "public"."orden_labor_tiempos" USING "btree" ("labor_id");

CREATE INDEX "idx_orden_labor_tiempos_orden_id" ON "public"."orden_labor_tiempos" USING "btree" ("orden_id");

CREATE INDEX "idx_orden_labor_tiempos_usuario_id" ON "public"."orden_labor_tiempos" USING "btree" ("usuario_id");

CREATE INDEX "idx_orden_labor_trabajo" ON "public"."orden_labor" USING "btree" ("trabajo_id", "orden_id");

CREATE INDEX "idx_orden_labor_trabajo_id" ON "public"."orden_labor" USING "btree" ("trabajo_id");

CREATE INDEX "idx_orden_media_avance" ON "public"."orden_media" USING "btree" ("avance_id") WHERE ("avance_id" IS NOT NULL);

CREATE INDEX "idx_orden_media_inspeccion_punto" ON "public"."orden_media" USING "btree" ("inspeccion_punto_id", "orden_id");

CREATE INDEX "idx_orden_media_inspeccion_punto_id" ON "public"."orden_media" USING "btree" ("inspeccion_punto_id");

CREATE INDEX "idx_orden_media_orden" ON "public"."orden_media" USING "btree" ("orden_id", "creado_en");

CREATE INDEX "idx_orden_media_sede" ON "public"."orden_media" USING "btree" ("sede_id");

CREATE INDEX "idx_orden_media_subido_por" ON "public"."orden_media" USING "btree" ("subido_por");

CREATE INDEX "idx_orden_proximo_servicio_programado_por" ON "public"."orden_proximo_servicio" USING "btree" ("programado_por");

CREATE INDEX "idx_orden_proximo_servicio_sede_id" ON "public"."orden_proximo_servicio" USING "btree" ("sede_id");

CREATE INDEX "idx_orden_proximo_servicio_sugerido_por" ON "public"."orden_proximo_servicio" USING "btree" ("sugerido_por");

CREATE INDEX "idx_orden_repuestos_orden" ON "public"."orden_repuestos" USING "btree" ("orden_id");

CREATE INDEX "idx_orden_repuestos_presupuesto" ON "public"."orden_repuestos" USING "btree" ("presupuesto_id") WHERE ("presupuesto_id" IS NOT NULL);

CREATE INDEX "idx_orden_repuestos_trabajo" ON "public"."orden_repuestos" USING "btree" ("trabajo_id", "orden_id");

CREATE INDEX "idx_orden_repuestos_trabajo_id" ON "public"."orden_repuestos" USING "btree" ("trabajo_id");

CREATE INDEX "idx_orden_trabajos_catalogo_id" ON "public"."orden_trabajos" USING "btree" ("catalogo_id");

CREATE INDEX "idx_orden_trabajos_creado_por" ON "public"."orden_trabajos" USING "btree" ("creado_por");

CREATE INDEX "idx_orden_trabajos_orden_id" ON "public"."orden_trabajos" USING "btree" ("orden_id");

CREATE INDEX "idx_ordenes_archivo" ON "public"."ordenes_trabajo" USING "btree" ("sede_id", "fecha_finalizacion") WHERE ("estatus" = 'entregado'::"public"."order_status");

CREATE INDEX "idx_ordenes_entrega_pendiente" ON "public"."ordenes_trabajo" USING "btree" ("fecha_estimada_entrega") WHERE ("estatus" <> ALL (ARRAY['finalizado'::"public"."order_status", 'entregado'::"public"."order_status"]));

CREATE INDEX "idx_ordenes_trabajo_cliente" ON "public"."ordenes_trabajo" USING "btree" ("cliente_id");

CREATE INDEX "idx_ordenes_trabajo_creado_por" ON "public"."ordenes_trabajo" USING "btree" ("creado_por");

CREATE INDEX "idx_ordenes_trabajo_lista_para_entregar_por" ON "public"."ordenes_trabajo" USING "btree" ("lista_para_entregar_por");

CREATE INDEX "idx_ordenes_trabajo_sede_creado" ON "public"."ordenes_trabajo" USING "btree" ("sede_id", "creado_en" DESC);

CREATE INDEX "idx_ordenes_trabajo_vehiculo" ON "public"."ordenes_trabajo" USING "btree" ("vehiculo_id");

CREATE INDEX "idx_parqueo_config_actualizado_por" ON "public"."parqueo_config" USING "btree" ("actualizado_por");

CREATE INDEX "idx_perfiles_pago_actualizado_por" ON "public"."perfiles_pago" USING "btree" ("actualizado_por");

CREATE INDEX "idx_perfiles_sede" ON "public"."perfiles" USING "btree" ("sede_id");

CREATE INDEX "idx_presupuestos_enviado_por" ON "public"."presupuestos" USING "btree" ("enviado_por");

CREATE INDEX "idx_presupuestos_enviados" ON "public"."presupuestos" USING "btree" ("creado_en") WHERE ("estado" = 'enviado'::"text");

CREATE INDEX "idx_presupuestos_respondido_por" ON "public"."presupuestos" USING "btree" ("respondido_por_perfil");

CREATE INDEX "idx_presupuestos_sede" ON "public"."presupuestos" USING "btree" ("sede_id");

CREATE INDEX "idx_push_suscripciones_usuario" ON "public"."push_suscripciones" USING "btree" ("usuario_id");

CREATE UNIQUE INDEX "idx_reglas_patron_unico" ON "public"."finanzas_reglas_categorizacion" USING "btree" ("lower"("patron"));

CREATE INDEX "idx_vehiculos_cliente" ON "public"."vehiculos" USING "btree" ("cliente_id");

CREATE INDEX "idx_vehiculos_sede_id" ON "public"."vehiculos" USING "btree" ("sede_id");

CREATE UNIQUE INDEX "perfiles_email_unique_idx" ON "public"."perfiles" USING "btree" ("lower"("email"));

CREATE UNIQUE INDEX "uq_cola_envios_dedupe" ON "public"."cola_envios" USING "btree" ("clave_dedupe") WHERE (("clave_dedupe" IS NOT NULL) AND ("estado" = 'pendiente'::"text"));

CREATE UNIQUE INDEX "uq_cola_envios_traduccion_pendiente" ON "public"."cola_envios" USING "btree" ("orden_id") WHERE (("canal" = 'traduccion'::"text") AND ("estado" = 'pendiente'::"text"));

CREATE UNIQUE INDEX "uq_orden_enlaces_activo" ON "public"."orden_enlaces" USING "btree" ("orden_id") WHERE ("revocado_en" IS NULL);

CREATE UNIQUE INDEX "uq_presupuestos_abierto" ON "public"."presupuestos" USING "btree" ("orden_id") WHERE ("estado" = 'enviado'::"text");

CREATE UNIQUE INDEX "uq_vehiculos_placa" ON "public"."vehiculos" USING "btree" ("upper"("btrim"("placa")), COALESCE("upper"("btrim"("placa_estado")), ''::"text")) WHERE (("placa" IS NOT NULL) AND ("btrim"("placa") <> ''::"text"));

CREATE UNIQUE INDEX "uq_vehiculos_vin" ON "public"."vehiculos" USING "btree" ("upper"("btrim"("vin"))) WHERE (("vin" IS NOT NULL) AND ("btrim"("vin") <> ''::"text"));

CREATE OR REPLACE TRIGGER "avance_labor_match" BEFORE INSERT OR UPDATE ON "public"."orden_avances" FOR EACH ROW EXECUTE FUNCTION "public"."trg_avance_labor_match"();

CREATE OR REPLACE TRIGGER "trg_a_orden_entregada_no_se_borra" BEFORE DELETE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_order_delete_entregada"();

CREATE OR REPLACE TRIGGER "trg_assignment_commissions" AFTER INSERT OR DELETE OR UPDATE ON "public"."orden_asignaciones" FOR EACH ROW EXECUTE FUNCTION "public"."trg_commissions_on_assignment"();

CREATE OR REPLACE TRIGGER "trg_assignment_notify" AFTER INSERT OR DELETE ON "public"."orden_asignaciones" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_assignment"();

CREATE OR REPLACE TRIGGER "trg_assignment_owner_immutable" BEFORE UPDATE ON "public"."orden_asignaciones" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_row_owner_immutable"();

CREATE OR REPLACE TRIGGER "trg_assignment_takes_tasks" AFTER INSERT ON "public"."orden_asignaciones" FOR EACH ROW WHEN (("new"."origen" = 'manual'::"text")) EXECUTE FUNCTION "public"."trg_asignacion_toma_tareas"();

CREATE OR REPLACE TRIGGER "trg_assignment_tasks_guard" BEFORE DELETE OR UPDATE OF "origen", "tipo_tarea" ON "public"."orden_asignaciones" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_asignacion_con_tareas"();

CREATE OR REPLACE TRIGGER "trg_assignments_delivered_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."orden_asignaciones" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_delivered_order_children"();

CREATE OR REPLACE TRIGGER "trg_avance_hallazgo_interno" BEFORE UPDATE OF "visible_cliente" ON "public"."orden_avances" FOR EACH ROW EXECUTE FUNCTION "public"."trg_avance_hallazgo_interno"();

CREATE OR REPLACE TRIGGER "trg_avance_owner_immutable" BEFORE UPDATE ON "public"."orden_avances" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_row_owner_immutable"();

CREATE OR REPLACE TRIGGER "trg_avance_publicar_archivos" AFTER UPDATE OF "visible_cliente" ON "public"."orden_avances" FOR EACH ROW EXECUTE FUNCTION "public"."trg_publicar_archivos_avance"();

CREATE OR REPLACE TRIGGER "trg_cleanup_order_finance" BEFORE DELETE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_order_finance"();

CREATE OR REPLACE TRIGGER "trg_commission_notify" AFTER INSERT ON "public"."comisiones" REFERENCING NEW TABLE AS "nuevas" FOR EACH STATEMENT EXECUTE FUNCTION "public"."trg_notify_commission"();

CREATE OR REPLACE TRIGGER "trg_finanzas_origen" BEFORE INSERT ON "public"."finanzas_movimientos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_finanzas_origen"();

CREATE OR REPLACE TRIGGER "trg_guard_inspeccion_media" BEFORE INSERT OR DELETE OR UPDATE OF "inspeccion_punto_id" ON "public"."orden_media" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_inspeccion_media"();

CREATE OR REPLACE TRIGGER "trg_guard_order_insert" BEFORE INSERT ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_order_insert"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER INSERT OR DELETE OR UPDATE OF "tipo_tarea", "origen" ON "public"."orden_asignaciones" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER INSERT OR DELETE OR UPDATE OF "descripcion", "visible_cliente" ON "public"."orden_avances" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER INSERT OR DELETE OR UPDATE OF "descripcion", "costo", "horas", "especialidad", "estado", "completado_en", "asignado_a" ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER INSERT OR DELETE OR UPDATE OF "visible_cliente" ON "public"."orden_media" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER UPDATE OF "deposito_inicial", "descuento", "descuento_motivo" ON "public"."orden_montos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER INSERT OR UPDATE OF "cobrar", "tarifa_manual", "inicio_manual", "dias_exonerados", "nota" ON "public"."orden_parqueo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER INSERT OR UPDATE OF "fecha", "millas", "nota", "sugerido_fecha", "sugerido_millas", "sugerido_nota" ON "public"."orden_proximo_servicio" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER INSERT OR DELETE OR UPDATE OF "descripcion", "cantidad", "precio_venta_unitario", "costo_unitario", "estado", "estado_pedido" ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER INSERT OR DELETE OR UPDATE OF "estatus", "porcentaje_avance", "tipo_trabajo", "fecha_estimada_entrega", "millas_ingreso", "nivel_gasolina", "inspeccion_360_notas", "cliente_id", "vehiculo_id", "firma_fecha", "motivo_autorizacion", "archivada_en", "retirada_sin_reparar", "lista_para_entregar_en", "con_seguro", "aseguradora", "numero_reclamo", "marcas_danos" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_historial" AFTER INSERT OR UPDATE OF "estado", "total_propuesto" ON "public"."presupuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_historial"();

CREATE OR REPLACE TRIGGER "trg_labor_avance" AFTER INSERT OR DELETE OR UPDATE OF "completado_en", "estado", "costo" ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_avance_por_tareas"();

CREATE OR REPLACE TRIGGER "trg_labor_cerrar_reloj" AFTER UPDATE OF "completado_en" ON "public"."orden_labor" FOR EACH ROW WHEN ((("new"."completado_en" IS NOT NULL) AND ("old"."completado_en" IS NULL))) EXECUTE FUNCTION "public"."trg_labor_cerrar_reloj"();

CREATE OR REPLACE TRIGGER "trg_labor_commissions" AFTER INSERT OR DELETE OR UPDATE OF "estado", "costo", "asignado_a", "reparto_heredado", "especialidad", "orden_id" ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_commissions_on_labor"();

CREATE OR REPLACE TRIGGER "trg_labor_delivered_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_delivered_order_children"();

CREATE OR REPLACE TRIGGER "trg_labor_especialidad" BEFORE INSERT ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_labor_especialidad"();

CREATE OR REPLACE TRIGGER "trg_labor_quote_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_linea_presupuesto"();

CREATE OR REPLACE TRIGGER "trg_labor_tecnico_asignado" AFTER INSERT OR UPDATE OF "asignado_a" ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_labor_tecnico_asignado"();

CREATE OR REPLACE TRIGGER "trg_labor_tecnico_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_labor_tecnico"();

CREATE OR REPLACE TRIGGER "trg_labor_totals" AFTER INSERT OR DELETE OR UPDATE ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recalc_labor"();

CREATE OR REPLACE TRIGGER "trg_marcas_danos_firmadas" BEFORE UPDATE OF "marcas_danos" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_marcas_danos_firmadas"();

CREATE OR REPLACE TRIGGER "trg_notificacion_guard" BEFORE UPDATE ON "public"."notificaciones" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_notificacion"();

CREATE OR REPLACE TRIGGER "trg_numero_orden" BEFORE INSERT ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_numero_orden"();

CREATE OR REPLACE TRIGGER "trg_orden_avances_traducir" AFTER INSERT OR UPDATE OF "descripcion", "visible_cliente" ON "public"."orden_avances" FOR EACH ROW EXECUTE FUNCTION "public"."trg_encolar_traduccion"();

CREATE OR REPLACE TRIGGER "trg_orden_hallazgos_traducir" AFTER INSERT OR UPDATE OF "texto_cliente", "en_reporte" ON "public"."orden_hallazgos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_encolar_traduccion"();

CREATE OR REPLACE TRIGGER "trg_orden_labor_traducir" AFTER INSERT OR UPDATE OF "descripcion" ON "public"."orden_labor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_encolar_traduccion"();

CREATE OR REPLACE TRIGGER "trg_orden_media_guard" BEFORE UPDATE ON "public"."orden_media" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_orden_media"();

CREATE OR REPLACE TRIGGER "trg_orden_media_prepare" BEFORE INSERT ON "public"."orden_media" FOR EACH ROW EXECUTE FUNCTION "public"."trg_prepare_orden_media"();

CREATE OR REPLACE TRIGGER "trg_orden_proximo_servicio_traducir" AFTER INSERT OR UPDATE OF "nota" ON "public"."orden_proximo_servicio" FOR EACH ROW EXECUTE FUNCTION "public"."trg_encolar_traduccion"();

CREATE OR REPLACE TRIGGER "trg_orden_repuestos_traducir" AFTER INSERT OR UPDATE OF "descripcion" ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_encolar_traduccion"();

CREATE OR REPLACE TRIGGER "trg_orden_sede_coherente" BEFORE INSERT OR UPDATE OF "cliente_id", "vehiculo_id", "sede_id" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_check_orden_sede"();

CREATE OR REPLACE TRIGGER "trg_ordenes_trabajo_traducir" AFTER UPDATE OF "inspeccion_360_notas" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_encolar_traduccion"();

CREATE OR REPLACE TRIGGER "trg_order_auth_request_notify" AFTER UPDATE OF "estatus", "motivo_autorizacion" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_auth_request"();

CREATE OR REPLACE TRIGGER "trg_order_commissions" AFTER UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_commissions_on_order"();

CREATE OR REPLACE TRIGGER "trg_order_created_notify" AFTER INSERT ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_order_created"();

CREATE OR REPLACE TRIGGER "trg_order_delete_paid_guard" BEFORE DELETE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_order_delete_paid"();

CREATE OR REPLACE TRIGGER "trg_order_delivery_payment" AFTER UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."handle_order_delivery_payment"();

CREATE OR REPLACE TRIGGER "trg_order_delivery_reversal" AFTER UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_order_delivery_reversal"();

CREATE OR REPLACE TRIGGER "trg_order_finished_notify" AFTER UPDATE OF "estatus" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_order_finished"();

CREATE OR REPLACE TRIGGER "trg_order_link_on_create" AFTER INSERT ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_enlace_al_crear_orden"();

CREATE OR REPLACE TRIGGER "trg_order_lista_guard" BEFORE INSERT OR UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_lista_para_entregar"();

CREATE OR REPLACE TRIGGER "trg_order_money_guard" BEFORE UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_order_money"();

CREATE OR REPLACE TRIGGER "trg_order_montos_create" AFTER INSERT ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_create_order_montos"();

CREATE OR REPLACE TRIGGER "trg_order_montos_delivered_adjustment" AFTER UPDATE ON "public"."orden_montos" FOR EACH ROW EXECUTE FUNCTION "public"."handle_delivered_order_adjustment"();

CREATE OR REPLACE TRIGGER "trg_order_montos_deposit" AFTER INSERT OR UPDATE OF "deposito_inicial" ON "public"."orden_montos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_order_deposit_sync"();

CREATE OR REPLACE TRIGGER "trg_order_montos_guard" BEFORE UPDATE ON "public"."orden_montos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_order_montos"();

CREATE OR REPLACE TRIGGER "trg_order_parts_expense" AFTER UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_parts_expense_on_delivery"();

CREATE OR REPLACE TRIGGER "trg_order_portal" AFTER UPDATE OF "firma_ruta", "estatus" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_portal_on_order_change"();

CREATE OR REPLACE TRIGGER "trg_order_quote_delivery_guard" BEFORE UPDATE OF "estatus" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_entrega_con_presupuesto"();

CREATE OR REPLACE TRIGGER "trg_order_retirada_guard" BEFORE INSERT OR UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_retirada"();

CREATE OR REPLACE TRIGGER "trg_order_technician_guard" BEFORE UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_order_technician"();

CREATE OR REPLACE TRIGGER "trg_order_unarchive_on_reopen" BEFORE UPDATE OF "estatus" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_desarchivar_al_reabrir"();

CREATE OR REPLACE TRIGGER "trg_parqueo_orden" AFTER INSERT OR UPDATE OF "estatus", "con_seguro", "lista_para_entregar_en", "fecha_ingreso" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_parqueo_orden"();

CREATE OR REPLACE TRIGGER "trg_part_cost_passthrough" BEFORE INSERT OR UPDATE ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_part_cost_follows_price"();

CREATE OR REPLACE TRIGGER "trg_parts_delivered_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_delivered_order_children"();

CREATE OR REPLACE TRIGGER "trg_parts_expense_sync" AFTER INSERT OR DELETE OR UPDATE ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_parts_expense_on_change"();

CREATE OR REPLACE TRIGGER "trg_parts_pedido" BEFORE INSERT OR UPDATE OF "estado_pedido" ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_repuesto_pedido"();

CREATE OR REPLACE TRIGGER "trg_parts_quote_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_linea_presupuesto"();

CREATE OR REPLACE TRIGGER "trg_parts_recibido_notify" AFTER UPDATE OF "estado_pedido" ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_repuesto_recibido"();

CREATE OR REPLACE TRIGGER "trg_parts_subtotal" BEFORE INSERT OR UPDATE ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_part_subtotal"();

CREATE OR REPLACE TRIGGER "trg_parts_totals" AFTER INSERT OR DELETE OR UPDATE ON "public"."orden_repuestos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recalc_parts_totals"();

CREATE OR REPLACE TRIGGER "trg_pay_scheme_commissions" AFTER INSERT OR DELETE OR UPDATE ON "public"."perfiles_pago" FOR EACH ROW EXECUTE FUNCTION "public"."trg_commissions_on_pay_scheme"();

CREATE OR REPLACE TRIGGER "trg_perfil_privilegios" BEFORE UPDATE ON "public"."perfiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_guard_perfil_privilegios"();

CREATE OR REPLACE TRIGGER "trg_perfiles_pago_sello" BEFORE INSERT OR UPDATE ON "public"."perfiles_pago" FOR EACH ROW EXECUTE FUNCTION "public"."trg_perfiles_pago_sello"();

CREATE OR REPLACE TRIGGER "trg_progress_notify" AFTER INSERT ON "public"."orden_avances" FOR EACH ROW EXECUTE FUNCTION "public"."trg_notify_progress"();

CREATE OR REPLACE TRIGGER "trg_progress_on_status" BEFORE UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_progress_on_status"();

CREATE OR REPLACE TRIGGER "trg_quote_starts_order" AFTER UPDATE OF "estado" ON "public"."presupuestos" FOR EACH ROW WHEN ((("new"."estado" = 'respondido'::"text") AND ("old"."estado" IS DISTINCT FROM 'respondido'::"text"))) EXECUTE FUNCTION "public"."trg_presupuesto_empieza_orden"();

CREATE OR REPLACE TRIGGER "trg_sede_commission_rate" AFTER UPDATE ON "public"."sedes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_commissions_on_rate_change"();

CREATE OR REPLACE TRIGGER "trg_sede_sembrar_inspeccion" AFTER INSERT ON "public"."sedes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sede_inspeccion_plantilla"();

CREATE OR REPLACE TRIGGER "trg_vehiculo_sede" BEFORE INSERT OR UPDATE OF "cliente_id" ON "public"."vehiculos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_vehiculo_sede"();

ALTER TABLE ONLY "public"."catalogo_trabajo_lineas"
    ADD CONSTRAINT "catalogo_trabajo_lineas_catalogo_id_fkey" FOREIGN KEY ("catalogo_id") REFERENCES "public"."catalogo_trabajos"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."catalogo_trabajos"
    ADD CONSTRAINT "catalogo_trabajos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."catalogo_trabajos"
    ADD CONSTRAINT "catalogo_trabajos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."cola_envios"
    ADD CONSTRAINT "cola_envios_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."comision_pagos"
    ADD CONSTRAINT "comision_pagos_pagado_por_fkey" FOREIGN KEY ("pagado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."comision_pagos"
    ADD CONSTRAINT "comision_pagos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."comision_pagos"
    ADD CONSTRAINT "comision_pagos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."comisiones"
    ADD CONSTRAINT "comisiones_labor_id_fkey" FOREIGN KEY ("labor_id") REFERENCES "public"."orden_labor"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."comisiones"
    ADD CONSTRAINT "comisiones_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."comisiones"
    ADD CONSTRAINT "comisiones_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "public"."comision_pagos"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."comisiones"
    ADD CONSTRAINT "comisiones_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."comisiones"
    ADD CONSTRAINT "comisiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."finanzas_importaciones"
    ADD CONSTRAINT "finanzas_importaciones_importado_por_fkey" FOREIGN KEY ("importado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."finanzas_importaciones"
    ADD CONSTRAINT "finanzas_importaciones_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."finanzas_movimientos"
    ADD CONSTRAINT "finanzas_movimientos_comision_pago_id_fkey" FOREIGN KEY ("comision_pago_id") REFERENCES "public"."comision_pagos"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."finanzas_movimientos"
    ADD CONSTRAINT "finanzas_movimientos_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "public"."finanzas_importaciones"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."finanzas_movimientos"
    ADD CONSTRAINT "finanzas_movimientos_referencia_orden_id_fkey" FOREIGN KEY ("referencia_orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."finanzas_movimientos"
    ADD CONSTRAINT "finanzas_movimientos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."finanzas_movimientos"
    ADD CONSTRAINT "finanzas_movimientos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."inspeccion_plantilla_puntos"
    ADD CONSTRAINT "inspeccion_plantilla_puntos_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "public"."inspeccion_plantillas"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."inspeccion_plantillas"
    ADD CONSTRAINT "inspeccion_plantillas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notificaciones"
    ADD CONSTRAINT "notificaciones_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notificaciones"
    ADD CONSTRAINT "notificaciones_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notificaciones"
    ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_asignaciones"
    ADD CONSTRAINT "orden_asignaciones_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_asignaciones"
    ADD CONSTRAINT "orden_asignaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_avances"
    ADD CONSTRAINT "orden_avances_labor_id_fkey" FOREIGN KEY ("labor_id") REFERENCES "public"."orden_labor"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_avances"
    ADD CONSTRAINT "orden_avances_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_avances"
    ADD CONSTRAINT "orden_avances_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_enlaces"
    ADD CONSTRAINT "orden_enlaces_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_enlaces"
    ADD CONSTRAINT "orden_enlaces_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_enlaces"
    ADD CONSTRAINT "orden_enlaces_revocado_por_fkey" FOREIGN KEY ("revocado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_enlaces"
    ADD CONSTRAINT "orden_enlaces_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_hallazgos"
    ADD CONSTRAINT "orden_hallazgos_avance_id_fkey" FOREIGN KEY ("avance_id") REFERENCES "public"."orden_avances"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_hallazgos"
    ADD CONSTRAINT "orden_hallazgos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_hallazgos"
    ADD CONSTRAINT "orden_hallazgos_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_hallazgos"
    ADD CONSTRAINT "orden_hallazgos_reportado_por_fkey" FOREIGN KEY ("reportado_por") REFERENCES "public"."perfiles"("id");

ALTER TABLE ONLY "public"."orden_hallazgos"
    ADD CONSTRAINT "orden_hallazgos_resuelto_por_fkey" FOREIGN KEY ("resuelto_por") REFERENCES "public"."perfiles"("id");

ALTER TABLE ONLY "public"."orden_hallazgos"
    ADD CONSTRAINT "orden_hallazgos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_inspeccion_puntos"
    ADD CONSTRAINT "orden_inspeccion_puntos_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_inspeccion_puntos"
    ADD CONSTRAINT "orden_inspeccion_puntos_inspeccion_id_fkey" FOREIGN KEY ("inspeccion_id") REFERENCES "public"."orden_inspecciones"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_inspeccion_puntos"
    ADD CONSTRAINT "orden_inspeccion_puntos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_inspecciones"
    ADD CONSTRAINT "orden_inspecciones_completada_por_fkey" FOREIGN KEY ("completada_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_inspecciones"
    ADD CONSTRAINT "orden_inspecciones_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_inspecciones"
    ADD CONSTRAINT "orden_inspecciones_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_inspecciones"
    ADD CONSTRAINT "orden_inspecciones_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "public"."inspeccion_plantillas"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_labor"
    ADD CONSTRAINT "orden_labor_asignado_a_fkey" FOREIGN KEY ("asignado_a") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_labor"
    ADD CONSTRAINT "orden_labor_completado_por_fkey" FOREIGN KEY ("completado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_labor"
    ADD CONSTRAINT "orden_labor_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_labor"
    ADD CONSTRAINT "orden_labor_presupuesto_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_labor_tiempos"
    ADD CONSTRAINT "orden_labor_tiempos_labor_id_fkey" FOREIGN KEY ("labor_id") REFERENCES "public"."orden_labor"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_labor_tiempos"
    ADD CONSTRAINT "orden_labor_tiempos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_labor_tiempos"
    ADD CONSTRAINT "orden_labor_tiempos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_labor"
    ADD CONSTRAINT "orden_labor_trabajo_fk" FOREIGN KEY ("trabajo_id", "orden_id") REFERENCES "public"."orden_trabajos"("id", "orden_id") ON DELETE SET NULL ("trabajo_id");

ALTER TABLE ONLY "public"."orden_media"
    ADD CONSTRAINT "orden_media_avance_id_fkey" FOREIGN KEY ("avance_id") REFERENCES "public"."orden_avances"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_media"
    ADD CONSTRAINT "orden_media_inspeccion_punto_fk" FOREIGN KEY ("inspeccion_punto_id", "orden_id") REFERENCES "public"."orden_inspeccion_puntos"("id", "orden_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_media"
    ADD CONSTRAINT "orden_media_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_media"
    ADD CONSTRAINT "orden_media_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_media"
    ADD CONSTRAINT "orden_media_subido_por_fkey" FOREIGN KEY ("subido_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_montos"
    ADD CONSTRAINT "orden_montos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_parqueo"
    ADD CONSTRAINT "orden_parqueo_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_proximo_servicio"
    ADD CONSTRAINT "orden_proximo_servicio_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_proximo_servicio"
    ADD CONSTRAINT "orden_proximo_servicio_programado_por_fkey" FOREIGN KEY ("programado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_proximo_servicio"
    ADD CONSTRAINT "orden_proximo_servicio_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_proximo_servicio"
    ADD CONSTRAINT "orden_proximo_servicio_sugerido_por_fkey" FOREIGN KEY ("sugerido_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_repuestos"
    ADD CONSTRAINT "orden_repuestos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orden_repuestos"
    ADD CONSTRAINT "orden_repuestos_presupuesto_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_repuestos"
    ADD CONSTRAINT "orden_repuestos_trabajo_fk" FOREIGN KEY ("trabajo_id", "orden_id") REFERENCES "public"."orden_trabajos"("id", "orden_id") ON DELETE SET NULL ("trabajo_id");

ALTER TABLE ONLY "public"."orden_trabajos"
    ADD CONSTRAINT "orden_trabajos_catalogo_id_fkey" FOREIGN KEY ("catalogo_id") REFERENCES "public"."catalogo_trabajos"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_trabajos"
    ADD CONSTRAINT "orden_trabajos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."orden_trabajos"
    ADD CONSTRAINT "orden_trabajos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_lista_para_entregar_por_fkey" FOREIGN KEY ("lista_para_entregar_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculos"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."parqueo_config"
    ADD CONSTRAINT "parqueo_config_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."parqueo_config"
    ADD CONSTRAINT "parqueo_config_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parqueo_perfiles"
    ADD CONSTRAINT "parqueo_perfiles_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parqueo_tramos"
    ADD CONSTRAINT "parqueo_tramos_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "public"."parqueo_perfiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."perfiles_pago"
    ADD CONSTRAINT "perfiles_pago_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."perfiles_pago"
    ADD CONSTRAINT "perfiles_pago_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_respondido_por_perfil_fkey" FOREIGN KEY ("respondido_por_perfil") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."push_suscripciones"
    ADD CONSTRAINT "push_suscripciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."traducciones"
    ADD CONSTRAINT "traducciones_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."vehiculos"
    ADD CONSTRAINT "vehiculos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."vehiculos"
    ADD CONSTRAINT "vehiculos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE RESTRICT;

ALTER TABLE "public"."catalogo_trabajo_lineas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_trabajo_lineas_delete_admin" ON "public"."catalogo_trabajo_lineas" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "catalogo_trabajo_lineas_insert_admin" ON "public"."catalogo_trabajo_lineas" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "catalogo_trabajo_lineas_select_admin" ON "public"."catalogo_trabajo_lineas" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "catalogo_trabajo_lineas_update_admin" ON "public"."catalogo_trabajo_lineas" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."catalogo_trabajos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_trabajos_delete_admin" ON "public"."catalogo_trabajos" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "catalogo_trabajos_insert_admin" ON "public"."catalogo_trabajos" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "catalogo_trabajos_select_admin" ON "public"."catalogo_trabajos" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "catalogo_trabajos_update_admin" ON "public"."catalogo_trabajos" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_delete" ON "public"."clientes" FOR DELETE USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "clientes_insert" ON "public"."clientes" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "clientes_select" ON "public"."clientes" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "o"
  WHERE (("o"."cliente_id" = "clientes"."id") AND ("o"."id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[])))))));

CREATE POLICY "clientes_update" ON "public"."clientes" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."cola_envios" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cola_envios_admin_select" ON "public"."cola_envios" FOR SELECT USING (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."comision_pagos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comision_pagos_select" ON "public"."comision_pagos" FOR SELECT USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))));

CREATE POLICY "comision_pagos_write_delete" ON "public"."comision_pagos" FOR DELETE USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "comision_pagos_write_insert" ON "public"."comision_pagos" FOR INSERT WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "comision_pagos_write_update" ON "public"."comision_pagos" FOR UPDATE USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."comisiones" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comisiones_select" ON "public"."comisiones" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("estado" = 'aceptada'::"text") OR ("pago_id" IS NOT NULL)))));

CREATE POLICY "comisiones_write_delete" ON "public"."comisiones" FOR DELETE USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "comisiones_write_insert" ON "public"."comisiones" FOR INSERT WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "comisiones_write_update" ON "public"."comisiones" FOR UPDATE USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."finanzas_importaciones" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finanzas_importaciones_admin" ON "public"."finanzas_importaciones" USING ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role")) WITH CHECK ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role"));

ALTER TABLE "public"."finanzas_movimientos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finanzas_movimientos_delete" ON "public"."finanzas_movimientos" FOR DELETE USING (((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role") AND (("origen" = 'manual'::"text") OR ("importacion_id" IS NOT NULL))));

CREATE POLICY "finanzas_movimientos_insert" ON "public"."finanzas_movimientos" FOR INSERT WITH CHECK ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role"));

CREATE POLICY "finanzas_movimientos_select" ON "public"."finanzas_movimientos" FOR SELECT USING ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role"));

CREATE POLICY "finanzas_movimientos_update" ON "public"."finanzas_movimientos" FOR UPDATE USING (((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role") AND (("origen" = 'manual'::"text") OR ("importacion_id" IS NOT NULL)))) WITH CHECK (((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role") AND (("origen" = 'manual'::"text") OR ("importacion_id" IS NOT NULL))));

CREATE POLICY "finanzas_reglas_admin" ON "public"."finanzas_reglas_categorizacion" USING ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role")) WITH CHECK ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role"));

ALTER TABLE "public"."finanzas_reglas_categorizacion" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."historial_orden" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historial_orden_admin_select" ON "public"."historial_orden" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."inspeccion_plantilla_puntos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inspeccion_plantilla_puntos_delete_admin" ON "public"."inspeccion_plantilla_puntos" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "inspeccion_plantilla_puntos_insert_admin" ON "public"."inspeccion_plantilla_puntos" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "inspeccion_plantilla_puntos_select_admin" ON "public"."inspeccion_plantilla_puntos" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "inspeccion_plantilla_puntos_update_admin" ON "public"."inspeccion_plantilla_puntos" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."inspeccion_plantillas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inspeccion_plantillas_delete_admin" ON "public"."inspeccion_plantillas" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "inspeccion_plantillas_insert_admin" ON "public"."inspeccion_plantillas" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "inspeccion_plantillas_select_admin" ON "public"."inspeccion_plantillas" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "inspeccion_plantillas_update_admin" ON "public"."inspeccion_plantillas" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."notificaciones" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notificaciones_delete" ON "public"."notificaciones" FOR DELETE USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "notificaciones_select" ON "public"."notificaciones" FOR SELECT USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "notificaciones_update" ON "public"."notificaciones" FOR UPDATE USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));

ALTER TABLE "public"."numero_orden_contadores" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."orden_asignaciones" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_asignaciones_delete" ON "public"."orden_asignaciones" FOR DELETE USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "orden_asignaciones_insert" ON "public"."orden_asignaciones" FOR INSERT WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "orden_asignaciones_select" ON "public"."orden_asignaciones" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

CREATE POLICY "orden_asignaciones_update" ON "public"."orden_asignaciones" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."orden_avances" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_avances_delete" ON "public"."orden_avances" FOR DELETE USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "o"
  WHERE (("o"."id" = "orden_avances"."orden_id") AND ("o"."estatus" <> 'entregado'::"public"."order_status")))) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."orden_hallazgos" "h"
  WHERE ("h"."avance_id" = "orden_avances"."id")))))));

CREATE POLICY "orden_avances_insert" ON "public"."orden_avances" FOR INSERT WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_assigned_to_order"("orden_id") AND (EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "o"
  WHERE (("o"."id" = "orden_avances"."orden_id") AND ("o"."sede_id" = ( SELECT "public"."current_user_sede_id"() AS "current_user_sede_id")) AND ("o"."estatus" <> 'entregado'::"public"."order_status")))))));

CREATE POLICY "orden_avances_select" ON "public"."orden_avances" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

CREATE POLICY "orden_avances_update" ON "public"."orden_avances" FOR UPDATE USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "o"
  WHERE (("o"."id" = "orden_avances"."orden_id") AND ("o"."estatus" <> 'entregado'::"public"."order_status"))))))) WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR ("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))));

ALTER TABLE "public"."orden_enlaces" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_enlaces_admin_select" ON "public"."orden_enlaces" FOR SELECT USING (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."orden_hallazgos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_hallazgos_select" ON "public"."orden_hallazgos" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

ALTER TABLE "public"."orden_inspeccion_puntos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_inspeccion_puntos_select" ON "public"."orden_inspeccion_puntos" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

ALTER TABLE "public"."orden_inspecciones" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_inspecciones_select" ON "public"."orden_inspecciones" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

ALTER TABLE "public"."orden_labor" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_labor_admin_delete" ON "public"."orden_labor" FOR DELETE USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "orden_labor_admin_update" ON "public"."orden_labor" FOR UPDATE USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "orden_labor_admin_write" ON "public"."orden_labor" FOR INSERT WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "orden_labor_select" ON "public"."orden_labor" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

ALTER TABLE "public"."orden_labor_tiempos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_labor_tiempos_select" ON "public"."orden_labor_tiempos" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

ALTER TABLE "public"."orden_media" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_media_rows_delete" ON "public"."orden_media" FOR DELETE USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (("subido_por" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "o"
  WHERE (("o"."id" = "orden_media"."orden_id") AND ("o"."estatus" <> 'entregado'::"public"."order_status")))))));

CREATE POLICY "orden_media_rows_insert" ON "public"."orden_media" FOR INSERT WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM ("public"."ordenes_trabajo" "o"
     JOIN "public"."orden_asignaciones" "a" ON ((("a"."orden_id" = "o"."id") AND ("a"."usuario_id" = ( SELECT "auth"."uid"() AS "uid")))))
  WHERE (("o"."id" = "orden_media"."orden_id") AND ("o"."sede_id" = ( SELECT "public"."current_user_sede_id"() AS "current_user_sede_id")) AND ("o"."estatus" <> 'entregado'::"public"."order_status"))))));

CREATE POLICY "orden_media_rows_select" ON "public"."orden_media" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

CREATE POLICY "orden_media_rows_update" ON "public"."orden_media" FOR UPDATE USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."orden_montos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_montos_admin" ON "public"."orden_montos" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."orden_parqueo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_parqueo_select_admin" ON "public"."orden_parqueo" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."orden_proximo_servicio" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_proximo_servicio_select" ON "public"."orden_proximo_servicio" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

ALTER TABLE "public"."orden_repuestos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_repuestos_admin" ON "public"."orden_repuestos" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."orden_trabajos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orden_trabajos_delete_admin" ON "public"."orden_trabajos" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "orden_trabajos_insert_admin" ON "public"."orden_trabajos" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "orden_trabajos_select" ON "public"."orden_trabajos" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("orden_id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

CREATE POLICY "orden_trabajos_update_admin" ON "public"."orden_trabajos" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."ordenes_trabajo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ordenes_trabajo_delete" ON "public"."ordenes_trabajo" FOR DELETE USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "ordenes_trabajo_insert" ON "public"."ordenes_trabajo" FOR INSERT WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "ordenes_trabajo_select" ON "public"."ordenes_trabajo" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

CREATE POLICY "ordenes_trabajo_update" ON "public"."ordenes_trabajo" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[])))) WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR ("id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[]))));

ALTER TABLE "public"."parqueo_config" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parqueo_config_select_admin" ON "public"."parqueo_config" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."parqueo_perfiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parqueo_perfiles_select_admin" ON "public"."parqueo_perfiles" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."parqueo_tramos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parqueo_tramos_select_admin" ON "public"."parqueo_tramos" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."perfiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfiles_delete" ON "public"."perfiles" FOR DELETE USING ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role"));

CREATE POLICY "perfiles_insert" ON "public"."perfiles" FOR INSERT WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."perfiles_pago" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfiles_pago_delete" ON "public"."perfiles_pago" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "perfiles_pago_insert" ON "public"."perfiles_pago" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "perfiles_pago_select" ON "public"."perfiles_pago" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))));

CREATE POLICY "perfiles_pago_update" ON "public"."perfiles_pago" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "perfiles_select" ON "public"."perfiles" FOR SELECT USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role") OR ("sede_id" = ( SELECT "public"."current_user_sede_id"() AS "current_user_sede_id"))));

CREATE POLICY "perfiles_update" ON "public"."perfiles" FOR UPDATE USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin"))) WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));

ALTER TABLE "public"."presupuestos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presupuestos_admin_select" ON "public"."presupuestos" FOR SELECT USING (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."push_suscripciones" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_suscripciones_delete" ON "public"."push_suscripciones" FOR DELETE USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "push_suscripciones_select" ON "public"."push_suscripciones" FOR SELECT USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));

ALTER TABLE "public"."sedes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sedes_select" ON "public"."sedes" FOR SELECT USING ((( SELECT "public"."current_user_role"() AS "current_user_role") IS NOT NULL));

CREATE POLICY "sedes_write_delete" ON "public"."sedes" FOR DELETE USING ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role"));

CREATE POLICY "sedes_write_insert" ON "public"."sedes" FOR INSERT WITH CHECK ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role"));

CREATE POLICY "sedes_write_update" ON "public"."sedes" FOR UPDATE USING ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role")) WITH CHECK ((( SELECT "public"."current_user_role"() AS "current_user_role") = 'admin'::"public"."user_role"));

ALTER TABLE "public"."traducciones" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "traducciones_admin_select" ON "public"."traducciones" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "traducciones_admin_update" ON "public"."traducciones" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

ALTER TABLE "public"."vehiculos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehiculos_delete" ON "public"."vehiculos" FOR DELETE USING (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "vehiculos_insert" ON "public"."vehiculos" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

CREATE POLICY "vehiculos_select" ON "public"."vehiculos" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "o"
  WHERE (("o"."vehiculo_id" = "vehiculos"."id") AND ("o"."id" = ANY (( SELECT "public"."mis_ordenes_asignadas"() AS "mis_ordenes_asignadas")::"uuid"[])))))));

CREATE POLICY "vehiculos_update" ON "public"."vehiculos" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

REVOKE ALL ON FUNCTION "public"."_agregar_borradores"("p_presupuesto_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_agregar_borradores"("p_presupuesto_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_avance_por_tareas"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_avance_por_tareas"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_balance_orden"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_balance_orden"("p_orden_id" "uuid") TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."presupuestos" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."presupuestos" TO "authenticated";
GRANT ALL ON TABLE "public"."presupuestos" TO "service_role";

REVOKE ALL ON FUNCTION "public"."_crear_presupuesto"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_crear_presupuesto"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_diccionario_traducciones"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_diccionario_traducciones"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_estatus_cliente"("p_estatus" "public"."order_status", "p_lista" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_estatus_cliente"("p_estatus" "public"."order_status", "p_lista" timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."_historial_diferencias"("p_antes" "jsonb", "p_despues" "jsonb", "p_campos" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_historial_diferencias"("p_antes" "jsonb", "p_despues" "jsonb", "p_campos" "text"[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."_historial_valores"("p_fila" "jsonb", "p_campos" "text"[], "p_clave" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_historial_valores"("p_fila" "jsonb", "p_campos" "text"[], "p_clave" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_lineas_pendientes"("p_presupuesto_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_lineas_pendientes"("p_presupuesto_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_parqueo_calcular"("p_orden_id" "uuid", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_parqueo_calcular"("p_orden_id" "uuid", "p_hasta" "date") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_parqueo_calculo"("p_perfil" "jsonb", "p_fecha_evento" "date", "p_hasta" "date", "p_vigente_desde" "date", "p_ajustes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_parqueo_calculo"("p_perfil" "jsonb", "p_fecha_evento" "date", "p_hasta" "date", "p_vigente_desde" "date", "p_ajustes" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_recalcular_parqueo"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_recalcular_parqueo"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_reloj_tope"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_reloj_tope"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."_reparto_comisiones"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_reparto_comisiones"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_resolver_presupuesto"("p_presupuesto_id" "uuid", "p_aprobadas" "uuid"[], "p_via" "text", "p_nombre" "text", "p_perfil" "uuid", "p_comentario" "text", "p_nota" "text", "p_ip" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_resolver_presupuesto"("p_presupuesto_id" "uuid", "p_aprobadas" "uuid"[], "p_via" "text", "p_nombre" "text", "p_perfil" "uuid", "p_comentario" "text", "p_nota" "text", "p_ip" "text", "p_user_agent" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_saldo_orden"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_saldo_orden"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_salir_de_espera"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_salir_de_espera"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_sembrar_plantilla_inspeccion"("p_sede_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_sembrar_plantilla_inspeccion"("p_sede_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_telefonos_sede"("p_telefonos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_telefonos_sede"("p_telefonos" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."_textos_cliente"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_textos_cliente"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."admins_de_sede"("p_sede_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admins_de_sede"("p_sede_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."agregar_trabajo_del_catalogo"("p_orden_id" "uuid", "p_catalogo_id" "uuid", "p_asignado_a" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agregar_trabajo_del_catalogo"("p_orden_id" "uuid", "p_catalogo_id" "uuid", "p_asignado_a" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."agregar_trabajo_del_catalogo"("p_orden_id" "uuid", "p_catalogo_id" "uuid", "p_asignado_a" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."ajustar_parqueo_orden"("p_orden_id" "uuid", "p_ajustes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ajustar_parqueo_orden"("p_orden_id" "uuid", "p_ajustes" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."ajustar_parqueo_orden"("p_orden_id" "uuid", "p_ajustes" "jsonb") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."aplicar_descuento"("p_orden_id" "uuid", "p_monto" numeric, "p_motivo" "text", "p_porcentaje" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aplicar_descuento"("p_orden_id" "uuid", "p_monto" numeric, "p_motivo" "text", "p_porcentaje" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."aplicar_descuento"("p_orden_id" "uuid", "p_monto" numeric, "p_motivo" "text", "p_porcentaje" numeric) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."app_schema_version"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."app_schema_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_schema_version"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."aprobar_comision"("p_comision_id" "uuid", "p_monto" numeric, "p_porcentaje" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aprobar_comision"("p_comision_id" "uuid", "p_monto" numeric, "p_porcentaje" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."aprobar_comision"("p_comision_id" "uuid", "p_monto" numeric, "p_porcentaje" numeric) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."aprobar_comisiones"("p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aprobar_comisiones"("p_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."aprobar_comisiones"("p_ids" "uuid"[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."archivos_huerfanos"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archivos_huerfanos"("p_limit" integer) TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_enlaces" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_enlaces" TO "authenticated";
GRANT ALL ON TABLE "public"."orden_enlaces" TO "service_role";

REVOKE ALL ON FUNCTION "public"."asegurar_enlace_orden"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."asegurar_enlace_orden"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."balance_orden"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."balance_orden"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."balance_orden"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."borrar_plantilla_inspeccion"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."borrar_plantilla_inspeccion"("p_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."borrar_plantilla_inspeccion"("p_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."borrar_tiempo"("p_tiempo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."borrar_tiempo"("p_tiempo_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."borrar_tiempo"("p_tiempo_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."borrar_trabajo_catalogo"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."borrar_trabajo_catalogo"("p_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."borrar_trabajo_catalogo"("p_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."cancelar_presupuesto"("p_presupuesto_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancelar_presupuesto"("p_presupuesto_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."cancelar_presupuesto"("p_presupuesto_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."catalogo_de_trabajos"("p_sede_id" "uuid", "p_incluir_inactivos" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."catalogo_de_trabajos"("p_sede_id" "uuid", "p_incluir_inactivos" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."catalogo_de_trabajos"("p_sede_id" "uuid", "p_incluir_inactivos" boolean) TO "authenticated";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."cola_envios" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."cola_envios" TO "authenticated";
GRANT ALL ON TABLE "public"."cola_envios" TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_outbox"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_outbox"("p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_order_finance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_order_finance"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."comisiones_estimadas"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."comisiones_estimadas"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."comisiones_estimadas"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."completar_inspeccion"("p_inspeccion_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."completar_inspeccion"("p_inspeccion_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."completar_inspeccion"("p_inspeccion_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."corregir_tiempo"("p_tiempo_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."corregir_tiempo"("p_tiempo_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."corregir_tiempo"("p_tiempo_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."cotizar_hallazgo"("p_hallazgo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cotizar_hallazgo"("p_hallazgo_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."cotizar_hallazgo"("p_hallazgo_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."crear_enlace_cliente"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_enlace_cliente"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."crear_enlace_cliente"("p_orden_id" "uuid") TO "authenticated";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ordenes_trabajo" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ordenes_trabajo" TO "authenticated";
GRANT ALL ON TABLE "public"."ordenes_trabajo" TO "service_role";

REVOKE ALL ON FUNCTION "public"."create_work_order"("p_order" "jsonb", "p_labor" "jsonb", "p_parts" "jsonb", "p_assignments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_work_order"("p_order" "jsonb", "p_labor" "jsonb", "p_parts" "jsonb", "p_assignments" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_work_order"("p_order" "jsonb", "p_labor" "jsonb", "p_parts" "jsonb", "p_assignments" "jsonb") TO "authenticated";

GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";

GRANT ALL ON FUNCTION "public"."current_user_sede_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_sede_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_sede_id"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."datos_correo"("p_cola_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."datos_correo"("p_cola_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."datos_orden_aviso"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."datos_orden_aviso"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."datos_portal"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."datos_portal"("p_token" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."datos_servicio"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."datos_servicio"("p_token" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."delete_sede_cascade"("p_sede_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_sede_cascade"("p_sede_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_sede_cascade"("p_sede_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."descartar_hallazgo"("p_hallazgo_id" "uuid", "p_en_reporte" boolean, "p_texto" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."descartar_hallazgo"("p_hallazgo_id" "uuid", "p_en_reporte" boolean, "p_texto" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."descartar_hallazgo"("p_hallazgo_id" "uuid", "p_en_reporte" boolean, "p_texto" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."descartar_sugerencia_proximo_servicio"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."descartar_sugerencia_proximo_servicio"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."descartar_sugerencia_proximo_servicio"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."deshacer_importacion_estado_cuenta"("p_importacion_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deshacer_importacion_estado_cuenta"("p_importacion_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deshacer_importacion_estado_cuenta"("p_importacion_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."detener_reloj"("p_labor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."detener_reloj"("p_labor_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."detener_reloj"("p_labor_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."dispatch_outbox_if_due"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_outbox_if_due"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."eliminar_push"("p_endpoint" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."eliminar_push"("p_endpoint" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."eliminar_push"("p_endpoint" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."encolar_correo_cliente"("p_orden_id" "uuid", "p_plantilla" "text", "p_datos" "jsonb", "p_clave_dedupe" "text", "p_espera" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."encolar_correo_cliente"("p_orden_id" "uuid", "p_plantilla" "text", "p_datos" "jsonb", "p_clave_dedupe" "text", "p_espera" interval) TO "service_role";

REVOKE ALL ON FUNCTION "public"."entregar_orden"("p_orden_id" "uuid", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."entregar_orden"("p_orden_id" "uuid", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."entregar_orden"("p_orden_id" "uuid", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."enviar_presupuesto"("p_orden_id" "uuid", "p_notificar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enviar_presupuesto"("p_orden_id" "uuid", "p_notificar" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."enviar_presupuesto"("p_orden_id" "uuid", "p_notificar" boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."enviar_reporte_cliente"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enviar_reporte_cliente"("p_orden_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enviar_reporte_cliente"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."es_correo_valido"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."es_correo_valido"("p_email" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."finish_outbox"("p_id" "uuid", "p_estado" "text", "p_error" "text", "p_proveedor_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_outbox"("p_id" "uuid", "p_estado" "text", "p_error" "text", "p_proveedor_id" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."guardar_config_parqueo"("p_sede_id" "uuid", "p_config" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guardar_config_parqueo"("p_sede_id" "uuid", "p_config" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."guardar_config_parqueo"("p_sede_id" "uuid", "p_config" "jsonb") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."guardar_plantilla_inspeccion"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_predeterminada" boolean, "p_puntos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guardar_plantilla_inspeccion"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_predeterminada" boolean, "p_puntos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."guardar_plantilla_inspeccion"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_predeterminada" boolean, "p_puntos" "jsonb") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."guardar_trabajo_catalogo"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_lineas" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guardar_trabajo_catalogo"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_lineas" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."guardar_trabajo_catalogo"("p_id" "uuid", "p_sede_id" "uuid", "p_nombre" "text", "p_activo" boolean, "p_lineas" "jsonb") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."guardar_traducciones"("p_sede_id" "uuid", "p_idioma_destino" "text", "p_textos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guardar_traducciones"("p_sede_id" "uuid", "p_idioma_destino" "text", "p_textos" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_delivered_order_adjustment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_delivered_order_adjustment"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_order_delivery_payment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_order_delivery_payment"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."hoy_taller"("p_sede_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hoy_taller"("p_sede_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."importar_estado_cuenta"("p_importacion" "jsonb", "p_movimientos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."importar_estado_cuenta"("p_importacion" "jsonb", "p_movimientos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."importar_estado_cuenta"("p_importacion" "jsonb", "p_movimientos" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."indicadores_taller"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."indicadores_taller"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."indicadores_taller"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."iniciar_inspeccion"("p_orden_id" "uuid", "p_plantilla_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."iniciar_inspeccion"("p_orden_id" "uuid", "p_plantilla_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."iniciar_inspeccion"("p_orden_id" "uuid", "p_plantilla_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."iniciar_reloj"("p_labor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."iniciar_reloj"("p_labor_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."iniciar_reloj"("p_labor_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."invoke_edge_function"("p_name" "text", "p_body" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoke_edge_function"("p_name" "text", "p_body" "jsonb") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_assigned_to_order"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_assigned_to_order"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_assigned_to_order"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."marcar_estatus_enviado"("p_cola_id" "uuid", "p_estatus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marcar_estatus_enviado"("p_cola_id" "uuid", "p_estatus" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."marcar_labor_completada"("p_labor_id" "uuid", "p_completado" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marcar_labor_completada"("p_labor_id" "uuid", "p_completado" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."marcar_labor_completada"("p_labor_id" "uuid", "p_completado" boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."marcar_lista_para_entregar"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marcar_lista_para_entregar"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."marcar_lista_para_entregar"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."marcar_punto_inspeccion"("p_punto_id" "uuid", "p_estado" "text", "p_nota" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marcar_punto_inspeccion"("p_punto_id" "uuid", "p_estado" "text", "p_nota" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."marcar_punto_inspeccion"("p_punto_id" "uuid", "p_estado" "text", "p_nota" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."margen_ordenes"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date", "p_limite" integer, "p_desplazamiento" integer, "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."margen_ordenes"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date", "p_limite" integer, "p_desplazamiento" integer, "p_tz" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."margen_ordenes"("p_sede_id" "uuid", "p_desde" "date", "p_hasta" "date", "p_limite" integer, "p_desplazamiento" integer, "p_tz" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mis_ordenes_asignadas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mis_ordenes_asignadas"() TO "service_role";
GRANT ALL ON FUNCTION "public"."mis_ordenes_asignadas"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."notificar"("p_usuarios" "uuid"[], "p_tipo" "text", "p_titulo" "text", "p_cuerpo" "text", "p_datos" "jsonb", "p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notificar"("p_usuarios" "uuid"[], "p_tipo" "text", "p_titulo" "text", "p_cuerpo" "text", "p_datos" "jsonb", "p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."notificar_cliente_avance"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notificar_cliente_avance"("p_orden_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notificar_cliente_avance"("p_orden_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."ordenes_esperando_autorizacion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ordenes_esperando_autorizacion"() TO "service_role";
GRANT ALL ON FUNCTION "public"."ordenes_esperando_autorizacion"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."ordenes_esperando_repuestos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ordenes_esperando_repuestos"() TO "service_role";
GRANT ALL ON FUNCTION "public"."ordenes_esperando_repuestos"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."parqueo_config_sede"("p_sede_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parqueo_config_sede"("p_sede_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."parqueo_config_sede"("p_sede_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."parqueo_de_orden"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parqueo_de_orden"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."parqueo_de_orden"("p_orden_id" "uuid") TO "authenticated";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."comision_pagos" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."comision_pagos" TO "authenticated";
GRANT ALL ON TABLE "public"."comision_pagos" TO "service_role";

REVOKE ALL ON FUNCTION "public"."pay_commissions"("p_usuario_id" "uuid", "p_comision_ids" "uuid"[], "p_fecha_pago" "date", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_url" "text", "p_notas" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_commissions"("p_usuario_id" "uuid", "p_comision_ids" "uuid"[], "p_fecha_pago" "date", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_url" "text", "p_notas" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."pay_commissions"("p_usuario_id" "uuid", "p_comision_ids" "uuid"[], "p_fecha_pago" "date", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_url" "text", "p_notas" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."plantillas_inspeccion"("p_sede_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."plantillas_inspeccion"("p_sede_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."plantillas_inspeccion"("p_sede_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."preferencia_correos_portal"("p_token" "text", "p_acepta" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preferencia_correos_portal"("p_token" "text", "p_acepta" boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."preferencia_idioma_portal"("p_token" "text", "p_idioma" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preferencia_idioma_portal"("p_token" "text", "p_idioma" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."probar_push"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."probar_push"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."probar_push"() TO "service_role";

GRANT ALL ON TABLE "public"."orden_proximo_servicio" TO "service_role";
GRANT SELECT ON TABLE "public"."orden_proximo_servicio" TO "authenticated";

REVOKE ALL ON FUNCTION "public"."programar_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text", "p_idioma" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."programar_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text", "p_idioma" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."programar_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text", "p_idioma" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."publicar_inspeccion"("p_inspeccion_id" "uuid", "p_publicar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publicar_inspeccion"("p_inspeccion_id" "uuid", "p_publicar" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."publicar_inspeccion"("p_inspeccion_id" "uuid", "p_publicar" boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."purge_old_notifications"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_old_notifications"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."quitar_proximo_servicio"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quitar_proximo_servicio"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."quitar_proximo_servicio"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."quitar_trabajo"("p_trabajo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quitar_trabajo"("p_trabajo_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."quitar_trabajo"("p_trabajo_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."recalcular_parqueo_pendiente"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalcular_parqueo_pendiente"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."recalculate_order_totals"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_order_totals"("target_order_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."recordar_ordenes_vencidas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recordar_ordenes_vencidas"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."recordar_presupuestos_sin_respuesta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recordar_presupuestos_sin_respuesta"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."regenerar_enlace_cliente"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerar_enlace_cliente"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."regenerar_enlace_cliente"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."registrar_anticipo"("p_orden_id" "uuid", "p_monto" numeric, "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_anticipo"("p_orden_id" "uuid", "p_monto" numeric, "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."registrar_anticipo"("p_orden_id" "uuid", "p_monto" numeric, "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."registrar_autorizacion"("p_orden_id" "uuid", "p_aprobadas" "uuid"[], "p_lineas" "uuid"[], "p_via" "text", "p_nombre" "text", "p_nota" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_autorizacion"("p_orden_id" "uuid", "p_aprobadas" "uuid"[], "p_lineas" "uuid"[], "p_via" "text", "p_nombre" "text", "p_nota" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_autorizacion"("p_orden_id" "uuid", "p_aprobadas" "uuid"[], "p_lineas" "uuid"[], "p_via" "text", "p_nombre" "text", "p_nota" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."registrar_push"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_push"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_push"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."reintentar_correos_fallidos"("p_horas" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reintentar_correos_fallidos"("p_horas" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."reintentar_correos_fallidos"("p_horas" integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."reintentar_envio"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reintentar_envio"("p_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."reintentar_envio"("p_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."renombrar_trabajo"("p_trabajo_id" "uuid", "p_titulo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."renombrar_trabajo"("p_trabajo_id" "uuid", "p_titulo" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."renombrar_trabajo"("p_trabajo_id" "uuid", "p_titulo" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."reportar_hallazgo"("p_orden_id" "uuid", "p_descripcion" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reportar_hallazgo"("p_orden_id" "uuid", "p_descripcion" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."reportar_hallazgo"("p_orden_id" "uuid", "p_descripcion" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."repuestos_de_orden"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."repuestos_de_orden"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."repuestos_de_orden"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."requiere_atencion"("p_sede_id" "uuid", "p_hoy" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."requiere_atencion"("p_sede_id" "uuid", "p_hoy" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."requiere_atencion"("p_sede_id" "uuid", "p_hoy" "date") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."responder_presupuesto_portal"("p_token" "text", "p_presupuesto_id" "uuid", "p_aprobadas" "uuid"[], "p_lineas" "uuid"[], "p_nombre" "text", "p_comentario" "text", "p_ip" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."responder_presupuesto_portal"("p_token" "text", "p_presupuesto_id" "uuid", "p_aprobadas" "uuid"[], "p_lineas" "uuid"[], "p_nombre" "text", "p_comentario" "text", "p_ip" "text", "p_user_agent" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."resumen_empleado"("p_usuario_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resumen_empleado"("p_usuario_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."resumen_empleado"("p_usuario_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."resumen_importaciones"("p_sede_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resumen_importaciones"("p_sede_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."resumen_importaciones"("p_sede_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."resumen_mis_comisiones"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resumen_mis_comisiones"() TO "service_role";
GRANT ALL ON FUNCTION "public"."resumen_mis_comisiones"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."resumen_panel"("p_sede_id" "uuid", "p_hoy" "date", "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resumen_panel"("p_sede_id" "uuid", "p_hoy" "date", "p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resumen_panel"("p_sede_id" "uuid", "p_hoy" "date", "p_tz" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."retirar_sin_reparar"("p_orden_id" "uuid", "p_cobro" numeric, "p_concepto" "text", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text", "p_conservar" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retirar_sin_reparar"("p_orden_id" "uuid", "p_cobro" numeric, "p_concepto" "text", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text", "p_conservar" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."retirar_sin_reparar"("p_orden_id" "uuid", "p_cobro" numeric, "p_concepto" "text", "p_metodo" "text", "p_numero_cheque" "text", "p_comprobante_ruta" "text", "p_conservar" "uuid"[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."reverse_order_delivery_finance"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_order_delivery_finance"("target_order_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."revocar_enlace_cliente"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revocar_enlace_cliente"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."revocar_enlace_cliente"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."saldo_orden"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."saldo_orden"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."saldo_orden"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."saldo_retiro"("p_orden_id" "uuid", "p_cobro" numeric, "p_conservar" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."saldo_retiro"("p_orden_id" "uuid", "p_cobro" numeric, "p_conservar" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."saldo_retiro"("p_orden_id" "uuid", "p_cobro" numeric, "p_conservar" "uuid"[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."sede_delete_impact"("p_sede_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sede_delete_impact"("p_sede_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sede_delete_impact"("p_sede_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."sugerir_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sugerir_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."sugerir_proximo_servicio"("p_orden_id" "uuid", "p_fecha" "date", "p_millas" integer, "p_nota" "text") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."sync_order_commissions"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_order_commissions"("target_order_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_order_parts_expense"("target_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_order_parts_expense"("target_order_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."trabajos_de_orden"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trabajos_de_orden"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."trabajos_de_orden"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."trabajos_pendientes_vehiculo"("p_vehiculo_id" "uuid", "p_excluir_orden" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trabajos_pendientes_vehiculo"("p_vehiculo_id" "uuid", "p_excluir_orden" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."trabajos_pendientes_vehiculo"("p_vehiculo_id" "uuid", "p_excluir_orden" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."traducciones_orden"("p_orden_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."traducciones_orden"("p_orden_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."traducciones_orden"("p_orden_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."traducciones_portal"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."traducciones_portal"("p_token" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_asignacion_toma_tareas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_asignacion_toma_tareas"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_avance_hallazgo_interno"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_avance_hallazgo_interno"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_avance_labor_match"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_avance_labor_match"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_avance_por_tareas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_avance_por_tareas"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_check_orden_sede"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_check_orden_sede"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_commissions_on_assignment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_commissions_on_assignment"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_commissions_on_labor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_commissions_on_labor"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_commissions_on_order"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_commissions_on_order"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_commissions_on_pay_scheme"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_commissions_on_pay_scheme"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_commissions_on_rate_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_commissions_on_rate_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_create_order_montos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_create_order_montos"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_desarchivar_al_reabrir"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_desarchivar_al_reabrir"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_encolar_traduccion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_encolar_traduccion"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_enlace_al_crear_orden"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_enlace_al_crear_orden"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_finanzas_origen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_finanzas_origen"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_asignacion_con_tareas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_asignacion_con_tareas"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_delivered_order_children"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_delivered_order_children"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_entrega_con_presupuesto"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_entrega_con_presupuesto"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_inspeccion_media"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_inspeccion_media"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_labor_tecnico"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_labor_tecnico"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_linea_presupuesto"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_linea_presupuesto"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_lista_para_entregar"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_lista_para_entregar"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_notificacion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_notificacion"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_orden_media"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_orden_media"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_order_delete_entregada"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_order_delete_entregada"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_order_delete_paid"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_order_delete_paid"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_order_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_order_insert"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_order_money"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_order_money"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_order_montos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_order_montos"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_order_technician"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_order_technician"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_perfil_privilegios"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_perfil_privilegios"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_retirada"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_retirada"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_guard_row_owner_immutable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_guard_row_owner_immutable"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_historial"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_historial"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_labor_cerrar_reloj"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_labor_cerrar_reloj"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_labor_especialidad"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_labor_especialidad"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_labor_tecnico_asignado"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_labor_tecnico_asignado"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_marcas_danos_firmadas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_marcas_danos_firmadas"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_notify_assignment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_notify_assignment"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_notify_auth_request"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_notify_auth_request"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_notify_commission"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_notify_commission"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_notify_order_created"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_notify_order_created"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_notify_order_finished"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_notify_order_finished"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_notify_progress"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_notify_progress"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_notify_repuesto_recibido"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_notify_repuesto_recibido"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_order_delivery_reversal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_order_delivery_reversal"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_order_deposit_sync"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_order_deposit_sync"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_parqueo_orden"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_parqueo_orden"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_part_cost_follows_price"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_part_cost_follows_price"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_parts_expense_on_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_parts_expense_on_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_parts_expense_on_delivery"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_parts_expense_on_delivery"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_perfiles_pago_sello"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_perfiles_pago_sello"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_portal_on_order_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_portal_on_order_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_prepare_orden_media"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_prepare_orden_media"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_presupuesto_empieza_orden"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_presupuesto_empieza_orden"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_publicar_archivos_avance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_publicar_archivos_avance"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_recalc_labor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_recalc_labor"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_recalc_parts_totals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_recalc_parts_totals"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_repuesto_pedido"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_repuesto_pedido"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_sede_inspeccion_plantilla"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_sede_inspeccion_plantilla"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_set_numero_orden"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_set_numero_orden"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_set_part_subtotal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_set_part_subtotal"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_set_progress_on_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_set_progress_on_status"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_set_vehiculo_sede"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_set_vehiculo_sede"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."usuarios_con_push"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usuarios_con_push"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."usuarios_con_push"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."vista_previa_parqueo"("p_perfil" "jsonb", "p_fecha_evento" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vista_previa_parqueo"("p_perfil" "jsonb", "p_fecha_evento" "date", "p_hasta" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."vista_previa_parqueo"("p_perfil" "jsonb", "p_fecha_evento" "date", "p_hasta" "date") TO "authenticated";

GRANT ALL ON TABLE "public"."catalogo_trabajo_lineas" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."catalogo_trabajo_lineas" TO "authenticated";

GRANT ALL ON TABLE "public"."catalogo_trabajos" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."catalogo_trabajos" TO "authenticated";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."clientes" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."comisiones" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."comisiones" TO "authenticated";
GRANT ALL ON TABLE "public"."comisiones" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."finanzas_importaciones" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."finanzas_importaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."finanzas_importaciones" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."finanzas_movimientos" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."finanzas_movimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."finanzas_movimientos" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."finanzas_reglas_categorizacion" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."finanzas_reglas_categorizacion" TO "authenticated";
GRANT ALL ON TABLE "public"."finanzas_reglas_categorizacion" TO "service_role";

GRANT ALL ON TABLE "public"."historial_orden" TO "service_role";
GRANT SELECT ON TABLE "public"."historial_orden" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."historial_orden_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."historial_orden_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."historial_orden_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."inspeccion_plantilla_puntos" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."inspeccion_plantilla_puntos" TO "authenticated";

GRANT ALL ON TABLE "public"."inspeccion_plantillas" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."inspeccion_plantillas" TO "authenticated";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."notificaciones" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."notificaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."notificaciones" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."numero_orden_contadores" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."numero_orden_contadores" TO "authenticated";
GRANT ALL ON TABLE "public"."numero_orden_contadores" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_asignaciones" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_asignaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."orden_asignaciones" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_avances" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_avances" TO "authenticated";
GRANT ALL ON TABLE "public"."orden_avances" TO "service_role";

GRANT ALL ON TABLE "public"."orden_hallazgos" TO "service_role";
GRANT SELECT ON TABLE "public"."orden_hallazgos" TO "authenticated";

GRANT ALL ON TABLE "public"."orden_inspeccion_puntos" TO "service_role";
GRANT SELECT ON TABLE "public"."orden_inspeccion_puntos" TO "authenticated";

GRANT ALL ON TABLE "public"."orden_inspecciones" TO "service_role";
GRANT SELECT ON TABLE "public"."orden_inspecciones" TO "authenticated";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_labor" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_labor" TO "authenticated";
GRANT ALL ON TABLE "public"."orden_labor" TO "service_role";

GRANT ALL ON TABLE "public"."orden_labor_tiempos" TO "service_role";
GRANT SELECT ON TABLE "public"."orden_labor_tiempos" TO "authenticated";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_media" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_media" TO "authenticated";
GRANT ALL ON TABLE "public"."orden_media" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_montos" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_montos" TO "authenticated";
GRANT ALL ON TABLE "public"."orden_montos" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_parqueo" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_parqueo" TO "authenticated";
GRANT ALL ON TABLE "public"."orden_parqueo" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_repuestos" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."orden_repuestos" TO "authenticated";
GRANT ALL ON TABLE "public"."orden_repuestos" TO "service_role";

GRANT ALL ON TABLE "public"."orden_trabajos" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."orden_trabajos" TO "authenticated";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parqueo_config" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parqueo_config" TO "authenticated";
GRANT ALL ON TABLE "public"."parqueo_config" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parqueo_perfiles" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parqueo_perfiles" TO "authenticated";
GRANT ALL ON TABLE "public"."parqueo_perfiles" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parqueo_tramos" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parqueo_tramos" TO "authenticated";
GRANT ALL ON TABLE "public"."parqueo_tramos" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."perfiles" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."perfiles" TO "authenticated";
GRANT ALL ON TABLE "public"."perfiles" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."perfiles_pago" TO "authenticated";
GRANT ALL ON TABLE "public"."perfiles_pago" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."push_suscripciones" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."push_suscripciones" TO "authenticated";
GRANT ALL ON TABLE "public"."push_suscripciones" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."sedes" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."sedes" TO "authenticated";
GRANT ALL ON TABLE "public"."sedes" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."traducciones" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."traducciones" TO "authenticated";
GRANT ALL ON TABLE "public"."traducciones" TO "service_role";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."vehiculos" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."vehiculos" TO "authenticated";
GRANT ALL ON TABLE "public"."vehiculos" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
