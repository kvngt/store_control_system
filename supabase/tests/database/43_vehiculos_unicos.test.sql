-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: VIN y placa únicos (20261010000039)
-- ====================================================================================
-- Qué cubre:
--   * el mismo VIN no se registra dos veces, aunque cambien las mayúsculas o haya espacios;
--   * la misma placa no se registra dos veces en el mismo estado, pero sí en otro estado;
--   * varios carros sin placa conviven (subasta) y editar un carro no choca consigo mismo.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(7);

INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('43000000-0000-0000-0000-000000000001', 'Sede QA 43', 'Calle 43', '555-4301');
INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('43c00000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', 'Cliente 43', '+15554301', 'cli43@prueba.local', 'Ave 43', false);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, placa_estado, color) VALUES
  ('43d00000-0000-0000-0000-000000000001', '43c00000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2021, '2T1BURHE0MC004301', 'ABC1234', 'MD', 'Blanco');

SELECT throws_ok(
  $$ INSERT INTO vehiculos (cliente_id, marca, modelo, anio, vin, placa, color)
     VALUES ('43c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2020, '2T1BURHE0MC004301', NULL, 'Negro') $$,
  '23505', NULL,
  'el mismo VIN no se registra dos veces'
);

SELECT throws_ok(
  $$ INSERT INTO vehiculos (cliente_id, marca, modelo, anio, vin, placa, color)
     VALUES ('43c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2020, '  2t1burhe0mc004301 ', NULL, 'Negro') $$,
  '23505', NULL,
  'ni con otras mayúsculas o espacios alrededor'
);

SELECT throws_ok(
  $$ INSERT INTO vehiculos (cliente_id, marca, modelo, anio, vin, placa, placa_estado, color)
     VALUES ('43c00000-0000-0000-0000-000000000001', 'Mazda', '3', 2019, '2T1BURHE0MC004302', ' abc1234', 'md', 'Rojo') $$,
  '23505', NULL,
  'la misma placa en el mismo estado no se registra dos veces (sin importar mayúsculas)'
);

SELECT lives_ok(
  $$ INSERT INTO vehiculos (cliente_id, marca, modelo, anio, vin, placa, placa_estado, color)
     VALUES ('43c00000-0000-0000-0000-000000000001', 'Mazda', '3', 2019, '2T1BURHE0MC004303', 'ABC1234', 'VA', 'Rojo') $$,
  'la misma placa en otro estado sí es otro carro'
);

SELECT lives_ok(
  $$ INSERT INTO vehiculos (cliente_id, marca, modelo, anio, vin, placa, color) VALUES
       ('43c00000-0000-0000-0000-000000000001', 'Ford', 'F-150', 2018, '1FTFW1ET5DFC43001', NULL, 'Azul'),
       ('43c00000-0000-0000-0000-000000000001', 'Ford', 'Ranger', 2018, '1FTFW1ET5DFC43002', NULL, 'Gris') $$,
  'varios carros sin placa (de subasta) conviven'
);

SELECT lives_ok(
  $$ UPDATE vehiculos SET color = 'Plata' WHERE id = '43d00000-0000-0000-0000-000000000001' $$,
  'editar un carro no choca consigo mismo'
);

SELECT is(
  (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('uq_vehiculos_vin', 'uq_vehiculos_placa')),
  2,
  'existen los dos índices únicos'
);

SELECT * FROM finish();
ROLLBACK;
