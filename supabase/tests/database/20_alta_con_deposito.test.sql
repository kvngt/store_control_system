-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: el alta con depósito con método y tareas con técnico
-- ====================================================================================
-- Qué cubre (migración 20261010000007): el movimiento "Depósito inicial" lleva el método, el
-- número de cheque y el comprobante que manda el alta; el cheque y el comprobante son
-- opcionales; un número de cheque en otro método se descarta; un método inválido, un
-- comprobante sin método o uno en la carpeta de otra sede se rechazan; la configuración de la
-- transacción no se queda puesta ni se aplica a otra orden; un ajuste posterior del depósito
-- (o un depósito puesto después) queda sin método; las líneas del alta con técnico nacen fuera
-- del reparto y meten al técnico en la orden con origen 'tarea', una sola vez y sin una fila
-- 'manual' aunque venga en las asignaciones; el técnico tiene que ser de la sede; una llamada
-- como la de la app anterior (sin claves nuevas) da lo mismo que antes; un técnico sigue sin
-- poder abrir órdenes.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(25);

-- ------------------------------------------------------------------------------------
-- Datos: dos sedes; un admin, un mecánico, una pintora y otro mecánico en la sede, y un
-- mecánico de la otra sede
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, comision_porcentaje) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Sede Alta', 'Calle 20', '555-2020', 35),
  ('20000000-0000-0000-0000-000000000002', 'Sede Otra', 'Calle 21', '555-2121', 35);

INSERT INTO auth.users (id, email) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'admin20@prueba.local'),
  ('a2000000-0000-0000-0000-000000000002', 'mario20@prueba.local'),
  ('a2000000-0000-0000-0000-000000000003', 'paula20@prueba.local'),
  ('a2000000-0000-0000-0000-000000000004', 'memo20@prueba.local'),
  ('a2000000-0000-0000-0000-000000000005', 'lejano20@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '20000000-0000-0000-0000-000000000001', 'admin20@prueba.local'),
  ('a2000000-0000-0000-0000-000000000002', 'Mario Mecánico', 'mecanico', '20000000-0000-0000-0000-000000000001', 'mario20@prueba.local'),
  ('a2000000-0000-0000-0000-000000000003', 'Paula Pintora', 'pintor', '20000000-0000-0000-0000-000000000001', 'paula20@prueba.local'),
  ('a2000000-0000-0000-0000-000000000004', 'Memo Mecánico', 'mecanico', '20000000-0000-0000-0000-000000000001', 'memo20@prueba.local'),
  ('a2000000-0000-0000-0000-000000000005', 'Lalo Lejano', 'mecanico', '20000000-0000-0000-0000-000000000002', 'lejano20@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c2000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Rosa Díaz', '+15550200', '', 'Elm 20');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d2000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A020001', NULL, 'Gris'),
  ('d2000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H020002', NULL, 'Azul'),
  ('d2000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-000000000001', 'Ford', 'F-150', 2018, '1FTEW1EG0JF020003', NULL, 'Negro'),
  ('d2000000-0000-0000-0000-00000000000d', 'c2000000-0000-0000-0000-000000000001', 'Nissan', 'Versa', 2017, '3N1CN7AP0HL020004', NULL, 'Rojo'),
  ('d2000000-0000-0000-0000-00000000000e', 'c2000000-0000-0000-0000-000000000001', 'Mazda', '3', 2020, 'JM1BPACL0L1020005', NULL, 'Blanco'),
  ('d2000000-0000-0000-0000-00000000000f', 'c2000000-0000-0000-0000-000000000001', 'Kia', 'Rio', 2021, 'KNADM4A30M6020006', NULL, 'Verde');

-- El alta, con las claves de siempre más `p_extra` (las nuevas del depósito).
CREATE FUNCTION pg_temp.alta(p_vehiculo UUID, p_deposito NUMERIC, p_extra JSONB, p_labor JSONB, p_equipo JSONB)
RETURNS VOID LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '20000000-0000-0000-0000-000000000001',
      'cliente_id', 'c2000000-0000-0000-0000-000000000001',
      'vehiculo_id', p_vehiculo,
      'tipo_trabajo', 'combinado', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
      'deposito_inicial', p_deposito, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-20',
      'creado_por', 'a2000000-0000-0000-0000-000000000001') || p_extra,
    p_labor, '[]'::jsonb, p_equipo);
END $f$;

CREATE TEMP VIEW t_ids AS
  SELECT vehiculo_id, id FROM ordenes_trabajo WHERE sede_id = '20000000-0000-0000-0000-000000000001';
CREATE TEMP VIEW t_mov AS
  SELECT o.vehiculo_id, f.tipo::text AS tipo, f.monto, f.descripcion, f.metodo_pago, f.numero_cheque, f.comprobante_ruta
  FROM finanzas_movimientos f JOIN ordenes_trabajo o ON o.id = f.referencia_orden_id
  WHERE f.categoria = 'pago_cliente';
CREATE TEMP VIEW t_lab AS
  SELECT o.vehiculo_id, l.descripcion, l.especialidad, l.asignado_a, l.reparto_heredado
  FROM orden_labor l JOIN ordenes_trabajo o ON o.id = l.orden_id;
CREATE TEMP VIEW t_asig AS
  SELECT o.vehiculo_id, a.usuario_id, a.tipo_tarea, a.origen
  FROM orden_asignaciones a JOIN ordenes_trabajo o ON o.id = a.orden_id;
GRANT SELECT ON t_ids, t_mov, t_lab, t_asig TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 1. El depósito inicial lleva su método
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000a', 300,
       '{"deposito_metodo":"cheque","deposito_numero_cheque":" 1234 ","deposito_comprobante_ruta":"20000000-0000-0000-0000-000000000001/deposito-a.jpg"}',
       '[]', '[]') $$,
  'El admin abre la orden A con un depósito en cheque, con número y foto'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT tipo, monto, descripcion LIKE 'Depósito inicial - %', metodo_pago, numero_cheque, comprobante_ruta
     FROM t_mov WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000a' $$,
  $$ VALUES ('ingreso'::text, 300::numeric, true, 'cheque'::text, '1234'::text,
             '20000000-0000-0000-0000-000000000001/deposito-a.jpg'::text) $$,
  'El movimiento "Depósito inicial" lleva el método, el número de cheque y el comprobante'
);

SELECT is(
  COALESCE(current_setting('restorify.deposito', true), ''),
  '',
  'Y la configuración de la transacción no se queda puesta'
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000b', 150,
       '{"deposito_metodo":"transferencia","deposito_comprobante_ruta":"20000000-0000-0000-0000-000000000001/deposito-b.png"}',
       '[]', '[]');
     SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000c', 80,
       '{"deposito_metodo":"efectivo","deposito_numero_cheque":"999"}', '[]', '[]') $$,
  'Una transferencia sin número y un efectivo con un número de cheque de sobra'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT vehiculo_id::text, metodo_pago, numero_cheque, comprobante_ruta FROM t_mov
     WHERE vehiculo_id IN ('d2000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000c')
     ORDER BY vehiculo_id $$,
  $$ VALUES ('d2000000-0000-0000-0000-00000000000b'::text, 'transferencia'::text, NULL::text,
             '20000000-0000-0000-0000-000000000001/deposito-b.png'::text),
            ('d2000000-0000-0000-0000-00000000000c', 'efectivo', NULL, NULL) $$,
  'El número de cheque y el comprobante son opcionales, y el número solo se guarda en un cheque'
);
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------------------------------
-- 2. Lo que se rechaza
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000d', 100, '{"deposito_metodo":"tarjeta"}', '[]', '[]') $$,
  '22023',
  'Elige cómo dejó el depósito el cliente: efectivo, cheque o transferencia.',
  'Un método que no es efectivo, cheque ni transferencia se rechaza'
);

SELECT throws_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000d', 100,
       '{"deposito_comprobante_ruta":"20000000-0000-0000-0000-000000000001/x.jpg"}', '[]', '[]') $$,
  '22023',
  'Elige cómo dejó el depósito el cliente: efectivo, cheque o transferencia.',
  'Un comprobante sin método se rechaza'
);

SELECT throws_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000d', 100,
       '{"deposito_metodo":"transferencia","deposito_comprobante_ruta":"20000000-0000-0000-0000-000000000002/ajeno.jpg"}',
       '[]', '[]') $$,
  '42501',
  'El comprobante debe guardarse en la carpeta de la sede de la orden.',
  'Un comprobante en la carpeta de otra sede da 42501'
);

SELECT is(
  (SELECT COUNT(*)::int FROM t_ids WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000d'),
  0,
  'Y ninguno de los rechazos deja una orden a medias'
);

-- ------------------------------------------------------------------------------------
-- 3. Los ajustes posteriores siguen sin método
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ UPDATE orden_montos SET deposito_inicial = 350
     WHERE orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000a') $$,
  'El admin sube el depósito de A'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT tipo, monto, metodo_pago, numero_cheque, comprobante_ruta FROM t_mov
     WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000a' AND descripcion LIKE 'Ajuste de depósito%' $$,
  $$ VALUES ('ingreso'::text, 50::numeric, NULL::text, NULL::text, NULL::text) $$,
  'El ajuste se asienta sin heredar el método del depósito inicial'
);
SET LOCAL ROLE authenticated;

-- Una orden con depósito en cero (el método que traiga se ignora) recibe después su primer
-- depósito, con datos de OTRA orden en la configuración: no se los lleva.
SELECT lives_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000d', 0, '{"deposito_metodo":"cheque"}', '[]', '[]') $$,
  'Una orden sin depósito se abre aunque traiga un método'
);

SELECT lives_ok(
  $$ SELECT set_config('restorify.deposito',
       jsonb_build_object('orden_id', (SELECT id FROM t_ids WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000a'),
                          'metodo', 'cheque', 'numero_cheque', '777')::text, true);
     UPDATE orden_montos SET deposito_inicial = 120
     WHERE orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000d') $$,
  'El admin le pone depósito después, con la configuración apuntando a otra orden'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT monto, descripcion LIKE 'Depósito inicial - %', metodo_pago, numero_cheque FROM t_mov
     WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000d' $$,
  $$ VALUES (120::numeric, true, NULL::text, NULL::text) $$,
  'Ese depósito queda sin método: los datos de otra orden no se aplican'
);
SELECT lives_ok($$ SELECT set_config('restorify.deposito', '', true) $$, 'Se limpia la configuración de la prueba');
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------------------------------
-- 4. Tareas con técnico desde el alta
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000e', 0, '{}',
       '[{"descripcion":"Frenos","costo":200,"especialidad":"mecanica","asignado_a":"a2000000-0000-0000-0000-000000000002","reparto_heredado":false},
         {"descripcion":"Aceite","costo":100,"especialidad":"mecanica","asignado_a":"a2000000-0000-0000-0000-000000000002"},
         {"descripcion":"Puerta","costo":300,"especialidad":"pintura","asignado_a":"a2000000-0000-0000-0000-000000000003","reparto_heredado":false},
         {"descripcion":"Alineación","costo":80,"especialidad":"mecanica","asignado_a":null,"reparto_heredado":false}]',
       '[{"usuario_id":"a2000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
         {"usuario_id":"a2000000-0000-0000-0000-000000000004","tipo_tarea":"mecanica"},
         {"usuario_id":"a2000000-0000-0000-0000-000000000004","tipo_tarea":"mecanica"}]') $$,
  'El admin abre la orden E con tareas: dos de Mario, una de Paula y una sin técnico'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT descripcion, especialidad, asignado_a, reparto_heredado FROM t_lab
     WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000e' ORDER BY descripcion $$,
  $$ VALUES ('Aceite'::text, 'mecanica'::text, 'a2000000-0000-0000-0000-000000000002'::uuid, false),
            ('Alineación', 'mecanica', NULL, false),
            ('Frenos', 'mecanica', 'a2000000-0000-0000-0000-000000000002', false),
            ('Puerta', 'pintura', 'a2000000-0000-0000-0000-000000000003', false) $$,
  'Las líneas nacen con su técnico y fuera del reparto (también la que no dijo reparto_heredado)'
);

SELECT results_eq(
  $$ SELECT usuario_id, tipo_tarea, origen FROM t_asig
     WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000e' ORDER BY usuario_id $$,
  $$ VALUES ('a2000000-0000-0000-0000-000000000002'::uuid, 'mecanica'::text, 'tarea'::text),
            ('a2000000-0000-0000-0000-000000000003', 'pintura', 'tarea'),
            ('a2000000-0000-0000-0000-000000000004', 'mecanica', 'manual') $$,
  'Los técnicos de las tareas entran una vez con origen tarea (sin fila manual aunque vengan en las asignaciones); quien no tiene tareas entra manual, una sola vez'
);

SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones n
   WHERE n.usuario_id = 'a2000000-0000-0000-0000-000000000002' AND n.tipo = 'tarea_asignada'
     AND n.orden_id = (SELECT id FROM t_ids WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000e')),
  2,
  'A Mario se le avisa cada tarea (tarea_asignada)'
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000f', 0, '{}',
       '[{"descripcion":"Frenos","costo":200,"especialidad":"mecanica","asignado_a":"a2000000-0000-0000-0000-000000000005","reparto_heredado":false}]',
       '[]') $$,
  '42501',
  'Una tarea solo se puede asignar a un mecánico o pintor de la sede de la orden.',
  'Una tarea del alta para un mecánico de otra sede se rechaza'
);

SELECT throws_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000f', 0, '{}',
       '[{"descripcion":"Revisión","costo":50,"especialidad":"mecanica","asignado_a":"a2000000-0000-0000-0000-000000000001","reparto_heredado":false}]',
       '[]') $$,
  '42501',
  'Una tarea solo se puede asignar a un mecánico o pintor de la sede de la orden.',
  'Y para un admin, también'
);

-- ------------------------------------------------------------------------------------
-- 5. La llamada de la app anterior (sin claves nuevas) da lo mismo que antes
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT pg_temp.alta('d2000000-0000-0000-0000-00000000000f', 200, '{}',
       '[{"descripcion":"Mano de obra","costo":500}]',
       '[{"usuario_id":"a2000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]') $$,
  'El admin abre la orden F como la app anterior'
);

RESET ROLE;
SELECT results_eq(
  $$ SELECT tipo, monto, descripcion LIKE 'Depósito inicial - %', metodo_pago, numero_cheque, comprobante_ruta
     FROM t_mov WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000f' $$,
  $$ VALUES ('ingreso'::text, 200::numeric, true, NULL::text, NULL::text, NULL::text) $$,
  'Su depósito se asienta como siempre, sin método'
);

SELECT results_eq(
  $$ SELECT l.descripcion, l.especialidad, l.asignado_a, l.reparto_heredado, a.usuario_id, a.origen
     FROM t_lab l JOIN t_asig a USING (vehiculo_id)
     WHERE vehiculo_id = 'd2000000-0000-0000-0000-00000000000f' $$,
  $$ VALUES ('Mano de obra'::text, 'mecanica'::text, NULL::uuid, true,
             'a2000000-0000-0000-0000-000000000002'::uuid, 'manual'::text) $$,
  'Su línea nace sin técnico y con el reparto heredado, y el asignado entra manual'
);
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------------------------------
-- 6. Un técnico sigue sin poder abrir órdenes
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$ SELECT create_work_order(
       jsonb_build_object(
         'sede_id', '20000000-0000-0000-0000-000000000001',
         'cliente_id', 'c2000000-0000-0000-0000-000000000001',
         'vehiculo_id', 'd2000000-0000-0000-0000-00000000000d',
         'tipo_trabajo', 'mecanica', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
         'deposito_inicial', 100, 'deposito_metodo', 'efectivo', 'inspeccion_360_notas', '',
         'fecha_estimada_entrega', '2026-10-20', 'creado_por', 'a2000000-0000-0000-0000-000000000002'),
       '[{"descripcion":"Extra","costo":100,"asignado_a":"a2000000-0000-0000-0000-000000000002","reparto_heredado":false}]',
       '[]', '[]') $$,
  '42501',
  NULL,
  'Un mecánico no abre una orden, aunque traiga depósito con método y una tarea para él'
);

SELECT * FROM finish();
ROLLBACK;
