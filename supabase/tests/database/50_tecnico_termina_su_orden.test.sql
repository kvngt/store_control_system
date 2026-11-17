-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: el técnico asignado termina su orden y la fecha de
-- finalización la pone la base (20261010000046)
-- ====================================================================================
-- Qué cubre (hallazgo B-01 del recorrido de calidad del 16/11/2026):
--  1. El técnico asignado, con una línea aprobada, termina la orden mandando estatus,
--     fecha_finalizacion (una vieja) y porcentaje_avance: no falla, queda finalizada y la
--     fecha guardada es la de ahora, no la que mandó.
--  2. Un UPDATE del técnico que solo cambia fecha_finalizacion no falla y no cambia nada.
--  3. Sin ninguna línea aprobada sigue sin poder terminar (mismo error de antes).
--  4. Un técnico no asignado sigue sin poder (la orden ajena no existe para él).
--  5. Administración sí escribe fecha_finalizacion.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(14);

-- ------------------------------------------------------------------------------------
-- Datos base
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('50000000-0000-0000-0000-000000000001', 'Sede QA 50', 'Calle 50', '555-5001', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('50a00000-0000-0000-0000-000000000001', 'admin50@prueba.local'),
  ('50b00000-0000-0000-0000-000000000001', 'tec50a@prueba.local'),
  ('50b00000-0000-0000-0000-000000000002', 'tec50b@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('50a00000-0000-0000-0000-000000000001', 'Admin 50', 'admin', '50000000-0000-0000-0000-000000000001', 'admin50@prueba.local'),
  ('50b00000-0000-0000-0000-000000000001', 'Tec 50A', 'mecanico', '50000000-0000-0000-0000-000000000001', 'tec50a@prueba.local'),
  ('50b00000-0000-0000-0000-000000000002', 'Tec 50B', 'mecanico', '50000000-0000-0000-0000-000000000001', 'tec50b@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('50c00000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Cliente 50', '+15555001', 'cli50@prueba.local', 'Ave 50', false);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('50d00000-0000-0000-0000-000000000001', '50c00000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2022, '5T1BURHE0MC005001', 'QA-501', 'Gris'),
  ('50d00000-0000-0000-0000-000000000002', '50c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2021, '5T1BURHE0MC005002', 'QA-502', 'Azul'),
  ('50d00000-0000-0000-0000-000000000003', '50c00000-0000-0000-0000-000000000001', 'Ford', 'Focus', 2020, '5T1BURHE0MC005003', 'QA-503', 'Rojo'),
  ('50d00000-0000-0000-0000-000000000004', '50c00000-0000-0000-0000-000000000001', 'Mazda', 'CX5', 2019, '5T1BURHE0MC005004', 'QA-504', 'Negro');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '50a00000-0000-0000-0000-000000000001';

-- 1 y 2: con una línea aprobada, asignadas al técnico A. 3: sin nada aprobado. 4: con una línea
-- aprobada, asignada solo al técnico A (el B es ajeno).
INSERT INTO ordenes_trabajo (
  id, sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
) VALUES
  ('50e00000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '50c00000-0000-0000-0000-000000000001',
   '50d00000-0000-0000-0000-000000000001', 'mecanica', 1000, 'full', '2026-12-01', '50a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('50e00000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '50c00000-0000-0000-0000-000000000001',
   '50d00000-0000-0000-0000-000000000002', 'mecanica', 2000, 'full', '2026-12-01', '50a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('50e00000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '50c00000-0000-0000-0000-000000000001',
   '50d00000-0000-0000-0000-000000000003', 'mecanica', 3000, 'full', '2026-12-01', '50a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('50e00000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', '50c00000-0000-0000-0000-000000000001',
   '50d00000-0000-0000-0000-000000000004', 'mecanica', 4000, 'full', '2026-12-01', '50a00000-0000-0000-0000-000000000001', 'en_proceso');

INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea) VALUES
  ('50e00000-0000-0000-0000-000000000001', '50b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('50e00000-0000-0000-0000-000000000002', '50b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('50e00000-0000-0000-0000-000000000003', '50b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('50e00000-0000-0000-0000-000000000004', '50b00000-0000-0000-0000-000000000001', 'mecanica');

SELECT set_config('restorify.presupuesto', 'on', true);
INSERT INTO orden_labor (id, orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado) VALUES
  ('50f00000-0000-0000-0000-000000000001', '50e00000-0000-0000-0000-000000000001', 'Frenos', 200, 'mecanica', '50b00000-0000-0000-0000-000000000001', 'aprobado', false),
  ('50f00000-0000-0000-0000-000000000002', '50e00000-0000-0000-0000-000000000002', 'Aceite', 80, 'mecanica', '50b00000-0000-0000-0000-000000000001', 'aprobado', false),
  ('50f00000-0000-0000-0000-000000000003', '50e00000-0000-0000-0000-000000000003', 'Alineación', 90, 'mecanica', '50b00000-0000-0000-0000-000000000001', 'borrador', false),
  ('50f00000-0000-0000-0000-000000000004', '50e00000-0000-0000-0000-000000000004', 'Batería', 120, 'mecanica', '50b00000-0000-0000-0000-000000000001', 'aprobado', false);
SELECT set_config('restorify.presupuesto', 'off', true);

-- ------------------------------------------------------------------------------------
-- 1. El técnico asignado termina su orden (la app manda su propia fecha: la base la ignora)
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '50b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo
     SET estatus = 'finalizado', fecha_finalizacion = '2020-01-01 00:00:00+00', porcentaje_avance = 100
     WHERE id = '50e00000-0000-0000-0000-000000000001' $$,
  'el técnico asignado termina su orden aunque mande fecha_finalizacion'
);
SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = '50e00000-0000-0000-0000-000000000001'),
  'finalizado',
  'la orden queda finalizada'
);
SELECT ok(
  (SELECT fecha_finalizacion >= NOW() - INTERVAL '1 hour' AND fecha_finalizacion > '2020-01-02'::timestamptz
     FROM ordenes_trabajo WHERE id = '50e00000-0000-0000-0000-000000000001'),
  'la fecha guardada es la de ahora, no la de 2020 que mandó el técnico'
);
SELECT is(
  (SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = '50e00000-0000-0000-0000-000000000001'),
  100,
  'y el avance queda en 100'
);

-- ------------------------------------------------------------------------------------
-- 2. Escribir solo la fecha no falla y no cambia nada
-- ------------------------------------------------------------------------------------
SELECT set_config('test.fecha50', fecha_finalizacion::text, true)
FROM ordenes_trabajo WHERE id = '50e00000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET fecha_finalizacion = '2020-01-01 00:00:00+00'
     WHERE id = '50e00000-0000-0000-0000-000000000001' $$,
  'con la orden terminada, el técnico escribe solo fecha_finalizacion: no falla'
);
SELECT is(
  (SELECT fecha_finalizacion::text FROM ordenes_trabajo WHERE id = '50e00000-0000-0000-0000-000000000001'),
  current_setting('test.fecha50'),
  'y la fecha no cambia'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET fecha_finalizacion = '2020-01-01 00:00:00+00'
     WHERE id = '50e00000-0000-0000-0000-000000000002' $$,
  'con la orden en proceso, el técnico escribe solo fecha_finalizacion: no falla'
);
SELECT is(
  (SELECT fecha_finalizacion FROM ordenes_trabajo WHERE id = '50e00000-0000-0000-0000-000000000002'),
  NULL::timestamptz,
  'y la orden sigue sin fecha de finalización'
);

-- ------------------------------------------------------------------------------------
-- 3. Sin nada aprobado sigue sin poder terminar
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo
     SET estatus = 'finalizado', fecha_finalizacion = NOW(), porcentaje_avance = 100
     WHERE id = '50e00000-0000-0000-0000-000000000003' $$,
  '42501',
  'El cliente todavía no autoriza ningún trabajo de esta orden. No se puede empezar ni terminar hasta que administración registre la autorización.',
  'sin ninguna línea aprobada el técnico no termina la orden'
);
SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = '50e00000-0000-0000-0000-000000000003'),
  'en_proceso',
  'y la orden sigue en proceso'
);

-- ------------------------------------------------------------------------------------
-- 4. Un técnico no asignado: la orden ajena no existe para él (cero filas, ni error)
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '50b00000-0000-0000-0000-000000000002';

SELECT lives_ok(
  $$ DO $d$
     DECLARE n INT;
     BEGIN
       UPDATE ordenes_trabajo
       SET estatus = 'finalizado', fecha_finalizacion = NOW(), porcentaje_avance = 100
       WHERE id = '50e00000-0000-0000-0000-000000000004';
       GET DIAGNOSTICS n = ROW_COUNT;
       IF n <> 0 THEN
         RAISE EXCEPTION 'el técnico ajeno modificó % fila(s)', n;
       END IF;
     END $d$ $$,
  'un técnico no asignado no logra terminar la orden de otro (cero filas)'
);

-- ------------------------------------------------------------------------------------
-- 5. Administración
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '50a00000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = '50e00000-0000-0000-0000-000000000004'),
  'en_proceso',
  'la orden ajena sigue en proceso'
);
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET fecha_finalizacion = '2020-01-01 00:00:00+00'
     WHERE id = '50e00000-0000-0000-0000-000000000002' $$,
  'administración sí escribe fecha_finalizacion'
);
SELECT is(
  (SELECT fecha_finalizacion FROM ordenes_trabajo WHERE id = '50e00000-0000-0000-0000-000000000002'),
  '2020-01-01 00:00:00+00'::timestamptz,
  'y se queda como la escribió'
);

SELECT * FROM finish();
ROLLBACK;
