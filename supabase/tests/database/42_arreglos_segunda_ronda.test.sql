-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: segunda ronda del QA (20261010000038)
-- ====================================================================================
-- Qué cubre:
-- 1. Origen de los movimientos de finanzas:
--    - lo que escribe una persona por la API queda 'manual' (aunque mande 'sistema');
--    - lo que asienta la base (otro rol) queda 'sistema';
--    - un admin borra y edita lo manual y lo importado, y NO lo del sistema (cero filas).
-- 2. aprobar_comision: tres técnicos al 35 % de $1.000 suman $350,00, no $350,01.
-- 3. pay_commissions toma la fecha del taller (su valor por omisión es NULL) y
--    requiere_atencion funciona sin fecha.
-- 4. Permisos: anon y authenticated sin TRUNCATE/TRIGGER/REFERENCES; trg_avance_labor_match con
--    search_path; los índices nuevos existen.
-- 5. Sticker de próximo servicio: el idioma que elige administración se guarda, la página del QR lo
--    usa, reprogramar sin idioma lo conserva y el código no cambia; un millaje negativo o un idioma
--    inválido dan un mensaje claro.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(25);

-- ------------------------------------------------------------------------------------
-- Datos base
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('42000000-0000-0000-0000-000000000001', 'Sede QA 42', 'Calle 42', '555-4201', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('42a00000-0000-0000-0000-000000000001', 'admin42@prueba.local'),
  ('42b00000-0000-0000-0000-000000000001', 'tec42a@prueba.local'),
  ('42b00000-0000-0000-0000-000000000002', 'tec42b@prueba.local'),
  ('42b00000-0000-0000-0000-000000000003', 'tec42c@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('42a00000-0000-0000-0000-000000000001', 'Admin 42', 'admin', '42000000-0000-0000-0000-000000000001', 'admin42@prueba.local'),
  ('42b00000-0000-0000-0000-000000000001', 'Tec 42A', 'mecanico', '42000000-0000-0000-0000-000000000001', 'tec42a@prueba.local'),
  ('42b00000-0000-0000-0000-000000000002', 'Tec 42B', 'mecanico', '42000000-0000-0000-0000-000000000001', 'tec42b@prueba.local'),
  ('42b00000-0000-0000-0000-000000000003', 'Tec 42C', 'mecanico', '42000000-0000-0000-0000-000000000001', 'tec42c@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('42c00000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'Cliente 42', '+15554201', 'cli42@prueba.local', 'Ave 42', false);
INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('42d00000-0000-0000-0000-000000000001', '42c00000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2021, '2T1BURHE0MC004201', 'QA-421', 'Blanco');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '42a00000-0000-0000-0000-000000000001';

INSERT INTO ordenes_trabajo (
  id, sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
) VALUES (
  '42e00000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', '42c00000-0000-0000-0000-000000000001',
  '42d00000-0000-0000-0000-000000000001', 'mecanica', 1000, 'full', '2026-11-01', '42a00000-0000-0000-0000-000000000001', 'en_proceso'
);

-- ------------------------------------------------------------------------------------
-- 1. Origen de los movimientos
-- ------------------------------------------------------------------------------------
-- Lo asienta la base (aquí, el dueño de la conexión): del sistema.
INSERT INTO finanzas_movimientos (id, sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id)
VALUES ('42f00000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'ingreso', 'pago_cliente', 200,
        'Depósito inicial - QA', '2026-10-10', '42e00000-0000-0000-0000-000000000001');

SELECT is(
  (SELECT origen FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000001'),
  'sistema',
  'lo que asienta la base queda con origen sistema'
);

-- Una importación y un movimiento suyo.
INSERT INTO finanzas_importaciones (id, sede_id, nombre_archivo, ruta_archivo, importado_por, total_transacciones)
VALUES ('42f10000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'banco.csv', 'x/banco.csv', '42a00000-0000-0000-0000-000000000001', 1);
INSERT INTO finanzas_movimientos (id, sede_id, tipo, categoria, monto, descripcion, fecha, importacion_id)
VALUES ('42f00000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000001', 'ingreso', 'pago_cliente', 50,
        'Depósito del banco', '2026-10-09', '42f10000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '42a00000-0000-0000-0000-000000000001';

-- Una persona por la API, aunque intente mandar 'sistema'.
INSERT INTO finanzas_movimientos (id, sede_id, tipo, categoria, monto, descripcion, fecha, origen)
VALUES ('42f00000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000001', 'egreso', 'gasto_operativo', 30,
        'Gasto a mano', '2026-10-10', 'sistema');

SELECT is(
  (SELECT origen FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000002'),
  'manual',
  'lo que escribe una persona por la API queda manual, aunque mande sistema'
);

-- El admin no borra el cobro del sistema: cero filas, sin error.
DELETE FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000001'),
  1,
  'un admin no borra por la API un cobro que asentó el sistema'
);

-- Ni lo edita.
UPDATE finanzas_movimientos SET monto = 1 WHERE id = '42f00000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT monto FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000001'),
  200.00::numeric,
  'ni cambia su monto'
);

-- Pero sí un movimiento a mano...
SELECT lives_ok(
  $$ UPDATE finanzas_movimientos SET monto = 35 WHERE id = '42f00000-0000-0000-0000-000000000002' $$,
  'un admin edita un movimiento manual'
);
SELECT is(
  (SELECT monto FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000002'),
  35.00::numeric,
  'y el cambio se guarda'
);
DELETE FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000002';
SELECT is(
  (SELECT count(*)::int FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000002'),
  0,
  'y lo borra'
);

-- ...ni uno de una importación (contabilidad aparte).
DELETE FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000003';
SELECT is(
  (SELECT count(*)::int FROM finanzas_movimientos WHERE id = '42f00000-0000-0000-0000-000000000003'),
  0,
  'un admin borra un movimiento importado del banco'
);

-- ------------------------------------------------------------------------------------
-- 2. Comisión de una bolsa compartida de tres técnicos
-- ------------------------------------------------------------------------------------
RESET ROLE;
INSERT INTO comisiones (orden_id, usuario_id, sede_id, especialidad, base_ganancia, porcentaje, tecnicos, monto, estado)
SELECT '42e00000-0000-0000-0000-000000000001', u, '42000000-0000-0000-0000-000000000001', 'mecanica', 1000, 35, 3, 116.67, 'sugerida'
FROM unnest(ARRAY['42b00000-0000-0000-0000-000000000001', '42b00000-0000-0000-0000-000000000002', '42b00000-0000-0000-0000-000000000003']::uuid[]) u;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '42a00000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ SELECT public.aprobar_comision(id, NULL, 35) FROM comisiones WHERE orden_id = '42e00000-0000-0000-0000-000000000001' $$,
  'el admin aprueba las tres partes con un porcentaje escrito a mano'
);

SELECT is(
  (SELECT sum(monto) FROM comisiones WHERE orden_id = '42e00000-0000-0000-0000-000000000001'),
  350.00::numeric,
  'las tres partes suman la bolsa entera ($350,00), no $350,01'
);

SELECT is(
  (SELECT array_agg(monto ORDER BY monto DESC) FROM comisiones WHERE orden_id = '42e00000-0000-0000-0000-000000000001'),
  ARRAY[116.67, 116.67, 116.66]::numeric[],
  'a las primeras les toca el sobrante: 116,67 + 116,67 + 116,66'
);

-- Una sola tarea con porcentaje a mano sigue siendo la cuenta de siempre.
SELECT is(
  (SELECT sum(monto) FROM comisiones WHERE orden_id = '42e00000-0000-0000-0000-000000000001' AND estado = 'aceptada'),
  350.00::numeric,
  'las tres quedan aceptadas'
);

-- ------------------------------------------------------------------------------------
-- 3. Fecha del taller por omisión
-- ------------------------------------------------------------------------------------
SELECT ok(
  (SELECT pg_get_function_arguments(p.oid) ILIKE '%p_fecha_pago date DEFAULT NULL%'
   FROM pg_proc p WHERE p.proname = 'pay_commissions' AND p.pronamespace = 'public'::regnamespace),
  'pay_commissions toma la fecha del taller cuando no recibe una (su valor por omisión es NULL)'
);

SELECT lives_ok(
  $$ SELECT public.requiere_atencion(NULL, NULL) $$,
  'requiere_atencion funciona sin sede ni fecha'
);

SELECT lives_ok(
  $$ SELECT public.requiere_atencion('42000000-0000-0000-0000-000000000001'::uuid, NULL) $$,
  'y con una sede, usa la fecha de su zona'
);

-- ------------------------------------------------------------------------------------
-- 4. Permisos e índices
-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.ordenes_trabajo', 'TRUNCATE')
  AND NOT has_table_privilege('anon', 'public.finanzas_movimientos', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.clientes', 'TRIGGER')
  AND NOT has_table_privilege('anon', 'public.clientes', 'REFERENCES'),
  'anon y authenticated no tienen TRUNCATE, TRIGGER ni REFERENCES'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
    WHERE p.proname = 'trg_avance_labor_match' AND c = 'search_path=public'
  )
  AND NOT has_function_privilege('anon', 'public.trg_avance_labor_match()', 'EXECUTE'),
  'trg_avance_labor_match fija search_path y no es llamable por anon'
);

SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN (
     'idx_orden_labor_trabajo', 'idx_orden_repuestos_trabajo', 'idx_orden_media_inspeccion_punto',
     'idx_orden_inspecciones_creado_por', 'idx_orden_inspecciones_completada_por',
     'idx_orden_inspeccion_puntos_actualizado_por')),
  6,
  'los seis índices de claves foráneas existen'
);

-- ------------------------------------------------------------------------------------
-- 5. Sticker de próximo servicio
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '42a00000-0000-0000-0000-000000000001';

SELECT public.programar_proximo_servicio('42e00000-0000-0000-0000-000000000001', (now() + interval '60 days')::date, 5000, 'Aceite', 'en');

RESET ROLE;
SELECT is(
  (SELECT idioma FROM orden_proximo_servicio WHERE orden_id = '42e00000-0000-0000-0000-000000000001'),
  'en',
  'el idioma que eligió administración se guarda'
);
SELECT is(
  public.datos_servicio((SELECT token FROM orden_proximo_servicio WHERE orden_id = '42e00000-0000-0000-0000-000000000001')) ->> 'idioma',
  'en',
  'la página del QR abre en ese idioma, aunque el cliente no tenga correo ni idioma en inglés'
);

CREATE TEMP TABLE token_antes AS
  SELECT token FROM orden_proximo_servicio WHERE orden_id = '42e00000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '42a00000-0000-0000-0000-000000000001';
SELECT public.programar_proximo_servicio('42e00000-0000-0000-0000-000000000001', (now() + interval '90 days')::date, 6000, 'Frenos');
RESET ROLE;

SELECT is(
  (SELECT token FROM orden_proximo_servicio WHERE orden_id = '42e00000-0000-0000-0000-000000000001'),
  (SELECT token FROM token_antes),
  'reprogramar conserva el código del sticker ya impreso'
);
SELECT is(
  (SELECT idioma FROM orden_proximo_servicio WHERE orden_id = '42e00000-0000-0000-0000-000000000001'),
  'en',
  'y, sin un idioma nuevo, conserva el que tenía'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '42a00000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ SELECT public.programar_proximo_servicio('42e00000-0000-0000-0000-000000000001', NULL, -5, 'x') $$,
  '22023', 'El millaje no puede ser negativo.',
  'un millaje negativo da un mensaje claro (no la violación del CHECK)'
);
SELECT throws_ok(
  $$ SELECT public.programar_proximo_servicio('42e00000-0000-0000-0000-000000000001', NULL, 7000, 'x', 'fr') $$,
  '22023', NULL,
  'un idioma que no es es ni en se rechaza'
);
SELECT is(
  (SELECT count(*)::int FROM pg_proc WHERE proname = 'programar_proximo_servicio' AND pronamespace = 'public'::regnamespace),
  1,
  'queda una sola función programar_proximo_servicio (la de cuatro argumentos se soltó)'
);

SELECT * FROM finish();
ROLLBACK;
