-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: Hallazgos (Fase 6)
-- ====================================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

-- Setup: preparar sede, usuario y orden
WITH s AS (
  INSERT INTO sedes (id, nombre, direccion, telefono) VALUES (gen_random_uuid(), 'Sede Hallazgos', 'Dir', '555') RETURNING id
),
au1 AS (
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'tech_hallazgo@example.com') RETURNING id
),
au2 AS (
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'admin_hallazgo@example.com') RETURNING id
),
u AS (
  INSERT INTO perfiles (id, email, nombre_completo, sede_id, rol)
  VALUES ((SELECT id FROM au1), 'tech_hallazgo@example.com', 'Tech Hallazgo', (SELECT id FROM s), 'mecanico')
  RETURNING id
),
admin AS (
  INSERT INTO perfiles (id, email, nombre_completo, sede_id, rol)
  VALUES ((SELECT id FROM au2), 'admin_hallazgo@example.com', 'Admin Hallazgo', (SELECT id FROM s), 'admin')
  RETURNING id
),
c AS (
  INSERT INTO clientes (id, nombre, email, telefono, direccion, sede_id)
  VALUES (gen_random_uuid(), 'Cliente Hallazgo', 'cliente@example.com', '555', 'Dir', (SELECT id FROM s))
  RETURNING id
),
v AS (
  INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color)
  VALUES (gen_random_uuid(), (SELECT id FROM c), 'Toyota', 'Corolla', 2020, 'VIN123456789', 'HALLAZGO', 'Blanco')
  RETURNING id
),
o AS (
  INSERT INTO ordenes_trabajo (id, sede_id, cliente_id, vehiculo_id, estatus, creado_por, numero_orden, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega)
  VALUES (gen_random_uuid(), (SELECT id FROM s), (SELECT id FROM c), (SELECT id FROM v), 'en_proceso', (SELECT id FROM admin), 'ORD-TEST', 'mecanica', 0, 'lleno', '2026-10-10')
  RETURNING id
),
a AS (
  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
  VALUES ((SELECT id FROM o), (SELECT id FROM u), 'mecanica')
)
SELECT set_config('restorify.test.orden', (SELECT id::text FROM o), true),
       set_config('restorify.test.tech', (SELECT id::text FROM u), true),
       set_config('restorify.test.admin', (SELECT id::text FROM admin), true);

SELECT plan(8);

-- Test 1: Reportar un hallazgo pone la orden en espera
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', format('{"sub":"%s", "email":"tech_hallazgo@example.com"}', current_setting('restorify.test.tech')), true);

SELECT is(
  (SELECT reportar_hallazgo((current_setting('restorify.test.orden')::uuid), 'Pastillas de freno desgastadas'::text) IS NOT NULL),
  true,
  'El mecánico puede reportar un hallazgo y retorna un ID válido'
);

SELECT is(
  (SELECT estatus FROM ordenes_trabajo WHERE id = current_setting('restorify.test.orden')::uuid),
  'espera_autorizacion'::order_status,
  'La orden se pausa (espera_autorizacion) automáticamente'
);

SELECT is(
  (SELECT estado FROM orden_hallazgos WHERE orden_id = current_setting('restorify.test.orden')::uuid LIMIT 1),
  'pendiente',
  'El hallazgo se crea con estado pendiente'
);

-- Test 2: Admin cotiza un hallazgo
SELECT set_config('request.jwt.claims', format('{"sub":"%s", "email":"admin_hallazgo@example.com"}', current_setting('restorify.test.admin')), true);

SELECT lives_ok(
  $$ SELECT cotizar_hallazgo((SELECT id FROM orden_hallazgos WHERE orden_id = current_setting('restorify.test.orden')::uuid LIMIT 1)) $$,
  'El admin puede cotizar el hallazgo'
);

SELECT is(
  (SELECT estado FROM orden_hallazgos WHERE orden_id = current_setting('restorify.test.orden')::uuid LIMIT 1),
  'cotizado',
  'El hallazgo cambia a estado cotizado'
);

-- Test 3: Descartar hallazgo
-- Reportamos otro hallazgo
SELECT set_config('request.jwt.claims', format('{"sub":"%s", "email":"tech_hallazgo@example.com"}', current_setting('restorify.test.tech')), true);
SELECT reportar_hallazgo((current_setting('restorify.test.orden')::uuid), 'Filtro de aire sucio'::text);

SELECT set_config('request.jwt.claims', format('{"sub":"%s", "email":"admin_hallazgo@example.com"}', current_setting('restorify.test.admin')), true);
SELECT lives_ok(
  $$ SELECT descartar_hallazgo((SELECT id FROM orden_hallazgos WHERE descripcion = 'Filtro de aire sucio' LIMIT 1), true, 'El cliente prefirió cambiarlo después'::text) $$,
  'El admin descarta el hallazgo y añade texto para el reporte'
);

SELECT is(
  (SELECT estado FROM orden_hallazgos WHERE descripcion = 'Filtro de aire sucio' LIMIT 1),
  'descartado',
  'El hallazgo cambia a estado descartado'
);

SELECT is(
  (SELECT estatus FROM ordenes_trabajo WHERE id = current_setting('restorify.test.orden')::uuid),
  'en_proceso'::order_status,
  'La orden vuelve a en_proceso si ya no hay hallazgos pendientes ni presupuesto esperando'
);

SELECT * FROM finish();
ROLLBACK;
