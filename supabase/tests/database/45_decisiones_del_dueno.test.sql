-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: decisiones del dueño del 04/11/2026 (20261010000041)
-- ====================================================================================
-- Qué cubre:
-- 1. El técnico asignado no pasa una orden a en_proceso ni a finalizado sin ninguna línea
--    aprobada; con una mano de obra o un repuesto aprobado, sí. Administración sí puede sin nada
--    autorizado. Reportar trabajo adicional (espera) no cambia.
-- 2. Una orden entregada no se borra por la API, ni siendo admin; se archiva. Una que no está
--    entregada se sigue borrando. Borrar la sede entera sí borra sus entregadas, y la bandera
--    que lo permite no queda prendida después.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(16);

-- ------------------------------------------------------------------------------------
-- Datos base: dos sedes, un admin y un técnico
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('45000000-0000-0000-0000-000000000001', 'Sede QA 45', 'Calle 45', '555-4501', 'America/New_York'),
  ('45000000-0000-0000-0000-000000000002', 'Sede QA 45 Sur', 'Calle 45 Sur', '555-4502', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('45a00000-0000-0000-0000-000000000001', 'admin45@prueba.local'),
  ('45b00000-0000-0000-0000-000000000001', 'tec45@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('45a00000-0000-0000-0000-000000000001', 'Admin 45', 'admin', '45000000-0000-0000-0000-000000000001', 'admin45@prueba.local'),
  ('45b00000-0000-0000-0000-000000000001', 'Tec 45', 'mecanico', '45000000-0000-0000-0000-000000000001', 'tec45@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('45c00000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', 'Cliente 45', '+15554501', 'cli45@prueba.local', 'Ave 45', false),
  ('45c00000-0000-0000-0000-000000000002', '45000000-0000-0000-0000-000000000002', 'Cliente 45 Sur', '+15554502', 'cli45s@prueba.local', 'Ave 45 Sur', false);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('45d00000-0000-0000-0000-000000000001', '45c00000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2022, '4T1BURHE0MC004501', 'QA-451', 'Gris'),
  ('45d00000-0000-0000-0000-000000000002', '45c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2021, '4T1BURHE0MC004502', 'QA-452', 'Azul'),
  ('45d00000-0000-0000-0000-000000000003', '45c00000-0000-0000-0000-000000000001', 'Mazda', '3', 2020, '4T1BURHE0MC004503', 'QA-453', 'Rojo'),
  ('45d00000-0000-0000-0000-000000000004', '45c00000-0000-0000-0000-000000000001', 'Kia', 'Rio', 2019, '4T1BURHE0MC004504', 'QA-454', 'Negro'),
  ('45d00000-0000-0000-0000-000000000005', '45c00000-0000-0000-0000-000000000001', 'Ford', 'Focus', 2018, '4T1BURHE0MC004505', 'QA-455', 'Blanco'),
  ('45d00000-0000-0000-0000-000000000006', '45c00000-0000-0000-0000-000000000002', 'Nissan', 'Versa', 2017, '4T1BURHE0MC004506', 'QA-456', 'Gris');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '45a00000-0000-0000-0000-000000000001';

-- 1: recepción, solo un borrador. 2: en proceso, solo un borrador. 3: recepción con una mano de
-- obra aprobada. 4: recepción con un repuesto aprobado. 5: se entrega. 6: entregada de la otra sede.
INSERT INTO ordenes_trabajo (
  id, sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
) VALUES
  ('45e00000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', '45c00000-0000-0000-0000-000000000001',
   '45d00000-0000-0000-0000-000000000001', 'mecanica', 1000, 'full', '2026-12-01', '45a00000-0000-0000-0000-000000000001', 'recepcion'),
  ('45e00000-0000-0000-0000-000000000002', '45000000-0000-0000-0000-000000000001', '45c00000-0000-0000-0000-000000000001',
   '45d00000-0000-0000-0000-000000000002', 'mecanica', 2000, 'full', '2026-12-01', '45a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('45e00000-0000-0000-0000-000000000003', '45000000-0000-0000-0000-000000000001', '45c00000-0000-0000-0000-000000000001',
   '45d00000-0000-0000-0000-000000000003', 'mecanica', 3000, 'full', '2026-12-01', '45a00000-0000-0000-0000-000000000001', 'recepcion'),
  ('45e00000-0000-0000-0000-000000000004', '45000000-0000-0000-0000-000000000001', '45c00000-0000-0000-0000-000000000001',
   '45d00000-0000-0000-0000-000000000004', 'mecanica', 4000, 'full', '2026-12-01', '45a00000-0000-0000-0000-000000000001', 'recepcion'),
  ('45e00000-0000-0000-0000-000000000005', '45000000-0000-0000-0000-000000000001', '45c00000-0000-0000-0000-000000000001',
   '45d00000-0000-0000-0000-000000000005', 'mecanica', 5000, 'full', '2026-12-01', '45a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('45e00000-0000-0000-0000-000000000006', '45000000-0000-0000-0000-000000000002', '45c00000-0000-0000-0000-000000000002',
   '45d00000-0000-0000-0000-000000000006', 'mecanica', 6000, 'full', '2026-12-01', '45a00000-0000-0000-0000-000000000001', 'en_proceso');

INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea) VALUES
  ('45e00000-0000-0000-0000-000000000001', '45b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('45e00000-0000-0000-0000-000000000002', '45b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('45e00000-0000-0000-0000-000000000003', '45b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('45e00000-0000-0000-0000-000000000004', '45b00000-0000-0000-0000-000000000001', 'mecanica');

SELECT set_config('restorify.presupuesto', 'on', true);
INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado) VALUES
  ('45e00000-0000-0000-0000-000000000001', 'Diagnóstico', 50, 'mecanica', '45b00000-0000-0000-0000-000000000001', 'borrador', false),
  ('45e00000-0000-0000-0000-000000000002', 'Frenos', 200, 'mecanica', '45b00000-0000-0000-0000-000000000001', 'borrador', false),
  ('45e00000-0000-0000-0000-000000000003', 'Aceite', 80, 'mecanica', '45b00000-0000-0000-0000-000000000001', 'aprobado', false),
  ('45e00000-0000-0000-0000-000000000005', 'Alineación', 90, 'mecanica', NULL, 'aprobado', false),
  ('45e00000-0000-0000-0000-000000000006', 'Batería', 120, 'mecanica', NULL, 'aprobado', false);
INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, precio_venta_unitario, estado) VALUES
  ('45e00000-0000-0000-0000-000000000004', 'Filtro', 1, 25, 'aprobado');
SELECT set_config('restorify.presupuesto', 'off', true);

-- Las dos que se entregan, sin sesión (como lo haría el diálogo de entrega por su RPC).
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
UPDATE ordenes_trabajo SET estatus = 'entregado'
WHERE id IN ('45e00000-0000-0000-0000-000000000005', '45e00000-0000-0000-0000-000000000006');

-- ------------------------------------------------------------------------------------
-- 1. El técnico no empieza ni termina sin nada autorizado
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '45b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = '45e00000-0000-0000-0000-000000000001' $$,
  '42501',
  'El cliente todavía no autoriza ningún trabajo de esta orden. No se puede empezar ni terminar hasta que administración registre la autorización.',
  'el técnico no empieza una orden sin nada autorizado'
);
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = '45e00000-0000-0000-0000-000000000002' $$,
  '42501', NULL,
  'ni la termina'
);
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = '45e00000-0000-0000-0000-000000000003' $$,
  'con una mano de obra autorizada, sí la empieza'
);
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado', porcentaje_avance = 100 WHERE id = '45e00000-0000-0000-0000-000000000003' $$,
  'y la termina'
);
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = '45e00000-0000-0000-0000-000000000004' $$,
  'un repuesto autorizado también cuenta'
);
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 40 WHERE id = '45e00000-0000-0000-0000-000000000002' $$,
  'sin cambiar de estado, el avance lo sigue moviendo'
);

RESET ROLE;
SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = '45e00000-0000-0000-0000-000000000001'),
  'recepcion',
  'la orden sin autorizar sigue en recepción'
);

SET LOCAL request.jwt.claim.sub = '45a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = '45e00000-0000-0000-0000-000000000001' $$,
  'administración sí puede moverla sin nada autorizado (garantía, cortesía)'
);

-- ------------------------------------------------------------------------------------
-- 2. Una entregada no se borra: se archiva
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ DELETE FROM ordenes_trabajo WHERE id = '45e00000-0000-0000-0000-000000000005' $$,
  '42501',
  'Una orden entregada no se borra: lleva el cobro, el costo de los repuestos y las comisiones. Archívala para sacarla de la lista.',
  'ni un admin borra una orden entregada'
);
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET archivada_en = now() WHERE id = '45e00000-0000-0000-0000-000000000005' $$,
  'la archiva'
);
SELECT lives_ok(
  $$ DELETE FROM ordenes_trabajo WHERE id = '45e00000-0000-0000-0000-000000000002' $$,
  'una que no está entregada se sigue borrando'
);

SELECT lives_ok(
  $$ SELECT public.delete_sede_cascade('45000000-0000-0000-0000-000000000002') $$,
  'borrar la sede entera sí borra sus órdenes entregadas'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM ordenes_trabajo WHERE id = '45e00000-0000-0000-0000-000000000006'),
  0,
  'la entregada de esa sede ya no existe'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ DELETE FROM ordenes_trabajo WHERE id = '45e00000-0000-0000-0000-000000000005' $$,
  '42501', NULL,
  'después de borrar una sede, la bandera no queda prendida'
);

RESET ROLE;
SELECT ok(
  NOT has_function_privilege('anon', 'public.trg_guard_order_delete_entregada()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.trg_guard_order_delete_entregada()', 'EXECUTE'),
  'el guardia del borrado no se llama por la API'
);
SELECT is(
  (SELECT count(*)::int FROM ordenes_trabajo WHERE id = '45e00000-0000-0000-0000-000000000005'),
  1,
  'la orden entregada sigue ahí, archivada'
);

SELECT * FROM finish();
ROLLBACK;
