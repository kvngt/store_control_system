-- ====================================================================================
-- Arreglo urgente de 20261010000013 (traducciones)
-- ====================================================================================
-- Desde que se aplicó la 013, en producción fallaba **toda** alta o edición de mano de obra y
-- de repuestos (crear una orden con tareas, "Agregar trabajo", agregar un repuesto, cambiar una
-- descripción) con `record "old" has no field "visible_cliente"`. Comprobado contra producción
-- el 05/10/2026 con una orden de prueba.
--
-- Qué estaba mal en `trg_encolar_traduccion` y qué cambia:
--   1. Una sola condición leía `OLD.visible_cliente` también en `orden_labor` y
--      `orden_repuestos`, que no tienen esa columna: PL/pgSQL resuelve los campos de toda la
--      expresión antes de evaluarla. Ahora cada tabla tiene su rama y solo lee sus columnas.
--   2. En un INSERT comparaba contra `OLD`, que no existe. Ahora mira `TG_OP`.
--   3. `ON CONFLICT (canal, orden_id) WHERE estado = 'pendiente'` no tenía un índice único que
--      lo respaldara (el INSERT habría fallado igual). Se crea el índice y la cláusula usa ese.
--   4. Encolar una traducción nunca debe impedir guardar una orden: el INSERT va en un bloque
--      que, si falla, avisa con un WARNING y deja seguir (como el historial).
-- Además, `traducciones_orden` (SECURITY DEFINER) le devolvía a cualquier usuario con sesión
-- las traducciones de **cualquier** orden, de cualquier sede: ahora pide lo mismo que para
-- leer la orden (admin, o técnico asignado). `traducciones_portal` seguía respondiendo con un
-- enlace **revocado**: ahora lo rechaza, como el portal. Y la función del trigger lleva su
-- REVOKE.
-- ====================================================================================

-- Una traducción pendiente por orden. En producción no puede haber filas que lo violen: hasta
-- este arreglo, ningún INSERT de canal 'traduccion' llegaba a guardarse.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cola_envios_traduccion_pendiente
  ON cola_envios (orden_id)
  WHERE canal = 'traduccion' AND estado = 'pendiente';

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

-- Las traducciones de una orden para la app: solo para quien puede leer esa orden. Para un
-- técnico, una orden ajena no existe (diccionario vacío), como en el resto de la app.
CREATE OR REPLACE FUNCTION public.traducciones_orden(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sede_id UUID;
  v_textos  TEXT[];
  v_dict    JSONB;
BEGIN
  IF NOT public.is_admin() AND NOT (p_orden_id = ANY (public.mis_ordenes_asignadas())) THEN
    RETURN '{}'::jsonb;
  END IF;

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
    AND md5_hash = ANY (ARRAY(SELECT md5(t) FROM unnest(v_textos) t));

  RETURN COALESCE(v_dict, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.traducciones_orden(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traducciones_orden(UUID) TO authenticated;

-- El diccionario del portal: con un enlace vigente, ni vencido ni revocado.
CREATE OR REPLACE FUNCTION public.traducciones_portal(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden  RECORD;
  v_textos TEXT[];
  v_dict   JSONB;
BEGIN
  SELECT orden_id, sede_id INTO v_orden
  FROM orden_enlaces
  WHERE token = p_token
    AND revocado_en IS NULL
    AND (expira_en IS NULL OR expira_en > now());

  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  v_textos := public._textos_cliente(v_orden.orden_id);
  IF array_length(v_textos, 1) IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_object_agg(texto_original, traduccion) INTO v_dict
  FROM traducciones
  WHERE sede_id = v_orden.sede_id
    AND md5_hash = ANY (ARRAY(SELECT md5(t) FROM unnest(v_textos) t));

  RETURN COALESCE(v_dict, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.traducciones_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traducciones_portal(TEXT) TO anon;
