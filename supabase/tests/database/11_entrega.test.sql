-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: entregar con método de pago
-- ====================================================================================
-- Qué cubre (migración 20261008000000): la base calcula el saldo de una orden; entregar
-- asienta el pago final con su método, número de cheque y comprobante; si el depósito
-- supera el total asienta la devolución; entregar dos veces no cobra dos veces; si algo
-- impide la entrega, el pago tampoco queda; sacar de Entregado deja lo cobrado igual al
-- depósito, también después de una devolución. Solo administración.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

-- Desde 20261010000022 la firma de recepción no autoriza lo cotizado. Estas pruebas parten de
-- una orden ya autorizada: esto la autoriza como lo hacía la firma (mismo presupuesto como
-- evidencia, vía 'firma_recepcion'), sin depender de la firma.
CREATE FUNCTION pg_temp.autorizar_cotizado(p_orden UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $h$
DECLARE
  v_p presupuestos;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = p_orden AND estado = 'borrador')
     AND NOT EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = p_orden AND estado = 'borrador') THEN
    RETURN;
  END IF;
  v_p := public._crear_presupuesto(p_orden);
  PERFORM public._resolver_presupuesto(
    v_p.id, public._lineas_pendientes(v_p.id), 'firma_recepcion',
    (SELECT c.nombre FROM ordenes_trabajo o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = p_orden),
    NULL, NULL, 'Autorizado en la prueba.', NULL, NULL);
END $h$;

SELECT plan(31);

-- ------------------------------------------------------------------------------------
-- Datos: cuatro órdenes con mano de obra de $500 y distinto depósito.
--   A: depósito 100 → falta cobrar 400
--   B: depósito 800 → hay que devolver 300
--   C: depósito 500 → nada pendiente
--   D: depósito 0, con un presupuesto esperando al cliente
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('1b000000-0000-0000-0000-000000000001', 'Sede Entrega', 'Calle 12', '555-1200');

INSERT INTO auth.users (id, email) VALUES
  ('ab000000-0000-0000-0000-000000000001', 'admin11@prueba.local'),
  ('ab000000-0000-0000-0000-000000000002', 'mecanico11@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('ab000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '1b000000-0000-0000-0000-000000000001', 'admin11@prueba.local'),
  ('ab000000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '1b000000-0000-0000-0000-000000000001', 'mecanico11@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('cb000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'Marta Ruiz', '+15550140', '', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('db000000-0000-0000-0000-00000000000a', 'cb000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris'),
  ('db000000-0000-0000-0000-00000000000b', 'cb000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul'),
  ('db000000-0000-0000-0000-00000000000c', 'cb000000-0000-0000-0000-000000000001', 'Ford', 'F-150', 2018, '1FTEW1EG0JF000001', NULL, 'Negro'),
  ('db000000-0000-0000-0000-00000000000d', 'cb000000-0000-0000-0000-000000000001', 'Nissan', 'Versa', 2017, '3N1CN7AP0HL000001', NULL, 'Rojo');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'ab000000-0000-0000-0000-000000000001';

DO $do$
DECLARE
  v RECORD;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('db000000-0000-0000-0000-00000000000a'::uuid, 100),
    ('db000000-0000-0000-0000-00000000000b'::uuid, 800),
    ('db000000-0000-0000-0000-00000000000c'::uuid, 500),
    ('db000000-0000-0000-0000-00000000000d'::uuid, 0)
  ) AS t(vehiculo, deposito) LOOP
    PERFORM create_work_order(
      jsonb_build_object(
        'sede_id', '1b000000-0000-0000-0000-000000000001',
        'cliente_id', 'cb000000-0000-0000-0000-000000000001',
        'vehiculo_id', v.vehiculo,
        'tipo_trabajo', 'mecanica', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
        'deposito_inicial', v.deposito, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
        'creado_por', 'ab000000-0000-0000-0000-000000000001'),
      '[{"descripcion":"Mano de obra","costo":500}]'::jsonb, '[]'::jsonb,
      '[{"usuario_id":"ab000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
    );
    -- Lo cotizado se autoriza (aparte de la firma desde 20261010000022): sin eso el total sería cero.
    UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png'
    WHERE vehiculo_id = v.vehiculo;
    PERFORM pg_temp.autorizar_cotizado(id) FROM ordenes_trabajo WHERE vehiculo_id = v.vehiculo;
  END LOOP;
END $do$;

RESET ROLE;
CREATE TEMP VIEW t_a AS SELECT id, sede_id FROM ordenes_trabajo WHERE vehiculo_id = 'db000000-0000-0000-0000-00000000000a';
CREATE TEMP VIEW t_b AS SELECT id, sede_id FROM ordenes_trabajo WHERE vehiculo_id = 'db000000-0000-0000-0000-00000000000b';
CREATE TEMP VIEW t_c AS SELECT id, sede_id FROM ordenes_trabajo WHERE vehiculo_id = 'db000000-0000-0000-0000-00000000000c';
CREATE TEMP VIEW t_d AS SELECT id, sede_id FROM ordenes_trabajo WHERE vehiculo_id = 'db000000-0000-0000-0000-00000000000d';
-- Lo cobrado neto de una orden, como lo cuenta la base.
CREATE TEMP VIEW t_cobrado AS
  SELECT referencia_orden_id AS orden_id, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END) AS neto
  FROM finanzas_movimientos WHERE categoria = 'pago_cliente' GROUP BY referencia_orden_id;
GRANT SELECT ON t_a, t_b, t_c, t_d, t_cobrado TO authenticated;

-- Un presupuesto esperando al cliente en D (el 1 es el de la autorización inicial).
INSERT INTO presupuestos (orden_id, sede_id, numero, estado) SELECT id, sede_id, 2, 'enviado' FROM t_d;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';

-- ------------------------------------------------------------------------------------
-- 1. El saldo lo calcula la base, y solo para administración
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'ab000000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$ SELECT saldo_orden((SELECT id FROM t_a)) $$,
  '42501', NULL,
  'Un técnico no consulta el saldo de una orden'
);

SELECT throws_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_a), 'efectivo') $$,
  '42501', NULL,
  'Un técnico no entrega una orden por la RPC'
);

SET LOCAL request.jwt.claim.sub = 'ab000000-0000-0000-0000-000000000001';

SELECT is(
  saldo_orden((SELECT id FROM t_a)),
  '{"total": 500.00, "cobrado": 100.00, "saldo": 400.00}'::jsonb,
  'A: total 500, cobrado el depósito de 100, faltan 400'
);

SELECT is((saldo_orden((SELECT id FROM t_b))->>'saldo')::numeric, -300.00::numeric,
  'B: el depósito supera el total, hay que devolver 300');

SELECT is((saldo_orden((SELECT id FROM t_c))->>'saldo')::numeric, 0.00::numeric,
  'C: nada pendiente');

-- ------------------------------------------------------------------------------------
-- 2. Entregar pide el método cuando hay dinero de por medio
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_a)) $$,
  '22023', NULL,
  'Con saldo pendiente, entregar sin método se rechaza'
);

SELECT throws_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_a), 'bitcoin') $$,
  '22023', NULL,
  'Un método que no es de los tres se rechaza'
);

SELECT throws_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_a), 'cheque') $$,
  '22023', NULL,
  'Un cheque sin número ni foto se rechaza'
);

SELECT throws_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_a), 'transferencia', NULL, 'otra-sede/comprobante.jpg') $$,
  '42501', NULL,
  'El comprobante tiene que estar en la carpeta de la sede de la orden'
);

SELECT is((SELECT estatus::text FROM ordenes_trabajo WHERE id = (SELECT id FROM t_a)), 'recepcion',
  'Ningún intento rechazado entregó la orden');

-- ------------------------------------------------------------------------------------
-- 3. Cobrar lo que falta
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_a), 'cheque', ' 1042 ', (SELECT sede_id || '/entrega-a.jpg' FROM t_a)) $$,
  'A: se entrega con cheque, su número y su foto'
);

SELECT results_eq(
  $$ SELECT tipo::text, monto, metodo_pago, numero_cheque, comprobante_ruta, registrado_por
     FROM finanzas_movimientos
     WHERE referencia_orden_id = (SELECT id FROM t_a) AND descripcion LIKE 'Pago final%' $$,
  $$ SELECT 'ingreso'::text, 400.00::numeric, 'cheque'::text, '1042'::text,
            sede_id || '/entrega-a.jpg', 'ab000000-0000-0000-0000-000000000001'::uuid FROM t_a $$,
  'Un solo "Pago final" por lo que faltaba, con su método, cheque, comprobante y quién lo registró'
);

SELECT is((SELECT neto FROM t_cobrado WHERE orden_id = (SELECT id FROM t_a)), 500.00::numeric,
  'Lo cobrado queda igual al total: el trigger de entrega no volvió a cobrar');

SELECT results_eq(
  $$ SELECT estatus::text, porcentaje_avance, fecha_finalizacion IS NOT NULL FROM ordenes_trabajo WHERE id = (SELECT id FROM t_a) $$,
  $$ VALUES ('entregado'::text, 100, true) $$,
  'La orden queda entregada, al 100 % y con su fecha'
);

SELECT throws_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_a), 'efectivo') $$,
  '42501', 'La orden ya fue entregada.',
  'Entregarla otra vez se rechaza'
);

SELECT is(
  (SELECT COUNT(*)::int FROM finanzas_movimientos WHERE referencia_orden_id = (SELECT id FROM t_a) AND descripcion LIKE 'Pago final%'),
  1,
  'Y no asienta un segundo pago'
);

-- ------------------------------------------------------------------------------------
-- 4. Devolver lo que sobra
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_b), 'efectivo') $$,
  'B: se entrega devolviendo en efectivo'
);

SELECT results_eq(
  $$ SELECT tipo::text, monto, metodo_pago FROM finanzas_movimientos
     WHERE referencia_orden_id = (SELECT id FROM t_b) AND descripcion LIKE 'Devolución al cliente%' $$,
  $$ VALUES ('egreso'::text, 300.00::numeric, 'efectivo'::text) $$,
  'La devolución queda en Finanzas como egreso, con su método'
);

SELECT is((SELECT neto FROM t_cobrado WHERE orden_id = (SELECT id FROM t_b)), 500.00::numeric,
  'Lo cobrado neto de B es el total, no el depósito');

-- ------------------------------------------------------------------------------------
-- 5. Nada pendiente: no hace falta método, y no se asienta nada
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_c)) $$,
  'C: se entrega sin método porque no hay nada que cobrar'
);

SELECT is(
  (SELECT COUNT(*)::int FROM finanzas_movimientos WHERE referencia_orden_id = (SELECT id FROM t_c) AND categoria = 'pago_cliente'),
  1,
  'C: el único movimiento sigue siendo el depósito'
);

-- ------------------------------------------------------------------------------------
-- 6. Si algo impide la entrega, el pago tampoco queda
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT entregar_orden((SELECT id FROM t_d), 'efectivo') $$,
  'P0001', NULL,
  'D: con un presupuesto esperando al cliente no se entrega'
);

SELECT is(
  (SELECT COUNT(*)::int FROM finanzas_movimientos WHERE referencia_orden_id = (SELECT id FROM t_d) AND descripcion LIKE 'Pago final%'),
  0,
  'Y el pago que la RPC alcanzó a asentar se deshizo con ella'
);

-- ------------------------------------------------------------------------------------
-- 7. Sacar de Entregado deja lo cobrado igual al depósito, suba o baje
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = (SELECT id FROM t_a) $$,
  'A sale de Entregado'
);
SELECT is((SELECT neto FROM t_cobrado WHERE orden_id = (SELECT id FROM t_a)), 100.00::numeric,
  'A: lo cobrado vuelve al depósito');

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = (SELECT id FROM t_b) $$,
  'B sale de Entregado'
);
SELECT is((SELECT neto FROM t_cobrado WHERE orden_id = (SELECT id FROM t_b)), 800.00::numeric,
  'B: la devolución se revierte y lo cobrado vuelve al depósito (antes se quedaba en 500)');

SELECT is(
  (SELECT COUNT(*)::int FROM finanzas_movimientos WHERE referencia_orden_id = (SELECT id FROM t_b) AND descripcion LIKE 'Reversión de devolución%' AND tipo = 'ingreso'),
  1,
  'Con un movimiento que lo dice'
);

-- ------------------------------------------------------------------------------------
-- 8. La red: una entrega por otra vía también asienta la devolución, sin método
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE id = (SELECT id FROM t_b) $$,
  'B se vuelve a entregar con un UPDATE directo'
);
SELECT results_eq(
  $$ SELECT neto FROM t_cobrado WHERE orden_id = (SELECT id FROM t_b) $$,
  $$ VALUES (500.00::numeric) $$,
  'El trigger de entrega asentó la devolución: lo cobrado vuelve a ser el total'
);

RESET ROLE;

SELECT ok(
  NOT has_function_privilege('anon', 'public.entregar_orden(uuid, text, text, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.saldo_orden(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public._saldo_orden(uuid)', 'EXECUTE'),
  'Sin sesión no se entrega ni se consulta el saldo, y la cuenta interna no es una RPC'
);

SELECT * FROM finish();
ROLLBACK;
