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

SELECT plan(10);

-- ------------------------------------------------------------------------------------
-- Datos
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, comision_porcentaje) VALUES
  ('1c000000-0000-0000-0000-000000000001', 'Sede Mixta', 'Calle 14', '555-1400', 35);

INSERT INTO auth.users (id, email) VALUES
  ('ac000000-0000-0000-0000-000000000001', 'admin14@prueba.local'),
  ('ac000000-0000-0000-0000-000000000002', 'mixto14@prueba.local'),
  ('ac000000-0000-0000-0000-000000000003', 'salario14@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('ac000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '1c000000-0000-0000-0000-000000000001', 'admin14@prueba.local'),
  ('ac000000-0000-0000-0000-000000000002', 'Mario Mixto', 'mecanico', '1c000000-0000-0000-0000-000000000001', 'mixto14@prueba.local'),
  ('ac000000-0000-0000-0000-000000000003', 'Paula Salario', 'pintor', '1c000000-0000-0000-0000-000000000001', 'salario14@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('cc000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', 'Marta Ruiz', '+15550140', '', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('dc000000-0000-0000-0000-00000000000a', 'cc000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris'),
  ('dc000000-0000-0000-0000-00000000000b', 'cc000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000001';

CREATE FUNCTION pg_temp.orden(p_vehiculo UUID, p_labor JSONB, p_equipo JSONB, p_entregar BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '1c000000-0000-0000-0000-000000000001',
      'cliente_id', 'cc000000-0000-0000-0000-000000000001',
      'vehiculo_id', p_vehiculo,
      'tipo_trabajo', 'combinado', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'ac000000-0000-0000-0000-000000000001'),
    p_labor, '[]'::jsonb, p_equipo);
  UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png' WHERE vehiculo_id = p_vehiculo;
  PERFORM pg_temp.autorizar_cotizado(id) FROM ordenes_trabajo WHERE vehiculo_id = p_vehiculo;
  IF p_entregar THEN
    UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = p_vehiculo;
  END IF;
END $f$;

-- ------------------------------------------------------------------------------------
-- Pruebas de esquema y triggers de pago
-- ------------------------------------------------------------------------------------

SELECT diag('Constraint is: ' || pg_get_constraintdef(oid)) FROM pg_constraint WHERE conname = 'perfiles_pago_esquema_check';

SELECT throws_ok(
  $$ INSERT INTO perfiles_pago (usuario_id, esquema, comision_porcentaje) VALUES ('ac000000-0000-0000-0000-000000000002', 'mixto', 40.0) $$,
  '22023', 'Escribe el salario del pago mixto.',
  'Mixto exige un salario'
);

SELECT lives_ok(
  $$ INSERT INTO perfiles_pago (usuario_id, esquema, comision_porcentaje, salario_monto, salario_periodo) 
     VALUES ('ac000000-0000-0000-0000-000000000002', 'mixto', 40.0, 900, 'quincenal') $$,
  'Técnico mixto insertado'
);

SELECT lives_ok(
  $$ INSERT INTO perfiles_pago (usuario_id, esquema, salario_monto, salario_periodo) 
     VALUES ('ac000000-0000-0000-0000-000000000003', 'salario', 800, 'semanal') $$,
  'Técnico a salario insertado'
);

-- Revisar que el trigger conservó los 3 valores para el mixto y limpió comisión para el salario
SELECT results_eq(
  $$ SELECT esquema, comision_porcentaje, salario_monto FROM perfiles_pago ORDER BY usuario_id $$,
  $$ VALUES ('mixto'::text, 40.00::numeric, 900.00::numeric),
            ('salario'::text, NULL::numeric, 800.00::numeric) $$,
  'El trigger conserva comision y salario para mixto'
);

-- ------------------------------------------------------------------------------------
-- Pruebas de comisiones y funciones
-- ------------------------------------------------------------------------------------

SELECT lives_ok(
  $$ SELECT pg_temp.orden('dc000000-0000-0000-0000-00000000000a',
       '[{"descripcion":"Frenos","costo":1000,"especialidad":"mecanica"},
         {"descripcion":"Pintura general","costo":1000,"especialidad":"pintura"}]',
       '[{"usuario_id":"ac000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
         {"usuario_id":"ac000000-0000-0000-0000-000000000003","tipo_tarea":"pintura"}]', true) $$,
  'Se entrega orden con mixto y asalariado'
);

-- El empleado a salario no devenga nada
SELECT is_empty(
  $$ SELECT 1 FROM comisiones c JOIN ordenes_trabajo o ON c.orden_id = o.id 
     WHERE o.vehiculo_id = 'dc000000-0000-0000-0000-00000000000a' AND c.usuario_id = 'ac000000-0000-0000-0000-000000000003' $$,
  'El asalariado no recibe comisión en la tabla'
);

-- El mixto devenga el 40% de $1000 = $400
SELECT results_eq(
  $$ SELECT usuario_id, especialidad, monto FROM comisiones c JOIN ordenes_trabajo o ON c.orden_id = o.id
     WHERE o.vehiculo_id = 'dc000000-0000-0000-0000-00000000000a' AND c.usuario_id = 'ac000000-0000-0000-0000-000000000002' $$,
  $$ VALUES ('ac000000-0000-0000-0000-000000000002'::uuid, 'mecanica'::text, 400.00::numeric) $$,
  'El mixto devenga comisión igual que si estuviera a pura comisión'
);

-- comisiones_estimadas: el admin ve el total (cero porque no hizo labor)
SELECT is(
  (SELECT (comisiones_estimadas(id)->>'mi_total')::numeric FROM ordenes_trabajo WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a'),
  0.00::numeric,
  'comisiones_estimadas incluye al mixto en mi_total para el admin'
);

-- comisiones_estimadas: el mixto ve su total (cero hasta ser aceptada)
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
SELECT is(
  (SELECT (comisiones_estimadas(id)->>'mi_total')::numeric FROM ordenes_trabajo WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a'),
  0.00::numeric,
  'comisiones_estimadas incluye al mixto en su propio mi_total'
);

-- El porcentaje sigue limitado a 0–100 (la migración solo suelta el check del esquema).
RESET ROLE;
SELECT throws_ok(
  $$ UPDATE perfiles_pago SET comision_porcentaje = 500 WHERE usuario_id = 'ac000000-0000-0000-0000-000000000002' $$,
  '23514', NULL, 'Un porcentaje de 500 se rechaza'
);

SELECT * FROM finish();
ROLLBACK;
