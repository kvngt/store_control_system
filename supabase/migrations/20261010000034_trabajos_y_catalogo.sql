-- ====================================================================================
-- RESTORIFY — Trabajos agrupados y catálogo, la base (20261010000034)
-- ====================================================================================
-- Plan SaaS (17/10/2026), Parte H (plan 1.1).
--
-- Qué cambia para el taller:
-- 1. Un trabajo («Frenos delanteros») junta su mano de obra y sus repuestos.
-- 2. El cliente lo autoriza completo, como en todos los programas de pago.
-- 3. Administración arma un catálogo de trabajos frecuentes con precio por sede y los
--    agrega a una orden con un toque, también en el alta.
-- 4. Las líneas sueltas siguen funcionando igual. Una línea sin trabajo es su propio
--    renglón, como hoy.
--
-- Reescrituras:
-- - create_work_order: reescrita entera desde 20261010000031:54, leyendo p_order->'trabajos'
--   y asignando trabajo_id a mano de obra y repuestos.
-- - _resolver_presupuesto: reescrita entera desde 20261010000022:600, autorizando el trabajo
--   entero si una de sus líneas fue aprobada.
-- - datos_portal: reescrita entera desde 20261010000031:235, agregando 'trabajo_id' y
--   'trabajo' a cada línea y el desglose 'trabajos' al presupuesto.
-- - _textos_cliente: reescrita entera desde 20261010000022:91, sumando los títulos de
--   orden_trabajos para traducción.
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- H0. Tablas, llaves foráneas, índices y RLS
-- ------------------------------------------------------------------------------------

-- 1. Catálogo de trabajos frecuentes por sede
CREATE TABLE public.catalogo_trabajos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id        UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL CHECK (char_length(btrim(nombre)) > 0 AND char_length(nombre) <= 120),
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_por     UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_catalogo_trabajos_sede_nombre
  ON public.catalogo_trabajos (sede_id, lower(btrim(nombre)));

CREATE INDEX idx_catalogo_trabajos_sede_id ON public.catalogo_trabajos (sede_id);
CREATE INDEX idx_catalogo_trabajos_creado_por ON public.catalogo_trabajos (creado_por);

-- 2. Líneas del catálogo (plantilla de mano de obra y repuestos)
CREATE TABLE public.catalogo_trabajo_lineas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogo_id    UUID NOT NULL REFERENCES public.catalogo_trabajos(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL CHECK (tipo IN ('mano_obra', 'repuesto')),
  descripcion    TEXT NOT NULL CHECK (char_length(btrim(descripcion)) > 0 AND char_length(descripcion) <= 200),
  especialidad   TEXT CHECK (especialidad IN ('mecanica', 'pintura')),
  cantidad       INTEGER NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
  precio         NUMERIC NOT NULL DEFAULT 0 CHECK (precio >= 0),
  costo_unitario NUMERIC CHECK (costo_unitario >= 0),
  posicion       INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT catalogo_trabajo_lineas_forma_check CHECK (
    (tipo = 'mano_obra' AND especialidad IS NOT NULL AND cantidad = 1 AND costo_unitario IS NULL)
    OR
    (tipo = 'repuesto' AND especialidad IS NULL)
  )
);

CREATE INDEX idx_catalogo_trabajo_lineas_catalogo_id
  ON public.catalogo_trabajo_lineas (catalogo_id);

-- 3. Trabajos de una orden
CREATE TABLE public.orden_trabajos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id    UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL CHECK (char_length(btrim(titulo)) > 0 AND char_length(titulo) <= 120),
  catalogo_id UUID REFERENCES public.catalogo_trabajos(id) ON DELETE SET NULL,
  creado_por  UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orden_trabajos_id_orden_id_unique UNIQUE (id, orden_id)
);

CREATE INDEX idx_orden_trabajos_orden_id ON public.orden_trabajos (orden_id);
CREATE INDEX idx_orden_trabajos_catalogo_id ON public.orden_trabajos (catalogo_id);
CREATE INDEX idx_orden_trabajos_creado_por ON public.orden_trabajos (creado_por);

-- 4. Columnas trabajo_id y claves compuestas en orden_labor y orden_repuestos
ALTER TABLE public.orden_labor
  ADD COLUMN trabajo_id UUID;

CREATE INDEX idx_orden_labor_trabajo_id ON public.orden_labor (trabajo_id);

ALTER TABLE public.orden_labor
  ADD CONSTRAINT orden_labor_trabajo_fk
  FOREIGN KEY (trabajo_id, orden_id)
  REFERENCES public.orden_trabajos (id, orden_id)
  ON DELETE SET NULL (trabajo_id);

ALTER TABLE public.orden_repuestos
  ADD COLUMN trabajo_id UUID;

CREATE INDEX idx_orden_repuestos_trabajo_id ON public.orden_repuestos (trabajo_id);

ALTER TABLE public.orden_repuestos
  ADD CONSTRAINT orden_repuestos_trabajo_fk
  FOREIGN KEY (trabajo_id, orden_id)
  REFERENCES public.orden_trabajos (id, orden_id)
  ON DELETE SET NULL (trabajo_id);

-- 5. RLS y permisos de tabla
ALTER TABLE public.catalogo_trabajos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_trabajo_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_trabajos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalogo_trabajos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalogo_trabajos TO authenticated;

REVOKE ALL ON TABLE public.catalogo_trabajo_lineas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalogo_trabajo_lineas TO authenticated;

REVOKE ALL ON TABLE public.orden_trabajos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orden_trabajos TO authenticated;

-- Políticas catalogo_trabajos (solo admin)
CREATE POLICY catalogo_trabajos_select_admin ON public.catalogo_trabajos
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

CREATE POLICY catalogo_trabajos_insert_admin ON public.catalogo_trabajos
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY catalogo_trabajos_update_admin ON public.catalogo_trabajos
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY catalogo_trabajos_delete_admin ON public.catalogo_trabajos
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- Políticas catalogo_trabajo_lineas (solo admin)
CREATE POLICY catalogo_trabajo_lineas_select_admin ON public.catalogo_trabajo_lineas
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

CREATE POLICY catalogo_trabajo_lineas_insert_admin ON public.catalogo_trabajo_lineas
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY catalogo_trabajo_lineas_update_admin ON public.catalogo_trabajo_lineas
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY catalogo_trabajo_lineas_delete_admin ON public.catalogo_trabajo_lineas
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- Políticas orden_trabajos (SELECT como orden_labor; INSERT, UPDATE, DELETE solo admin)
CREATE POLICY orden_trabajos_select ON public.orden_trabajos
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[]));

CREATE POLICY orden_trabajos_insert_admin ON public.orden_trabajos
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY orden_trabajos_update_admin ON public.orden_trabajos
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY orden_trabajos_delete_admin ON public.orden_trabajos
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 6. Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orden_trabajos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_trabajos;
  END IF;
END $$;


-- ------------------------------------------------------------------------------------
-- H1. Funciones nuevas
-- ------------------------------------------------------------------------------------

-- 1. Agregar trabajo del catálogo a una orden
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
    orden_id, trabajo_id, descripcion, costo, especialidad, asignado_a, reparto_heredado
  )
  SELECT
    v_orden.id,
    v_trabajo_id,
    l.descripcion,
    l.precio,
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

-- 2. Quitar trabajo y sus líneas
CREATE OR REPLACE FUNCTION public.quitar_trabajo(p_trabajo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.quitar_trabajo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quitar_trabajo(UUID) TO authenticated;

-- 3. Renombrar trabajo
CREATE OR REPLACE FUNCTION public.renombrar_trabajo(p_trabajo_id UUID, p_titulo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.renombrar_trabajo(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renombrar_trabajo(UUID, TEXT) TO authenticated;

-- 4. Trabajos de una orden (solo admin)
CREATE OR REPLACE FUNCTION public.trabajos_de_orden(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.trabajos_de_orden(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trabajos_de_orden(UUID) TO authenticated;

-- 5. Catálogo de trabajos por sede (solo admin)
CREATE OR REPLACE FUNCTION public.catalogo_de_trabajos(
  p_sede_id           UUID,
  p_incluir_inactivos BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.catalogo_de_trabajos(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalogo_de_trabajos(UUID, BOOLEAN) TO authenticated;

-- 6. Guardar trabajo en el catálogo (crear o editar)
CREATE OR REPLACE FUNCTION public.guardar_trabajo_catalogo(
  p_id      UUID,
  p_sede_id UUID,
  p_nombre  TEXT,
  p_activo  BOOLEAN,
  p_lineas  JSONB
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

REVOKE ALL ON FUNCTION public.guardar_trabajo_catalogo(UUID, UUID, TEXT, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_trabajo_catalogo(UUID, UUID, TEXT, BOOLEAN, JSONB) TO authenticated;

-- 7. Borrar trabajo del catálogo
CREATE OR REPLACE FUNCTION public.borrar_trabajo_catalogo(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede borrar trabajos del catálogo.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.catalogo_trabajos WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.borrar_trabajo_catalogo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_trabajo_catalogo(UUID) TO authenticated;


-- ------------------------------------------------------------------------------------
-- H2. Funciones que cambian (reescritas enteras desde su versión vigente)
-- ------------------------------------------------------------------------------------

-- 1. create_work_order: reescrita entera desde 20261010000031_marcas_de_danos.sql:54
-- Cambios (20261010000034):
--   - Lee p_order->'trabajos', inserta cada trabajo de la orden y guarda su id en v_mapa.
--   - Asigna trabajo_id en orden_labor y orden_repuestos según item->>'grupo'.
CREATE OR REPLACE FUNCTION public.create_work_order(
  p_order       JSONB,
  p_labor       JSONB DEFAULT '[]'::jsonb,
  p_parts       JSONB DEFAULT '[]'::jsonb,
  p_assignments JSONB DEFAULT '[]'::jsonb
)
RETURNS ordenes_trabajo
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order      ordenes_trabajo;
  v_admin      BOOLEAN := public.is_admin();
  v_deposito   NUMERIC := GREATEST(COALESCE((p_order->>'deposito_inicial')::numeric, 0), 0);
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
    COALESCE((p_order->>'millas_ingreso')::int, 0),
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
    INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, reparto_heredado, trabajo_id)
    SELECT
      v_order.id,
      item->>'descripcion',
      GREATEST(COALESCE((item->>'costo')::numeric, 0), 0),
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
        NULLIF(GREATEST(COALESCE((item->>'costo_unitario')::numeric, -1), -1), -1),
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
$$;

REVOKE ALL ON FUNCTION public.create_work_order(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_work_order(JSONB, JSONB, JSONB, JSONB) TO authenticated;


-- 2. _resolver_presupuesto: reescrita entera desde 20261010000022_firma_idioma_y_rechazos.sql:600
-- Cambios (20261010000034):
--   - si el cliente aprobó una línea de un trabajo, se aprueba el trabajo entero (20261010000034)
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
$$;

REVOKE ALL ON FUNCTION public._resolver_presupuesto(UUID, UUID[], TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- 3. datos_portal: reescrita entera desde 20261010000031_marcas_de_danos.sql:235
-- Cambios (20261010000034):
--   - cada línea suma 'trabajo_id' y 'trabajo' (el título) mediante LEFT JOIN orden_trabajos.
--   - el presupuesto suma 'trabajos': un arreglo de {id, titulo, total} de los trabajos que
--     tienen líneas pendiente en ese presupuesto.
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
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.datos_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_portal(TEXT) TO service_role;


-- 4. _textos_cliente: reescrita entera desde 20261010000022_firma_idioma_y_rechazos.sql:91
-- Cambios (20261010000034):
--   - suma los títulos de orden_trabajos para traducción automática.
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
  ) t
  WHERE nullif(trim(t.texto), '') IS NOT NULL;

  RETURN COALESCE(v_textos, ARRAY[]::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public._textos_cliente(UUID) FROM PUBLIC, anon, authenticated;
