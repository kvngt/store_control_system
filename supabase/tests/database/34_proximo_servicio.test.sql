-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: sticker y próximo servicio (20261010000029)
-- ====================================================================================
-- Qué cubre:
--   * El técnico asignado sugiere próximo servicio en una orden en proceso.
--   * Uno no asignado recibe 42501.
--   * En una orden entregada, el técnico recibe 42501.
--   * El técnico no programa, ni quita, ni descarta (42501), ni escribe la tabla directo.
--   * El admin programa: se crea el código, la sugerencia se borra, reprogramar
--     conserva el código y programar una orden entregada funciona.
--   * Validaciones (22023): sin fecha ni millas, fecha pasada, millas menores que
--     las de ingreso y nota de más de 120 caracteres.
--   * Quitar borra el código y entonces datos_servicio devuelve no_existe.
--   * datos_servicio: devuelve taller, vehículo y servicio; no trae cliente, placa,
--     vin, montos ni número de orden; anon y authenticated no la pueden llamar.
--   * datos_portal trae proximo_servicio.
--   * requiere_atencion cuenta la sugerencia en sugerencias_servicio.
--   * RLS: el técnico lee la fila de su orden y ve 0 filas de otra orden.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(34);

-- ------------------------------------------------------------------------------------
-- Datos de prueba
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, telefonos) VALUES
  ('34000000-0000-0000-0000-000000000001', 'Sede Sticker', 'Calle 34', '555-3400',
   '[{"label":"Oficina","numero":"555-3400","tipo":"oficina","whatsapp":false},{"label":"Celular","numero":"555-3401","tipo":"celular","whatsapp":true}]'::jsonb);

INSERT INTO auth.users (id, email) VALUES
  ('a3400000-0000-0000-0000-000000000001', 'admin34@prueba.local'),
  ('a3400000-0000-0000-0000-000000000002', 'tec34_asignado@prueba.local'),
  ('a3400000-0000-0000-0000-000000000003', 'tec34_ajeno@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a3400000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '34000000-0000-0000-0000-000000000001', 'admin34@prueba.local'),
  ('a3400000-0000-0000-0000-000000000002', 'Tomás Técnico Asignado', 'mecanico', '34000000-0000-0000-0000-000000000001', 'tec34_asignado@prueba.local'),
  ('a3400000-0000-0000-0000-000000000003', 'Pedro Técnico Ajeno', 'mecanico', '34000000-0000-0000-0000-000000000001', 'tec34_ajeno@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, idioma) VALUES
  ('c3400000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'Marta Gómez', '+15553401', 'marta34@prueba.local', 'Av 1', 'en'),
  ('c3400000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000001', 'Carlos Ruiz', '+15553402', 'carlos34@prueba.local', 'Av 2', 'es');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d3400000-0000-0000-0000-000000000001', 'c3400000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A034001', 'ABC-3401', 'Gris'),
  ('d3400000-0000-0000-0000-000000000002', 'c3400000-0000-0000-0000-000000000002', 'Honda', 'Civic', 2021, '1HGCM82633A034002', 'XYZ-3402', 'Azul'),
  ('d3400000-0000-0000-0000-000000000003', 'c3400000-0000-0000-0000-000000000001', 'Ford', 'F-150', 2018, '1HGCM82633A034003', 'ENT-3403', 'Rojo');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a3400000-0000-0000-0000-000000000001';

-- Orden 1: asignada a Tomás Técnico (a34...2), en proceso
SELECT create_work_order(
  jsonb_build_object(
    'sede_id', '34000000-0000-0000-0000-000000000001',
    'cliente_id', 'c3400000-0000-0000-0000-000000000001',
    'vehiculo_id', 'd3400000-0000-0000-0000-000000000001',
    'tipo_trabajo', 'mecanica', 'millas_ingreso', 60000, 'nivel_gasolina', '1/2',
    'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2027-12-31',
    'creado_por', 'a3400000-0000-0000-0000-000000000001'),
  '[{"descripcion":"Afinación","costo":150,"especialidad":"mecanica","asignado_a":"a3400000-0000-0000-0000-000000000002","reparto_heredado":false}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb);

-- Orden 2: asignada a Pedro Técnico (a34...3), en proceso (para Tomás es ajena)
SELECT create_work_order(
  jsonb_build_object(
    'sede_id', '34000000-0000-0000-0000-000000000001',
    'cliente_id', 'c3400000-0000-0000-0000-000000000002',
    'vehiculo_id', 'd3400000-0000-0000-0000-000000000002',
    'tipo_trabajo', 'mecanica', 'millas_ingreso', 30000, 'nivel_gasolina', '1/2',
    'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2027-12-31',
    'creado_por', 'a3400000-0000-0000-0000-000000000001'),
  '[{"descripcion":"Frenos","costo":120,"especialidad":"mecanica","asignado_a":"a3400000-0000-0000-0000-000000000003","reparto_heredado":false}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb);

-- Orden 3: asignada a Tomás Técnico pero entregada
SELECT create_work_order(
  jsonb_build_object(
    'sede_id', '34000000-0000-0000-0000-000000000001',
    'cliente_id', 'c3400000-0000-0000-0000-000000000001',
    'vehiculo_id', 'd3400000-0000-0000-0000-000000000003',
    'tipo_trabajo', 'mecanica', 'millas_ingreso', 80000, 'nivel_gasolina', '1/2',
    'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2027-12-31',
    'creado_por', 'a3400000-0000-0000-0000-000000000001'),
  '[{"descripcion":"Revisión","costo":80,"especialidad":"mecanica","asignado_a":"a3400000-0000-0000-0000-000000000002","reparto_heredado":false}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb);

RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.o1() RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd3400000-0000-0000-0000-000000000001' $$;
CREATE OR REPLACE FUNCTION pg_temp.o2() RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd3400000-0000-0000-0000-000000000002' $$;
CREATE OR REPLACE FUNCTION pg_temp.o_entregada() RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd3400000-0000-0000-0000-000000000003' $$;

UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id IN (pg_temp.o1(), pg_temp.o2());
UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE id = pg_temp.o_entregada();

-- ------------------------------------------------------------------------------------
-- 1. Permisos de datos_servicio
-- ------------------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('anon', 'public.datos_servicio(text)', 'EXECUTE'),
  'anon no puede llamar datos_servicio');
SELECT ok(NOT has_function_privilege('authenticated', 'public.datos_servicio(text)', 'EXECUTE'),
  'authenticated no puede llamar datos_servicio');
SELECT ok(has_function_privilege('service_role', 'public.datos_servicio(text)', 'EXECUTE'),
  'service_role puede llamar datos_servicio');

-- ------------------------------------------------------------------------------------
-- 2. El técnico asignado sugiere y validaciones de rol
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a3400000-0000-0000-0000-000000000002'; -- Tomás (asignado a o1)

SELECT lives_ok(
  $$ SELECT sugerir_proximo_servicio(pg_temp.o1(), '2027-04-14'::date, 65000, 'Aceite sintético') $$,
  'El técnico asignado sugiere en una orden en proceso'
);

SELECT throws_ok(
  $$ SELECT sugerir_proximo_servicio(pg_temp.o2(), '2027-04-14'::date, 35000, 'Aceite') $$,
  '42501',
  NULL, -- para él la orden ajena no existe: basta el código
  'Un técnico no asignado recibe 42501 al sugerir'
);

SELECT throws_ok(
  $$ SELECT sugerir_proximo_servicio(pg_temp.o_entregada(), '2027-04-14'::date, 85000, 'Aceite') $$,
  '42501',
  'No se puede sugerir servicio en una orden ya entregada.',
  'En una orden entregada el técnico recibe 42501'
);

-- El técnico no programa, ni quita, ni descarta
SELECT throws_ok(
  $$ SELECT programar_proximo_servicio(pg_temp.o1(), '2027-04-14'::date, 65000, 'Aceite') $$,
  '42501',
  'Solo administración puede programar el próximo servicio.',
  'El técnico no programa (42501)'
);

SELECT throws_ok(
  $$ SELECT quitar_proximo_servicio(pg_temp.o1()) $$,
  '42501',
  'Solo administración puede quitar el próximo servicio.',
  'El técnico no quita (42501)'
);

SELECT throws_ok(
  $$ SELECT descartar_sugerencia_proximo_servicio(pg_temp.o1()) $$,
  '42501',
  'Solo administración puede descartar la sugerencia.',
  'El técnico no descarta sugerencia (42501)'
);

-- El técnico no escribe la tabla directo
SELECT throws_ok(
  $$ INSERT INTO orden_proximo_servicio (orden_id, sede_id) VALUES (pg_temp.o1(), '34000000-0000-0000-0000-000000000001') $$,
  '42501', NULL,
  'El técnico no puede insertar en orden_proximo_servicio'
);

SELECT throws_ok(
  $$ UPDATE orden_proximo_servicio SET nota = 'hack' WHERE orden_id = pg_temp.o1() $$,
  '42501', NULL,
  'El técnico no puede actualizar orden_proximo_servicio directo'
);

SELECT throws_ok(
  $$ DELETE FROM orden_proximo_servicio WHERE orden_id = pg_temp.o1() $$,
  '42501', NULL,
  'El técnico no puede borrar de orden_proximo_servicio directo'
);

-- RLS: el técnico lee su orden y 0 filas de otra orden
SELECT is(
  (SELECT count(*)::int FROM orden_proximo_servicio WHERE orden_id = pg_temp.o1()),
  1,
  'RLS: el técnico lee la fila de su orden asignada'
);

SELECT is(
  (SELECT count(*)::int FROM orden_proximo_servicio WHERE orden_id = pg_temp.o2()),
  0,
  'RLS: el técnico ve 0 filas de orden_proximo_servicio de orden ajena'
);

RESET ROLE;

-- ------------------------------------------------------------------------------------
-- 3. requiere_atencion cuenta la sugerencia pendiente
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a3400000-0000-0000-0000-000000000001'; -- Admin

SELECT throws_ok(
  $$ SELECT sugerir_proximo_servicio(pg_temp.o1(), '2027-04-14'::date, 65000, 'Aceite') $$,
  '42501',
  'Administración programa el próximo servicio directamente.',
  'Un admin no sugiere: programa directo'
);

SELECT is(
  (SELECT (requiere_atencion('34000000-0000-0000-0000-000000000001', '2026-10-14')->'sugerencias_servicio'->>'total')::int),
  1,
  'requiere_atencion cuenta la sugerencia en sugerencias_servicio'
);

-- ------------------------------------------------------------------------------------
-- 4. Validaciones (22023)
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT programar_proximo_servicio(pg_temp.o1(), NULL, NULL, 'Nota') $$,
  '22023',
  'Debes indicar al menos la fecha o el millaje para el próximo servicio.',
  'Validación: rechaza sin fecha ni millas'
);

SELECT throws_ok(
  $$ SELECT programar_proximo_servicio(pg_temp.o1(), '2020-01-01'::date, 70000, 'Nota') $$,
  '22023',
  'La fecha del próximo servicio no puede ser anterior a hoy.',
  'Validación: rechaza fecha anterior a hoy'
);

SELECT throws_ok(
  $$ SELECT programar_proximo_servicio(pg_temp.o1(), '2027-01-01'::date, 50000, 'Nota') $$,
  '22023',
  'El millaje no puede ser menor que las millas de ingreso del vehículo (60000).',
  'Validación: rechaza millas menores que las de ingreso (60000)'
);

SELECT throws_ok(
  $$ SELECT programar_proximo_servicio(pg_temp.o1(), '2027-01-01'::date, 70000, repeat('x', 121)) $$,
  '22023',
  'La nota no puede tener más de 120 caracteres.',
  'Validación: rechaza nota de más de 120 caracteres'
);

-- ------------------------------------------------------------------------------------
-- 5. El admin programa, reprograma y programa orden entregada
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT programar_proximo_servicio(pg_temp.o1(), '2027-04-14'::date, 66000, 'Aceite sintético 5W-30') $$,
  'El admin programa el próximo servicio'
);

SELECT is(
  (SELECT length(token) FROM orden_proximo_servicio WHERE orden_id = pg_temp.o1()),
  64,
  'Se crea el código token de 64 caracteres hex'
);

SELECT is(
  (SELECT sugerido_fecha FROM orden_proximo_servicio WHERE orden_id = pg_temp.o1()),
  NULL,
  'La sugerencia del técnico se borra al programar'
);

-- Reprogramar conserva el código existente
CREATE TEMP TABLE pg_temp.t_tok AS
  SELECT token AS tok1 FROM orden_proximo_servicio WHERE orden_id = pg_temp.o1();

SELECT lives_ok(
  $$ SELECT programar_proximo_servicio(pg_temp.o1(), '2027-05-20'::date, 67000, 'Aceite y filtros') $$,
  'Reprogramar servicio'
);

SELECT is(
  (SELECT token FROM orden_proximo_servicio WHERE orden_id = pg_temp.o1()),
  (SELECT tok1 FROM pg_temp.t_tok),
  'Reprogramar conserva el código token existente'
);

-- Programar una orden entregada funciona
SELECT lives_ok(
  $$ SELECT programar_proximo_servicio(pg_temp.o_entregada(), '2027-06-01'::date, 85000, 'Revisión anual') $$,
  'Programar en una orden entregada funciona para administración'
);

-- ------------------------------------------------------------------------------------
-- 6. datos_portal incluye proximo_servicio
-- ------------------------------------------------------------------------------------
RESET ROLE;

DO $do$
DECLARE
  v_enlace orden_enlaces;
  v_port   JSONB;
BEGIN
  v_enlace := public.asegurar_enlace_orden(pg_temp.o1());
  v_port := public.datos_portal(v_enlace.token);
  CREATE TEMP TABLE pg_temp.t_port AS SELECT v_port AS datos;
END $do$;

SELECT is(
  (SELECT datos->'proximo_servicio'->>'fecha' FROM pg_temp.t_port),
  '2027-05-20',
  'datos_portal trae fecha de proximo_servicio'
);

SELECT is(
  (SELECT (datos->'proximo_servicio'->>'millas')::int FROM pg_temp.t_port),
  67000,
  'datos_portal trae millas de proximo_servicio'
);

-- ------------------------------------------------------------------------------------
-- 7. datos_servicio: datos públicos y ausencia de datos sensibles
-- ------------------------------------------------------------------------------------
DO $do$
DECLARE
  v_tok TEXT;
  v_srv JSONB;
BEGIN
  SELECT token INTO v_tok FROM orden_proximo_servicio WHERE orden_id = pg_temp.o1();
  v_srv := public.datos_servicio(v_tok);
  CREATE TEMP TABLE pg_temp.t_srv AS SELECT v_tok AS token, v_srv AS datos;
END $do$;

SELECT is(
  (SELECT datos->>'estado' FROM pg_temp.t_srv),
  'ok',
  'datos_servicio devuelve estado ok'
);

SELECT is(
  (SELECT datos->'vehiculo'->>'modelo' FROM pg_temp.t_srv),
  'Camry',
  'datos_servicio devuelve modelo del vehículo'
);

SELECT ok(
  NOT ((SELECT datos FROM pg_temp.t_srv) ? 'cliente')
  AND NOT ((SELECT datos FROM pg_temp.t_srv) ? 'numero_orden')
  AND NOT ((SELECT datos FROM pg_temp.t_srv) ? 'cuenta')
  AND NOT ((SELECT datos->'vehiculo' FROM pg_temp.t_srv) ? 'placa')
  AND NOT ((SELECT datos->'vehiculo' FROM pg_temp.t_srv) ? 'vin'),
  'datos_servicio NO expone cliente, numero_orden, cuenta, placa ni vin'
);

-- ------------------------------------------------------------------------------------
-- 8. Quitar borra el código y datos_servicio devuelve no_existe
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a3400000-0000-0000-0000-000000000001'; -- Admin

SELECT lives_ok(
  $$ SELECT quitar_proximo_servicio(pg_temp.o1()) $$,
  'Admin quita el próximo servicio'
);

SELECT is(
  (SELECT token FROM orden_proximo_servicio WHERE orden_id = pg_temp.o1()),
  NULL,
  'Quitar pone token a NULL'
);

RESET ROLE;

SELECT is(
  (SELECT datos_servicio((SELECT token FROM pg_temp.t_srv))->>'estado'),
  'no_existe',
  'datos_servicio devuelve no_existe tras quitar el servicio'
);

SELECT * FROM finish();
ROLLBACK;
