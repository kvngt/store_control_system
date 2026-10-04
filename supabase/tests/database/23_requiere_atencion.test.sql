-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: "Requiere atención" del panel (F7)
-- ====================================================================================
-- Qué cubre (migración 20261010000012): `requiere_atencion` es solo de administración;
-- cuenta en la base los hallazgos sin decidir, los presupuestos sin respuesta, las tareas
-- sin técnico, las órdenes vencidas y los correos con error; deja fuera lo entregado, lo
-- finalizado (que no vence), las líneas heredadas y lo de otra sede; usa la fecha local que
-- le pasan; y cuenta los correos como los reintentaría `reintentar_correos_fallidos`.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(15);

-- ------------------------------------------------------------------------------------
-- Datos: dos sedes, un admin y un mecánico; siete órdenes en la primera, una en la segunda
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sede Norte', 'Calle 1', '555-0100'),
  ('10000000-0000-0000-0000-000000000002', 'Sede Sur', 'Calle 2', '555-0200');

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'mecanico@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '10000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '10000000-0000-0000-0000-000000000001', 'mecanico@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta@prueba.local', 'Oak 12'),
  ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Pedro Sur', '555-0240', 'pedro@prueba.local', 'Elm 3');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A000001', NULL, 'Gris'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '1HGCM82633A000002', NULL, 'Rojo'),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Ford', 'F-150', 2020, '1HGCM82633A000003', NULL, 'Azul'),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'Nissan', 'Versa', 2017, '1HGCM82633A000004', NULL, 'Blanco'),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'Kia', 'Rio', 2016, '1HGCM82633A000005', NULL, 'Negro'),
  ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'Mazda', '3', 2021, '1HGCM82633A000006', NULL, 'Gris'),
  ('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 'Jeep', 'Wrangler', 2015, '1HGCM82633A000007', NULL, 'Verde');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

-- Una orden por vehículo. Las líneas del alta sin `reparto_heredado` nacen heredadas: no
-- cuentan como "sin técnico". La 3 lleva además una tarea nueva sin técnico y una con.
DO $do$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('d0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-12-31', '[{"descripcion":"Diagnóstico","costo":100}]'),
      ('d0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-12-31', '[{"descripcion":"Frenos","costo":200}]'),
      ('d0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-12-31',
        '[{"descripcion":"Heredada","costo":50},{"descripcion":"Sin técnico","costo":80,"reparto_heredado":false},{"descripcion":"Con técnico","costo":90,"asignado_a":"a0000000-0000-0000-0000-000000000002"}]'),
      ('d0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-10-01', '[]'),
      ('d0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-10-01', '[]'),
      ('d0000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', '2026-12-31', '[]'),
      ('d0000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-10-01', '[]')
    ) AS t(vehiculo, sede, cliente, fecha, labor)
  LOOP
    PERFORM create_work_order(
      jsonb_build_object(
        'sede_id', v.sede, 'cliente_id', v.cliente, 'vehiculo_id', v.vehiculo,
        'tipo_trabajo', 'mecanica', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
        'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', v.fecha,
        'creado_por', 'a0000000-0000-0000-0000-000000000001'),
      v.labor::jsonb, '[]'::jsonb, '[]'::jsonb
    );
  END LOOP;
  -- La 2 tiene un presupuesto enviado sin respuesta.
  PERFORM enviar_presupuesto((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002'), false);
END $do$;

RESET ROLE;
CREATE TEMP TABLE t_o AS
  SELECT right(vehiculo_id::text, 1)::int AS n, id, numero_orden FROM ordenes_trabajo;
GRANT SELECT ON t_o TO authenticated;

-- La 5 está finalizada (no vence); la 7, entregada (nada que decidir aunque tenga un hallazgo).
UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = (SELECT id FROM t_o WHERE n = 5);
UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE id = (SELECT id FROM t_o WHERE n = 7);

-- Hallazgos: pendiente en la 1, cotizado sin presupuesto en la 3 (más nuevo), cotizado ya en
-- presupuesto y descartado en la 2 (no cuentan), pendiente en la 7 entregada y en la 6 de la
-- otra sede.
INSERT INTO orden_hallazgos (orden_id, sede_id, reportado_por, descripcion, estado, presupuesto_id, creado_en) VALUES
  ((SELECT id FROM t_o WHERE n = 1), '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Fuga', 'pendiente', NULL, NOW() - INTERVAL '2 hours'),
  ((SELECT id FROM t_o WHERE n = 3), '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Balatas', 'cotizado', NULL, NOW() - INTERVAL '1 hour'),
  ((SELECT id FROM t_o WHERE n = 2), '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Ya cotizado', 'cotizado',
     (SELECT id FROM presupuestos WHERE orden_id = (SELECT id FROM t_o WHERE n = 2)), NOW()),
  ((SELECT id FROM t_o WHERE n = 2), '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Descartado', 'descartado', NULL, NOW()),
  ((SELECT id FROM t_o WHERE n = 7), '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Entregada', 'pendiente', NULL, NOW()),
  ((SELECT id FROM t_o WHERE n = 6), '10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Otra sede', 'pendiente', NULL, NOW());

-- Correos: dos errores con la misma clave (uno), uno cuya clave ya tiene otro pendiente (no),
-- uno viejo (no), un push (no), uno de la otra sede y uno sin orden (solo sin filtro de sede).
DELETE FROM cola_envios;
INSERT INTO cola_envios (canal, destinatario, plantilla, orden_id, estado, clave_dedupe, creado_en) VALUES
  ('email', 'marta@prueba.local', 'estado', (SELECT id FROM t_o WHERE n = 1), 'error', 'k1', NOW()),
  ('email', 'marta@prueba.local', 'estado', (SELECT id FROM t_o WHERE n = 1), 'error', 'k1', NOW() - INTERVAL '1 hour'),
  ('email', 'marta@prueba.local', 'estado', (SELECT id FROM t_o WHERE n = 2), 'error', 'k2', NOW()),
  ('email', 'marta@prueba.local', 'estado', (SELECT id FROM t_o WHERE n = 2), 'pendiente', 'k2', NOW()),
  ('email', 'marta@prueba.local', 'estado', (SELECT id FROM t_o WHERE n = 1), 'error', 'k5', NOW() - INTERVAL '100 hours'),
  ('push', 'a0000000-0000-0000-0000-000000000001', 'aviso', (SELECT id FROM t_o WHERE n = 1), 'error', NULL, NOW()),
  ('email', 'pedro@prueba.local', 'estado', (SELECT id FROM t_o WHERE n = 6), 'error', 'k7', NOW()),
  ('email', 'otro@prueba.local', 'bienvenida', NULL, 'error', NULL, NOW());

CREATE TEMP TABLE t_res (k TEXT PRIMARY KEY, v JSONB);
GRANT ALL ON t_res TO authenticated;

-- Los números de orden de un grupo, en el orden en que los devuelve.
CREATE FUNCTION pg_temp.numeros(p JSONB) RETURNS TEXT[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(e->>'numero_orden' ORDER BY i), '{}') FROM jsonb_array_elements(p->'ordenes') WITH ORDINALITY AS x(e, i)
$$;
CREATE FUNCTION pg_temp.de(p_n INT[]) RETURNS TEXT[] LANGUAGE sql AS $$
  SELECT array_agg(numero_orden ORDER BY array_position(p_n, n)) FROM t_o WHERE n = ANY(p_n)
$$;

-- ------------------------------------------------------------------------------------
-- 1. Quién la puede llamar
-- ------------------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('anon', 'public.requiere_atencion(uuid, date)', 'EXECUTE'),
  'anon no puede llamarla');
SELECT ok(has_function_privilege('authenticated', 'public.requiere_atencion(uuid, date)', 'EXECUTE'),
  'Una sesión puede llamarla (y la función decide)');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT requiere_atencion('10000000-0000-0000-0000-000000000001', '2026-10-05') $$,
  '42501', 'Solo administración ve lo que requiere atención.',
  'Un técnico no la ve'
);

-- ------------------------------------------------------------------------------------
-- 2. La sede del admin, con la fecha local del 5 de octubre
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
INSERT INTO t_res VALUES ('norte', requiere_atencion('10000000-0000-0000-0000-000000000001', '2026-10-05'));
INSERT INTO t_res VALUES ('todas', requiere_atencion(NULL, '2026-10-05'));
INSERT INTO t_res VALUES ('antes', requiere_atencion('10000000-0000-0000-0000-000000000001', '2026-09-30'));
INSERT INTO t_res VALUES ('sur', requiere_atencion('10000000-0000-0000-0000-000000000002', '2026-10-05'));
RESET ROLE;

SELECT is((SELECT (v->'hallazgos'->>'total')::int FROM t_res WHERE k = 'norte'), 2,
  'Hallazgos: el pendiente y el cotizado sin presupuesto; no el que ya salió, el descartado ni el de una entregada');
SELECT is((SELECT pg_temp.numeros(v->'hallazgos') FROM t_res WHERE k = 'norte'), pg_temp.de(ARRAY[1, 3]),
  'Las órdenes de los hallazgos, la que más lleva esperando primero');
SELECT is((SELECT v->'presupuestos'->>'total' FROM t_res WHERE k = 'norte'), '1',
  'Presupuestos: el enviado sin respuesta');
SELECT is((SELECT pg_temp.numeros(v->'presupuestos') FROM t_res WHERE k = 'norte'), pg_temp.de(ARRAY[2]),
  'Y lleva a su orden');
SELECT is((SELECT v->'sin_tecnico' FROM t_res WHERE k = 'norte'),
  jsonb_build_object('total', 1, 'ordenes', jsonb_build_array(jsonb_build_object(
    'id', (SELECT id FROM t_o WHERE n = 3), 'numero_orden', (SELECT numero_orden FROM t_o WHERE n = 3)))),
  'Sin técnico: solo la tarea nueva sin técnico; no las heredadas ni la que tiene técnico');
SELECT is((SELECT pg_temp.numeros(v->'vencidas') FROM t_res WHERE k = 'norte'), pg_temp.de(ARRAY[4]),
  'Vencidas: la que pasó su fecha; no la finalizada ni la entregada');
SELECT is((SELECT v->'correos'->>'total' FROM t_res WHERE k = 'norte'), '1',
  'Correos: uno por clave, sin los que ya tienen otro pendiente, los viejos, los push ni los de otra sede');

-- ------------------------------------------------------------------------------------
-- 3. Todas las sedes, otra fecha, y una sede sin nada que decidir
-- ------------------------------------------------------------------------------------
SELECT is((SELECT (v->'hallazgos'->>'total')::int FROM t_res WHERE k = 'todas'), 3,
  'Sin sede cuenta también la otra');
SELECT is((SELECT (v->'correos'->>'total')::int FROM t_res WHERE k = 'todas'), 3,
  'Y los correos de la otra sede y los que no son de una orden');
SELECT is((SELECT v->'vencidas' FROM t_res WHERE k = 'antes'), '{"total": 0, "ordenes": []}'::jsonb,
  'Con la fecha local de antes, nada está vencido');
SELECT is((SELECT v FROM t_res WHERE k = 'sur') - 'hallazgos',
  '{"presupuestos": {"total": 0, "ordenes": []}, "sin_tecnico": {"total": 0, "ordenes": []},
    "vencidas": {"total": 0, "ordenes": []}, "correos": {"total": 1}}'::jsonb,
  'Los grupos vacíos llegan en cero, con la misma forma');
SELECT is((SELECT pg_temp.numeros(v->'hallazgos') FROM t_res WHERE k = 'sur'), pg_temp.de(ARRAY[6]),
  'Y la otra sede ve solo lo suyo');

SELECT * FROM finish();
ROLLBACK;
