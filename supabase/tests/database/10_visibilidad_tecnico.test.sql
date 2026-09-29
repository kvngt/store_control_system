-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: un técnico ve solo sus órdenes
-- ====================================================================================
-- Qué cubre (migración 20261007000000): un técnico lee solo las órdenes que tiene asignadas
-- y lo que cuelga de ellas (mano de obra, avances, archivos, asignaciones, repuestos sin
-- precio, cliente y vehículo); no ve las de sus compañeros aunque sean de su sede; no crea ni
-- edita clientes ni vehículos; su panel cuenta sus órdenes. Un admin sigue viendo todo.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(26);

-- ------------------------------------------------------------------------------------
-- Datos: una sede, un admin, dos mecánicos y una pintora. La orden 1 es de Luis y Rosa; la
-- orden 2, de Otto. Cada una con su cliente y su vehículo.
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('1a000000-0000-0000-0000-000000000001', 'Sede Visibilidad', 'Calle 10', '555-1000'),
  ('1a000000-0000-0000-0000-000000000002', 'Sede Otra', 'Calle 11', '555-1100');

INSERT INTO auth.users (id, email) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'admin10@prueba.local'),
  ('aa000000-0000-0000-0000-000000000002', 'luis10@prueba.local'),
  ('aa000000-0000-0000-0000-000000000003', 'rosa10@prueba.local'),
  ('aa000000-0000-0000-0000-000000000004', 'otto10@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '1a000000-0000-0000-0000-000000000001', 'admin10@prueba.local'),
  ('aa000000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '1a000000-0000-0000-0000-000000000001', 'luis10@prueba.local'),
  ('aa000000-0000-0000-0000-000000000003', 'Rosa Pintora', 'pintor', '1a000000-0000-0000-0000-000000000001', 'rosa10@prueba.local'),
  ('aa000000-0000-0000-0000-000000000004', 'Otto Mecánico', 'mecanico', '1a000000-0000-0000-0000-000000000001', 'otto10@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('ca000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'Marta Ruiz', '+15550140', '', 'Oak 12'),
  ('ca000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000001', 'Pedro Gil', '+15550141', '', 'Elm 3');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('da000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris'),
  ('da000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000002', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000001';

-- DO y no SELECT: un SELECT suelto imprime una fila que no es salida TAP.
DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '1a000000-0000-0000-0000-000000000001',
      'cliente_id', 'ca000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'da000000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'combinado', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'aa000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Frenos","costo":300}]'::jsonb,
    '[{"descripcion":"Pastillas","cantidad":2,"precio_venta_unitario":50}]'::jsonb,
    '[{"usuario_id":"aa000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"},
      {"usuario_id":"aa000000-0000-0000-0000-000000000003","tipo_tarea":"pintura"}]'::jsonb
  );
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '1a000000-0000-0000-0000-000000000001',
      'cliente_id', 'ca000000-0000-0000-0000-000000000002',
      'vehiculo_id', 'da000000-0000-0000-0000-000000000002',
      'tipo_trabajo', 'mecanica', 'millas_ingreso', 2000, 'nivel_gasolina', '1/4',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'aa000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Suspensión","costo":800}]'::jsonb,
    '[{"descripcion":"Amortiguadores","cantidad":2,"precio_venta_unitario":120}]'::jsonb,
    '[{"usuario_id":"aa000000-0000-0000-0000-000000000004","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

RESET ROLE;

-- Vistas del dueño (postgres): ven todo, así cada prueba nombra las órdenes sin depender de
-- quién esté mirando.
CREATE TEMP VIEW t_o1 AS SELECT id, sede_id FROM ordenes_trabajo WHERE vehiculo_id = 'da000000-0000-0000-0000-000000000001';
CREATE TEMP VIEW t_o2 AS SELECT id, sede_id FROM ordenes_trabajo WHERE vehiculo_id = 'da000000-0000-0000-0000-000000000002';
GRANT SELECT ON t_o1, t_o2 TO authenticated;

-- Un avance, una foto y su archivo en Storage en cada orden, y un presupuesto esperando al
-- cliente en la de Otto.
INSERT INTO orden_avances (orden_id, usuario_id, descripcion)
SELECT id, 'aa000000-0000-0000-0000-000000000002'::uuid, 'Avance de la orden 1' FROM t_o1
UNION ALL
SELECT id, 'aa000000-0000-0000-0000-000000000004'::uuid, 'Avance de la orden 2' FROM t_o2;

INSERT INTO orden_media (orden_id, tipo, origen, ruta, mime, bytes, subido_por)
SELECT id, 'foto', 'recepcion', sede_id || '/' || id || '/foto.jpg', 'image/jpeg', 1000, 'aa000000-0000-0000-0000-000000000001'::uuid FROM t_o1
UNION ALL
SELECT id, 'foto', 'recepcion', sede_id || '/' || id || '/foto.jpg', 'image/jpeg', 1000, 'aa000000-0000-0000-0000-000000000001'::uuid FROM t_o2;

INSERT INTO storage.objects (bucket_id, name)
SELECT 'orden_media', sede_id || '/' || id || '/foto.jpg' FROM t_o1
UNION ALL
SELECT 'orden_media', sede_id || '/' || id || '/foto.jpg' FROM t_o2;

INSERT INTO presupuestos (orden_id, sede_id, numero)
SELECT id, sede_id, 1 FROM t_o2;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';

-- ------------------------------------------------------------------------------------
-- 1. Luis, asignado a la orden 1
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000002';

SELECT results_eq(
  'SELECT id FROM ordenes_trabajo',
  'SELECT id FROM t_o1',
  'Un técnico ve su orden y ninguna otra de la sede'
);

SELECT is_empty(
  'SELECT 1 FROM ordenes_trabajo WHERE id = (SELECT id FROM t_o2)',
  'No ve la orden de un compañero aunque la pida por su id'
);

SELECT isnt_empty(
  'SELECT 1 FROM orden_labor WHERE orden_id = (SELECT id FROM t_o1)',
  'Ve la mano de obra de su orden'
);

SELECT is_empty(
  'SELECT 1 FROM orden_labor WHERE orden_id = (SELECT id FROM t_o2)',
  'No ve la mano de obra de la orden ajena'
);

SELECT is_empty(
  'SELECT 1 FROM orden_avances WHERE orden_id = (SELECT id FROM t_o2)',
  'Ni sus avances'
);

SELECT is_empty(
  'SELECT 1 FROM orden_media WHERE orden_id = (SELECT id FROM t_o2)',
  'Ni sus fotos'
);

SELECT results_eq(
  $$ SELECT name FROM storage.objects WHERE bucket_id = 'orden_media' $$,
  $$ SELECT sede_id || '/' || id || '/foto.jpg' FROM t_o1 $$,
  'En Storage solo alcanza los archivos de su orden: la ruta de una ajena no se puede pedir'
);

-- La tarjeta de técnicos y la comisión estimada (mano de obra ÷ asignados) necesitan al equipo.
SELECT is(
  (SELECT COUNT(*)::int FROM orden_asignaciones WHERE orden_id = (SELECT id FROM t_o1)),
  2,
  'Ve a su compañera de la misma orden'
);

SELECT is_empty(
  'SELECT 1 FROM orden_asignaciones WHERE orden_id = (SELECT id FROM t_o2)',
  'No ve quién trabaja la orden ajena'
);

SELECT results_eq(
  'SELECT id FROM clientes',
  $$ VALUES ('ca000000-0000-0000-0000-000000000001'::uuid) $$,
  'Ve el cliente de su orden y ningún otro'
);

SELECT results_eq(
  'SELECT id FROM vehiculos',
  $$ VALUES ('da000000-0000-0000-0000-000000000001'::uuid) $$,
  'Ve el vehículo de su orden y ningún otro'
);

SELECT isnt_empty(
  'SELECT * FROM repuestos_de_orden((SELECT id FROM t_o1))',
  'Las piezas de su orden, sin precio, le llegan por la RPC'
);

SELECT is_empty(
  'SELECT * FROM repuestos_de_orden((SELECT id FROM t_o2))',
  'La RPC no le enseña las piezas de una orden ajena'
);

SELECT is_empty(
  'SELECT * FROM ordenes_esperando_autorizacion()',
  'El aviso de presupuesto pendiente de la orden ajena no le llega'
);

SELECT is(
  mis_ordenes_asignadas(),
  ARRAY[(SELECT id FROM t_o1)],
  'mis_ordenes_asignadas() es la orden en la que está'
);

SELECT is(
  (resumen_panel('1a000000-0000-0000-0000-000000000001', '2026-09-28', 'America/Chicago')->>'ordenes_activas')::int,
  1,
  'Su panel cuenta sus órdenes, no las del taller'
);

SELECT isnt_empty(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 10 WHERE id = (SELECT id FROM t_o1) RETURNING id $$,
  'Sigue moviendo el avance de su orden'
);

-- ------------------------------------------------------------------------------------
-- 2. Clientes y vehículos: solo administración los crea y los edita
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO clientes (sede_id, nombre, telefono, email, direccion)
     VALUES ('1a000000-0000-0000-0000-000000000001', 'Cliente del técnico', '+15550199', '', 'Calle') $$,
  '42501', NULL,
  'Un técnico no da de alta un cliente'
);

SELECT is_empty(
  $$ UPDATE clientes SET telefono = '+15550000' WHERE id = 'ca000000-0000-0000-0000-000000000001' RETURNING id $$,
  'Ni edita el cliente de su propia orden'
);

SELECT throws_ok(
  $$ INSERT INTO vehiculos (cliente_id, marca, modelo, anio, vin, color)
     VALUES ('ca000000-0000-0000-0000-000000000001', 'Ford', 'F-150', 2018, '1FTEW1EG0JF000001', 'Negro') $$,
  '42501', NULL,
  'Un técnico no da de alta un vehículo'
);

SELECT is_empty(
  $$ UPDATE vehiculos SET color = 'Rojo' WHERE id = 'da000000-0000-0000-0000-000000000001' RETURNING id $$,
  'Ni edita el vehículo de su propia orden'
);

-- ------------------------------------------------------------------------------------
-- 3. Administración ve todo
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT COUNT(*)::int FROM ordenes_trabajo WHERE sede_id = '1a000000-0000-0000-0000-000000000001'),
  2,
  'Un admin ve las dos órdenes'
);

SELECT is(
  (SELECT COUNT(*)::int FROM clientes WHERE sede_id = '1a000000-0000-0000-0000-000000000001'),
  2,
  'Y los dos clientes'
);

SELECT isnt_empty(
  'SELECT * FROM ordenes_esperando_autorizacion()',
  'Y el presupuesto que espera al cliente'
);

-- ------------------------------------------------------------------------------------
-- 4. Cambiar de sede se lleva la visibilidad, igual que ya pasaba con la escritura
-- ------------------------------------------------------------------------------------
RESET ROLE;
UPDATE perfiles SET sede_id = '1a000000-0000-0000-0000-000000000002'
WHERE id = 'aa000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'aa000000-0000-0000-0000-000000000002';

SELECT is_empty(
  'SELECT 1 FROM ordenes_trabajo',
  'Un técnico que pasó a otra sede deja de ver las órdenes de la anterior'
);

RESET ROLE;

SELECT ok(
  NOT has_function_privilege('anon', 'public.mis_ordenes_asignadas()', 'EXECUTE'),
  'Sin sesión no se llama mis_ordenes_asignadas()'
);

SELECT * FROM finish();
ROLLBACK;
