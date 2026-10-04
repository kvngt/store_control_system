-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: el historial de la orden
-- ====================================================================================
-- Qué cubre (migración 20261010000004): cada cambio que alguien decide en una orden deja una
-- fila con quién, desde dónde y el antes → después; un recálculo de totales no deja nada;
-- el historial sobrevive al borrado de la orden; solo un admin lo lee y nadie lo escribe por
-- la API.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(16);

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

-- La vista se crea antes de cambiar de rol: así su dueño es postgres y lee el historial
-- real. Creada después, la leería con la RLS de quien tenga la sesión en cada paso, y con la
-- de la técnica no vería nada.
CREATE TEMP VIEW t_hist AS
  SELECT * FROM historial_orden WHERE sede_id = '10000000-0000-0000-0000-000000000001';
GRANT SELECT ON t_hist TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica', 'millas_ingreso', 0, 'nivel_gasolina', '1/2',
      'deposito_inicial', 200, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-10',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Cambio de luces","costo":100}]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

CREATE TEMP TABLE t_orden AS
  SELECT id, numero_orden FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
GRANT SELECT ON t_orden TO authenticated;

-- ------------------------------------------------------------------------------------
-- 1. Crear la orden deja su rastro
-- ------------------------------------------------------------------------------------
SELECT set_eq(
  $$ SELECT entidad, accion FROM t_hist $$,
  $$ VALUES ('orden'::text, 'crear'::text), ('mano_obra', 'crear'), ('asignacion', 'crear'), ('deposito', 'cambiar') $$,
  'Crear la orden registra la orden, su mano de obra, el técnico y el depósito'
);

SELECT is(
  (SELECT actor_nombre || ' · ' || origen FROM t_hist WHERE entidad = 'orden'),
  'Ana Admin · app',
  'Con quién la creó y desde la app'
);

SELECT is(
  (SELECT resumen FROM t_hist WHERE entidad = 'asignacion'),
  'Rosa Mecánica',
  'La asignación se lee con el nombre del técnico'
);

SELECT is(
  (SELECT cambios -> 'deposito_inicial' FROM t_hist WHERE entidad = 'deposito'),
  '{"antes": 0, "despues": 200}'::jsonb,
  'El depósito con su antes y después'
);

-- ------------------------------------------------------------------------------------
-- 2. Lo que hace la mecánica, con su nombre
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

UPDATE ordenes_trabajo SET estatus = 'en_proceso', fecha_finalizacion = NULL WHERE id = (SELECT id FROM t_orden);
UPDATE ordenes_trabajo SET porcentaje_avance = 40 WHERE id = (SELECT id FROM t_orden);

SELECT is(
  (SELECT cambios -> 'estatus' FROM t_hist WHERE entidad = 'orden' AND accion = 'cambiar' AND cambios ? 'estatus'),
  '{"antes": "recepcion", "despues": "en_proceso"}'::jsonb,
  'Cambiar el estado queda con el antes y el después'
);

SELECT is(
  (SELECT actor_nombre FROM t_hist WHERE entidad = 'orden' AND accion = 'cambiar' AND cambios ? 'porcentaje_avance'),
  'Rosa Mecánica',
  'Mover el avance queda a nombre de quien lo movió'
);

-- Un UPDATE que no cambia nada de lo que se registra no deja fila.
UPDATE ordenes_trabajo SET porcentaje_avance = 40 WHERE id = (SELECT id FROM t_orden);
SELECT is(
  (SELECT COUNT(*)::int FROM t_hist WHERE accion = 'cambiar' AND cambios ? 'porcentaje_avance'),
  1,
  'Guardar el mismo avance otra vez no deja otra fila'
);

-- ------------------------------------------------------------------------------------
-- 3. Un recálculo de totales no es un cambio de nadie
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

CREATE TEMP TABLE t_antes AS SELECT COUNT(*)::int AS n FROM t_hist WHERE entidad = 'orden';
GRANT SELECT ON t_antes TO authenticated;

INSERT INTO orden_labor (orden_id, descripcion, costo) SELECT id, 'Alineación', 80 FROM t_orden;

SELECT is(
  (SELECT COUNT(*)::int FROM t_hist WHERE entidad = 'mano_obra' AND resumen = 'Alineación'),
  1,
  'Agregar una línea deja una fila'
);
SELECT is(
  (SELECT COUNT(*)::int FROM t_hist WHERE entidad = 'orden'),
  (SELECT n FROM t_antes),
  'Y el recálculo de totales que dispara no deja ninguna'
);

-- ------------------------------------------------------------------------------------
-- 4. Quién lo puede leer o escribir
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT is_empty('SELECT 1 FROM historial_orden', 'La mecánica no lee el historial');

SELECT throws_ok(
  $$ INSERT INTO historial_orden (orden_id, origen, entidad, accion) SELECT id, 'app', 'orden', 'crear' FROM t_orden $$,
  '42501', NULL,
  'Ni lo escribe por la API'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT ok((SELECT COUNT(*) FROM historial_orden) > 0, 'El admin sí lo lee');

SELECT throws_ok(
  $$ UPDATE historial_orden SET actor_nombre = 'Otra persona' $$,
  '42501', NULL,
  'Nadie, ni un admin, lo corrige por la API'
);

RESET ROLE;
SELECT ok(
  NOT has_table_privilege('anon', 'historial_orden', 'SELECT')
  AND NOT has_function_privilege('authenticated', 'public.trg_historial()', 'EXECUTE'),
  'Sin sesión no se lee; la función del trigger no es una RPC'
);

-- ------------------------------------------------------------------------------------
-- 5. Sobrevive al borrado de la orden
-- ------------------------------------------------------------------------------------
-- Sin sesión (como el cron): el origen queda como sistema.
RESET request.jwt.claim.role;
RESET request.jwt.claim.sub;
DELETE FROM ordenes_trabajo WHERE id = (SELECT id FROM t_orden);

SELECT is(
  (SELECT origen || ' · ' || numero_orden FROM t_hist WHERE entidad = 'orden' AND accion = 'borrar'),
  'sistema · ' || (SELECT numero_orden FROM t_orden),
  'Borrar la orden queda registrado, con su número y el origen'
);

SELECT is(
  (SELECT COUNT(*)::int FROM t_hist WHERE accion = 'borrar' AND entidad <> 'orden'),
  0,
  'Las hijas que se van en cascada no se registran una por una'
);

SELECT * FROM finish();
ROLLBACK;
