-- ------------------------------------------------------------------------------------
-- Teléfonos de la sede: tipo (oficina / celular) y WhatsApp por teléfono
-- ------------------------------------------------------------------------------------
-- Pedido del taller (10/10/2026): al configurar un teléfono de la sede, elegir si es de
-- oficina o celular y si atiende WhatsApp. El cliente ve cada teléfono con su tipo, botón
-- para llamar y, si atiende WhatsApp, botón de WhatsApp para ese número.
--
-- Se quita el campo suelto "WhatsApp del taller" de la tarjeta de la sede en Configuración.
-- `sedes.whatsapp` queda como respaldo heredado (igual que `sedes.telefono`), sincronizado
-- automáticamente por `sedesService` con el primer número que tenga WhatsApp, o null.
--
-- `datos_portal` y `datos_correo` NO se reemiten porque ya llaman a `_telefonos_sede`,
-- que aquí se actualiza para incluir `tipo` y `whatsapp`.
--
-- Los números del taller NO van aquí: se capturan en Configuración.
-- ------------------------------------------------------------------------------------

-- 1. Lo que sale al cliente: ahora con tipo y WhatsApp. Reescrita desde 20261010000025.
CREATE OR REPLACE FUNCTION public._telefonos_sede(p_telefonos JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
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
REVOKE ALL ON FUNCTION public._telefonos_sede(JSONB) FROM PUBLIC, anon, authenticated;

-- 2. Lo guardado pasa a la forma completa (tipo y whatsapp en cada teléfono).
UPDATE public.sedes SET telefonos = public._telefonos_sede(telefonos);

-- 3. El WhatsApp suelto de la sede marca su teléfono en la lista (mismo número: los
--    últimos diez dígitos, así "+1 (240) 355-1266" y "240-355-1266" coinciden)...
UPDATE public.sedes s
SET telefonos = (
  SELECT jsonb_agg(
    CASE
      WHEN right(regexp_replace(e.v->>'numero', '\D', '', 'g'), 10)
         = right(regexp_replace(s.whatsapp, '\D', '', 'g'), 10)
      THEN e.v || jsonb_build_object('tipo', 'celular', 'whatsapp', true)
      ELSE e.v
    END ORDER BY e.n)
  FROM jsonb_array_elements(s.telefonos) WITH ORDINALITY AS e(v, n)
)
WHERE length(regexp_replace(COALESCE(s.whatsapp, ''), '\D', '', 'g')) >= 7
  AND jsonb_array_length(s.telefonos) > 0;

-- 4. ...y si no estaba en la lista, entra al final como celular con WhatsApp, sin descripción.
UPDATE public.sedes s
SET telefonos = s.telefonos || jsonb_build_array(jsonb_build_object(
  'label', '', 'numero', btrim(s.whatsapp), 'tipo', 'celular', 'whatsapp', true))
WHERE length(regexp_replace(COALESCE(s.whatsapp, ''), '\D', '', 'g')) >= 7
  AND NOT s.telefonos @> '[{"whatsapp": true}]'::jsonb;
