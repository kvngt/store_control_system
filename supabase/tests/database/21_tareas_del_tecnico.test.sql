-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: tareas por hacer del técnico
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(3);

-- ------------------------------------------------------------------------------------
-- Datos
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, comision_porcentaje) VALUES
  ('21000000-0000-0000-0000-000000000001', 'Sede Tareas', 'Calle 21', '555-2121', 35);

INSERT INTO auth.users (id, email) VALUES
  ('a2100000-0000-0000-0000-000000000001', 'admin21@prueba.local'),
  ('a2100000-0000-0000-0000-000000000002', 'mecanico21@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a2100000-0000-0000-0000-000000000001', 'Admin', 'admin', '21000000-0000-0000-0000-000000000001', 'admin21@prueba.local'),
  ('a2100000-0000-0000-0000-000000000002', 'Tecnico', 'mecanico', '21000000-0000-0000-0000-000000000001', 'mecanico21@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c2100000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Cliente', '+15550210', '', 'Elm 21');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d2100000-0000-0000-0000-00000000000a', 'c2100000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A021001', NULL, 'Gris');

-- Nos logueamos como admin para crear las órdenes
SELECT set_config('request.jwt.claims', '{"sub":"a2100000-0000-0000-0000-000000000001", "role":"authenticated"}', true);

SELECT create_work_order(
  jsonb_build_object(
    'sede_id', '21000000-0000-0000-0000-000000000001',
    'cliente_id', 'c2100000-0000-0000-0000-000000000001',
    'vehiculo_id', 'd2100000-0000-0000-0000-00000000000a',
    'tipo_trabajo', 'mecanica',
    'millas_ingreso', 10,
    'nivel_gasolina', '1/2',
    'creado_por', 'a2100000-0000-0000-0000-000000000001',
    'fecha_estimada_entrega', '2026-10-10',
    'deposito', 10
  ),
  '[{"id":"f2100000-0000-0000-0000-000000000001", "descripcion":"Tarea 1", "costo":100, "asignado_a":"a2100000-0000-0000-0000-000000000002"}]'::jsonb, 
  '[]'::jsonb, 
  '[]'::jsonb
);

SELECT create_work_order(
  jsonb_build_object(
    'sede_id', '21000000-0000-0000-0000-000000000001',
    'cliente_id', 'c2100000-0000-0000-0000-000000000001',
    'vehiculo_id', 'd2100000-0000-0000-0000-00000000000a',
    'tipo_trabajo', 'pintura',
    'millas_ingreso', 10,
    'nivel_gasolina', '1/2',
    'creado_por', 'a2100000-0000-0000-0000-000000000001',
    'fecha_estimada_entrega', '2026-10-10',
    'deposito', 10
  ),
  '[{"id":"f2100000-0000-0000-0000-000000000002", "descripcion":"Tarea 2", "costo":200, "asignado_a":"a2100000-0000-0000-0000-000000000002"}]'::jsonb, 
  '[]'::jsonb, 
  '[]'::jsonb
);

-- Obtenemos el ID de las órdenes que acabamos de crear
CREATE OR REPLACE FUNCTION pg_temp.o1_id() RETURNS UUID AS $$ SELECT id FROM ordenes_trabajo WHERE tipo_trabajo = 'mecanica' AND cliente_id = 'c2100000-0000-0000-0000-000000000001' LIMIT 1 $$ LANGUAGE SQL;
CREATE OR REPLACE FUNCTION pg_temp.o2_id() RETURNS UUID AS $$ SELECT id FROM ordenes_trabajo WHERE tipo_trabajo = 'pintura' AND cliente_id = 'c2100000-0000-0000-0000-000000000001' LIMIT 1 $$ LANGUAGE SQL;
CREATE OR REPLACE FUNCTION pg_temp.o1_labor_id() RETURNS UUID AS $$ SELECT id FROM orden_labor WHERE orden_id = pg_temp.o1_id() LIMIT 1 $$ LANGUAGE SQL;
CREATE OR REPLACE FUNCTION pg_temp.o2_labor_id() RETURNS UUID AS $$ SELECT id FROM orden_labor WHERE orden_id = pg_temp.o2_id() LIMIT 1 $$ LANGUAGE SQL;

-- Intentar vincular un avance a su propia orden y tarea
SELECT lives_ok(
  $$ INSERT INTO orden_avances (orden_id, labor_id, usuario_id, descripcion) VALUES (pg_temp.o1_id(), pg_temp.o1_labor_id(), 'a2100000-0000-0000-0000-000000000001', 'Avance válido') $$,
  'Un avance puede asociarse a una tarea de la misma orden'
);

-- Aprobar tareas para que el técnico pueda completarlas
SELECT registrar_autorizacion(
  pg_temp.o1_id(),
  ARRAY[pg_temp.o1_labor_id()],
  ARRAY[pg_temp.o1_labor_id()],
  'admin_telefono'
);

-- Intentar vincular un avance a una orden pero usando la tarea de OTRA orden
SELECT throws_ok(
  $$ INSERT INTO orden_avances (orden_id, labor_id, usuario_id, descripcion) VALUES (pg_temp.o1_id(), pg_temp.o2_labor_id(), 'a2100000-0000-0000-0000-000000000001', 'Avance fraudulento') $$,
  '23503',
  NULL,
  'El trigger debe abortar si labor_id no pertenece a la misma orden'
);

-- Verificar comportamiento de completar tarea
-- Nos logueamos como el técnico asignado
SELECT set_config('request.jwt.claims', '{"sub":"a2100000-0000-0000-0000-000000000002", "role":"authenticated"}', true);
SELECT lives_ok(
  $$ SELECT marcar_labor_completada(pg_temp.o1_labor_id(), true) $$,
  'El técnico asignado puede marcar su propia tarea como completada'
);

SELECT * FROM finish();
ROLLBACK;
