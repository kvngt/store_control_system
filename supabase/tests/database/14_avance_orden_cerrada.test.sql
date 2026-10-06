-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: el avance de una orden cerrada
-- ====================================================================================
-- Qué cubre (migración 20261010000001): una orden finalizada o entregada está al 100 %,
-- aunque después llegue una escritura del avance. Antes el 100 se ponía solo al cambiar
-- el estatus, y una escritura atrasada de la pantalla dejó una orden Finalizada en 80 % y
-- después en 0 % (reporte del taller, octubre 2026). Reabrirla conserva el 100 y el
-- técnico lo puede bajar.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(22);

-- ------------------------------------------------------------------------------------
-- Datos de prueba: un admin y una mecánica asignada
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sede Prueba', 'Calle 1', '555-0100');

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'mecanica@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '10000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'Rosa Mecánica', 'mecanico', '10000000-0000-0000-0000-000000000001', 'mecanica@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta@prueba.local', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Chevrolet', 'Impala', 2017, '2G1105S30H9197870', NULL, 'Negro');

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
      'tipo_trabajo', 'mecanica', 'millas_ingreso', 0, 'nivel_gasolina', '1/2',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-10',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Cambio de luces","costo":100}]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

-- La vista corre como su dueño: se lee el avance real, sin depender de la RLS de quien
-- tenga la sesión en cada paso.
CREATE TEMP VIEW t_orden AS
  SELECT * FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
GRANT SELECT ON t_orden TO authenticated;

-- ------------------------------------------------------------------------------------
-- 1. La mecánica trabaja la orden y la finaliza
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso', fecha_finalizacion = NULL
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'La mecánica asignada pone la orden en proceso'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 80 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Mueve el avance a 80'
);
SELECT is((SELECT porcentaje_avance FROM t_orden), 80, 'En proceso el avance es el que ella eligió');

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado', fecha_finalizacion = NOW()
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'La finaliza'
);
SELECT is((SELECT porcentaje_avance FROM t_orden), 100, 'Finalizar pone el avance en 100');

-- ------------------------------------------------------------------------------------
-- 2. Lo reportado: una escritura del avance que llega después de finalizar
-- ------------------------------------------------------------------------------------
-- No es un error: puede ser una escritura atrasada de la propia pantalla.
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 80 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Un 80 que llega después de finalizar no es un error'
);
SELECT is((SELECT porcentaje_avance FROM t_orden), 100, 'Pero no deja la orden finalizada en 80 %');

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 0 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Tampoco un 0'
);
SELECT is((SELECT porcentaje_avance FROM t_orden), 100, 'Ni en 0 %');

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado', porcentaje_avance = 40
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Ni un UPDATE que mande estatus y avance juntos'
);
SELECT is((SELECT porcentaje_avance FROM t_orden), 100, 'Finalizada sigue en 100');

-- ------------------------------------------------------------------------------------
-- 3. Reabrir conserva el 100, y el avance vuelve a ser de quien trabaja la orden
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso', fecha_finalizacion = NULL
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'La mecánica NO reabre la orden (desde el 05/10/2026 solo administración)'
);
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso', fecha_finalizacion = NULL
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Administración reabre la orden'
);
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT is((SELECT porcentaje_avance FROM t_orden), 100, 'Reabierta conserva el 100');

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 30 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Y lo puede bajar'
);
SELECT is((SELECT porcentaje_avance FROM t_orden), 30, 'Reabierta, el avance es el que ella elige');

-- ------------------------------------------------------------------------------------
-- 4. Tampoco administración deja una orden cerrada por debajo de 100
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado', fecha_finalizacion = NOW()
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El admin la finaliza'
);
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 10 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Y después escribe un avance de 10'
);
SELECT is((SELECT porcentaje_avance FROM t_orden), 100, 'Finalizada sigue en 100 aunque lo mande un admin');

-- La red de entrega (UPDATE directo); la pantalla usa `entregar_orden`, que también pone 100.
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El admin la entrega'
);
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 0 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Y después escribe un avance de 0'
);
SELECT is((SELECT porcentaje_avance FROM t_orden), 100, 'Entregada sigue en 100');

SELECT * FROM finish();
ROLLBACK;
