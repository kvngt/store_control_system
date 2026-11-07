-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: el técnico no desmarca una tarea de una orden
-- terminada (20261010000042)
-- ====================================================================================
-- Qué cubre:
-- 1. Con la orden `finalizado`, el técnico asignado no desmarca su tarea hecha (42501) y la
--    tarea sigue hecha; sí puede marcar como hecha una que quedó sin marcar.
-- 2. Con la orden en proceso, el técnico desmarca y vuelve a marcar como siempre.
-- 3. Administración sí desmarca una tarea de una orden terminada.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(8);

INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('46000000-0000-0000-0000-000000000001', 'Sede QA 46', 'Calle 46', '555-4601', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('46a00000-0000-0000-0000-000000000001', 'admin46@prueba.local'),
  ('46b00000-0000-0000-0000-000000000001', 'tec46@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('46a00000-0000-0000-0000-000000000001', 'Admin 46', 'admin', '46000000-0000-0000-0000-000000000001', 'admin46@prueba.local'),
  ('46b00000-0000-0000-0000-000000000001', 'Tec 46', 'mecanico', '46000000-0000-0000-0000-000000000001', 'tec46@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('46c00000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000001', 'Cliente 46', '+15554601', 'cli46@prueba.local', 'Ave 46', false);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('46d00000-0000-0000-0000-000000000001', '46c00000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2022, '4T1BURHE0MC004601', 'QA-461', 'Gris'),
  ('46d00000-0000-0000-0000-000000000002', '46c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2021, '4T1BURHE0MC004602', 'QA-462', 'Azul');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '46a00000-0000-0000-0000-000000000001';

-- 1: terminada (una tarea hecha y otra sin marcar). 2: en proceso (una tarea hecha).
INSERT INTO ordenes_trabajo (
  id, sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
) VALUES
  ('46e00000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000001', '46c00000-0000-0000-0000-000000000001',
   '46d00000-0000-0000-0000-000000000001', 'mecanica', 1000, 'full', '2026-12-01', '46a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('46e00000-0000-0000-0000-000000000002', '46000000-0000-0000-0000-000000000001', '46c00000-0000-0000-0000-000000000001',
   '46d00000-0000-0000-0000-000000000002', 'mecanica', 2000, 'full', '2026-12-01', '46a00000-0000-0000-0000-000000000001', 'en_proceso');

INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea) VALUES
  ('46e00000-0000-0000-0000-000000000001', '46b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('46e00000-0000-0000-0000-000000000002', '46b00000-0000-0000-0000-000000000001', 'mecanica');

SELECT set_config('restorify.presupuesto', 'on', true);
INSERT INTO orden_labor (id, orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado, completado_en) VALUES
  ('46f00000-0000-0000-0000-000000000001', '46e00000-0000-0000-0000-000000000001', 'Frenos', 200, 'mecanica', '46b00000-0000-0000-0000-000000000001', 'aprobado', false, NOW()),
  ('46f00000-0000-0000-0000-000000000002', '46e00000-0000-0000-0000-000000000001', 'Aceite', 80, 'mecanica', '46b00000-0000-0000-0000-000000000001', 'aprobado', false, NULL),
  ('46f00000-0000-0000-0000-000000000003', '46e00000-0000-0000-0000-000000000002', 'Alineación', 90, 'mecanica', '46b00000-0000-0000-0000-000000000001', 'aprobado', false, NOW());
SELECT set_config('restorify.presupuesto', 'off', true);

UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = '46e00000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- El técnico
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '46b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.marcar_labor_completada('46f00000-0000-0000-0000-000000000001', false) $$,
  '42501', 'La orden ya está terminada. Si falta algo, pide a administración que la reabra.',
  'el técnico no desmarca una tarea de una orden terminada'
);

SELECT lives_ok(
  $$ SELECT public.marcar_labor_completada('46f00000-0000-0000-0000-000000000002', true) $$,
  'el técnico sí marca como hecha una tarea que quedó sin marcar'
);

SELECT lives_ok(
  $$ SELECT public.marcar_labor_completada('46f00000-0000-0000-0000-000000000003', false) $$,
  'con la orden en proceso, el técnico desmarca como siempre'
);

SELECT lives_ok(
  $$ SELECT public.marcar_labor_completada('46f00000-0000-0000-0000-000000000003', true) $$,
  'y la vuelve a marcar'
);

RESET ROLE;
SELECT ok(
  (SELECT completado_en IS NOT NULL FROM orden_labor WHERE id = '46f00000-0000-0000-0000-000000000001'),
  'la tarea de la orden terminada sigue hecha'
);
SELECT ok(
  (SELECT completado_en IS NOT NULL FROM orden_labor WHERE id = '46f00000-0000-0000-0000-000000000002'),
  'la que quedó sin marcar ya está hecha'
);

-- ------------------------------------------------------------------------------------
-- Administración
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '46a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT public.marcar_labor_completada('46f00000-0000-0000-0000-000000000001', false) $$,
  'administración sí desmarca una tarea de una orden terminada'
);

RESET ROLE;
SELECT ok(
  (SELECT completado_en IS NULL FROM orden_labor WHERE id = '46f00000-0000-0000-0000-000000000001'),
  'y queda sin hacer'
);

SELECT * FROM finish();
ROLLBACK;
