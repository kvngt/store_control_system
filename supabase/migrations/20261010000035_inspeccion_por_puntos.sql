-- ====================================================================================
-- RESTORIFY — Inspección por puntos, la base (20261010000035)
-- ====================================================================================
-- Plan SaaS (17/10/2026), Parte J (plan 1.4).
--
-- Qué cambia para el taller:
-- 1. El técnico revisa el carro con una lista de puntos (frenos, llantas, fluidos,
--    luces…). Marca cada uno con un toque: bien, atención o urgente, y le toma foto.
-- 2. Administración la revisa y la muestra al cliente en su enlace. Lo que salió en
--    atención o urgente se cotiza con lo de siempre (tarea o catálogo).
-- 3. Lo que no se hizo queda como pendiente del vehículo para la próxima visita.
-- 4. Las 6 zonas de fotos de la recepción no cambian (cómo llegó el carro).
--
-- Reescrituras:
-- - datos_portal: reescrita entera desde 20261010000034:935, sumando 'inspeccion'
--   cuando está publicada e incluyendo inspeccion_punto_id en multimedia.
-- - _textos_cliente: reescrita entera desde 20261010000034:1259, sumando nombres y
--   notas de puntos de inspecciones publicadas para traducción automática.
-- - trabajos_pendientes_vehiculo: reescrita entera desde 20261010000018:276, sumando
--   puntos en atención o urgente de inspecciones completadas de otras órdenes.
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- J0. Tablas, llaves foráneas, índices, RLS y Realtime
-- ------------------------------------------------------------------------------------

-- 1. Plantillas por sede (solo administración)
CREATE TABLE public.inspeccion_plantillas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id        UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL CHECK (char_length(btrim(nombre)) > 0 AND char_length(nombre) <= 120),
  activo         BOOLEAN NOT NULL DEFAULT true,
  predeterminada BOOLEAN NOT NULL DEFAULT false,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_inspeccion_plantillas_sede_predeterminada
  ON public.inspeccion_plantillas (sede_id)
  WHERE predeterminada = true;

CREATE INDEX idx_inspeccion_plantillas_sede_id ON public.inspeccion_plantillas (sede_id);

CREATE TABLE public.inspeccion_plantilla_puntos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id UUID NOT NULL REFERENCES public.inspeccion_plantillas(id) ON DELETE CASCADE,
  seccion      TEXT NOT NULL CHECK (char_length(btrim(seccion)) > 0 AND char_length(seccion) <= 120),
  nombre       TEXT NOT NULL CHECK (char_length(btrim(nombre)) > 0 AND char_length(nombre) <= 120),
  posicion     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_inspeccion_plantilla_puntos_plantilla_id
  ON public.inspeccion_plantilla_puntos (plantilla_id);

-- 2. Inspección de la orden
CREATE TABLE public.orden_inspecciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id       UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  plantilla_id   UUID REFERENCES public.inspeccion_plantillas(id) ON DELETE SET NULL,
  nombre         TEXT NOT NULL CHECK (char_length(btrim(nombre)) > 0 AND char_length(nombre) <= 120),
  creado_por     UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completada_en  TIMESTAMPTZ,
  completada_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  publicada_en   TIMESTAMPTZ,
  CONSTRAINT orden_inspecciones_orden_id_unique UNIQUE (orden_id)
);

CREATE INDEX idx_orden_inspecciones_orden_id ON public.orden_inspecciones (orden_id);
CREATE INDEX idx_orden_inspecciones_plantilla_id ON public.orden_inspecciones (plantilla_id);

CREATE TABLE public.orden_inspeccion_puntos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspeccion_id   UUID NOT NULL REFERENCES public.orden_inspecciones(id) ON DELETE CASCADE,
  orden_id        UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  seccion         TEXT NOT NULL CHECK (char_length(btrim(seccion)) > 0 AND char_length(seccion) <= 120),
  nombre          TEXT NOT NULL CHECK (char_length(btrim(nombre)) > 0 AND char_length(nombre) <= 120),
  posicion        INTEGER NOT NULL DEFAULT 0,
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'bien', 'atencion', 'urgente', 'no_aplica')),
  nota            TEXT CHECK (nota IS NULL OR char_length(nota) <= 500),
  actualizado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  actualizado_en  TIMESTAMPTZ,
  CONSTRAINT orden_inspeccion_puntos_id_orden_id_unique UNIQUE (id, orden_id)
);

CREATE INDEX idx_orden_inspeccion_puntos_inspeccion_id ON public.orden_inspeccion_puntos (inspeccion_id);
CREATE INDEX idx_orden_inspeccion_puntos_orden_id ON public.orden_inspeccion_puntos (orden_id);

-- 3. RLS y permisos
ALTER TABLE public.inspeccion_plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspeccion_plantilla_puntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_inspecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_inspeccion_puntos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.inspeccion_plantillas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspeccion_plantillas TO authenticated;

REVOKE ALL ON TABLE public.inspeccion_plantilla_puntos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspeccion_plantilla_puntos TO authenticated;

REVOKE ALL ON TABLE public.orden_inspecciones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orden_inspecciones TO authenticated;

REVOKE ALL ON TABLE public.orden_inspeccion_puntos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orden_inspeccion_puntos TO authenticated;

-- Políticas plantillas (solo administración)
CREATE POLICY inspeccion_plantillas_select_admin ON public.inspeccion_plantillas
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

CREATE POLICY inspeccion_plantillas_insert_admin ON public.inspeccion_plantillas
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY inspeccion_plantillas_update_admin ON public.inspeccion_plantillas
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY inspeccion_plantillas_delete_admin ON public.inspeccion_plantillas
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

CREATE POLICY inspeccion_plantilla_puntos_select_admin ON public.inspeccion_plantilla_puntos
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

CREATE POLICY inspeccion_plantilla_puntos_insert_admin ON public.inspeccion_plantilla_puntos
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY inspeccion_plantilla_puntos_update_admin ON public.inspeccion_plantilla_puntos
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY inspeccion_plantilla_puntos_delete_admin ON public.inspeccion_plantilla_puntos
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- Políticas orden_inspecciones y puntos (SELECT para admin o asignado; sin INSERT/UPDATE/DELETE desde la API)
CREATE POLICY orden_inspecciones_select ON public.orden_inspecciones
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));

CREATE POLICY orden_inspeccion_puntos_select ON public.orden_inspeccion_puntos
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));

-- 4. Fotos por punto en orden_media
ALTER TABLE public.orden_media
  ADD COLUMN inspeccion_punto_id UUID;

CREATE INDEX idx_orden_media_inspeccion_punto_id ON public.orden_media (inspeccion_punto_id);

ALTER TABLE public.orden_media
  ADD CONSTRAINT orden_media_inspeccion_punto_fk
  FOREIGN KEY (inspeccion_punto_id, orden_id)
  REFERENCES public.orden_inspeccion_puntos (id, orden_id)
  ON DELETE CASCADE;

ALTER TABLE public.orden_media DROP CONSTRAINT IF EXISTS orden_media_origen_check;
ALTER TABLE public.orden_media ADD CONSTRAINT orden_media_origen_check
  CHECK (origen IN ('recepcion', 'avance', 'inspeccion'));

ALTER TABLE public.orden_media DROP CONSTRAINT IF EXISTS orden_media_origen_coherente;
ALTER TABLE public.orden_media ADD CONSTRAINT orden_media_origen_coherente CHECK (
  (origen = 'avance') = (avance_id IS NOT NULL)
  AND
  (origen = 'inspeccion') = (inspeccion_punto_id IS NOT NULL)
);

-- 5. Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orden_inspecciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_inspecciones;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orden_inspeccion_puntos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_inspeccion_puntos;
  END IF;
END $$;

-- 6. Función interna de siembra de plantilla predeterminada y trigger para sedes nuevas
CREATE OR REPLACE FUNCTION public._sembrar_plantilla_inspeccion(p_sede_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public._sembrar_plantilla_inspeccion(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_sede_inspeccion_plantilla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.trg_sede_inspeccion_plantilla() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sede_sembrar_inspeccion ON public.sedes;
CREATE TRIGGER trg_sede_sembrar_inspeccion
  AFTER INSERT ON public.sedes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sede_inspeccion_plantilla();

-- Sembrar plantilla en sedes existentes
DO $$
DECLARE
  v_sede RECORD;
BEGIN
  FOR v_sede IN SELECT id FROM public.sedes LOOP
    PERFORM public._sembrar_plantilla_inspeccion(v_sede.id);
  END LOOP;
END $$;


-- ------------------------------------------------------------------------------------
-- J1. Funciones nuevas
-- ------------------------------------------------------------------------------------

-- 1. Iniciar inspección
CREATE OR REPLACE FUNCTION public.iniciar_inspeccion(
  p_orden_id     UUID,
  p_plantilla_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.iniciar_inspeccion(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_inspeccion(UUID, UUID) TO authenticated;

-- 2. Marcar punto de inspección
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
  v_punto RECORD;
  v_nota  TEXT;
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
  IF EXISTS (SELECT 1 FROM public.orden_inspecciones WHERE id = v_punto.inspeccion_id AND publicada_en IS NOT NULL) THEN
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

-- 3. Completar inspección
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

-- 4. Publicar inspección (admin)
CREATE OR REPLACE FUNCTION public.publicar_inspeccion(
  p_inspeccion_id UUID,
  p_publicar      BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
-- DEFINER: la tabla es de solo lectura por la API (se escribe por RPC). Con INVOKER, ni
-- administración podía publicar; la revisión con capturas lo encontró (17/10/2026).
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.publicar_inspeccion(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_inspeccion(UUID, BOOLEAN) TO authenticated;

-- 5. Plantillas de inspección (admin)
CREATE OR REPLACE FUNCTION public.plantillas_inspeccion(p_sede_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.plantillas_inspeccion(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plantillas_inspeccion(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.guardar_plantilla_inspeccion(
  p_id             UUID,
  p_sede_id        UUID,
  p_nombre         TEXT,
  p_activo         BOOLEAN,
  p_predeterminada BOOLEAN,
  p_puntos         JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.guardar_plantilla_inspeccion(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_plantilla_inspeccion(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.borrar_plantilla_inspeccion(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede borrar plantillas de inspección.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.inspeccion_plantillas WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.borrar_plantilla_inspeccion(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_plantilla_inspeccion(UUID) TO authenticated;


-- ------------------------------------------------------------------------------------
-- J2. Funciones que cambian (reescritas enteras desde su versión vigente)
-- ------------------------------------------------------------------------------------

-- 1. datos_portal: reescrita entera desde 20261010000034_trabajos_y_catalogo.sql:935
-- Cambios (20261010000035):
--   - si la orden tiene inspección publicada, suma 'inspeccion' con nombre, completada_en,
--     resumen (urgente, atencion, bien) y puntos filtrados (sin pendiente ni no_aplica)
--     ordenados por estado y posicion.
--   - multimedia suma 'inspeccion_punto_id' en cada elemento.
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
$$;

REVOKE ALL ON FUNCTION public.datos_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_portal(TEXT) TO service_role;

-- 2. _textos_cliente: reescrita entera desde 20261010000034_trabajos_y_catalogo.sql:1259
-- Cambios (20261010000035):
--   - suma los nombres y las notas de los puntos de una inspección publicada.
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
  ) t
  WHERE nullif(trim(t.texto), '') IS NOT NULL;

  RETURN COALESCE(v_textos, ARRAY[]::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public._textos_cliente(UUID) FROM PUBLIC, anon, authenticated;

-- 3. trabajos_pendientes_vehiculo: reescrita entera desde 20261010000018_operacion_del_taller.sql:276
-- Cambios (20261010000035):
--   - suma filas 'inspeccion' (monto NULL): puntos en 'atencion' o 'urgente' de inspecciones
--     completadas de otras órdenes del vehículo, respetando LIMIT 20 y orden por fecha.
CREATE OR REPLACE FUNCTION public.trabajos_pendientes_vehiculo(p_vehiculo_id UUID, p_excluir_orden UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.trabajos_pendientes_vehiculo(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trabajos_pendientes_vehiculo(UUID, UUID) TO authenticated;
