-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: comisiones por especialidad y por empleado
-- ====================================================================================
-- Qué cubre (migración 20261009000000): cada especialidad es una bolsa que se reparte
-- entre quienes tienen esa tarea; cada quien cobra su porcentaje (o el de la sede); el
-- asalariado no cobra y su parte se queda en el taller; una bolsa sin nadie no la cobra
-- nadie; una persona puede cobrar de las dos; lo pagado no se recalcula; cambiar la
-- especialidad de una línea o el esquema de alguien recalcula lo pendiente; la
-- configuración de pago es de administración.
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

SELECT plan(32);

-- ------------------------------------------------------------------------------------
-- Datos: una sede al 35 %, un admin, dos mecánicos y una pintora
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, comision_porcentaje) VALUES
  ('1c000000-0000-0000-0000-000000000001', 'Sede Comisiones', 'Calle 13', '555-1300', 35);

INSERT INTO auth.users (id, email) VALUES
  ('ac000000-0000-0000-0000-000000000001', 'admin12@prueba.local'),
  ('ac000000-0000-0000-0000-000000000002', 'mario12@prueba.local'),
  ('ac000000-0000-0000-0000-000000000003', 'paula12@prueba.local'),
  ('ac000000-0000-0000-0000-000000000004', 'memo12@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('ac000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '1c000000-0000-0000-0000-000000000001', 'admin12@prueba.local'),
  ('ac000000-0000-0000-0000-000000000002', 'Mario Mecánico', 'mecanico', '1c000000-0000-0000-0000-000000000001', 'mario12@prueba.local'),
  ('ac000000-0000-0000-0000-000000000003', 'Paula Pintora', 'pintor', '1c000000-0000-0000-0000-000000000001', 'paula12@prueba.local'),
  ('ac000000-0000-0000-0000-000000000004', 'Memo Mecánico', 'mecanico', '1c000000-0000-0000-0000-000000000001', 'memo12@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('cc000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', 'Marta Ruiz', '+15550140', '', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('dc000000-0000-0000-0000-00000000000a', 'cc000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris'),
  ('dc000000-0000-0000-0000-00000000000b', 'cc000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul'),
  ('dc000000-0000-0000-0000-00000000000c', 'cc000000-0000-0000-0000-000000000001', 'Ford', 'F-150', 2018, '1FTEW1EG0JF000001', NULL, 'Negro'),
  ('dc000000-0000-0000-0000-00000000000d', 'cc000000-0000-0000-0000-000000000001', 'Nissan', 'Versa', 2017, '3N1CN7AP0HL000001', NULL, 'Rojo'),
  ('dc000000-0000-0000-0000-00000000000e', 'cc000000-0000-0000-0000-000000000001', 'Kia', 'Rio', 2016, 'KNADM4A30G6000001', NULL, 'Blanco');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000001';

-- Crea, firma (autoriza lo cotizado) y opcionalmente entrega una orden "combinado".
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

RESET ROLE;
CREATE TEMP VIEW t_ids AS
  SELECT vehiculo_id, id FROM ordenes_trabajo WHERE sede_id = '1c000000-0000-0000-0000-000000000001';
-- Lo que cobra cada quien en una orden: (quién, bolsa, base, %, técnicos, monto).
CREATE TEMP VIEW t_com AS
  SELECT o.vehiculo_id, c.usuario_id, c.especialidad, c.base_ganancia, c.porcentaje, c.tecnicos, c.monto, c.pago_id
  FROM comisiones c JOIN ordenes_trabajo o ON o.id = c.orden_id;
GRANT SELECT ON t_ids, t_com TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 1. El ejemplo de la reunión: pintura $1,000 y mecánica $200
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.orden('dc000000-0000-0000-0000-00000000000a',
       '[{"descripcion":"Pintura general","costo":1000,"especialidad":"pintura"},
         {"descripcion":"Cambio de aceite","costo":200,"especialidad":"mecanica"}]',
       '[{"usuario_id":"ac000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
         {"usuario_id":"ac000000-0000-0000-0000-000000000003","tipo_tarea":"pintura"}]', true) $$,
  'Se entrega la orden de la reunión'
);

-- Antes: 35 % de $1,200 = $420, mitad y mitad: $210 cada uno.
SELECT results_eq(
  $$ SELECT usuario_id, especialidad, base_ganancia, porcentaje, tecnicos, monto FROM t_com
     WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a' ORDER BY especialidad $$,
  $$ VALUES
     ('ac000000-0000-0000-0000-000000000002'::uuid, 'mecanica'::text, 200.00::numeric, 35.00::numeric, 1, 70.00::numeric),
     ('ac000000-0000-0000-0000-000000000003'::uuid, 'pintura'::text, 1000.00::numeric, 35.00::numeric, 1, 350.00::numeric) $$,
  'Cada quien cobra de su bolsa: la pintora $350 de la pintura, el mecánico $70 de la mecánica'
);

-- ------------------------------------------------------------------------------------
-- 2. Porcentaje propio, y lo pagado no se toca
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ INSERT INTO perfiles_pago (usuario_id, esquema, comision_porcentaje)
     VALUES ('ac000000-0000-0000-0000-000000000003', 'comision', 40) $$,
  'Administración le da a la pintora su propio 40 %'
);

SELECT is(
  (SELECT monto FROM t_com WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a' AND especialidad = 'pintura'),
  400.00::numeric,
  'Su comisión pendiente se recalcula con su porcentaje, no con el de la sede'
);

SELECT lives_ok(
  $$ SELECT aprobar_comisiones(ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'ac000000-0000-0000-0000-000000000003'));
     SELECT pay_commissions('ac000000-0000-0000-0000-000000000003',
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'ac000000-0000-0000-0000-000000000003'),
       CURRENT_DATE, 'cheque', '2001', NULL, NULL) $$,
  'Se le paga'
);

SELECT lives_ok(
  $$ UPDATE perfiles_pago SET comision_porcentaje = 50 WHERE usuario_id = 'ac000000-0000-0000-0000-000000000003' $$,
  'Después le suben el porcentaje al 50 %'
);

SELECT results_eq(
  $$ SELECT monto, pago_id IS NOT NULL FROM t_com WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a' AND especialidad = 'pintura' $$,
  $$ VALUES (400.00::numeric, true) $$,
  'Lo ya pagado se queda como se pagó'
);

-- ------------------------------------------------------------------------------------
-- 3. El asalariado cuenta para el reparto, pero su parte se queda en el taller
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
     SELECT id, 'ac000000-0000-0000-0000-000000000004', 'mecanica' FROM t_ids
     WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a' $$,
  'Se suma un segundo mecánico a la orden entregada'
);

SELECT results_eq(
  $$ SELECT usuario_id, tecnicos, monto FROM t_com
     WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a' AND especialidad = 'mecanica' ORDER BY usuario_id $$,
  $$ VALUES ('ac000000-0000-0000-0000-000000000002'::uuid, 2, 35.00::numeric),
            ('ac000000-0000-0000-0000-000000000004'::uuid, 2, 35.00::numeric) $$,
  'La bolsa de mecánica se parte entre los dos: $35 cada uno'
);

SELECT lives_ok(
  $$ INSERT INTO perfiles_pago (usuario_id, esquema, salario_monto, salario_periodo)
     VALUES ('ac000000-0000-0000-0000-000000000004', 'salario', 900, 'quincenal') $$,
  'El segundo mecánico pasa a salario'
);

SELECT results_eq(
  $$ SELECT usuario_id, tecnicos, monto FROM t_com
     WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a' AND especialidad = 'mecanica' $$,
  $$ VALUES ('ac000000-0000-0000-0000-000000000002'::uuid, 2, 35.00::numeric) $$,
  'Él ya no cobra comisión y su mitad se queda en el taller: el otro sigue en $35'
);

-- ------------------------------------------------------------------------------------
-- 4. "Combinado" sin especialidad va a mecánica; cambiarla mueve la bolsa
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.orden('dc000000-0000-0000-0000-00000000000b',
       '[{"descripcion":"Carrocería","costo":500}]',
       '[{"usuario_id":"ac000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
         {"usuario_id":"ac000000-0000-0000-0000-000000000003","tipo_tarea":"pintura"}]', true) $$,
  'Se entrega una orden combinada con una línea sin especialidad'
);

SELECT is(
  (SELECT especialidad FROM orden_labor l JOIN t_ids t ON t.id = l.orden_id
    WHERE t.vehiculo_id = 'dc000000-0000-0000-0000-00000000000b'),
  'mecanica',
  'La línea de una orden combinada toma mecánica por omisión'
);

SELECT results_eq(
  $$ SELECT usuario_id, especialidad, monto FROM t_com WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000b' $$,
  $$ VALUES ('ac000000-0000-0000-0000-000000000002'::uuid, 'mecanica'::text, 175.00::numeric) $$,
  'La pintora no tiene bolsa y no genera una comisión en cero'
);

SELECT lives_ok(
  $$ UPDATE orden_labor SET especialidad = 'pintura'
     WHERE orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000b') $$,
  'Administración corrige: era trabajo de pintura'
);

SELECT results_eq(
  $$ SELECT usuario_id, especialidad, monto FROM t_com WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000b' $$,
  $$ VALUES ('ac000000-0000-0000-0000-000000000003'::uuid, 'pintura'::text, 250.00::numeric) $$,
  'La comisión pasa a la pintora, con su 50 %, y la del mecánico desaparece'
);

-- ------------------------------------------------------------------------------------
-- 5. Una bolsa sin nadie no la cobra nadie; una persona puede cobrar de las dos
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.orden('dc000000-0000-0000-0000-00000000000c',
       '[{"descripcion":"Pintura de puerta","costo":300,"especialidad":"pintura"}]',
       '[{"usuario_id":"ac000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]', true) $$,
  'Se entrega una orden de pintura con solo un mecánico asignado'
);

SELECT is_empty(
  $$ SELECT 1 FROM t_com WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000c' $$,
  'Nadie cobra la bolsa de pintura'
);

SELECT is(
  comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000c'))->'bolsas',
  '[{"especialidad": "pintura", "base": 300.00, "tecnicos": 0}]'::jsonb,
  'Y la orden lo avisa: una bolsa de pintura con cero técnicos'
);

SELECT lives_ok(
  $$ SELECT pg_temp.orden('dc000000-0000-0000-0000-00000000000d',
       '[{"descripcion":"Pintura","costo":100,"especialidad":"pintura"},
         {"descripcion":"Mecánica","costo":100,"especialidad":"mecanica"}]',
       '[{"usuario_id":"ac000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
         {"usuario_id":"ac000000-0000-0000-0000-000000000002","tipo_tarea":"pintura"}]', true) $$,
  'Se entrega una orden donde el mismo mecánico hizo las dos cosas'
);

SELECT results_eq(
  $$ SELECT especialidad, monto FROM t_com WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000d' ORDER BY especialidad $$,
  $$ VALUES ('mecanica'::text, 35.00::numeric), ('pintura'::text, 35.00::numeric) $$,
  'Cobra de las dos bolsas, una fila por cada una'
);

-- ------------------------------------------------------------------------------------
-- 6. Cambiar solo la especialidad de una línea en presupuesto no toca lo cotizado
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.orden('dc000000-0000-0000-0000-00000000000e', '[]',
       '[{"usuario_id":"ac000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]', false);
     INSERT INTO orden_labor (orden_id, descripcion, costo)
     SELECT id, 'Hojalatería', 400 FROM t_ids WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000e';
     SELECT enviar_presupuesto((SELECT id FROM t_ids WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000e'), false) $$,
  'Una línea queda esperando la autorización del cliente'
);

SELECT lives_ok(
  $$ UPDATE orden_labor SET especialidad = 'pintura' WHERE descripcion = 'Hojalatería' $$,
  'Se le puede cambiar la especialidad'
);

SELECT is((SELECT estado FROM orden_labor WHERE descripcion = 'Hojalatería'), 'pendiente',
  'Y sigue esperando al cliente');

SELECT throws_ok(
  $$ UPDATE orden_labor SET costo = 450 WHERE descripcion = 'Hojalatería' $$,
  '42501', NULL,
  'Cambiar el precio de esa línea sigue sin poderse'
);

-- ------------------------------------------------------------------------------------
-- 7. La configuración de pago es de administración
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$ INSERT INTO perfiles_pago (usuario_id, esquema, comision_porcentaje)
     VALUES ('ac000000-0000-0000-0000-000000000002', 'comision', 90) $$,
  '42501', NULL,
  'Un mecánico no se pone su propio porcentaje'
);

SELECT is_empty(
  $$ SELECT 1 FROM perfiles_pago WHERE usuario_id = 'ac000000-0000-0000-0000-000000000003' $$,
  'Ni ve el de su compañera'
);

SELECT results_eq(
  $$ SELECT usuario_id, especialidad FROM jsonb_to_recordset(
       comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a'))->'reparto'
     ) AS r(usuario_id uuid, especialidad text) $$,
  $$ VALUES ('ac000000-0000-0000-0000-000000000002'::uuid, 'mecanica'::text) $$,
  'La estimación le muestra lo suyo y no lo de los demás'
);

-- Desde 20261010000014 el técnico ve su monto cuando administración acepta la comisión; antes,
-- su total es cero (la cuenta de $35 la ve administración, y la prueba 25 cubre lo aceptado).
SELECT is(
  (comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'dc000000-0000-0000-0000-00000000000a'))->>'mi_total')::numeric,
  0::numeric,
  'Sin aceptar, su total es cero: el monto lo ve cuando administración lo acepta'
);

SELECT throws_ok(
  $$ SELECT resumen_empleado('ac000000-0000-0000-0000-000000000003') $$,
  '42501', NULL,
  'Un mecánico no ve el resumen de otro empleado'
);

SET LOCAL request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000001';

SELECT is(
  resumen_empleado('ac000000-0000-0000-0000-000000000003') - 'ultimo_pago',
  '{"comisiones_pendientes": 250.00, "comisiones_pagadas": 400.00, "ordenes_activas": 0, "ordenes_entregadas": 2}'::jsonb,
  'El resumen de la pintora: $250 pendientes, $400 pagados, dos órdenes entregadas'
);

RESET ROLE;

SELECT ok(
  NOT has_function_privilege('anon', 'public.comisiones_estimadas(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.resumen_empleado(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public._reparto_comisiones(uuid)', 'EXECUTE'),
  'Sin sesión no hay estimación ni resumen, y el reparto interno no es una RPC'
);

SELECT * FROM finish();
ROLLBACK;
