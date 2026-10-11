-- ====================================================================================
-- RESTORIFY — Módulo de cobro por parqueo configurable por sede (20261010000028)
-- ====================================================================================
-- Plan: docs/historico/tareas-para-gemini-parqueo.md (§5, Fase B).
--
-- Tablas:
--   - parqueo_config: habilitación, fecha de vigencia, política y avisos por sede.
--   - parqueo_perfiles: configuración de perfil 'seguro' y 'particular' por sede.
--   - parqueo_tramos: tarifas escalonadas por días de cobro para cada perfil.
--   - orden_parqueo: ajustes manuales por orden y cálculo persistido por la base.
--
-- Cálculo:
--   - _parqueo_calculo: función pura e inmutable que cuenta días y montos por tramos.
--   - _parqueo_calcular: evalúa estado de la orden, sede y perfil y llama al cálculo puro.
--   - _recalcular_parqueo: persiste el cálculo en orden_parqueo y actualiza totales.
--   - recalcular_parqueo_pendiente: recálculo por pg_cron para órdenes abiertas.
--   - trg_parqueo_orden: trigger sobre ordenes_trabajo que congela al entregar y recalcula.
--
-- RPCs:
--   - parqueo_config_sede: consulta configuración de sede (o valores por defecto).
--   - guardar_config_parqueo: guarda configuración, perfiles y tramos transaccionalmente.
--   - vista_previa_parqueo: cálculo en vivo sin persistir para previsualización en UI.
--   - parqueo_de_orden: consulta datos de parqueo de una orden para administración.
--   - ajustar_parqueo_orden: guarda ajustes manuales de administración sobre la orden.
--
-- Reescrituras:
--   - recalculate_order_totals: suma orden_parqueo.monto a total_general.
--   - entregar_orden: recalcula parqueo antes de determinar el saldo.
--   - saldo_retiro: incluye parqueo en cobro y desglose.
--   - datos_portal: recalcula parqueo y añade cuenta.parqueo.
--   - datos_correo: añade objeto parqueo cuando avisar_cliente está activo.
--   - trg_historial: audita cambios manuales en orden_parqueo.
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. Tablas y RLS
-- ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.parqueo_config (
  sede_id                 UUID PRIMARY KEY REFERENCES public.sedes(id) ON DELETE CASCADE,
  habilitado              BOOLEAN NOT NULL DEFAULT false,
  vigente_desde           DATE,
  incluir_ordenes_previas BOOLEAN NOT NULL DEFAULT false,
  avisar_cliente          BOOLEAN NOT NULL DEFAULT true,
  politica_es             TEXT,
  politica_en             TEXT,
  actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por         UUID REFERENCES public.perfiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.parqueo_perfiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id             UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('seguro', 'particular')),
  habilitado          BOOLEAN NOT NULL DEFAULT true,
  evento_inicio       TEXT NOT NULL CHECK (evento_inicio IN ('ingreso', 'lista_para_entregar')),
  cobra_dia_evento    BOOLEAN NOT NULL,
  dias_gracia         INT NOT NULL DEFAULT 0 CHECK (dias_gracia BETWEEN 0 AND 365),
  gracia_dias_habiles BOOLEAN NOT NULL DEFAULT false,
  tope_dias           INT CHECK (tope_dias > 0),
  tope_monto          NUMERIC(12,2) CHECK (tope_monto > 0),
  UNIQUE (sede_id, tipo)
);

CREATE TABLE IF NOT EXISTS public.parqueo_tramos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id     UUID NOT NULL REFERENCES public.parqueo_perfiles(id) ON DELETE CASCADE,
  desde_dia     INT NOT NULL CHECK (desde_dia >= 1),
  tarifa_diaria NUMERIC(12,2) NOT NULL CHECK (tarifa_diaria >= 0),
  UNIQUE (perfil_id, desde_dia)
);

CREATE TABLE IF NOT EXISTS public.orden_parqueo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id        UUID NOT NULL UNIQUE REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  -- Decisiones de administración (ajustar_parqueo_orden):
  cobrar          BOOLEAN NOT NULL DEFAULT true,
  tarifa_manual   NUMERIC(12,2) CHECK (tarifa_manual >= 0),
  inicio_manual   DATE,
  dias_exonerados INT NOT NULL DEFAULT 0 CHECK (dias_exonerados >= 0),
  nota            TEXT,
  -- Cálculo del sistema (_recalcular_parqueo):
  perfil          TEXT CHECK (perfil IN ('seguro', 'particular')),
  estado          TEXT NOT NULL DEFAULT 'inactivo' CHECK (estado IN ('inactivo', 'sin_cobro', 'orden_previa', 'esperando', 'por_empezar', 'acumulando', 'cerrado')),
  inicio_cobro    DATE,
  fin_congelado   DATE,
  dias_cobrados   INT NOT NULL DEFAULT 0,
  monto           NUMERIC(12,2) NOT NULL DEFAULT 0,
  detalle         JSONB NOT NULL DEFAULT '[]'::jsonb,
  tope_aplicado   BOOLEAN NOT NULL DEFAULT false,
  calculado_hasta DATE,
  calculado_en    TIMESTAMPTZ
);

ALTER TABLE public.parqueo_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parqueo_perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parqueo_tramos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_parqueo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parqueo_config_select_admin ON public.parqueo_config;
CREATE POLICY parqueo_config_select_admin ON public.parqueo_config
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS parqueo_perfiles_select_admin ON public.parqueo_perfiles;
CREATE POLICY parqueo_perfiles_select_admin ON public.parqueo_perfiles
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS parqueo_tramos_select_admin ON public.parqueo_tramos;
CREATE POLICY parqueo_tramos_select_admin ON public.parqueo_tramos
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS orden_parqueo_select_admin ON public.orden_parqueo;
CREATE POLICY orden_parqueo_select_admin ON public.orden_parqueo
  FOR SELECT TO authenticated USING (public.is_admin());

-- ------------------------------------------------------------------------------------
-- 2. Función pura de cálculo: _parqueo_calculo
-- ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._parqueo_calculo(
  p_perfil        JSONB,          -- {cobra_dia_evento, dias_gracia, gracia_dias_habiles, tope_dias, tope_monto, tramos:[{desde_dia, tarifa_diaria}]}
  p_fecha_evento  DATE,           -- NULL: el evento todavía no pasa
  p_hasta         DATE,           -- último día que se cuenta
  p_vigente_desde DATE DEFAULT NULL,
  p_ajustes       JSONB DEFAULT '{}'::jsonb  -- {tarifa_manual, inicio_manual, dias_exonerados}
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
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
REVOKE ALL ON FUNCTION public._parqueo_calculo(JSONB, DATE, DATE, DATE, JSONB) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------
-- 3. Funciones internas del módulo
-- ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._parqueo_calcular(
  p_orden_id UUID,
  p_hasta    DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public._parqueo_calcular(UUID, DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._recalcular_parqueo(p_orden_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sede_id UUID;
  v_res     JSONB;
BEGIN
  SELECT sede_id INTO v_sede_id FROM ordenes_trabajo WHERE id = p_orden_id;
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
REVOKE ALL ON FUNCTION public._recalcular_parqueo(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_parqueo_pendiente()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public.recalcular_parqueo_pendiente() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'restorify-parqueo',
  '7 * * * *',
  $$SELECT public.recalcular_parqueo_pendiente()$$
);

CREATE OR REPLACE FUNCTION public.trg_parqueo_orden()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public.trg_parqueo_orden() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_parqueo_orden ON public.ordenes_trabajo;
CREATE TRIGGER trg_parqueo_orden
  AFTER INSERT OR UPDATE OF estatus, con_seguro, lista_para_entregar_en, fecha_ingreso
  ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_parqueo_orden();

-- ------------------------------------------------------------------------------------
-- 4. RPCs para la aplicación
-- ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parqueo_config_sede(p_sede_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public.parqueo_config_sede(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parqueo_config_sede(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.guardar_config_parqueo(
  p_sede_id UUID,
  p_config  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public.guardar_config_parqueo(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_config_parqueo(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.vista_previa_parqueo(
  p_perfil       JSONB,
  p_fecha_evento DATE,
  p_hasta        DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public.vista_previa_parqueo(JSONB, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vista_previa_parqueo(JSONB, DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.parqueo_de_orden(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public.parqueo_de_orden(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parqueo_de_orden(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ajustar_parqueo_orden(
  p_orden_id UUID,
  p_ajustes  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF NOT EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = p_orden_id) THEN
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
REVOKE ALL ON FUNCTION public.ajustar_parqueo_orden(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_parqueo_orden(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 5. Reescritura de funciones vigentes
-- ------------------------------------------------------------------------------------

-- recalculate_order_totals (vigente en 20261010000017)
CREATE OR REPLACE FUNCTION public.recalculate_order_totals(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  labor_total NUMERIC;
  parts_total NUMERIC;
  v_descuento NUMERIC;
  v_parqueo   NUMERIC;
  v_total     NUMERIC;
BEGIN
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
REVOKE ALL ON FUNCTION public.recalculate_order_totals(UUID) FROM PUBLIC, anon, authenticated;

-- Parte de 20261010000017. Cambia: cuenta el parqueo hasta hoy antes del saldo y lo deja fijo
-- (`fin_congelado`) antes de marcar la orden entregada.
CREATE OR REPLACE FUNCTION public.entregar_orden(
  p_orden_id         UUID,
  p_metodo           TEXT DEFAULT NULL,
  p_numero_cheque    TEXT DEFAULT NULL,
  p_comprobante_ruta TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public.entregar_orden(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entregar_orden(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- saldo_retiro (vigente en 20261010000017)
CREATE OR REPLACE FUNCTION public.saldo_retiro(
  p_orden_id  UUID,
  p_cobro     NUMERIC DEFAULT 0,
  p_conservar UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public.saldo_retiro(UUID, NUMERIC, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saldo_retiro(UUID, NUMERIC, UUID[]) TO authenticated;

-- datos_portal (vigente en 20261010000025)
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
    -- Texto original → inglés de lo que el taller escribió a mano. Antes solo el PDF lo
    -- usaba y el enlace mostraba todo en español (06/10/2026).
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
    -- Los avances que el técnico decidió mostrar. Sin autor, y solo si tienen algo que
    -- contar: un avance publicado sin texto ni archivos visibles sería una tarjeta en blanco.
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
    -- F6: lo que el taller vio y el cliente no tiene que autorizar ahora ("las llantas
    -- traseras están a la mitad"). Solo el texto del admin, nunca el del mecánico.
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
    -- Las piezas que el taller pidió y no han llegado: por qué la orden no avanza. Solo el
    -- nombre, sin precio ni proveedor.
    'esperando_repuestos', CASE WHEN v_orden.estatus = 'entregado' THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('descripcion', r.descripcion, 'desde', r.pedido_en) ORDER BY r.pedido_en, r.descripcion)
      FROM orden_repuestos r
      WHERE r.orden_id = v_orden.id AND r.estado_pedido = 'pedido' AND r.estado <> 'rechazado'
    ), '[]'::jsonb) END,
    -- El presupuesto que espera su respuesta. Los ids de las líneas viajan porque el
    -- cliente responde línea por línea.
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
    -- Constancia de lo que ya respondió (o firmó).
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
    -- Lo que se cobra: solo lo aprobado, a precio de venta, menos el descuento, más el parqueo
    -- (`total` ya lo trae; `parqueo` es su desglose).
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
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.datos_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_portal(TEXT) TO service_role;

-- datos_correo (vigente en 20261010000025)
CREATE OR REPLACE FUNCTION public.datos_correo(p_cola_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL ON FUNCTION public.datos_correo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_correo(UUID) TO service_role;

ALTER TABLE public.historial_orden DROP CONSTRAINT IF EXISTS historial_orden_entidad_check;
ALTER TABLE public.historial_orden ADD CONSTRAINT historial_orden_entidad_check
  CHECK (entidad IN ('orden', 'mano_obra', 'repuesto', 'asignacion', 'deposito', 'descuento',
                     'presupuesto', 'archivo', 'avance', 'parqueo'));

-- trg_historial (vigente en 20261010000027)
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
        -- El técnico, por nombre: un uuid no le dice nada a quien lee el historial.
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
        -- `reparto`: si entra al reparto heredado (origen 'manual') o cobra solo sus tareas
        -- ('tarea'). Es dinero que decide administración, así que se registra.
        v_campos := ARRAY['tipo_tarea', 'reparto'];
        IF v_antes IS NOT NULL THEN
          v_antes := v_antes || jsonb_build_object('reparto', (v_antes ->> 'origen') = 'manual');
        END IF;
        IF v_despues IS NOT NULL THEN
          v_despues := v_despues || jsonb_build_object('reparto', (v_despues ->> 'origen') = 'manual');
        END IF;
      WHEN 'orden_montos' THEN
        -- Un cambio del depósito o un descuento: cada uno se lee como su propia acción.
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
        -- Si es una creación del sistema sin ningún ajuste manual, no registrar en el historial
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
      ELSE
        RETURN NULL;
    END CASE;

    v_cambios := CASE TG_OP
      WHEN 'UPDATE' THEN public._historial_diferencias(v_antes, v_despues, v_campos)
      WHEN 'INSERT' THEN public._historial_valores(v_despues, v_campos, 'despues')
      ELSE public._historial_valores(v_antes, v_campos, 'antes')
    END;

    -- Un UPDATE que no cambió nada de lo que se registra no deja fila.
    IF TG_OP = 'UPDATE' AND v_cambios = '{}'::jsonb THEN
      RETURN NULL;
    END IF;

    IF TG_TABLE_NAME = 'ordenes_trabajo' THEN
      v_numero := v_fila ->> 'numero_orden';
      v_sede := (v_fila ->> 'sede_id')::uuid;
    ELSE
      SELECT numero_orden, sede_id INTO v_numero, v_sede FROM ordenes_trabajo WHERE id = v_orden;
      -- La orden ya no existe: es una hija que se va en cascada con ella. Su borrado ya quedó
      -- registrado como el de la orden.
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
      CASE WHEN TG_TABLE_NAME = 'orden_montos' THEN v_orden ELSE (v_fila ->> 'id')::uuid END,
      v_accion, v_resumen, v_cambios
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'historial_orden (%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_historial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_historial ON public.orden_parqueo;
CREATE TRIGGER trg_historial
  AFTER INSERT OR UPDATE OF
    cobrar, tarifa_manual, inicio_manual, dias_exonerados, nota
  ON public.orden_parqueo
  FOR EACH ROW EXECUTE FUNCTION public.trg_historial();
