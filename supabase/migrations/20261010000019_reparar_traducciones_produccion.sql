-- ------------------------------------------------------------------------------------
-- La traducción automática no funcionaba en producción: se repara lo que le faltaba
-- ------------------------------------------------------------------------------------
-- Síntoma (06/10/2026): lo que se escribe en español no se traducía y Google AI Studio no
-- registraba ni una solicitud. Causa: la `20261010000013` se aplicó en producción en una versión
-- anterior a la que hoy está en el repositorio, y a esa base le faltaban dos cosas:
--   1. `cola_envios_canal_check` solo permitía 'push' y 'email': cada INSERT del trigger
--      `trg_encolar_traduccion` fallaba (el trigger solo avisa con un WARNING, por diseño, así
--      que nadie lo notó) y nunca se encoló un trabajo de traducción.
--   2. La función `guardar_traducciones`, con la que `process-outbox` guarda lo que devuelve
--      Gemini, no existía.
-- Todo es idempotente: en una base que ya lo tiene (la local, el CI) no cambia nada.
-- ------------------------------------------------------------------------------------

ALTER TABLE public.cola_envios DROP CONSTRAINT IF EXISTS cola_envios_canal_check;
ALTER TABLE public.cola_envios
  ADD CONSTRAINT cola_envios_canal_check CHECK (canal IN ('push', 'email', 'traduccion')) NOT VALID;

-- Guarda un lote de traducciones. La edge function la usa con service_role. No pisa las manuales.
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
  WHERE traducciones.origen = 'auto';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.guardar_traducciones(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
