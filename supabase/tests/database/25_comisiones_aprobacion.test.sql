-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: aprobación de comisiones
-- ====================================================================================
-- Qué cubre (migración 20261010000014): al entregar, la comisión nace sugerida y el técnico no
-- ve su monto — ni en la tarjeta de la orden, ni leyendo la tabla, ni en un aviso — hasta que
-- administración la acepta; nunca ve las de sus compañeros; aceptar valida el monto y el
-- porcentaje y avisa al técnico; el recálculo no pisa lo aceptado, pero lo borra si la tarea
-- cambia de técnico (no se paga dos veces) o si la orden deja de estar entregada.
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

SELECT plan(22);

-- ------------------------------------------------------------------------------------
-- Datos: una sede al 35 %, un admin y tres mecánicos. Una orden con una tarea de $1,000 para
-- Mario y otra de $500 para Memo, firmada y entregada.
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, comision_porcentaje) VALUES
  ('25000000-0000-0000-0000-000000000001', 'Sede Comisiones', 'Calle 25', '555-2500', 35);

INSERT INTO auth.users (id, email) VALUES
  ('a2500000-0000-0000-0000-000000000001', 'admin25@prueba.local'),
  ('a2500000-0000-0000-0000-000000000002', 'mario25@prueba.local'),
  ('a2500000-0000-0000-0000-000000000003', 'memo25@prueba.local'),
  ('a2500000-0000-0000-0000-000000000004', 'teo25@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a2500000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '25000000-0000-0000-0000-000000000001', 'admin25@prueba.local'),
  ('a2500000-0000-0000-0000-000000000002', 'Mario Mecánico', 'mecanico', '25000000-0000-0000-0000-000000000001', 'mario25@prueba.local'),
  ('a2500000-0000-0000-0000-000000000003', 'Memo Mecánico', 'mecanico', '25000000-0000-0000-0000-000000000001', 'memo25@prueba.local'),
  ('a2500000-0000-0000-0000-000000000004', 'Teo Mecánico', 'mecanico', '25000000-0000-0000-0000-000000000001', 'teo25@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c2500000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'Marta Ruiz', '+15550250', '', 'Oak 25');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d2500000-0000-0000-0000-000000000001', 'c2500000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A025001', NULL, 'Gris');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a2500000-0000-0000-0000-000000000001';

SELECT create_work_order(
  jsonb_build_object(
    'sede_id', '25000000-0000-0000-0000-000000000001',
    'cliente_id', 'c2500000-0000-0000-0000-000000000001',
    'vehiculo_id', 'd2500000-0000-0000-0000-000000000001',
    'tipo_trabajo', 'mecanica', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
    'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-12-31',
    'creado_por', 'a2500000-0000-0000-0000-000000000001'),
  '[{"descripcion":"Motor","costo":1000,"especialidad":"mecanica","asignado_a":"a2500000-0000-0000-0000-000000000002","reparto_heredado":false},
    {"descripcion":"Frenos","costo":500,"especialidad":"mecanica","asignado_a":"a2500000-0000-0000-0000-000000000003","reparto_heredado":false}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb);

RESET ROLE;
CREATE TEMP TABLE t_o AS SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd2500000-0000-0000-0000-000000000001';
GRANT SELECT ON t_o TO authenticated;
CREATE TEMP TABLE t_res (k TEXT PRIMARY KEY, v JSONB);
GRANT ALL ON t_res TO authenticated;
-- Lo que hay en la tabla, sin RLS.
CREATE TEMP VIEW t_c AS
  SELECT c.*, l.descripcion FROM comisiones c JOIN orden_labor l ON l.id = c.labor_id
  WHERE c.orden_id = (SELECT id FROM t_o);
GRANT SELECT ON t_c TO authenticated;

UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png' WHERE id = (SELECT id FROM t_o);
DO $do$ BEGIN PERFORM pg_temp.autorizar_cotizado((SELECT id FROM t_o)); END $do$;
DELETE FROM notificaciones;
SET LOCAL ROLE authenticated;
UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE id = (SELECT id FROM t_o);
RESET ROLE;

-- ------------------------------------------------------------------------------------
-- 1. Al entregar: sugeridas, sin aviso con monto
-- ------------------------------------------------------------------------------------
SELECT results_eq(
  $$ SELECT descripcion, monto, estado FROM t_c ORDER BY descripcion $$,
  $$ VALUES ('Frenos'::text, 175.00::numeric, 'sugerida'::text), ('Motor', 350.00, 'sugerida') $$,
  'Al entregar, cada tarea deja su comisión sugerida (35 %)'
);
SELECT is((SELECT COUNT(*)::int FROM notificaciones WHERE tipo = 'comision_generada'), 0,
  'Entregar no le manda al técnico el monto sugerido');

-- ------------------------------------------------------------------------------------
-- 2. Lo que ve el técnico antes de que se acepte
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2500000-0000-0000-0000-000000000002';
INSERT INTO t_res VALUES ('mario_antes', comisiones_estimadas((SELECT id FROM t_o)));
SELECT is((SELECT COUNT(*)::int FROM comisiones), 0, 'Por la API, el técnico no lee su comisión sugerida');
SELECT throws_ok(
  $$ SELECT aprobar_comision((SELECT id FROM comisiones LIMIT 1)) $$,
  '42501', NULL, 'Un técnico no aprueba comisiones'
);
RESET ROLE;

SELECT is((SELECT jsonb_array_length(v->'tareas') FROM t_res WHERE k = 'mario_antes'), 1,
  'El técnico ve solo su tarea, no la de su compañero');
SELECT is((SELECT v->'tareas'->0->'monto' FROM t_res WHERE k = 'mario_antes'), 'null'::jsonb,
  'Sin aceptar, su monto llega vacío');
SELECT is((SELECT (v->>'mi_total')::numeric FROM t_res WHERE k = 'mario_antes'), 0::numeric,
  'Y su total, en cero');
SELECT is((SELECT jsonb_typeof(v->'sin_asignar') FROM t_res WHERE k = 'mario_antes'), 'array',
  '`sin_asignar` sigue siendo una lista (el diálogo de entrega la recorre)');

-- ------------------------------------------------------------------------------------
-- 3. Administración acepta
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2500000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ SELECT aprobar_comision((SELECT id FROM t_c WHERE descripcion = 'Motor'), -1) $$,
  '22023', 'La comisión no puede ser negativa.', 'Un monto negativo se rechaza'
);
SELECT throws_ok(
  $$ SELECT aprobar_comision((SELECT id FROM t_c WHERE descripcion = 'Motor'), NULL, 150) $$,
  '22023', 'El porcentaje tiene que estar entre 0 y 100.', 'Un porcentaje fuera de rango se rechaza'
);
SELECT lives_ok(
  $$ SELECT aprobar_comision((SELECT id FROM t_c WHERE descripcion = 'Motor')) $$,
  'Administración acepta la de Mario tal cual'
);
SELECT lives_ok(
  $$ SELECT aprobar_comision((SELECT id FROM t_c WHERE descripcion = 'Frenos'), NULL, 40) $$,
  'Y la de Memo con otro porcentaje'
);
RESET ROLE;

SELECT results_eq(
  $$ SELECT descripcion, monto, porcentaje, estado FROM t_c ORDER BY descripcion $$,
  $$ VALUES ('Frenos'::text, 200.00::numeric, 40::numeric, 'aceptada'::text), ('Motor', 350.00, 35, 'aceptada') $$,
  'Con solo el porcentaje, el monto sale de la misma cuenta ($500 × 40 %)'
);
SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones
   WHERE tipo = 'comision_generada' AND usuario_id = 'a2500000-0000-0000-0000-000000000002'
     AND titulo LIKE 'Comisión aprobada%' AND cuerpo LIKE '$350.00%'),
  1, 'Al aceptarla, el técnico recibe el aviso con el monto aceptado'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2500000-0000-0000-0000-000000000002';
INSERT INTO t_res VALUES ('mario_despues', comisiones_estimadas((SELECT id FROM t_o)));
SELECT is((SELECT COUNT(*)::int FROM comisiones), 1, 'Aceptada, el técnico ya la lee (solo la suya)');
RESET ROLE;
SELECT is((SELECT (v->'tareas'->0->>'monto')::numeric FROM t_res WHERE k = 'mario_despues'), 350.00,
  'En la tarjeta ve el monto aceptado');
SELECT is((SELECT (v->>'mi_total')::numeric FROM t_res WHERE k = 'mario_despues'), 350.00,
  'Y su total');
SELECT is((SELECT jsonb_array_length(v->'tareas') FROM t_res WHERE k = 'mario_despues'), 1,
  'Aceptada la de Memo, Mario sigue sin verla');

-- ------------------------------------------------------------------------------------
-- 4. El recálculo respeta lo aceptado, pero no paga dos veces
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2500000-0000-0000-0000-000000000001';
SELECT aprobar_comision((SELECT id FROM t_c WHERE descripcion = 'Motor'), 300);
RESET ROLE;
SELECT sync_order_commissions((SELECT id FROM t_o));
SELECT is((SELECT monto FROM t_c WHERE descripcion = 'Motor'), 300.00::numeric,
  'Recalcular no pisa el monto que fijó administración');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2500000-0000-0000-0000-000000000001';
UPDATE orden_labor SET asignado_a = 'a2500000-0000-0000-0000-000000000004' WHERE descripcion = 'Motor';
RESET ROLE;
SELECT results_eq(
  $$ SELECT usuario_id::text, monto, estado FROM t_c WHERE descripcion = 'Motor' $$,
  $$ VALUES ('a2500000-0000-0000-0000-000000000004'::text, 350.00::numeric, 'sugerida'::text) $$,
  'Si la tarea cambia de técnico, la aceptada del anterior se borra: una sola comisión por la tarea'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2500000-0000-0000-0000-000000000001';
UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = (SELECT id FROM t_o);
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM t_c), 0,
  'Sacar la orden de Entregado borra también lo aceptado sin pagar: una orden no entregada no paga');

-- ------------------------------------------------------------------------------------
-- 5. Permisos
-- ------------------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('anon', 'public.aprobar_comision(uuid, numeric, numeric)', 'EXECUTE'),
  'Sin sesión no se aprueban comisiones');

SELECT * FROM finish();
ROLLBACK;
