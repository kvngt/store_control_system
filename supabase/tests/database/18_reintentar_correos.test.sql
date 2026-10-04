-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: reintentar un correo que falló
-- ====================================================================================
-- Qué cubre (migración 20261010000005): un admin devuelve a la cola un correo con error (uno
-- o todos los recientes); un técnico no; no se reintenta lo que no falló, lo que no es correo
-- ni lo que ya tiene uno igual pendiente; el masivo respeta la ventana de horas y de varios
-- fallidos con la misma clave reintenta el más nuevo.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(13);

INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sede Prueba', 'Calle 1', '555-0100');

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'mecanica@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '10000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'Rosa Mecánica', 'mecanico', '10000000-0000-0000-0000-000000000001', 'mecanica@prueba.local');

-- La cola como la dejó un día con la llave de Resend mal puesta.
INSERT INTO cola_envios (id, canal, destinatario, plantilla, estado, intentos, ultimo_error, clave_dedupe, creado_en) VALUES
  -- Uno suelto que falló hoy.
  ('f0000000-0000-0000-0000-000000000001', 'email', 'marta@prueba.local', 'recepcion', 'error', 1, 'Resend HTTP 400: API key is invalid', NULL, NOW() - INTERVAL '2 hours'),
  -- Dos con la misma clave: el masivo tiene que reintentar solo el más nuevo.
  ('f0000000-0000-0000-0000-000000000002', 'email', 'pedro@prueba.local', 'estado', 'error', 1, 'Resend HTTP 400: API key is invalid', 'estado:o2', NOW() - INTERVAL '5 hours'),
  ('f0000000-0000-0000-0000-000000000003', 'email', 'pedro@prueba.local', 'estado', 'error', 1, 'Resend HTTP 400: API key is invalid', 'estado:o2', NOW() - INTERVAL '1 hour'),
  -- Uno cuya clave ya tiene otro pendiente.
  ('f0000000-0000-0000-0000-000000000004', 'email', 'luis@prueba.local', 'estado', 'error', 1, 'Resend HTTP 400: API key is invalid', 'estado:o3', NOW() - INTERVAL '3 hours'),
  ('f0000000-0000-0000-0000-000000000005', 'email', 'luis@prueba.local', 'estado', 'pendiente', 0, NULL, 'estado:o3', NOW()),
  -- Uno viejo: fuera de la ventana del masivo.
  ('f0000000-0000-0000-0000-000000000006', 'email', 'ana@prueba.local', 'recepcion', 'error', 1, 'Resend HTTP 400: API key is invalid', NULL, NOW() - INTERVAL '10 days'),
  -- Uno que salió bien y un push con error: no son candidatos.
  ('f0000000-0000-0000-0000-000000000007', 'email', 'sara@prueba.local', 'recepcion', 'enviado', 1, NULL, NULL, NOW()),
  ('f0000000-0000-0000-0000-000000000008', 'push', 'a0000000-0000-0000-0000-000000000001', 'aviso', 'error', 5, 'gone', NULL, NOW());

CREATE TEMP VIEW t_cola AS SELECT id, estado, intentos, ultimo_error FROM cola_envios;
GRANT SELECT ON t_cola TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';

-- ------------------------------------------------------------------------------------
-- 1. Un técnico no reintenta nada
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$ SELECT reintentar_envio('f0000000-0000-0000-0000-000000000001') $$,
  '42501', 'Solo administración puede reintentar un correo.',
  'Un técnico no reintenta un correo'
);
SELECT throws_ok(
  $$ SELECT reintentar_correos_fallidos() $$,
  '42501', NULL,
  'Ni los reintenta todos'
);

-- ------------------------------------------------------------------------------------
-- 2. Un admin reintenta uno
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ SELECT reintentar_envio('f0000000-0000-0000-0000-000000000001') $$,
  'El admin reintenta un correo que falló'
);
SELECT results_eq(
  $$ SELECT estado, intentos, ultimo_error FROM t_cola WHERE id = 'f0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('pendiente'::text, 0, NULL::text) $$,
  'Vuelve a la cola desde cero y sin el error viejo'
);

SELECT throws_ok(
  $$ SELECT reintentar_envio('f0000000-0000-0000-0000-000000000007') $$,
  '42501', 'Solo se puede reintentar un correo que falló.',
  'Uno que salió bien no se reintenta'
);
SELECT throws_ok(
  $$ SELECT reintentar_envio('f0000000-0000-0000-0000-000000000008') $$,
  '42501', 'Ese correo ya no existe.',
  'Un push no es un correo'
);
SELECT throws_ok(
  $$ SELECT reintentar_envio('f0000000-0000-0000-0000-000000000004') $$,
  '42501', 'Ya hay un correo igual esperando para salir.',
  'Uno que ya tiene otro igual pendiente no se duplica'
);

-- ------------------------------------------------------------------------------------
-- 3. El masivo
-- ------------------------------------------------------------------------------------
SELECT is(
  (SELECT reintentar_correos_fallidos()),
  1,
  'El masivo reintenta solo lo reciente, sin duplicados ni choques'
);
SELECT is(
  (SELECT estado FROM t_cola WHERE id = 'f0000000-0000-0000-0000-000000000003'),
  'pendiente',
  'De dos fallidos con la misma clave, el más nuevo'
);
SELECT is(
  (SELECT estado FROM t_cola WHERE id = 'f0000000-0000-0000-0000-000000000002'),
  'error',
  'Y el viejo de esa clave se queda'
);
SELECT is(
  (SELECT estado FROM t_cola WHERE id = 'f0000000-0000-0000-0000-000000000004'),
  'error',
  'El que ya tiene otro pendiente se queda'
);
SELECT is(
  (SELECT estado FROM t_cola WHERE id = 'f0000000-0000-0000-0000-000000000006'),
  'error',
  'El de hace 10 días queda fuera de la ventana'
);

RESET ROLE;
SELECT ok(
  NOT has_function_privilege('anon', 'public.reintentar_envio(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.reintentar_correos_fallidos(integer)', 'EXECUTE'),
  'Sin sesión no se llama ninguna de las dos'
);

SELECT * FROM finish();
ROLLBACK;
