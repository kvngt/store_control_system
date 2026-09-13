-- ====================================================================================
-- RESTORIFY — Fotos, videos y notas de voz de una orden
-- ====================================================================================
-- Pedido del cliente: que el técnico documente la orden con fotos, videos cortos
-- (hasta 2 minutos) y notas de voz, y que el cliente final pueda verlos después
-- en el reporte web.
--
-- Hasta ahora las fotos eran URLs públicas guardadas en arreglos de texto
-- (`ordenes_trabajo.inspeccion_360_fotos`, `orden_avances.fotos`) apuntando al
-- bucket PÚBLICO `vehiculos_fotos`, subidas tal como salían del teléfono: 3–8 MB
-- por foto, con el GPS del EXIF adentro, y con placas y VIN a una URL adivinable.
-- Un arreglo de URLs tampoco puede decir qué es cada archivo, cuánto dura, si ya
-- se puede mostrar al cliente, ni quién lo subió.
--
-- El modelo nuevo:
--   orden_media    una fila por archivo, con tipo, duración, dimensiones,
--                  visibilidad para el cliente y proveedor
--   orden_media/   bucket PRIVADO; se lee con URLs firmadas de vida corta
--
-- El navegador comprime antes de subir (fotos a 1920 px, video a 720p), así que
-- el límite del bucket es un tope de seguridad y no el tamaño esperado: un video
-- de 2 minutos comprimido pesa ~25 MB.
--
-- IMPORTANTE, fuera de SQL: Supabase aplica primero el límite GLOBAL de tamaño de
-- archivo del proyecto (Storage → Settings, 50 MB por defecto) y después el del
-- bucket. Hay que subir el global a 100 MB o los videos largos serán rechazados
-- aunque este bucket los permita.

-- ------------------------------------------------------------------------------------
-- 1. El bucket.
-- ------------------------------------------------------------------------------------
-- Tipos sin parámetros de códec: el cliente normaliza `video/webm;codecs=vp9` a
-- `video/webm` al subir, porque Storage compara el Content-Type completo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'orden_media',
  'orden_media',
  false,
  104857600, -- 100 MB
  ARRAY[
    'image/jpeg', 'image/png',
    'video/mp4', 'video/webm',
    'audio/mp4', 'audio/webm', 'audio/mpeg', 'audio/ogg'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Rutas: {sede_id}/{orden_id}/{archivo}. La primera carpeta decide la sede y la
-- segunda la orden; las políticas se apoyan en eso.
DROP POLICY IF EXISTS "orden_media_select" ON storage.objects;
CREATE POLICY "orden_media_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'orden_media'
  AND (
    public.is_admin()
    OR (storage.foldername(name))[1] = public.current_user_sede_id()::text
  )
);

DROP POLICY IF EXISTS "orden_media_insert" ON storage.objects;
CREATE POLICY "orden_media_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'orden_media'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM ordenes_trabajo o
    WHERE o.id::text = (storage.foldername(name))[2]
      AND o.sede_id::text = (storage.foldername(name))[1]
      AND (public.is_admin() OR o.sede_id = public.current_user_sede_id())
  )
);

-- Borrar un archivo: el admin, o quien lo subió. Sin política de UPDATE: nada
-- sobrescribe un archivo existente (las rutas llevan un UUID nuevo cada vez).
DROP POLICY IF EXISTS "orden_media_delete" ON storage.objects;
CREATE POLICY "orden_media_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'orden_media'
  AND (public.is_admin() OR owner = auth.uid())
);

-- ------------------------------------------------------------------------------------
-- 2. La tabla.
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orden_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id        UUID NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  -- Derivada de la orden por trigger; el cliente no la decide.
  sede_id         UUID NOT NULL REFERENCES sedes(id) ON DELETE CASCADE,
  -- Null = pertenece a la recepción. Con valor = adjunto de un avance.
  avance_id       UUID REFERENCES orden_avances(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('foto', 'video', 'audio')),
  origen          TEXT NOT NULL CHECK (origen IN ('recepcion', 'avance')),
  -- Zona de la inspección 360 (front, rear, left, right, interior, fuel) o null.
  zona            TEXT,
  ruta            TEXT NOT NULL UNIQUE,
  ruta_miniatura  TEXT,
  mime            TEXT NOT NULL,
  bytes           BIGINT NOT NULL CHECK (bytes > 0),
  duracion_seg    NUMERIC(6,1),
  ancho           INTEGER,
  alto            INTEGER,
  -- Pedido del cliente: lo que sube el técnico es interno hasta que un admin lo
  -- publica. La recepción es la excepción: es el reporte de ingreso que el
  -- cliente firma, así que nace visible.
  visible_cliente BOOLEAN NOT NULL DEFAULT false,
  -- 'supabase' hoy. Deja la puerta abierta a mover videos a un servicio de
  -- streaming (Cloudflare Stream) sin cambiar el modelo.
  proveedor       TEXT NOT NULL DEFAULT 'supabase',
  subido_por      UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  creado_en       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT orden_media_origen_coherente
    CHECK ((origen = 'avance') = (avance_id IS NOT NULL)),
  -- Tope de 2 minutos con un segundo de holgura por el redondeo del grabador.
  CONSTRAINT orden_media_duracion
    CHECK (tipo = 'foto' OR (duracion_seg IS NOT NULL AND duracion_seg <= 121))
);

CREATE INDEX IF NOT EXISTS idx_orden_media_orden ON orden_media (orden_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_orden_media_avance ON orden_media (avance_id) WHERE avance_id IS NOT NULL;

-- ------------------------------------------------------------------------------------
-- 3. Lo que el cliente no decide al insertar.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_prepare_orden_media()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  NEW.visible_cliente := (NEW.origen = 'recepcion');
  NEW.proveedor := 'supabase';
  NEW.creado_en := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orden_media_prepare ON orden_media;
CREATE TRIGGER trg_orden_media_prepare
  BEFORE INSERT ON orden_media
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prepare_orden_media();

-- Una vez subido, un archivo es lo que es: solo cambia su visibilidad y su zona.
CREATE OR REPLACE FUNCTION public.trg_guard_orden_media()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_orden_media_guard ON orden_media;
CREATE TRIGGER trg_orden_media_guard
  BEFORE UPDATE ON orden_media
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_orden_media();

-- ------------------------------------------------------------------------------------
-- 4. RLS.
-- ------------------------------------------------------------------------------------
ALTER TABLE orden_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orden_media_rows_select" ON orden_media;
CREATE POLICY "orden_media_rows_select" ON orden_media FOR SELECT
  USING (public.is_admin() OR sede_id = public.current_user_sede_id());

-- Sube quien trabaja la orden: un admin, o un técnico asignado mientras la orden
-- no esté entregada — la misma regla que el resto de la orden.
DROP POLICY IF EXISTS "orden_media_rows_insert" ON orden_media;
CREATE POLICY "orden_media_rows_insert" ON orden_media FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM ordenes_trabajo o
      JOIN orden_asignaciones a ON a.orden_id = o.id AND a.usuario_id = auth.uid()
      WHERE o.id = orden_media.orden_id
        AND o.sede_id = public.current_user_sede_id()
        AND o.estatus <> 'entregado'
    )
  );

-- Publicar al cliente es decisión de administración.
DROP POLICY IF EXISTS "orden_media_rows_update" ON orden_media;
CREATE POLICY "orden_media_rows_update" ON orden_media FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "orden_media_rows_delete" ON orden_media;
CREATE POLICY "orden_media_rows_delete" ON orden_media FOR DELETE
  USING (
    public.is_admin()
    OR (
      subido_por = auth.uid()
      AND EXISTS (
        SELECT 1 FROM ordenes_trabajo o
        WHERE o.id = orden_media.orden_id AND o.estatus <> 'entregado'
      )
    )
  );

-- ------------------------------------------------------------------------------------
-- 5. Retirar el modelo anterior.
-- ------------------------------------------------------------------------------------
-- Válido solo porque no hay datos en producción: las URLs públicas viejas no se
-- migran.
ALTER TABLE ordenes_trabajo DROP COLUMN IF EXISTS inspeccion_360_fotos;
ALTER TABLE orden_avances DROP COLUMN IF EXISTS fotos;

-- La firma pasa al bucket privado. La columna guarda la ruta, no una URL
-- pública, y se renombra para que ningún código viejo la lea como URL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo' AND column_name = 'firma_cliente_url'
  ) THEN
    UPDATE ordenes_trabajo SET firma_cliente_url = NULL, firma_fecha = NULL;
    ALTER TABLE ordenes_trabajo RENAME COLUMN firma_cliente_url TO firma_ruta;
  END IF;
END;
$$;

-- Un avance puede ser solo multimedia (una nota de voz, un video) sin texto.
ALTER TABLE orden_avances ALTER COLUMN descripcion SET DEFAULT '';
