-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: lo que un técnico puede tocar de una orden
-- ====================================================================================
-- Qué cubre (migración 20260922000000): un técnico modifica una orden solo si está
-- asignado y la orden no está entregada, y aun así solo estado, avance y firma;
-- no puede sacar una orden de Entregado; los avances siguen la misma regla; ni un
-- avance ni una asignación cambian de orden; la firma apunta a la carpeta de su
-- orden; los buckets del modelo anterior quedan cerrados.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(23);

-- ------------------------------------------------------------------------------------
-- Datos de prueba: un admin, un mecánico asignado y uno que no lo está
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sede Prueba', 'Calle 1', '555-0100');

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'asignado@prueba.local'),
  ('a0000000-0000-0000-0000-000000000004', 'otro@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '10000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'Luis Asignado', 'mecanico', '10000000-0000-0000-0000-000000000001', 'asignado@prueba.local'),
  ('a0000000-0000-0000-0000-000000000004', 'Otro Técnico', 'mecanico', '10000000-0000-0000-0000-000000000001', 'otro@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta@prueba.local', 'Oak 12'),
  ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Pedro Gil', '555-0141', 'pedro@prueba.local', 'Elm 3');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

-- DO y no SELECT: un SELECT suelto imprime una fila que no es salida TAP.
DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica', 'millas_ingreso', 45000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 100, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Frenos","costo":500}]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

CREATE TEMP VIEW t_orden AS
  SELECT * FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
GRANT SELECT ON t_orden TO authenticated;

-- ------------------------------------------------------------------------------------
-- 1. Técnico NO asignado: consulta, pero no modifica
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';

SELECT isnt_empty('SELECT * FROM t_orden', 'Un técnico no asignado sí ve la orden de su sede');

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Un técnico no asignado no puede cambiar el estado'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 50 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Un técnico no asignado no puede mover el avance'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-1.png', firma_fecha = NOW()
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Un técnico no asignado no puede capturar la firma'
);

SELECT throws_ok(
  $$ INSERT INTO orden_avances (orden_id, usuario_id, descripcion)
     SELECT id, 'a0000000-0000-0000-0000-000000000004', 'Intento' FROM t_orden $$,
  '42501', NULL,
  'Un técnico no asignado no puede agregar avances'
);

-- ------------------------------------------------------------------------------------
-- 2. Técnico asignado: estado, avance y firma, nada más
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso', fecha_finalizacion = NULL
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El técnico asignado cambia el estado'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 40 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El técnico asignado mueve el avance'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-1.png', firma_fecha = NOW()
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El técnico asignado captura la firma en la carpeta de la orden'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/otra-orden/firma.png'
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'La firma no puede apuntar a la carpeta de otra orden'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET cliente_id = 'c0000000-0000-0000-0000-000000000002'
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'El técnico asignado no puede cambiar el cliente de la orden'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET millas_ingreso = 1 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'El técnico asignado no puede cambiar las millas de recepción'
);

SELECT lives_ok(
  $$ INSERT INTO orden_avances (id, orden_id, usuario_id, descripcion)
     SELECT 'e0000000-0000-0000-0000-000000000001', id, 'a0000000-0000-0000-0000-000000000002', 'Pastillas cambiadas'
     FROM t_orden $$,
  'El técnico asignado agrega un avance'
);

SELECT throws_ok(
  $$ UPDATE orden_avances SET orden_id = gen_random_uuid() WHERE id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Un avance no se puede mover a otra orden'
);

SELECT throws_ok(
  $$ UPDATE orden_asignaciones SET usuario_id = 'a0000000-0000-0000-0000-000000000004'
     WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002' $$,
  '42501', NULL,
  'Una asignación no se puede pasar a otra persona'
);

-- ------------------------------------------------------------------------------------
-- 3. Orden entregada: cerrada para el técnico, abierta para el admin
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El admin entrega la orden'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Ni el técnico asignado puede sacar una orden de Entregado (revertiría el cobro y sus comisiones)'
);

RESET ROLE;
SELECT is(
  (SELECT estatus::text FROM t_orden),
  'entregado',
  'La orden sigue entregada tras el intento'
);
SELECT is(
  (SELECT COUNT(*)::int FROM comisiones c JOIN t_orden o ON o.id = c.orden_id),
  1,
  'Y su comisión sigue ahí'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ INSERT INTO orden_avances (orden_id, usuario_id, descripcion)
     SELECT id, 'a0000000-0000-0000-0000-000000000002', 'Después de entregar' FROM t_orden $$,
  '42501', NULL,
  'El técnico no agrega avances a una orden entregada'
);

SELECT is_empty(
  $$ DELETE FROM orden_avances WHERE id = 'e0000000-0000-0000-0000-000000000001' RETURNING id $$,
  'El técnico no borra su avance de una orden entregada (se llevaría sus archivos)'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El admin sí puede sacar una orden de Entregado'
);

-- ------------------------------------------------------------------------------------
-- 4. Buckets del modelo anterior
-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'vehiculos_fotos'),
  false,
  'El bucket viejo de fotos de vehículos ya no es público'
);
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'firmas'),
  false,
  'El bucket viejo de firmas ya no es público'
);

-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
