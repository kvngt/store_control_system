-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: teléfonos con tipo y WhatsApp (20261010000026)
-- ====================================================================================
-- Qué cubre:
-- 1. Helper _telefonos_sede: conserva tipo ('celular' / 'oficina') y whatsapp boolean,
--    asigna defaults ('oficina', false) y descarta llaves ajenas.
-- 2. Pasos 2 a 4 de la migración sobre sedes existentes (Sede A con coincidencia,
--    Sede B con número nuevo, Sede C sin WhatsApp).
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(9);

-- ------------------------------------------------------------------------------------
-- 1. Comportamiento de _telefonos_sede
-- ------------------------------------------------------------------------------------
SELECT is(
  public._telefonos_sede('[{"label":"Movil","numero":"111-222-3333","tipo":"celular","whatsapp":true}]'::jsonb),
  '[{"label":"Movil","numero":"111-222-3333","tipo":"celular","whatsapp":true}]'::jsonb,
  '_telefonos_sede conserva celular y whatsapp: true'
);

SELECT is(
  public._telefonos_sede('[{"label":"Fijo","numero":"111-222-3333"}]'::jsonb),
  '[{"label":"Fijo","numero":"111-222-3333","tipo":"oficina","whatsapp":false}]'::jsonb,
  '_telefonos_sede sin tipo asigna oficina y sin whatsapp asigna false'
);

SELECT is(
  public._telefonos_sede('[{"label":"Otro","numero":"111-222-3333","tipo":"fax"}]'::jsonb),
  '[{"label":"Otro","numero":"111-222-3333","tipo":"oficina","whatsapp":false}]'::jsonb,
  '_telefonos_sede con tipo desconocido (ej. fax) asigna oficina'
);

SELECT is(
  public._telefonos_sede('[{"label":"Test","numero":"111-222-3333","whatsapp":"si"}]'::jsonb),
  '[{"label":"Test","numero":"111-222-3333","tipo":"oficina","whatsapp":false}]'::jsonb,
  '_telefonos_sede con whatsapp no booleano asigna false'
);

SELECT is(
  public._telefonos_sede('[{"label":"Sin WA","numero":"111-222-3333","whatsapp":null}]'::jsonb),
  '[{"label":"Sin WA","numero":"111-222-3333","tipo":"oficina","whatsapp":false}]'::jsonb,
  '_telefonos_sede con whatsapp nulo asigna false'
);

SELECT is(
  public._telefonos_sede('[{"label":"Extra","numero":"111-222-3333","secreto":"123","tipo":"celular","whatsapp":true}]'::jsonb),
  '[{"label":"Extra","numero":"111-222-3333","tipo":"celular","whatsapp":true}]'::jsonb,
  '_telefonos_sede no expone llaves extras'
);

-- ------------------------------------------------------------------------------------
-- 2. Pasos 2 a 4 de la migración sobre sedes de prueba
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, whatsapp, telefonos) VALUES
  ('31000000-0000-0000-0000-000000000001', 'Sede A', 'Dir A', '240-355-1266', '+1 (240) 355-1266',
   '[{"label":"English","numero":"240-355-1266"},{"label":"Office","numero":"301-909-9937"}]'::jsonb),
  ('31000000-0000-0000-0000-000000000002', 'Sede B', 'Dir B', '301-909-9937', '202-607-6126',
   '[{"numero":"301-909-9937"}]'::jsonb),
  ('31000000-0000-0000-0000-000000000003', 'Sede C', 'Dir C', '555-0001', NULL,
   '[{"label":"Oficina Central","numero":"555-0001"}]'::jsonb);

-- copia de la 026; si cambias una, cambia la otra
-- 2. Lo guardado pasa a la forma completa (tipo y whatsapp en cada teléfono).
UPDATE public.sedes SET telefonos = public._telefonos_sede(telefonos)
WHERE id IN ('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000003');

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
  AND jsonb_array_length(s.telefonos) > 0
  AND s.id IN ('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000003');

-- 4. ...y si no estaba en la lista, entra al final como celular con WhatsApp, sin descripción.
UPDATE public.sedes s
SET telefonos = s.telefonos || jsonb_build_array(jsonb_build_object(
  'label', '', 'numero', btrim(s.whatsapp), 'tipo', 'celular', 'whatsapp', true))
WHERE length(regexp_replace(COALESCE(s.whatsapp, ''), '\D', '', 'g')) >= 7
  AND NOT s.telefonos @> '[{"whatsapp": true}]'::jsonb
  AND s.id IN ('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000003');

-- Verificaciones sobre las tres sedes:
SELECT is(
  (SELECT telefonos FROM sedes WHERE id = '31000000-0000-0000-0000-000000000001'),
  '[{"label":"English","numero":"240-355-1266","tipo":"celular","whatsapp":true},{"label":"Office","numero":"301-909-9937","tipo":"oficina","whatsapp":false}]'::jsonb,
  'Sede A: English coincide con whatsapp (+1 (240) 355-1266) y queda celular con WhatsApp; Office queda oficina sin WhatsApp'
);

SELECT is(
  (SELECT telefonos FROM sedes WHERE id = '31000000-0000-0000-0000-000000000002'),
  '[{"label":"","numero":"301-909-9937","tipo":"oficina","whatsapp":false},{"label":"","numero":"202-607-6126","tipo":"celular","whatsapp":true}]'::jsonb,
  'Sede B: el whatsapp suelto no estaba en la lista y se agrega al final como celular con WhatsApp'
);

SELECT is(
  (SELECT telefonos FROM sedes WHERE id = '31000000-0000-0000-0000-000000000003'),
  '[{"label":"Oficina Central","numero":"555-0001","tipo":"oficina","whatsapp":false}]'::jsonb,
  'Sede C: sin whatsapp en la sede solo se normaliza con tipo oficina y whatsapp false'
);

SELECT * FROM finish();
ROLLBACK;
