-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: permisos por rol y dinero de la orden
-- ====================================================================================
-- Qué cubre: lo que ninguna prueba del navegador puede comprobar, porque vive en
-- RLS y en triggers — un técnico no ve montos ni cotiza, entregar asienta el
-- dinero correcto, des-entregar lo revierte, re-entregar lo vuelve a cobrar,
-- las comisiones suman la bolsa exacta y deshacer un pago no borra el de otro.
--
-- Cómo correrlo (necesita Docker):
--   npx supabase start
--   npx supabase test db
--
-- Todo corre dentro de una transacción que se revierte al final: no deja datos.
-- Para actuar como un usuario se cambia al rol `authenticated` y se fija el
-- `sub` del JWT, que es exactamente lo que hace PostgREST con cada petición.
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(27);

-- ------------------------------------------------------------------------------------
-- Datos de prueba (como postgres, sin RLS)
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sede Prueba', 'Calle 1', '555-0100');

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'mecanico@prueba.local'),
  ('a0000000-0000-0000-0000-000000000003', 'pintor@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '10000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '10000000-0000-0000-0000-000000000001', 'mecanico@prueba.local'),
  ('a0000000-0000-0000-0000-000000000003', 'Sara Pintora', 'pintor', '10000000-0000-0000-0000-000000000001', 'pintor@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta@prueba.local', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul');

-- ------------------------------------------------------------------------------------
-- 1. Un admin crea una orden completa: depósito $200, labor $1,000, repuestos 2×$100
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ SELECT create_work_order(
       jsonb_build_object(
         'sede_id', '10000000-0000-0000-0000-000000000001',
         'cliente_id', 'c0000000-0000-0000-0000-000000000001',
         'vehiculo_id', 'd0000000-0000-0000-0000-000000000001',
         'tipo_trabajo', 'mecanica', 'millas_ingreso', 45000, 'nivel_gasolina', '1/2',
         'deposito_inicial', 200, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
         'creado_por', 'a0000000-0000-0000-0000-000000000001'),
       '[{"descripcion":"Frenos","costo":1000}]'::jsonb,
       '[{"descripcion":"Pastillas","cantidad":2,"precio_venta_unitario":100}]'::jsonb,
       '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
         {"usuario_id":"a0000000-0000-0000-0000-000000000003","tipo_tarea":"pintura"}]'::jsonb) $$,
  'Un admin crea una orden con depósito, labor, repuestos y dos técnicos'
);

SELECT is(
  (SELECT total_general FROM orden_montos m JOIN ordenes_trabajo o ON o.id = m.orden_id
    WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001'),
  1200.00::numeric,
  'El total general es labor + repuestos ($1,200)'
);

SELECT is(
  (SELECT SUM(monto) FROM finanzas_movimientos f JOIN ordenes_trabajo o ON o.id = f.referencia_orden_id
    WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001' AND f.descripcion LIKE 'Depósito inicial%'),
  200.00::numeric,
  'El depósito se asienta como ingreso al crear la orden'
);

-- ------------------------------------------------------------------------------------
-- 2. Lo que un técnico asignado NO puede ver ni hacer
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

SELECT is_empty('SELECT * FROM orden_montos', 'Un técnico no ve totales ni depósito (orden_montos)');
SELECT is_empty('SELECT * FROM orden_repuestos', 'Un técnico no ve la tabla de repuestos con precios');

SELECT is(
  (SELECT COUNT(*)::int FROM repuestos_de_orden(
     (SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001'))),
  1,
  'Un técnico sí ve qué repuestos lleva la orden, sin precio'
);

SELECT is(
  (SELECT total_labor FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001'),
  1000.00::numeric,
  'Un técnico sí ve la mano de obra (base de su comisión)'
);

SELECT throws_ok(
  $$ INSERT INTO orden_labor (orden_id, descripcion, costo)
     SELECT id, 'Trabajo extra', 5000 FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Un técnico no puede agregar mano de obra'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Un técnico no puede marcar una orden como entregada'
);

SELECT throws_ok(
  $$ INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
     SELECT id, 'a0000000-0000-0000-0000-000000000001', 'mecanica' FROM ordenes_trabajo
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Un técnico no puede asignar a otra persona'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Un técnico asignado sí puede marcar la orden como finalizada'
);

-- ------------------------------------------------------------------------------------
-- 3. Entregar: cobro final, costo de repuestos y comisiones
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Un admin entrega la orden'
);

-- Suma con signo de lo cobrado al cliente en esa orden.
CREATE TEMP VIEW t_cobrado AS
  SELECT COALESCE(SUM(CASE WHEN f.tipo = 'ingreso' THEN f.monto ELSE -f.monto END), 0) AS neto
  FROM finanzas_movimientos f JOIN ordenes_trabajo o ON o.id = f.referencia_orden_id
  WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001' AND f.categoria = 'pago_cliente';
CREATE TEMP VIEW t_costo_repuestos AS
  SELECT COALESCE(SUM(CASE WHEN f.tipo = 'egreso' THEN f.monto ELSE -f.monto END), 0) AS neto
  FROM finanzas_movimientos f JOIN ordenes_trabajo o ON o.id = f.referencia_orden_id
  WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001' AND f.categoria = 'compra_repuesto';
GRANT SELECT ON t_cobrado, t_costo_repuestos TO authenticated;

SELECT is((SELECT neto FROM t_cobrado), 1200.00::numeric, 'Al entregar, lo cobrado al cliente suma el total ($1,200)');
SELECT is((SELECT neto FROM t_costo_repuestos), 200.00::numeric, 'Al entregar, se asienta el costo de repuestos ($200)');

SELECT is(
  (SELECT SUM(monto) FROM comisiones c JOIN ordenes_trabajo o ON o.id = c.orden_id
    WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001'),
  350.00::numeric,
  'La bolsa de comisión es 35% de la labor ($350)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM comisiones c JOIN ordenes_trabajo o ON o.id = c.orden_id
    WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001' AND c.monto = 175.00),
  2,
  'Dos técnicos reciben $175 cada uno'
);

-- ------------------------------------------------------------------------------------
-- 4. Des-entregar revierte el dinero; re-entregar lo vuelve a cobrar
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Un admin saca la orden de entregado (entrega marcada por error)'
);
SELECT is((SELECT neto FROM t_cobrado), 200.00::numeric, 'Des-entregar deja lo cobrado en el depósito');
SELECT is((SELECT neto FROM t_costo_repuestos), 0.00::numeric, 'Des-entregar revierte el costo de repuestos');
SELECT is(
  (SELECT COUNT(*)::int FROM comisiones c JOIN ordenes_trabajo o ON o.id = c.orden_id
    WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001'),
  0,
  'Des-entregar elimina las comisiones pendientes'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Un admin vuelve a entregar la orden'
);
SELECT is((SELECT neto FROM t_cobrado), 1200.00::numeric, 'Re-entregar vuelve a cobrar el total (no se queda en el depósito)');

-- ------------------------------------------------------------------------------------
-- 5. Deshacer un pago de comisiones solo borra SU egreso
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pay_commissions('a0000000-0000-0000-0000-000000000002',
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002'),
       CURRENT_DATE, 'cheque', '1001', NULL, NULL);
     SELECT pay_commissions('a0000000-0000-0000-0000-000000000003',
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'a0000000-0000-0000-0000-000000000003'),
       CURRENT_DATE, 'cheque', '1002', NULL, NULL) $$,
  'Se pagan dos comisiones iguales el mismo día'
);

SELECT lives_ok(
  $$ DELETE FROM comision_pagos WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002' $$,
  'Se deshace el pago de uno de los dos'
);

SELECT is(
  (SELECT COUNT(*)::int FROM finanzas_movimientos WHERE categoria = 'planilla'
     AND sede_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'Queda el egreso del otro técnico (antes se borraban los dos)'
);

-- ------------------------------------------------------------------------------------
-- 6. El reparto entre tres técnicos suma la bolsa exacta
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT create_work_order(
       jsonb_build_object(
         'sede_id', '10000000-0000-0000-0000-000000000001',
         'cliente_id', 'c0000000-0000-0000-0000-000000000001',
         'vehiculo_id', 'd0000000-0000-0000-0000-000000000002',
         'tipo_trabajo', 'combinado', 'millas_ingreso', 1, 'nivel_gasolina', '1/4',
         'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
         'creado_por', 'a0000000-0000-0000-0000-000000000001'),
       '[{"descripcion":"Pintura","costo":1000}]'::jsonb, '[]'::jsonb,
       '[{"usuario_id":"a0000000-0000-0000-0000-000000000001","tipo_tarea":"mecanica"},
         {"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
         {"usuario_id":"a0000000-0000-0000-0000-000000000003","tipo_tarea":"pintura"}]'::jsonb);
     UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002' $$,
  'Se entrega una orden con tres técnicos'
);

SELECT results_eq(
  $$ SELECT SUM(monto), MAX(monto) - MIN(monto) FROM comisiones c JOIN ordenes_trabajo o ON o.id = c.orden_id
     WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000002' $$,
  $$ VALUES (350.00::numeric, 0.01::numeric) $$,
  'Tres técnicos: $116.67 + $116.67 + $116.66 = $350.00 exactos'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
