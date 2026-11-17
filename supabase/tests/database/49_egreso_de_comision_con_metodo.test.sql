-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: el egreso de un pago de comisiones lleva su
-- método de pago (20261010000045)
-- ====================================================================================
-- Qué cubre:
--  1. Pagar en efectivo deja el egreso de Finanzas con metodo_pago = 'efectivo' (antes, vacío).
--  2. Pagar con cheque deja 'cheque' y su número.
--  3. Un método que finanzas_movimientos no admite no tumba el pago: el egreso queda sin método.
--  4. Lo asentado sigue cuadrando con lo pagado y sigue siendo del sistema.
--  5. Los permisos no cambiaron: un técnico no paga y anon no ejecuta la función.
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
  ('49000000-0000-0000-0000-000000000001', 'Sede QA 49', 'Calle 49', '555-4901', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('49a00000-0000-0000-0000-000000000001', 'admin49@prueba.local'),
  ('49b00000-0000-0000-0000-000000000001', 'tec49a@prueba.local'),
  ('49b00000-0000-0000-0000-000000000002', 'tec49b@prueba.local'),
  ('49b00000-0000-0000-0000-000000000003', 'tec49c@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('49a00000-0000-0000-0000-000000000001', 'Admin 49', 'admin', '49000000-0000-0000-0000-000000000001', 'admin49@prueba.local'),
  ('49b00000-0000-0000-0000-000000000001', 'Tec 49A', 'mecanico', '49000000-0000-0000-0000-000000000001', 'tec49a@prueba.local'),
  ('49b00000-0000-0000-0000-000000000002', 'Tec 49B', 'mecanico', '49000000-0000-0000-0000-000000000001', 'tec49b@prueba.local'),
  ('49b00000-0000-0000-0000-000000000003', 'Tec 49C', 'mecanico', '49000000-0000-0000-0000-000000000001', 'tec49c@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('49c00000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 'Cliente 49', '+15554901', 'cli49@prueba.local', 'Ave 49', false);
INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('49d00000-0000-0000-0000-000000000001', '49c00000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2021, '2T1BURHE0MC004901', 'QA-491', 'Blanco');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '49a00000-0000-0000-0000-000000000001';

INSERT INTO ordenes_trabajo (
  id, sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
) VALUES (
  '49e00000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', '49c00000-0000-0000-0000-000000000001',
  '49d00000-0000-0000-0000-000000000001', 'mecanica', 1000, 'full', '2026-12-01', '49a00000-0000-0000-0000-000000000001', 'en_proceso'
);

-- Una comisión sugerida por técnico; administración las acepta (solo se paga lo aceptado).
INSERT INTO comisiones (orden_id, usuario_id, sede_id, especialidad, base_ganancia, porcentaje, tecnicos, monto, estado)
SELECT '49e00000-0000-0000-0000-000000000001', u, '49000000-0000-0000-0000-000000000001', 'mecanica', 1000, 30, 3, 100, 'sugerida'
FROM unnest(ARRAY['49b00000-0000-0000-0000-000000000001', '49b00000-0000-0000-0000-000000000002', '49b00000-0000-0000-0000-000000000003']::uuid[]) u;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '49a00000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ SELECT public.aprobar_comision(id, NULL, 30) FROM comisiones WHERE orden_id = '49e00000-0000-0000-0000-000000000001' $$,
  'el admin acepta las tres comisiones'
);

-- ------------------------------------------------------------------------------------
-- 1. Efectivo
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT public.pay_commissions(
       '49b00000-0000-0000-0000-000000000001'::uuid,
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = '49b00000-0000-0000-0000-000000000001'),
       p_metodo => 'efectivo') $$,
  'el admin paga en efectivo'
);
SELECT is(
  (SELECT m.metodo_pago FROM finanzas_movimientos m JOIN comision_pagos p ON p.id = m.comision_pago_id
    WHERE p.usuario_id = '49b00000-0000-0000-0000-000000000001'),
  'efectivo',
  'el egreso de Finanzas lleva el método del pago (antes quedaba vacío)'
);
SELECT is(
  (SELECT m.origen FROM finanzas_movimientos m JOIN comision_pagos p ON p.id = m.comision_pago_id
    WHERE p.usuario_id = '49b00000-0000-0000-0000-000000000001'),
  'sistema',
  'y sigue siendo un movimiento del sistema'
);

-- ------------------------------------------------------------------------------------
-- 2. Cheque con su número
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT public.pay_commissions(
       '49b00000-0000-0000-0000-000000000002'::uuid,
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = '49b00000-0000-0000-0000-000000000002'),
       p_metodo => 'cheque', p_numero_cheque => '4901') $$,
  'el admin paga con cheque'
);
SELECT is(
  (SELECT m.metodo_pago FROM finanzas_movimientos m JOIN comision_pagos p ON p.id = m.comision_pago_id
    WHERE p.usuario_id = '49b00000-0000-0000-0000-000000000002'),
  'cheque',
  'el egreso dice cheque'
);
SELECT is(
  (SELECT m.numero_cheque FROM finanzas_movimientos m JOIN comision_pagos p ON p.id = m.comision_pago_id
    WHERE p.usuario_id = '49b00000-0000-0000-0000-000000000002'),
  '4901',
  'y conserva su número'
);

-- ------------------------------------------------------------------------------------
-- 3. Un método que Finanzas no conoce no tumba el pago
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT public.pay_commissions(
       '49b00000-0000-0000-0000-000000000003'::uuid,
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = '49b00000-0000-0000-0000-000000000003'),
       p_metodo => 'vale') $$,
  'un método fuera de la lista de Finanzas no impide pagar'
);
SELECT is(
  (SELECT m.metodo_pago FROM finanzas_movimientos m JOIN comision_pagos p ON p.id = m.comision_pago_id
    WHERE p.usuario_id = '49b00000-0000-0000-0000-000000000003'),
  NULL,
  'su egreso queda sin método (no viola el CHECK de finanzas_movimientos)'
);

-- ------------------------------------------------------------------------------------
-- 4. Lo asentado cuadra con lo pagado
-- ------------------------------------------------------------------------------------
SELECT is(
  (SELECT sum(m.monto) FROM finanzas_movimientos m WHERE m.referencia_orden_id = '49e00000-0000-0000-0000-000000000001' AND m.comision_pago_id IS NOT NULL),
  (SELECT sum(p.monto) FROM comision_pagos p WHERE p.sede_id = '49000000-0000-0000-0000-000000000001'),
  'los egresos suman exactamente lo pagado'
);

-- ------------------------------------------------------------------------------------
-- 5. Permisos sin cambios
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '49b00000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ SELECT public.pay_commissions('49b00000-0000-0000-0000-000000000001'::uuid, ARRAY[]::uuid[], p_metodo => 'efectivo') $$,
  '42501',
  NULL,
  'un técnico no registra pagos de comisiones'
);

RESET ROLE;
SELECT ok(
  NOT has_function_privilege('anon', 'public.pay_commissions(uuid, uuid[], date, text, text, text, text)', 'EXECUTE'),
  'anon no ejecuta pay_commissions'
);

SELECT * FROM finish();
ROLLBACK;
