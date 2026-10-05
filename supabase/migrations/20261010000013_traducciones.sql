-- 20261010000013_traducciones.sql

ALTER TABLE public.cola_envios DROP CONSTRAINT IF EXISTS cola_envios_canal_check;
ALTER TABLE public.cola_envios ADD CONSTRAINT cola_envios_canal_check CHECK (canal IN ('push', 'email', 'traduccion')) NOT VALID;

CREATE TABLE public.traducciones (
    sede_id uuid NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
    md5_hash text NOT NULL,
    idioma_destino text NOT NULL CHECK (idioma_destino IN ('es', 'en')),
    texto_original text NOT NULL,
    traduccion text NOT NULL,
    origen text NOT NULL DEFAULT 'auto' CHECK (origen IN ('auto', 'manual')),
    creado_en timestamp with time zone NOT NULL DEFAULT now(),
    actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (sede_id, md5_hash, idioma_destino)
);

ALTER TABLE public.traducciones ENABLE ROW LEVEL SECURITY;

-- Ningún cliente la lee directo; la edge function portal lee con service_role.
-- La app usa funciones SECURITY DEFINER o service_role.
-- Un admin del taller sí puede leer y corregir las de su sede.
CREATE POLICY traducciones_admin_select ON public.traducciones
    FOR SELECT TO authenticated
    USING (is_admin() AND sede_id = current_user_sede_id());

CREATE POLICY traducciones_admin_update ON public.traducciones
    FOR UPDATE TO authenticated
    USING (is_admin() AND sede_id = current_user_sede_id())
    WITH CHECK (is_admin() AND sede_id = current_user_sede_id());


-- Extrae todo texto visible al cliente de una orden, deduplicado.
CREATE OR REPLACE FUNCTION public._textos_cliente(p_orden_id uuid)
RETURNS text[] AS $$
DECLARE
    v_textos text[];
BEGIN
    SELECT array_agg(DISTINCT nullif(trim(t.texto), '')) INTO v_textos
    FROM (
        -- Mano de obra
        SELECT descripcion AS texto FROM orden_labor WHERE orden_id = p_orden_id
        UNION ALL
        -- Repuestos
        SELECT descripcion FROM orden_repuestos WHERE orden_id = p_orden_id
        UNION ALL
        -- Avances visibles al cliente
        SELECT descripcion FROM orden_avances WHERE orden_id = p_orden_id AND visible_cliente = true
        UNION ALL
        -- Notas de inspección
        SELECT inspeccion_360_notas FROM ordenes_trabajo WHERE id = p_orden_id
    ) t
    WHERE nullif(trim(t.texto), '') IS NOT NULL;

    RETURN COALESCE(v_textos, ARRAY[]::text[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public._textos_cliente(uuid) FROM PUBLIC, anon, authenticated;

-- Trigger para encolar la traducción.
-- canal 'traduccion', deduplicado por orden.
CREATE OR REPLACE FUNCTION public.trg_encolar_traduccion()
RETURNS trigger AS $$
DECLARE
    v_orden_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'ordenes_trabajo' THEN
        v_orden_id := NEW.id;
        IF OLD.inspeccion_360_notas IS NOT DISTINCT FROM NEW.inspeccion_360_notas THEN
            RETURN NEW;
        END IF;
    ELSIF TG_TABLE_NAME = 'orden_labor' OR TG_TABLE_NAME = 'orden_repuestos' OR TG_TABLE_NAME = 'orden_avances' THEN
        v_orden_id := NEW.orden_id;
        IF OLD.descripcion IS NOT DISTINCT FROM NEW.descripcion AND 
           (TG_TABLE_NAME != 'orden_avances' OR OLD.visible_cliente IS NOT DISTINCT FROM NEW.visible_cliente) THEN
            RETURN NEW;
        END IF;
        -- Para avances, solo si nace visible o se hizo visible, y tiene texto.
        IF TG_TABLE_NAME = 'orden_avances' AND NOT NEW.visible_cliente THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Si la orden existe, encola (o actualiza si ya había uno pendiente, dejándolo al final de la cola
    -- para darle unos segundos más por si editan varias líneas).
    INSERT INTO cola_envios (canal, destinatario, plantilla, orden_id, enviar_despues_de)
    VALUES ('traduccion', 'gemini', 'auto', v_orden_id, now() + interval '10 seconds')
    ON CONFLICT (canal, orden_id) WHERE estado = 'pendiente'
    DO UPDATE SET enviar_despues_de = EXCLUDED.enviar_despues_de;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_ordenes_trabajo_traducir
    AFTER UPDATE OF inspeccion_360_notas ON public.ordenes_trabajo
    FOR EACH ROW EXECUTE FUNCTION public.trg_encolar_traduccion();

CREATE TRIGGER trg_orden_labor_traducir
    AFTER INSERT OR UPDATE OF descripcion ON public.orden_labor
    FOR EACH ROW EXECUTE FUNCTION public.trg_encolar_traduccion();

CREATE TRIGGER trg_orden_repuestos_traducir
    AFTER INSERT OR UPDATE OF descripcion ON public.orden_repuestos
    FOR EACH ROW EXECUTE FUNCTION public.trg_encolar_traduccion();

CREATE TRIGGER trg_orden_avances_traducir
    AFTER INSERT OR UPDATE OF descripcion, visible_cliente ON public.orden_avances
    FOR EACH ROW EXECUTE FUNCTION public.trg_encolar_traduccion();

-- Diccionario para el portal.
CREATE OR REPLACE FUNCTION public.traducciones_portal(p_token text)
RETURNS jsonb AS $$
DECLARE
    v_orden record;
    v_textos text[];
    v_dict jsonb;
BEGIN
    SELECT orden_id, sede_id INTO v_orden
    FROM orden_enlaces
    WHERE token = p_token AND (expira_en IS NULL OR expira_en > now());

    IF NOT FOUND THEN
        RETURN '{}'::jsonb;
    END IF;

    v_textos := _textos_cliente(v_orden.orden_id);
    IF array_length(v_textos, 1) IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    SELECT jsonb_object_agg(texto_original, traduccion) INTO v_dict
    FROM traducciones
    WHERE sede_id = v_orden.sede_id
      AND md5_hash = ANY(ARRAY(SELECT md5(t) FROM unnest(v_textos) t));

    RETURN COALESCE(v_dict, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.traducciones_portal(text) FROM PUBLIC, anon, authenticated;
-- El portal llama esta RPC directo.
GRANT EXECUTE ON FUNCTION public.traducciones_portal(text) TO anon;

-- Diccionario para la app interna.
CREATE OR REPLACE FUNCTION public.traducciones_orden(p_orden_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_sede_id uuid;
    v_textos text[];
    v_dict jsonb;
BEGIN
    -- Verificamos permiso de lectura sobre la orden (que nos da también la sede).
    SELECT sede_id INTO v_sede_id
    FROM ordenes_trabajo
    WHERE id = p_orden_id;

    IF NOT FOUND THEN
        RETURN '{}'::jsonb;
    END IF;

    v_textos := _textos_cliente(p_orden_id);
    IF array_length(v_textos, 1) IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    SELECT jsonb_object_agg(texto_original, traduccion) INTO v_dict
    FROM traducciones
    WHERE sede_id = v_sede_id
      AND md5_hash = ANY(ARRAY(SELECT md5(t) FROM unnest(v_textos) t));

    RETURN COALESCE(v_dict, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.traducciones_orden(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traducciones_orden(uuid) TO authenticated;

-- Guarda un lote de traducciones. La edge function la usa con service_role.
CREATE OR REPLACE FUNCTION public.guardar_traducciones(p_sede_id uuid, p_idioma_destino text, p_textos jsonb)
RETURNS void AS $$
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
    WHERE traducciones.origen = 'auto'; -- No sobrescribimos las manuales!
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.guardar_traducciones(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
