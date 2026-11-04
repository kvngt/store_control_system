-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: revisión del 03/11/2026 (20261010000040)
-- ====================================================================================
-- Qué cubre:
-- 1. trg_set_numero_orden sigue sin EXECUTE para anon ni authenticated.
-- 2. Lo que administración escribe para el cliente en un hallazgo encola la traducción (la 037
--    había perdido esa rama); volver a guardar lo mismo no encola otra.
-- 3. _textos_cliente incluye la sección de los puntos de una inspección publicada.
-- 4. Fotos de una inspección publicada: el técnico no agrega ni borra; administración sí; con la
--    inspección sin publicar, el técnico vuelve a poder.
-- 5. requiere_atencion: los correos al personal con error cuentan en la sede de la persona, y el
--    grupo sin_autorizar trae lo que está en proceso sin nada autorizado, por sede.
-- 6. indicadores_taller: una tarea completada que no está autorizada no cuenta.
-- 7. datos_servicio: la traducción de la nota es la del idioma del sticker.
-- 8. corregir_tiempo: dejar abierto un tiempo cuando la persona ya tiene otro reloj abierto da un
--    mensaje para el taller, no el 23505.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(21);

-- ------------------------------------------------------------------------------------
-- Datos base: dos sedes, un admin, un técnico en cada una
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('44000000-0000-0000-0000-000000000001', 'Sede QA 44', 'Calle 44', '555-4401', 'America/New_York'),
  ('44000000-0000-0000-0000-000000000002', 'Sede QA 44 Sur', 'Calle 44 Sur', '555-4402', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('44a00000-0000-0000-0000-000000000001', 'admin44@prueba.local'),
  ('44b00000-0000-0000-0000-000000000001', 'tec44a@prueba.local'),
  ('44b00000-0000-0000-0000-000000000002', 'tec44b@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('44a00000-0000-0000-0000-000000000001', 'Admin 44', 'admin', '44000000-0000-0000-0000-000000000001', 'admin44@prueba.local'),
  ('44b00000-0000-0000-0000-000000000001', 'Tec 44A', 'mecanico', '44000000-0000-0000-0000-000000000001', 'tec44a@prueba.local'),
  ('44b00000-0000-0000-0000-000000000002', 'Tec 44B', 'mecanico', '44000000-0000-0000-0000-000000000002', 'tec44b@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('44c00000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001', 'Cliente 44', '+15554401', 'cli44@prueba.local', 'Ave 44', false),
  ('44c00000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000002', 'Cliente 44 Sur', '+15554402', 'cli44s@prueba.local', 'Ave 44 Sur', false);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('44d00000-0000-0000-0000-000000000001', '44c00000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2022, '4T1BURHE0MC004401', 'QA-441', 'Gris'),
  ('44d00000-0000-0000-0000-000000000002', '44c00000-0000-0000-0000-000000000001', 'Honda', 'CR-V', 2023, '4T1BURHE0MC004402', 'QA-442', 'Blanco'),
  ('44d00000-0000-0000-0000-000000000003', '44c00000-0000-0000-0000-000000000002', 'Ford', 'Explorer', 2021, '4T1BURHE0MC004403', 'QA-443', 'Negro'),
  ('44d00000-0000-0000-0000-000000000004', '44c00000-0000-0000-0000-000000000001', 'Mazda', '3', 2020, '4T1BURHE0MC004404', 'QA-444', 'Rojo');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '44a00000-0000-0000-0000-000000000001';

-- 1: en proceso sin nada autorizado. 2: en proceso con una tarea autorizada. 3: en proceso sin nada,
-- de la otra sede. 4: todavía en recepción (no se avisa: nadie ha empezado).
INSERT INTO ordenes_trabajo (
  id, sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
) VALUES
  ('44e00000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001', '44c00000-0000-0000-0000-000000000001',
   '44d00000-0000-0000-0000-000000000001', 'mecanica', 1000, 'full', '2026-12-01', '44a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('44e00000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000001', '44c00000-0000-0000-0000-000000000001',
   '44d00000-0000-0000-0000-000000000002', 'mecanica', 2000, 'full', '2026-12-01', '44a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('44e00000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000002', '44c00000-0000-0000-0000-000000000002',
   '44d00000-0000-0000-0000-000000000003', 'mecanica', 3000, 'full', '2026-12-01', '44a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('44e00000-0000-0000-0000-000000000004', '44000000-0000-0000-0000-000000000001', '44c00000-0000-0000-0000-000000000001',
   '44d00000-0000-0000-0000-000000000004', 'mecanica', 4000, 'full', '2026-12-01', '44a00000-0000-0000-0000-000000000001', 'recepcion');

INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea) VALUES
  ('44e00000-0000-0000-0000-000000000001', '44b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('44e00000-0000-0000-0000-000000000002', '44b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('44e00000-0000-0000-0000-000000000003', '44b00000-0000-0000-0000-000000000002', 'mecanica');

SELECT set_config('restorify.presupuesto', 'on', true);
INSERT INTO orden_labor (id, orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado) VALUES
  ('44f00000-0000-0000-0000-000000000001', '44e00000-0000-0000-0000-000000000001', 'Diagnóstico', 50, 0.5, 'mecanica', '44b00000-0000-0000-0000-000000000001', 'borrador', false),
  ('44f00000-0000-0000-0000-000000000002', '44e00000-0000-0000-0000-000000000002', 'Cambio de aceite', 100, 1, 'mecanica', '44b00000-0000-0000-0000-000000000001', 'aprobado', false);
SELECT set_config('restorify.presupuesto', 'off', true);

-- ------------------------------------------------------------------------------------
-- 1. Número de orden
-- ------------------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.trg_set_numero_orden()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.trg_set_numero_orden()', 'EXECUTE'),
  'trg_set_numero_orden no se puede llamar por la API'
);

-- ------------------------------------------------------------------------------------
-- 2. Traducción de lo que el cliente ve de un hallazgo
-- ------------------------------------------------------------------------------------
INSERT INTO orden_hallazgos (id, orden_id, sede_id, reportado_por, descripcion, estado) VALUES
  ('44100000-0000-0000-0000-000000000001', '44e00000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001',
   '44b00000-0000-0000-0000-000000000001', 'Fuga en el empaque', 'pendiente');

DELETE FROM cola_envios WHERE canal = 'traduccion';
UPDATE orden_hallazgos
SET estado = 'descartado', en_reporte = true, texto_cliente = 'Recomendamos cambiar el empaque de la tapa de punterías.'
WHERE id = '44100000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*)::int FROM cola_envios
   WHERE canal = 'traduccion' AND estado = 'pendiente' AND orden_id = '44e00000-0000-0000-0000-000000000001'),
  1,
  'escribir el texto para el cliente de un hallazgo encola la traducción'
);

DELETE FROM cola_envios WHERE canal = 'traduccion';
UPDATE orden_hallazgos SET en_reporte = true WHERE id = '44100000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM cola_envios WHERE canal = 'traduccion' AND orden_id = '44e00000-0000-0000-0000-000000000001'),
  0,
  'guardarlo otra vez sin cambiar el texto no encola otra'
);

-- ------------------------------------------------------------------------------------
-- 3 y 4. Inspección publicada: la sección se traduce y sus fotos son de administración
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '44b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_insp UUID;
  v_r RECORD;
BEGIN
  v_insp := public.iniciar_inspeccion('44e00000-0000-0000-0000-000000000001'::uuid);
  FOR v_r IN SELECT id FROM orden_inspeccion_puntos WHERE inspeccion_id = v_insp LOOP
    PERFORM public.marcar_punto_inspeccion(v_r.id, 'bien', NULL);
  END LOOP;
  PERFORM public.completar_inspeccion(v_insp);
  PERFORM set_config('test.insp', v_insp::text, true);
  PERFORM set_config('test.punto', (SELECT id::text FROM orden_inspeccion_puntos WHERE inspeccion_id = v_insp ORDER BY id LIMIT 1), true);
END $$;

-- Sin publicar, el técnico asignado sube su foto (subido_por queda a su nombre).
SELECT lives_ok(
  $$ INSERT INTO orden_media (id, orden_id, tipo, origen, inspeccion_punto_id, ruta, mime, bytes)
     VALUES ('44200000-0000-0000-0000-000000000001', '44e00000-0000-0000-0000-000000000001', 'foto', 'inspeccion',
             current_setting('test.punto')::uuid,
             '44000000-0000-0000-0000-000000000001/44e00000-0000-0000-0000-000000000001/insp-tec-1.jpg', 'image/jpeg', 1024) $$,
  'sin publicar, el técnico asignado sí agrega fotos al punto'
);

SET LOCAL request.jwt.claim.sub = '44a00000-0000-0000-0000-000000000001';
SELECT public.publicar_inspeccion(current_setting('test.insp')::uuid, true);

RESET ROLE;
SELECT ok(
  (SELECT seccion FROM orden_inspeccion_puntos WHERE id = current_setting('test.punto')::uuid)
    = ANY (public._textos_cliente('44e00000-0000-0000-0000-000000000001')),
  '_textos_cliente incluye la sección de un punto de la inspección publicada'
);

SET LOCAL request.jwt.claim.sub = '44b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO orden_media (orden_id, tipo, origen, inspeccion_punto_id, ruta, mime, bytes)
     VALUES ('44e00000-0000-0000-0000-000000000001', 'foto', 'inspeccion', current_setting('test.punto')::uuid,
             '44000000-0000-0000-0000-000000000001/44e00000-0000-0000-0000-000000000001/insp-tec.jpg', 'image/jpeg', 1024) $$,
  '42501', 'La inspección ya está publicada para el cliente. Sus fotos solo las cambia administración.',
  'el técnico no agrega fotos a una inspección publicada'
);

-- Es su foto (su política de borrado lo dejaría), pero el cliente ya la ve: el guardia lo frena.
SELECT throws_ok(
  $$ DELETE FROM orden_media WHERE id = '44200000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'el técnico no borra su foto de una inspección ya publicada'
);

SET LOCAL request.jwt.claim.sub = '44a00000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ INSERT INTO orden_media (orden_id, tipo, origen, inspeccion_punto_id, ruta, mime, bytes)
     VALUES ('44e00000-0000-0000-0000-000000000001', 'foto', 'inspeccion', current_setting('test.punto')::uuid,
             '44000000-0000-0000-0000-000000000001/44e00000-0000-0000-0000-000000000001/insp-admin.jpg', 'image/jpeg', 1024) $$,
  'administración sí agrega una foto a la inspección publicada'
);

SELECT public.publicar_inspeccion(current_setting('test.insp')::uuid, false);

SET LOCAL request.jwt.claim.sub = '44b00000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ DELETE FROM orden_media WHERE id = '44200000-0000-0000-0000-000000000001' $$,
  'sin publicar, el técnico vuelve a poder borrar su foto'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM orden_media WHERE id = '44200000-0000-0000-0000-000000000001'),
  0,
  'y la foto de verdad se borró (no fue un DELETE de cero filas)'
);

-- ------------------------------------------------------------------------------------
-- 5. Requiere atención
-- ------------------------------------------------------------------------------------
RESET ROLE;
DELETE FROM cola_envios WHERE canal = 'email';
INSERT INTO cola_envios (canal, destinatario, plantilla, orden_id, estado, clave_dedupe, creado_en) VALUES
  ('email', 'tec44a@prueba.local', 'empleado', NULL, 'error', 'k44-a', now()),
  ('email', 'TEC44B@prueba.local', 'empleado', NULL, 'error', 'k44-b', now()),
  ('email', 'nadie@prueba.local', 'empleado', NULL, 'error', 'k44-c', now());

CREATE TEMP TABLE t_res (k TEXT PRIMARY KEY, v JSONB);
GRANT ALL ON t_res TO authenticated;

CREATE FUNCTION pg_temp.ids(p JSONB) RETURNS TEXT[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(e->>'id' ORDER BY e->>'id'), '{}') FROM jsonb_array_elements(p->'ordenes') AS e
$$;

SET LOCAL request.jwt.claim.sub = '44a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
INSERT INTO t_res VALUES
  ('norte', public.requiere_atencion('44000000-0000-0000-0000-000000000001')),
  ('sur', public.requiere_atencion('44000000-0000-0000-0000-000000000002')),
  ('todas', public.requiere_atencion(NULL));
RESET ROLE;

SELECT is((SELECT (v->'correos'->>'total')::int FROM t_res WHERE k = 'norte'), 1,
  'el correo con error de un técnico cuenta en su sede');
SELECT is((SELECT (v->'correos'->>'total')::int FROM t_res WHERE k = 'sur'), 1,
  'también si el destinatario viene con otras mayúsculas');
SELECT is((SELECT (v->'correos'->>'total')::int FROM t_res WHERE k = 'todas'), 3,
  'sin sede, cuentan todos, también el de alguien que no es del personal');

SELECT is((SELECT pg_temp.ids(v->'sin_autorizar') FROM t_res WHERE k = 'norte'),
  ARRAY['44e00000-0000-0000-0000-000000000001'],
  'sin_autorizar: la orden en proceso sin nada autorizado; no la que tiene algo autorizado ni la que está en recepción');
SELECT is((SELECT pg_temp.ids(v->'sin_autorizar') FROM t_res WHERE k = 'sur'),
  ARRAY['44e00000-0000-0000-0000-000000000003'],
  'sin_autorizar respeta la sede');
SELECT ok((SELECT v->'sin_autorizar'->'ordenes'->0 ? 'numero_orden' FROM t_res WHERE k = 'norte'),
  'cada orden de sin_autorizar trae su número, como los demás grupos');

-- ------------------------------------------------------------------------------------
-- 6. Indicadores: solo las tareas autorizadas cuentan como completadas
-- ------------------------------------------------------------------------------------
SELECT set_config('restorify.presupuesto', 'on', true);
INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, completado_en, reparto_heredado) VALUES
  ('44e00000-0000-0000-0000-000000000002', 'Rotar llantas', 40, 0.5, 'mecanica', '44b00000-0000-0000-0000-000000000001', 'aprobado', now(), false),
  ('44e00000-0000-0000-0000-000000000002', 'Pulir faros', 60, 1, 'mecanica', '44b00000-0000-0000-0000-000000000001', 'rechazado', now(), false);
SELECT set_config('restorify.presupuesto', 'off', true);

SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT (t->>'tareas_completadas')::int
   FROM jsonb_array_elements(
     public.indicadores_taller('44000000-0000-0000-0000-000000000001',
       (now() AT TIME ZONE 'America/New_York')::date - 1, (now() AT TIME ZONE 'America/New_York')::date + 1) -> 'por_tecnico'
   ) t
   WHERE t->>'usuario_id' = '44b00000-0000-0000-0000-000000000001'),
  1,
  'indicadores_taller no cuenta una tarea completada que no está autorizada'
);

-- ------------------------------------------------------------------------------------
-- 7. Página del QR: la traducción del idioma del sticker
-- ------------------------------------------------------------------------------------
SELECT public.programar_proximo_servicio('44e00000-0000-0000-0000-000000000002', (now() + interval '90 days')::date, 7000, 'Revisión de frenos', 'en');
RESET ROLE;

SELECT public.guardar_traducciones('44000000-0000-0000-0000-000000000001'::uuid, 'en',
  '[{"original":"Revisión de frenos","traduccion":"Brake check"}]'::jsonb);
SELECT public.guardar_traducciones('44000000-0000-0000-0000-000000000001'::uuid, 'es',
  '[{"original":"Revisión de frenos","traduccion":"Revisión de frenos (es)"}]'::jsonb);

SELECT is(
  public.datos_servicio((SELECT token FROM orden_proximo_servicio WHERE orden_id = '44e00000-0000-0000-0000-000000000002'))
    -> 'traducciones' ->> 'Revisión de frenos',
  'Brake check',
  'datos_servicio manda la traducción al idioma del sticker, no la de otro idioma'
);

-- ------------------------------------------------------------------------------------
-- 8. Corregir un tiempo con otro reloj abierto
-- ------------------------------------------------------------------------------------
INSERT INTO orden_labor_tiempos (id, labor_id, orden_id, usuario_id, inicio, fin) VALUES
  ('44300000-0000-0000-0000-000000000001', '44f00000-0000-0000-0000-000000000002', '44e00000-0000-0000-0000-000000000002',
   '44b00000-0000-0000-0000-000000000001', now() - interval '4 hours', now() - interval '3 hours'),
  ('44300000-0000-0000-0000-000000000002', '44f00000-0000-0000-0000-000000000002', '44e00000-0000-0000-0000-000000000002',
   '44b00000-0000-0000-0000-000000000001', now() - interval '1 hour', NULL);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.corregir_tiempo('44300000-0000-0000-0000-000000000001', now() - interval '4 hours', NULL) $$,
  '22023', 'Esa persona ya tiene otro reloj abierto. Ciérralo antes de dejar este sin fin.',
  'dejar abierto un tiempo con otro reloj abierto da un mensaje para el taller'
);
SELECT lives_ok(
  $$ SELECT public.corregir_tiempo('44300000-0000-0000-0000-000000000001', now() - interval '5 hours', now() - interval '3 hours') $$,
  'una corrección con fin sigue funcionando'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM orden_labor_tiempos
   WHERE usuario_id = '44b00000-0000-0000-0000-000000000001' AND fin IS NULL),
  1,
  'la persona sigue con un solo reloj abierto'
);

SELECT * FROM finish();
ROLLBACK;
