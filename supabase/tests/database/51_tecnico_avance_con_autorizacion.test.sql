-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: el técnico no mueve porcentaje_avance sin
-- ninguna línea autorizada (20261010000047, hallazgo B-02)
-- ====================================================================================
-- Qué cubre:
--  1. Técnico asignado, orden sin ninguna línea aprobada: cambiar porcentaje_avance da 42501.
--  2. Con una línea de mano de obra aprobada: mueve el avance bien.
--  3. Con solo un repuesto aprobado: mueve el avance bien.
--  4. Técnico manda el mismo porcentaje_avance (sin cambiarlo) junto con otro cambio permitido
--     en orden sin autorizar: no falla por esta regla (IS DISTINCT FROM).
--  5. Administración mueve porcentaje_avance aunque no haya nada autorizado.
--  6. Técnico ajeno sigue sin ver ni tocar la orden (cero filas).
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(12);

-- ------------------------------------------------------------------------------------
-- Datos base
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('51000000-0000-0000-0000-000000000001', 'Sede QA 51', 'Calle 51', '555-5101', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('51a00000-0000-0000-0000-000000000001', 'admin51@prueba.local'),
  ('51b00000-0000-0000-0000-000000000001', 'tec51a@prueba.local'),
  ('51b00000-0000-0000-0000-000000000002', 'tec51b@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('51a00000-0000-0000-0000-000000000001', 'Admin 51', 'admin', '51000000-0000-0000-0000-000000000001', 'admin51@prueba.local'),
  ('51b00000-0000-0000-0000-000000000001', 'Tec 51A', 'mecanico', '51000000-0000-0000-0000-000000000001', 'tec51a@prueba.local'),
  ('51b00000-0000-0000-0000-000000000002', 'Tec 51B', 'mecanico', '51000000-0000-0000-0000-000000000001', 'tec51b@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('51c00000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Cliente 51', '+15555101', 'cli51@prueba.local', 'Ave 51', false);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('51d00000-0000-0000-0000-000000000001', '51c00000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2022, '5T1BURHE0MC005101', 'QA-511', 'Gris'),
  ('51d00000-0000-0000-0000-000000000002', '51c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2021, '5T1BURHE0MC005102', 'QA-512', 'Azul'),
  ('51d00000-0000-0000-0000-000000000003', '51c00000-0000-0000-0000-000000000001', 'Ford', 'Focus', 2020, '5T1BURHE0MC005103', 'QA-513', 'Rojo'),
  ('51d00000-0000-0000-0000-000000000004', '51c00000-0000-0000-0000-000000000001', 'Mazda', 'CX5', 2019, '5T1BURHE0MC005104', 'QA-514', 'Negro');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '51a00000-0000-0000-0000-000000000001';

-- Orden 1: sin nada aprobado, asignada a Tec A.
-- Orden 2: con mano de obra aprobada, asignada a Tec A.
-- Orden 3: con solo un repuesto aprobado, asignada a Tec A.
-- Orden 4: sin nada aprobado, asignada solo a Tec A (Tec B es ajeno).
INSERT INTO ordenes_trabajo (
  id, sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus, porcentaje_avance
) VALUES
  ('51e00000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '51c00000-0000-0000-0000-000000000001',
   '51d00000-0000-0000-0000-000000000001', 'mecanica', 1000, 'full', '2026-12-01', '51a00000-0000-0000-0000-000000000001', 'recepcion', 0),
  ('51e00000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', '51c00000-0000-0000-0000-000000000001',
   '51d00000-0000-0000-0000-000000000002', 'mecanica', 2000, 'full', '2026-12-01', '51a00000-0000-0000-0000-000000000001', 'en_proceso', 0),
  ('51e00000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000001', '51c00000-0000-0000-0000-000000000001',
   '51d00000-0000-0000-0000-000000000003', 'mecanica', 3000, 'full', '2026-12-01', '51a00000-0000-0000-0000-000000000001', 'en_proceso', 0),
  ('51e00000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000001', '51c00000-0000-0000-0000-000000000001',
   '51d00000-0000-0000-0000-000000000004', 'mecanica', 4000, 'full', '2026-12-01', '51a00000-0000-0000-0000-000000000001', 'recepcion', 0);

INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea) VALUES
  ('51e00000-0000-0000-0000-000000000001', '51b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('51e00000-0000-0000-0000-000000000002', '51b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('51e00000-0000-0000-0000-000000000003', '51b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('51e00000-0000-0000-0000-000000000004', '51b00000-0000-0000-0000-000000000001', 'mecanica');

SELECT set_config('restorify.presupuesto', 'on', true);
INSERT INTO orden_labor (id, orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado) VALUES
  ('51f00000-0000-0000-0000-000000000001', '51e00000-0000-0000-0000-000000000001', 'Diagnóstico', 100, 'mecanica', '51b00000-0000-0000-0000-000000000001', 'borrador', false),
  ('51f00000-0000-0000-0000-000000000002', '51e00000-0000-0000-0000-000000000002', 'Frenos', 200, 'mecanica', '51b00000-0000-0000-0000-000000000001', 'aprobado', false);

INSERT INTO orden_repuestos (id, orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal, estado) VALUES
  ('51f10000-0000-0000-0000-000000000003', '51e00000-0000-0000-0000-000000000003', 'Filtro de aire', 1, 20, 35, 35, 'aprobado');
SELECT set_config('restorify.presupuesto', 'off', true);

-- ------------------------------------------------------------------------------------
-- 1. Técnico asignado, orden sin ninguna línea aprobada: cambiar avance da 42501
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '51b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo
     SET porcentaje_avance = 40
     WHERE id = '51e00000-0000-0000-0000-000000000001' $$,
  '42501',
  'El cliente todavía no autoriza ningún trabajo de esta orden. No se puede empezar ni terminar hasta que administración registre la autorización.',
  'sin ninguna línea aprobada el técnico no mueve porcentaje_avance'
);
SELECT is(
  (SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = '51e00000-0000-0000-0000-000000000001'),
  0,
  'y porcentaje_avance sigue en 0'
);

-- ------------------------------------------------------------------------------------
-- 4. Mismo avance (sin cambiarlo) con otro cambio permitido no falla por esta regla
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo
     SET porcentaje_avance = 0, fecha_finalizacion = '2020-01-01 00:00:00+00'
     WHERE id = '51e00000-0000-0000-0000-000000000001' $$,
  'mandar el mismo porcentaje_avance con fecha_finalizacion no falla por esta regla'
);
SELECT is(
  (SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = '51e00000-0000-0000-0000-000000000001'),
  0,
  'y porcentaje_avance continúa en 0'
);

-- ------------------------------------------------------------------------------------
-- 2. Con una línea de mano de obra aprobada: cambia el avance bien
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo
     SET porcentaje_avance = 45
     WHERE id = '51e00000-0000-0000-0000-000000000002' $$,
  'con mano de obra aprobada el técnico sí mueve el avance'
);
SELECT is(
  (SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = '51e00000-0000-0000-0000-000000000002'),
  45,
  'el avance queda en 45'
);

-- ------------------------------------------------------------------------------------
-- 3. Con solo un repuesto aprobado: cambia el avance bien
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo
     SET porcentaje_avance = 70
     WHERE id = '51e00000-0000-0000-0000-000000000003' $$,
  'con solo un repuesto aprobado el técnico también mueve el avance'
);
SELECT is(
  (SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = '51e00000-0000-0000-0000-000000000003'),
  70,
  'el avance queda en 70'
);

-- ------------------------------------------------------------------------------------
-- 6. Técnico ajeno sigue sin ver ni cambiar la orden (cero filas)
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '51b00000-0000-0000-0000-000000000002';

SELECT lives_ok(
  $$ DO $d$
     DECLARE n INT;
     BEGIN
       UPDATE ordenes_trabajo
       SET porcentaje_avance = 50
       WHERE id = '51e00000-0000-0000-0000-000000000004';
       GET DIAGNOSTICS n = ROW_COUNT;
       IF n <> 0 THEN
         RAISE EXCEPTION 'el técnico ajeno modificó % fila(s)', n;
       END IF;
     END $d$ $$,
  'un técnico no asignado sigue sin ver la orden de otro (cero filas)'
);

-- ------------------------------------------------------------------------------------
-- 5. Administración mueve el avance sin nada autorizado
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '51a00000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = '51e00000-0000-0000-0000-000000000004'),
  0,
  'la orden 4 sigue en 0 antes de que administración la mueva'
);
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo
     SET porcentaje_avance = 60
     WHERE id = '51e00000-0000-0000-0000-000000000004' $$,
  'administración sí mueve porcentaje_avance sin ninguna línea aprobada'
);
SELECT is(
  (SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = '51e00000-0000-0000-0000-000000000004'),
  60,
  'y el avance queda en 60'
);

SELECT * FROM finish();
ROLLBACK;
