-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: egresos de comisión por orden y margen
-- ====================================================================================
-- Qué cubre (migración 20261010000000): un pago de comisiones asienta un egreso por orden
-- que suma exactamente el pago; deshacerlo los borra todos; el balance de una orden (cobrado,
-- repuestos, comisiones devengadas, margen) sin contar dos veces una compra vinculada; la
-- lista de margen del periodo, paginada y con sus sumas. Solo administración.
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

SELECT plan(16);

INSERT INTO sedes (id, nombre, direccion, telefono, comision_porcentaje) VALUES
  ('1d000000-0000-0000-0000-000000000001', 'Sede Margen', 'Calle 14', '555-1400', 35);

INSERT INTO auth.users (id, email) VALUES
  ('ad000000-0000-0000-0000-000000000001', 'admin13@prueba.local'),
  ('ad000000-0000-0000-0000-000000000002', 'mario13@prueba.local'),
  ('ad000000-0000-0000-0000-000000000003', 'paula13@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('ad000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '1d000000-0000-0000-0000-000000000001', 'admin13@prueba.local'),
  ('ad000000-0000-0000-0000-000000000002', 'Mario Mecánico', 'mecanico', '1d000000-0000-0000-0000-000000000001', 'mario13@prueba.local'),
  ('ad000000-0000-0000-0000-000000000003', 'Paula Pintora', 'pintor', '1d000000-0000-0000-0000-000000000001', 'paula13@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('cd000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001', 'Marta Ruiz', '+15550140', '', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('dd000000-0000-0000-0000-00000000000a', 'cd000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris'),
  ('dd000000-0000-0000-0000-00000000000b', 'cd000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'ad000000-0000-0000-0000-000000000001';

-- A: combinada, depósito 100, pintura 1000 + mecánica 200 + repuestos 2 × 50 = total 1300.
-- B: mecánica 300, sin depósito ni repuestos. Las dos se entregan en efectivo.
DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '1d000000-0000-0000-0000-000000000001', 'cliente_id', 'cd000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'dd000000-0000-0000-0000-00000000000a', 'tipo_trabajo', 'combinado',
      'millas_ingreso', 1000, 'nivel_gasolina', '1/2', 'deposito_inicial', 100,
      'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'ad000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Pintura general","costo":1000,"especialidad":"pintura"},
      {"descripcion":"Cambio de aceite","costo":200,"especialidad":"mecanica"}]'::jsonb,
    '[{"descripcion":"Filtro","cantidad":2,"precio_venta_unitario":50}]'::jsonb,
    '[{"usuario_id":"ad000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
      {"usuario_id":"ad000000-0000-0000-0000-000000000003","tipo_tarea":"pintura"}]'::jsonb);
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '1d000000-0000-0000-0000-000000000001', 'cliente_id', 'cd000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'dd000000-0000-0000-0000-00000000000b', 'tipo_trabajo', 'mecanica',
      'millas_ingreso', 2000, 'nivel_gasolina', '1/4', 'deposito_inicial', 0,
      'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'ad000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Suspensión","costo":300}]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"ad000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb);
  UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png'
  WHERE sede_id = '1d000000-0000-0000-0000-000000000001';
  PERFORM pg_temp.autorizar_cotizado(id) FROM ordenes_trabajo WHERE sede_id = '1d000000-0000-0000-0000-000000000001';
  PERFORM entregar_orden(id, 'efectivo') FROM ordenes_trabajo
  WHERE sede_id = '1d000000-0000-0000-0000-000000000001';
END $do$;

RESET ROLE;
CREATE TEMP VIEW t_a AS SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'dd000000-0000-0000-0000-00000000000a';
CREATE TEMP VIEW t_b AS SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'dd000000-0000-0000-0000-00000000000b';
GRANT SELECT ON t_a, t_b TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'ad000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 1. El balance de una orden
-- ------------------------------------------------------------------------------------
SELECT is(
  balance_orden((SELECT id FROM t_a)) - 'otros',
  '{"total_orden": 1300.00, "cobrado": 1300.00, "costo_repuestos": 100.00, "comisiones": 420.00,
    "comisiones_pagadas": 0.00, "margen": 780.00}'::jsonb,
  'A: cobrado 1300 − repuestos 100 − comisiones 420 (350 pintura + 70 mecánica) = margen 780'
);

-- ------------------------------------------------------------------------------------
-- 2. Un pago, un egreso por orden
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT aprobar_comisiones(ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'ad000000-0000-0000-0000-000000000002'));
     SELECT pay_commissions('ad000000-0000-0000-0000-000000000002',
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'ad000000-0000-0000-0000-000000000002'),
       CURRENT_DATE, 'cheque', '3001', NULL, NULL) $$,
  'Se le paga al mecánico lo de las dos órdenes en un cheque'
);

SELECT results_eq(
  $$ SELECT f.referencia_orden_id, f.monto, f.categoria::text, f.numero_cheque
     FROM finanzas_movimientos f JOIN comision_pagos p ON p.id = f.comision_pago_id
     WHERE p.usuario_id = 'ad000000-0000-0000-0000-000000000002'
     ORDER BY f.monto $$,
  $$ VALUES ((SELECT id FROM t_a), 70.00::numeric, 'planilla'::text, '3001'::text),
            ((SELECT id FROM t_b), 105.00::numeric, 'planilla'::text, '3001'::text) $$,
  'Un egreso por orden, con su orden y el cheque: $70 de A y $105 de B'
);

SELECT is(
  (SELECT SUM(f.monto) FROM finanzas_movimientos f JOIN comision_pagos p ON p.id = f.comision_pago_id
    WHERE p.usuario_id = 'ad000000-0000-0000-0000-000000000002'),
  (SELECT monto FROM comision_pagos WHERE usuario_id = 'ad000000-0000-0000-0000-000000000002'),
  'Los egresos suman exactamente el pago ($175)'
);

SELECT ok(
  (SELECT descripcion LIKE 'Comisión Mario Mecánico - %' FROM finanzas_movimientos f
    WHERE f.comision_pago_id IS NOT NULL AND f.referencia_orden_id = (SELECT id FROM t_b)),
  'La descripción dice a quién y de qué orden'
);

SELECT results_eq(
  $$ SELECT (b->>'comisiones_pagadas')::numeric, (b->>'margen')::numeric FROM (SELECT balance_orden((SELECT id FROM t_a)) b) x $$,
  $$ VALUES (70.00::numeric, 780.00::numeric) $$,
  'El balance de A ve lo pagado, y el margen no cambia: cuenta lo devengado'
);

SELECT lives_ok(
  $$ DELETE FROM comision_pagos WHERE usuario_id = 'ad000000-0000-0000-0000-000000000002' $$,
  'Se deshace el pago'
);

SELECT is(
  (SELECT COUNT(*)::int FROM finanzas_movimientos WHERE categoria = 'planilla'
     AND sede_id = '1d000000-0000-0000-0000-000000000001'),
  0,
  'Se van los dos egresos, y las comisiones vuelven a pendientes'
);

-- ------------------------------------------------------------------------------------
-- 3. Una compra vinculada a la orden no se cuenta dos veces
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id, registrado_por)
     SELECT '1d000000-0000-0000-0000-000000000001', 'egreso', 'compra_repuesto', 40, 'Filtros AutoZone', CURRENT_DATE, id,
            'ad000000-0000-0000-0000-000000000001' FROM t_a $$,
  'Administración vincula a A la compra de los filtros, a mano'
);

SELECT results_eq(
  $$ SELECT (b->>'costo_repuestos')::numeric, (b->>'margen')::numeric, jsonb_array_length(b->'otros'),
            b->'otros'->0->>'descripcion'
     FROM (SELECT balance_orden((SELECT id FROM t_a)) b) x $$,
  $$ VALUES (100.00::numeric, 780.00::numeric, 1, 'Filtros AutoZone'::text) $$,
  'El margen usa el costo de las líneas y la compra se muestra aparte, sin restarla otra vez'
);

-- ------------------------------------------------------------------------------------
-- 4. El margen del periodo, paginado
-- ------------------------------------------------------------------------------------
SELECT results_eq(
  $$ SELECT (m->>'total_filas')::int, (m->'sumas'->>'cobrado')::numeric, (m->'sumas'->>'margen')::numeric,
            jsonb_array_length(m->'filas')
     FROM (SELECT margen_ordenes('1d000000-0000-0000-0000-000000000001',
             (now() AT TIME ZONE 'America/Chicago')::date, (now() AT TIME ZONE 'America/Chicago')::date + 1) m) x $$,
  $$ VALUES (2, 1600.00::numeric, 975.00::numeric, 2) $$,
  'Dos órdenes entregadas hoy: cobrado 1600, margen 780 + 195 = 975'
);

SELECT results_eq(
  $$ SELECT (m->>'total_filas')::int, jsonb_array_length(m->'filas')
     FROM (SELECT margen_ordenes('1d000000-0000-0000-0000-000000000001',
             (now() AT TIME ZONE 'America/Chicago')::date, (now() AT TIME ZONE 'America/Chicago')::date + 1, 1, 1) m) x $$,
  $$ VALUES (2, 1) $$,
  'Paginada: la segunda página de una fila trae una, y el total sigue siendo dos'
);

SELECT is(
  (margen_ordenes('1d000000-0000-0000-0000-000000000001', '2020-01-01', '2020-02-01')->>'total_filas')::int,
  0,
  'Fuera del periodo no hay órdenes'
);

-- ------------------------------------------------------------------------------------
-- 5. Solo administración
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'ad000000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$ SELECT balance_orden((SELECT id FROM t_a)) $$,
  '42501', NULL,
  'Un mecánico no ve el balance de una orden, ni de la suya'
);

SELECT throws_ok(
  $$ SELECT margen_ordenes(NULL, '2026-01-01', '2027-01-01') $$,
  '42501', NULL,
  'Ni el margen de las órdenes'
);

RESET ROLE;

SELECT ok(
  NOT has_function_privilege('authenticated', 'public._balance_orden(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.balance_orden(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.margen_ordenes(uuid, date, date, integer, integer, text)', 'EXECUTE')
  AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_commission_payment_finance'),
  'La cuenta interna no es una RPC, sin sesión no hay balance, y el egreso único se retiró'
);

SELECT * FROM finish();
ROLLBACK;
