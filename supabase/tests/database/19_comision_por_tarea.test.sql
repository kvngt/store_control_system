-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: tareas con técnico y comisión por tarea
-- ====================================================================================
-- Qué cubre (migración 20261010000006): cada línea de mano de obra tiene su técnico y su
-- comisión es de él, a su porcentaje; una tarea nueva sin técnico no la cobra nadie y la
-- estimación la devuelve en `sin_asignar`; las líneas de antes conservan el reparto por
-- especialidad, sin contar a quien entró a la orden por una tarea; asignar no cambia el
-- estado de una línea pendiente o rechazada; lo pagado no se reasigna, no se borra y no se
-- paga dos veces (ni la línea heredada de una bolsa pagada se borra, cambia de especialidad o
-- sale del reparto; ni una línea entra a una bolsa pagada; ni se muda a otra orden); una
-- tarea aprobada después de un pago tiene su propia fila; administración saca y mete gente
-- del reparto heredado con el origen de la asignación, salvo en una bolsa ya pagada; borrar a
-- un empleado deja su tarea sin técnico (aunque su línea con reparto caiga en una bolsa
-- pagada); quitar a un técnico con tareas se bloquea pero borrar la orden no; solo el técnico
-- de la tarea (o un
-- admin) la marca hecha; un técnico no se asigna tareas ni cambia su tipo de tarea; el
-- asignado tiene que ser mecánico o pintor de la sede; avisos de tarea y un solo aviso de
-- comisión por orden y persona; el historial nombra al técnico.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(71);

-- ------------------------------------------------------------------------------------
-- Datos: una sede al 35 % y otra; un admin, dos mecánicos y una pintora (con su 40 %), y
-- un mecánico de la otra sede
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, comision_porcentaje) VALUES
  ('19000000-0000-0000-0000-000000000001', 'Sede Tareas', 'Calle 19', '555-1900', 35),
  ('19000000-0000-0000-0000-000000000002', 'Sede Lejana', 'Calle 20', '555-2000', 35);

INSERT INTO auth.users (id, email) VALUES
  ('a1900000-0000-0000-0000-000000000001', 'admin19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000002', 'mario19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000003', 'paula19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000004', 'memo19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000005', 'lejano19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000006', 'teo19@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a1900000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '19000000-0000-0000-0000-000000000001', 'admin19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000002', 'Mario Mecánico', 'mecanico', '19000000-0000-0000-0000-000000000001', 'mario19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000003', 'Paula Pintora', 'pintor', '19000000-0000-0000-0000-000000000001', 'paula19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000004', 'Memo Mecánico', 'mecanico', '19000000-0000-0000-0000-000000000001', 'memo19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000005', 'Lalo Lejano', 'mecanico', '19000000-0000-0000-0000-000000000002', 'lejano19@prueba.local'),
  ('a1900000-0000-0000-0000-000000000006', 'Teo Temporal', 'mecanico', '19000000-0000-0000-0000-000000000001', 'teo19@prueba.local');

INSERT INTO perfiles_pago (usuario_id, esquema, comision_porcentaje) VALUES
  ('a1900000-0000-0000-0000-000000000003', 'comision', 40);

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c1900000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'Marta Ruiz', '+15550190', '', 'Oak 19');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d1900000-0000-0000-0000-00000000000a', 'c1900000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A019001', NULL, 'Gris'),
  ('d1900000-0000-0000-0000-00000000000b', 'c1900000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H019002', NULL, 'Azul'),
  ('d1900000-0000-0000-0000-00000000000c', 'c1900000-0000-0000-0000-000000000001', 'Ford', 'F-150', 2018, '1FTEW1EG0JF019003', NULL, 'Negro');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000001';

-- Crea una orden "combinado" (con líneas y equipo como los manda la app de hoy: reparto
-- heredado) y la firma, que autoriza lo cotizado.
CREATE FUNCTION pg_temp.orden(p_vehiculo UUID, p_labor JSONB, p_equipo JSONB)
RETURNS VOID LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '19000000-0000-0000-0000-000000000001',
      'cliente_id', 'c1900000-0000-0000-0000-000000000001',
      'vehiculo_id', p_vehiculo,
      'tipo_trabajo', 'combinado', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-20',
      'creado_por', 'a1900000-0000-0000-0000-000000000001'),
    p_labor, '[]'::jsonb, p_equipo);
  UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png' WHERE vehiculo_id = p_vehiculo;
END $f$;

-- Una tarea como la crea la app nueva: con técnico (o sin él) y sin reparto heredado.
CREATE FUNCTION pg_temp.tarea(p_vehiculo UUID, p_desc TEXT, p_costo NUMERIC, p_esp TEXT, p_tecnico UUID)
RETURNS VOID LANGUAGE sql AS $f$
  INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, reparto_heredado)
  SELECT id, p_desc, p_costo, p_esp, p_tecnico, false FROM ordenes_trabajo WHERE vehiculo_id = p_vehiculo;
$f$;

RESET ROLE;
CREATE TEMP VIEW t_ids AS
  SELECT vehiculo_id, id FROM ordenes_trabajo WHERE sede_id = '19000000-0000-0000-0000-000000000001';
CREATE TEMP VIEW t_l AS
  SELECT l.id, l.descripcion, l.estado, l.asignado_a, l.orden_id FROM orden_labor l
  JOIN ordenes_trabajo o ON o.id = l.orden_id WHERE o.sede_id = '19000000-0000-0000-0000-000000000001';
CREATE TEMP VIEW t_com AS
  SELECT o.vehiculo_id, c.usuario_id, c.especialidad, l.descripcion, c.base_ganancia, c.porcentaje,
         c.tecnicos, c.monto, c.pago_id
  FROM comisiones c JOIN ordenes_trabajo o ON o.id = c.orden_id
  LEFT JOIN orden_labor l ON l.id = c.labor_id;
GRANT SELECT ON t_ids, t_l, t_com TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 1. Orden A: tareas con técnico, una sin técnico, presupuesto
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.orden('d1900000-0000-0000-0000-00000000000a', '[]', '[]');
     SELECT pg_temp.tarea('d1900000-0000-0000-0000-00000000000a', 'Pintura de puerta', 500, 'pintura', 'a1900000-0000-0000-0000-000000000003');
     SELECT pg_temp.tarea('d1900000-0000-0000-0000-00000000000a', 'Frenos', 200, 'mecanica', NULL);
     SELECT pg_temp.tarea('d1900000-0000-0000-0000-00000000000a', 'Cambio de aceite', 100, 'mecanica', 'a1900000-0000-0000-0000-000000000002');
     SELECT pg_temp.tarea('d1900000-0000-0000-0000-00000000000a', 'Alineación', 100, 'mecanica', NULL) $$,
  'El admin abre la orden A y le agrega tareas, dos con técnico y dos sin él'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT origen, tipo_tarea FROM orden_asignaciones
     WHERE orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a')
       AND usuario_id = 'a1900000-0000-0000-0000-000000000003' $$,
  $$ VALUES ('tarea'::text, 'pintura'::text) $$,
  'Darle una tarea a la pintora la agrega a la orden (origen tarea), para que la vea'
);

SELECT is(
  (SELECT datos->>'labor_id' FROM notificaciones
   WHERE usuario_id = 'a1900000-0000-0000-0000-000000000003' AND tipo = 'tarea_asignada'),
  (SELECT id::text FROM t_l WHERE descripcion = 'Pintura de puerta'),
  'Y se le avisa con tarea_asignada, con la tarea en los datos'
);

SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones
   WHERE usuario_id = 'a1900000-0000-0000-0000-000000000003' AND tipo = 'asignacion'),
  0,
  'Sin el aviso "Nueva orden asignada": ya lo cubre el de la tarea'
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT enviar_presupuesto((SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'), false) $$,
  'Las cuatro tareas van al cliente en un presupuesto'
);

SELECT lives_ok(
  $$ UPDATE orden_labor SET asignado_a = 'a1900000-0000-0000-0000-000000000002' WHERE descripcion = 'Frenos' $$,
  'Con el presupuesto esperando, el admin le asigna técnico a los frenos'
);

SELECT is((SELECT estado FROM t_l WHERE descripcion = 'Frenos'), 'pendiente',
  'Asignar técnico a una línea pendiente no la saca del presupuesto');

RESET ROLE;
SELECT is(
  (SELECT cambios->'tecnico' FROM historial_orden
   WHERE entidad = 'mano_obra' AND accion = 'cambiar' AND resumen = 'Frenos' AND cambios ? 'tecnico'),
  '{"antes": null, "despues": "Mario Mecánico"}'::jsonb,
  'El historial registra el cambio de técnico con su nombre'
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ UPDATE orden_labor SET costo = 250 WHERE descripcion = 'Frenos' $$,
  '42501', NULL,
  'Cambiar el precio de esa línea sigue sin poderse'
);

SELECT lives_ok(
  $$ SELECT registrar_autorizacion(
       (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'),
       ARRAY(SELECT id FROM t_l WHERE descripcion IN ('Pintura de puerta', 'Frenos', 'Cambio de aceite')),
       ARRAY(SELECT id FROM t_l WHERE descripcion IN ('Pintura de puerta', 'Frenos', 'Cambio de aceite', 'Alineación')),
       'admin_telefono') $$,
  'El cliente autoriza todo menos la alineación'
);

SELECT lives_ok(
  $$ UPDATE orden_labor SET asignado_a = 'a1900000-0000-0000-0000-000000000004' WHERE descripcion = 'Alineación' $$,
  'El admin le asigna técnico a la alineación rechazada'
);

SELECT is((SELECT estado FROM t_l WHERE descripcion = 'Alineación'), 'rechazado',
  'Asignar técnico a una línea rechazada no la regresa a borrador');

SELECT lives_ok(
  $$ SELECT pg_temp.tarea('d1900000-0000-0000-0000-00000000000a', 'Diagnóstico', 80, 'mecanica', NULL) $$,
  'Después se agrega un diagnóstico, sin técnico'
);

-- La estimación: cada tarea aprobada con su técnico, y lo que nadie va a cobrar.
SELECT results_eq(
  $$ SELECT descripcion, usuario_id, base, porcentaje, monto FROM jsonb_to_recordset(
       comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'))->'tareas'
     ) AS r(descripcion text, usuario_id uuid, base numeric, porcentaje numeric, monto numeric)
     ORDER BY descripcion $$,
  $$ VALUES ('Cambio de aceite'::text, 'a1900000-0000-0000-0000-000000000002'::uuid, 100.00::numeric, 35.00::numeric, 35.00::numeric),
            ('Frenos', 'a1900000-0000-0000-0000-000000000002'::uuid, 200.00, 35.00, 70.00),
            ('Pintura de puerta', 'a1900000-0000-0000-0000-000000000003'::uuid, 500.00, 40.00, 200.00) $$,
  'Cada tarea aprobada paga a su técnico, a su porcentaje (la pintora, su 40 %)'
);

SELECT results_eq(
  $$ SELECT descripcion, costo, estado FROM jsonb_to_recordset(
       comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'))->'sin_asignar'
     ) AS r(descripcion text, costo numeric, estado text) $$,
  $$ VALUES ('Diagnóstico'::text, 80.00::numeric, 'borrador'::text) $$,
  'La tarea nueva sin técnico aparece en sin_asignar (la rechazada no)'
);

SELECT is(
  comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'))->'bolsas',
  '[]'::jsonb,
  'Sin líneas heredadas no hay bolsas por especialidad'
);

SELECT results_eq(
  $$ SELECT usuario_id, especialidad, monto, tareas, heredado FROM jsonb_to_recordset(
       comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'))->'reparto'
     ) AS r(usuario_id uuid, especialidad text, monto numeric, tareas int, heredado boolean)
     ORDER BY especialidad $$,
  $$ VALUES ('a1900000-0000-0000-0000-000000000002'::uuid, 'mecanica'::text, 105.00::numeric, 2, false),
            ('a1900000-0000-0000-0000-000000000003'::uuid, 'pintura'::text, 200.00::numeric, 1, false) $$,
  'El reparto sigue agrupado por persona y especialidad: el mecánico suma sus dos tareas'
);

-- Lo que ve un técnico: en la orden A hay tareas de Mario y de Paula. Él ve solo las suyas, en
-- `tareas` y en `reparto` (el porcentaje y el monto de cada quien son de administración).
SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000002';
SELECT results_eq(
  $$ SELECT descripcion, usuario_id FROM jsonb_to_recordset(
       comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'))->'tareas'
     ) AS r(descripcion text, usuario_id uuid) ORDER BY descripcion $$,
  $$ VALUES ('Cambio de aceite'::text, 'a1900000-0000-0000-0000-000000000002'::uuid),
            ('Frenos', 'a1900000-0000-0000-0000-000000000002'::uuid) $$,
  'Un técnico ve en tareas solo las suyas, no la de la pintora'
);

SELECT results_eq(
  $$ SELECT usuario_id, monto FROM jsonb_to_recordset(
       comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'))->'reparto'
     ) AS r(usuario_id uuid, monto numeric) $$,
  $$ VALUES ('a1900000-0000-0000-0000-000000000002'::uuid, 105.00::numeric) $$,
  'Y en el reparto, solo su fila'
);
SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 2. Quién asigna y a quién
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE orden_labor SET asignado_a = 'a1900000-0000-0000-0000-000000000005' WHERE descripcion = 'Diagnóstico' $$,
  '42501', 'Una tarea solo se puede asignar a un mecánico o pintor de la sede de la orden.',
  'No se asigna una tarea a un técnico de otra sede'
);

SELECT throws_ok(
  $$ UPDATE orden_labor SET asignado_a = 'a1900000-0000-0000-0000-000000000001' WHERE descripcion = 'Diagnóstico' $$,
  '42501', 'Una tarea solo se puede asignar a un mecánico o pintor de la sede de la orden.',
  'Ni a un administrador'
);

SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000002';

SELECT is_empty(
  $$ UPDATE orden_labor SET asignado_a = 'a1900000-0000-0000-0000-000000000002'
     WHERE descripcion = 'Diagnóstico' RETURNING id $$,
  'Un técnico no se asigna una tarea (su UPDATE no llega a ninguna fila)'
);

SELECT throws_ok(
  $$ INSERT INTO orden_labor (orden_id, descripcion, costo, asignado_a, reparto_heredado)
     SELECT id, 'Extra mío', 999, 'a1900000-0000-0000-0000-000000000002', false FROM t_ids
     WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a' $$,
  '42501', NULL,
  'Ni se crea una tarea propia'
);

SELECT is_empty(
  $$ UPDATE orden_asignaciones SET tipo_tarea = 'pintura'
     WHERE usuario_id = 'a1900000-0000-0000-0000-000000000002' RETURNING id $$,
  'Ni cambia el tipo de tarea de su asignación (movería su comisión)'
);

-- ------------------------------------------------------------------------------------
-- 3. Marcar una tarea hecha
-- ------------------------------------------------------------------------------------
-- Memo está en la orden (por la alineación), pero la pintura de puerta es de Paula.
SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000004';
SELECT throws_ok(
  $$ SELECT marcar_labor_completada((SELECT id FROM t_l WHERE descripcion = 'Pintura de puerta')) $$,
  '42501', 'Esta tarea está asignada a otro técnico. Solo esa persona o administración pueden marcarla.',
  'Un técnico de la orden no marca la tarea de otro'
);

SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000003';
SELECT lives_ok(
  $$ SELECT marcar_labor_completada((SELECT id FROM t_l WHERE descripcion = 'Pintura de puerta')) $$,
  'La pintora marca hecha su tarea'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT usuario_id, datos->>'tecnico', datos->>'descripcion' FROM notificaciones
     WHERE tipo = 'tarea_completada' $$,
  $$ VALUES ('a1900000-0000-0000-0000-000000000001'::uuid, 'Paula Pintora'::text, 'Pintura de puerta'::text) $$,
  'Administración recibe tarea_completada, con quién y qué'
);
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------------------------------
-- 4. Entrega: una fila por tarea y un solo aviso por persona
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a' $$,
  'Se entrega la orden A'
);

SELECT results_eq(
  $$ SELECT usuario_id, especialidad, descripcion, base_ganancia, porcentaje, tecnicos, monto FROM t_com
     WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a' ORDER BY descripcion $$,
  $$ VALUES ('a1900000-0000-0000-0000-000000000002'::uuid, 'mecanica'::text, 'Cambio de aceite'::text, 100.00::numeric, 35.00::numeric, 1, 35.00::numeric),
            ('a1900000-0000-0000-0000-000000000002'::uuid, 'mecanica', 'Frenos', 200.00, 35.00, 1, 70.00),
            ('a1900000-0000-0000-0000-000000000003'::uuid, 'pintura', 'Pintura de puerta', 500.00, 40.00, 1, 200.00) $$,
  'Una comisión por tarea, de su técnico; la alineación rechazada y el diagnóstico sin técnico no generan nada'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT COUNT(*)::int, MAX((datos->>'monto')::numeric) FROM notificaciones
     WHERE usuario_id = 'a1900000-0000-0000-0000-000000000002' AND tipo = 'comision_generada' $$,
  $$ VALUES (1, 105.00::numeric) $$,
  'El mecánico recibe un solo aviso de comisión por la orden, con la suma de sus dos tareas'
);
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------------------------------
-- 5. Lo pagado no se mueve ni se paga dos veces
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pay_commissions('a1900000-0000-0000-0000-000000000002',
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'a1900000-0000-0000-0000-000000000002'),
       CURRENT_DATE, 'cheque', '1901', NULL, NULL) $$,
  'Se le paga al mecánico'
);

SELECT throws_ok(
  $$ UPDATE orden_labor SET asignado_a = 'a1900000-0000-0000-0000-000000000004' WHERE descripcion = 'Frenos' $$,
  '42501', 'La comisión de esta tarea ya se pagó. Para cambiarle el técnico o la especialidad, deshaz ese pago en Comisiones.',
  'Reasignar una tarea ya pagada se rechaza'
);

SELECT throws_ok(
  $$ UPDATE orden_labor SET especialidad = 'pintura' WHERE descripcion = 'Frenos' $$,
  '42501', NULL,
  'Cambiarle la especialidad, también'
);

SELECT throws_ok(
  $$ DELETE FROM orden_labor WHERE descripcion = 'Frenos' $$,
  '42501', NULL,
  'Y borrarla'
);

SELECT lives_ok(
  $$ SELECT pg_temp.tarea('d1900000-0000-0000-0000-00000000000a', 'Rayón', 150, 'pintura', 'a1900000-0000-0000-0000-000000000002');
     SELECT registrar_autorizacion(
       (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'),
       ARRAY(SELECT id FROM t_l WHERE descripcion = 'Rayón'),
       ARRAY(SELECT id FROM t_l WHERE descripcion IN ('Rayón', 'Diagnóstico')),
       'admin_presencial') $$,
  'Ya entregada, el cliente autoriza un rayón que hará el mismo mecánico'
);

SELECT results_eq(
  $$ SELECT descripcion, monto, pago_id IS NOT NULL FROM t_com
     WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a'
       AND usuario_id = 'a1900000-0000-0000-0000-000000000002' ORDER BY descripcion $$,
  $$ VALUES ('Cambio de aceite'::text, 35.00::numeric, true),
            ('Frenos', 70.00, true),
            ('Rayón', 52.50, false) $$,
  'La tarea aprobada después del pago tiene su propia fila pendiente; las pagadas quedan como se pagaron'
);

SELECT is(
  (SELECT SUM(m.monto) FROM finanzas_movimientos m JOIN comision_pagos p ON p.id = m.comision_pago_id
   WHERE p.usuario_id = 'a1900000-0000-0000-0000-000000000002'),
  105.00::numeric,
  'Y el egreso del pago sigue siendo lo pagado'
);

-- ------------------------------------------------------------------------------------
-- 6. Orden B: líneas de antes (reparto heredado) junto a una tarea nueva
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.orden('d1900000-0000-0000-0000-00000000000b',
       '[{"descripcion":"Pintura general","costo":1000,"especialidad":"pintura"},
         {"descripcion":"Mecánica general","costo":200,"especialidad":"mecanica"}]',
       '[{"usuario_id":"a1900000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
         {"usuario_id":"a1900000-0000-0000-0000-000000000003","tipo_tarea":"pintura"}]');
     SELECT pg_temp.tarea('d1900000-0000-0000-0000-00000000000b', 'Pulido', 300, 'pintura', 'a1900000-0000-0000-0000-000000000004');
     SELECT registrar_autorizacion(
       (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b'),
       ARRAY(SELECT id FROM t_l WHERE descripcion = 'Pulido'),
       ARRAY(SELECT id FROM t_l WHERE descripcion = 'Pulido'),
       'admin_telefono');
     UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b' $$,
  'Se entrega una orden con dos líneas heredadas y una tarea de pulido para Memo'
);

SELECT results_eq(
  $$ SELECT usuario_id, especialidad, descripcion, base_ganancia, tecnicos, monto FROM t_com
     WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b' ORDER BY especialidad, usuario_id $$,
  $$ VALUES ('a1900000-0000-0000-0000-000000000002'::uuid, 'mecanica'::text, NULL::text, 200.00::numeric, 1, 70.00::numeric),
            ('a1900000-0000-0000-0000-000000000003'::uuid, 'pintura', NULL, 1000.00, 1, 400.00),
            ('a1900000-0000-0000-0000-000000000004'::uuid, 'pintura', 'Pulido', 300.00, 1, 105.00) $$,
  'Las líneas heredadas se reparten por especialidad como antes, y Memo (que entró por su tarea) no entra a la bolsa de pintura'
);

SELECT results_eq(
  $$ SELECT especialidad, base, tecnicos FROM jsonb_to_recordset(
       comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b'))->'bolsas'
     ) AS r(especialidad text, base numeric, tecnicos int) ORDER BY especialidad $$,
  $$ VALUES ('mecanica'::text, 200.00::numeric, 1), ('pintura', 1000.00, 1) $$,
  'Las bolsas cuentan solo las líneas heredadas y a los asignados a mano'
);

SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000004';
SELECT is(
  comisiones_estimadas((SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b')) - 'bolsas' - 'sin_asignar',
  jsonb_build_object(
    'mi_total', 105.00,
    'reparto', jsonb_build_array(jsonb_build_object(
      'usuario_id', 'a1900000-0000-0000-0000-000000000004', 'especialidad', 'pintura',
      'esquema', 'comision', 'porcentaje', 35.00, 'tecnicos', 1, 'monto', 105.00,
      'heredado', false, 'tareas', 1)),
    'tareas', jsonb_build_array(jsonb_build_object(
      'labor_id', (SELECT id FROM t_l WHERE descripcion = 'Pulido'),
      'descripcion', 'Pulido', 'especialidad', 'pintura',
      'usuario_id', 'a1900000-0000-0000-0000-000000000004',
      'esquema', 'comision', 'base', 300.00, 'porcentaje', 35.00, 'monto', 105.00))),
  'En la orden B, Memo ve solo su tarea, su fila del reparto y su total (no la bolsa de Mario y Paula)'
);
SET LOCAL request.jwt.claim.sub = 'a1900000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ SELECT pay_commissions('a1900000-0000-0000-0000-000000000003',
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'a1900000-0000-0000-0000-000000000003'
               AND orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b')),
       CURRENT_DATE, 'cheque', '1902', NULL, NULL) $$,
  'Se le paga a la pintora la bolsa de pintura heredada'
);

SELECT throws_ok(
  $$ UPDATE orden_labor SET asignado_a = 'a1900000-0000-0000-0000-000000000004' WHERE descripcion = 'Pintura general' $$,
  '42501', 'La comisión de pintura de esta orden ya se pagó con el reparto anterior. Deshaz ese pago en Comisiones antes de cambiarle el técnico o la especialidad a este trabajo.',
  'Asignarle técnico a una línea heredada de una bolsa ya pagada se rechaza (se pagaría dos veces)'
);

SELECT lives_ok(
  $$ UPDATE orden_labor SET asignado_a = 'a1900000-0000-0000-0000-000000000004' WHERE descripcion = 'Mecánica general' $$,
  'La línea heredada de mecánica (sin pagar) sí se le asigna a Memo'
);

SELECT results_eq(
  $$ SELECT usuario_id, descripcion, monto FROM t_com
     WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b' AND especialidad = 'mecanica' $$,
  $$ VALUES ('a1900000-0000-0000-0000-000000000004'::uuid, 'Mecánica general'::text, 70.00::numeric) $$,
  'Con técnico, la línea deja el reparto heredado y su comisión pasa a Memo'
);

-- La bolsa de pintura ya se pagó: la línea heredada que la formó no se borra, no cambia de
-- especialidad y no sale del reparto (se pagaría dos veces, o lo pagado quedaría sin línea).
SELECT throws_ok(
  $$ DELETE FROM orden_labor WHERE descripcion = 'Pintura general' $$,
  '42501', 'La comisión de este trabajo ya se pagó. Deshaz ese pago en Comisiones antes de quitarlo.',
  'Borrar una línea heredada de una bolsa ya pagada se rechaza'
);

SELECT throws_ok(
  $$ UPDATE orden_labor SET especialidad = 'mecanica' WHERE descripcion = 'Pintura general' $$,
  '42501', 'La comisión de pintura de esta orden ya se pagó con el reparto anterior. Deshaz ese pago en Comisiones antes de cambiarle el técnico o la especialidad a este trabajo.',
  'Cambiarle la especialidad, también'
);

SELECT throws_ok(
  $$ UPDATE orden_labor SET reparto_heredado = false WHERE descripcion = 'Pintura general' $$,
  '42501', NULL,
  'Y sacarla del reparto heredado'
);

-- Y al revés: una línea heredada no entra a una bolsa ya pagada (nadie cobraría su comisión).
SELECT lives_ok(
  $$ INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad)
     SELECT id, 'Faros', 100, 'mecanica' FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b';
     SELECT registrar_autorizacion(
       (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b'),
       ARRAY(SELECT id FROM t_l WHERE descripcion = 'Faros'),
       ARRAY(SELECT id FROM t_l WHERE descripcion = 'Faros'),
       'admin_telefono') $$,
  'Una línea con reparto heredado (la app publicada no manda la columna) se autoriza ya entregada'
);

SELECT throws_ok(
  $$ UPDATE orden_labor SET especialidad = 'pintura' WHERE descripcion = 'Faros' $$,
  '42501', 'La comisión de pintura de esta orden ya se pagó con el reparto anterior: este trabajo no puede entrar a ese reparto. Deshaz ese pago en Comisiones o asígnale un técnico.',
  'Pasarla a la bolsa de pintura, ya pagada, se rechaza'
);

SELECT throws_ok(
  $$ UPDATE orden_labor SET orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000a')
     WHERE descripcion = 'Pulido' $$,
  '42501', 'Un trabajo no se puede mover a otra orden. Quítalo de esta y agrégalo en la otra.',
  'Una línea no se muda a otra orden (la tarea se pagaría en las dos)'
);

-- Quién entra al reparto heredado lo decide administración con el origen de la asignación.
SELECT results_eq(
  $$ SELECT usuario_id, descripcion, monto FROM t_com
     WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b' AND especialidad = 'mecanica'
     ORDER BY usuario_id $$,
  $$ VALUES ('a1900000-0000-0000-0000-000000000002'::uuid, NULL::text, 35.00::numeric),
            ('a1900000-0000-0000-0000-000000000004'::uuid, 'Mecánica general'::text, 70.00::numeric) $$,
  'Los faros entran a la bolsa de mecánica de Mario (asignado a mano)'
);

SELECT lives_ok(
  $$ UPDATE orden_asignaciones SET origen = 'tarea'
     WHERE orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b')
       AND usuario_id = 'a1900000-0000-0000-0000-000000000002' $$,
  'El admin saca a Mario del reparto heredado sin quitarlo de la orden'
);

SELECT results_eq(
  $$ SELECT usuario_id, monto FROM t_com
     WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b' AND especialidad = 'mecanica' $$,
  $$ VALUES ('a1900000-0000-0000-0000-000000000004'::uuid, 70.00::numeric) $$,
  'Su parte de la bolsa se va (nadie más está en ella); la tarea de Memo sigue'
);

RESET ROLE;
SELECT is(
  (SELECT cambios->'reparto' FROM historial_orden
   WHERE entidad = 'asignacion' AND accion = 'cambiar' AND resumen = 'Mario Mecánico' AND cambios ? 'reparto'),
  '{"antes": true, "despues": false}'::jsonb,
  'El historial registra la salida del reparto'
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ UPDATE orden_asignaciones SET origen = 'manual'
     WHERE orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b')
       AND usuario_id = 'a1900000-0000-0000-0000-000000000002' $$,
  'Y lo vuelve a meter'
);

SELECT is(
  (SELECT monto FROM t_com
   WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b' AND especialidad = 'mecanica'
     AND usuario_id = 'a1900000-0000-0000-0000-000000000002'),
  35.00::numeric,
  'Con su parte de la bolsa de vuelta'
);

SELECT throws_ok(
  $$ UPDATE orden_asignaciones SET origen = 'manual'
     WHERE orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b')
       AND usuario_id = 'a1900000-0000-0000-0000-000000000004' $$,
  '42501', 'El reparto de pintura de esta orden ya se pagó: no se cambia quién entra en él. Deshaz ese pago en Comisiones primero.',
  'Meter a Memo a la bolsa de pintura, ya pagada a Paula, se rechaza'
);

-- Borrar a un empleado con tareas sin pagar: las tareas se quedan, sin técnico.
-- La segunda fija la excepción de `trg_guard_labor_tecnico` para el ON DELETE SET NULL: una
-- línea con técnico pero con reparto heredado (la app publicada no manda la columna), aprobada,
-- en la bolsa de pintura que ya se le pagó a Paula. Al borrar a Teo la línea queda sin técnico y
-- con reparto, o sea "entra" a una bolsa pagada; sin la excepción, eso impediría borrar al
-- empleado.
SELECT lives_ok(
  $$ INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a)
     SELECT id, 'Retoque', 60, 'pintura', 'a1900000-0000-0000-0000-000000000006' FROM t_ids
     WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b';
     SELECT registrar_autorizacion(
       (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000b'),
       ARRAY(SELECT id FROM t_l WHERE descripcion = 'Retoque'),
       ARRAY(SELECT id FROM t_l WHERE descripcion = 'Retoque'),
       'admin_telefono') $$,
  'Teo recibe un retoque de pintura con reparto heredado, y se autoriza'
);

SELECT lives_ok(
  $$ SELECT pg_temp.tarea('d1900000-0000-0000-0000-00000000000b', 'Faro roto', 40, 'mecanica', 'a1900000-0000-0000-0000-000000000006') $$,
  'Y una tarea nueva en la orden B, sin autorizar'
);

RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM orden_labor l
    WHERE l.descripcion = 'Retoque' AND l.asignado_a = 'a1900000-0000-0000-0000-000000000006'
      AND l.reparto_heredado AND l.estado = 'aprobado'
      AND EXISTS (SELECT 1 FROM comisiones c
                  WHERE c.orden_id = l.orden_id AND c.especialidad = 'pintura'
                    AND c.labor_id IS NULL AND c.pago_id IS NOT NULL)),
  'El retoque es de Teo, con reparto heredado, aprobado y en una bolsa de pintura ya pagada'
);

SELECT lives_ok(
  $$ DELETE FROM perfiles WHERE id = 'a1900000-0000-0000-0000-000000000006' $$,
  'Borrar al empleado no lo impide su tarea (ni su asignación por tarea, ni que su línea con reparto caiga en una bolsa pagada)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM t_l WHERE descripcion = 'Faro roto' AND asignado_a IS NULL),
  1,
  'Su tarea queda en la orden, sin técnico'
);

SELECT is(
  (SELECT COUNT(*)::int FROM t_l WHERE descripcion = 'Retoque' AND asignado_a IS NULL),
  1,
  'Y el retoque también, sin técnico'
);
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------------------------------
-- 7. Quitar a un técnico con tareas, y borrar la orden
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.orden('d1900000-0000-0000-0000-00000000000c', '[]', '[]');
     SELECT pg_temp.tarea('d1900000-0000-0000-0000-00000000000c', 'Escaneo', 50, 'mecanica', 'a1900000-0000-0000-0000-000000000002') $$,
  'Orden C con una tarea para Mario'
);

SELECT throws_ok(
  $$ DELETE FROM orden_asignaciones
     WHERE orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000c')
       AND usuario_id = 'a1900000-0000-0000-0000-000000000002' $$,
  '42501', 'Mario Mecánico tiene 1 tarea(s) en esta orden. Asígnalas a otra persona antes de quitarlo de la orden.',
  'Quitar de la orden a un técnico con tareas se bloquea'
);

SELECT lives_ok(
  $$ UPDATE orden_labor SET asignado_a = 'a1900000-0000-0000-0000-000000000004' WHERE descripcion = 'Escaneo';
     DELETE FROM orden_asignaciones
     WHERE orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000c')
       AND usuario_id = 'a1900000-0000-0000-0000-000000000002' $$,
  'Reasignada la tarea, ya se le puede quitar'
);

RESET ROLE;
SELECT is(
  (SELECT datos->>'descripcion' FROM notificaciones
   WHERE usuario_id = 'a1900000-0000-0000-0000-000000000002' AND tipo = 'tarea_reasignada'),
  'Escaneo',
  'A quien le quitan la tarea se le avisa con tarea_reasignada'
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ DELETE FROM ordenes_trabajo WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000c' $$,
  'Borrar la orden entera funciona aunque Memo tenga una tarea en ella'
);

SELECT is_empty(
  $$ SELECT 1 FROM t_ids WHERE vehiculo_id = 'd1900000-0000-0000-0000-00000000000c' $$,
  'La orden C ya no existe'
);

-- ------------------------------------------------------------------------------------
-- 8. Ninguna función interna nueva es una RPC
-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.trg_guard_labor_tecnico()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.trg_labor_tecnico_asignado()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.trg_guard_asignacion_con_tareas()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.trg_commissions_on_labor()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.trg_notify_commission()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public._reparto_comisiones(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.comisiones_estimadas(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.marcar_labor_completada(uuid, boolean)', 'EXECUTE'),
  'Los triggers nuevos y el reparto no se llaman por la API; la estimación y marcar piden sesión'
);

SELECT * FROM finish();
ROLLBACK;
