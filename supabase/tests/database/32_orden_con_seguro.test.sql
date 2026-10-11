-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: trabajo con seguro en la orden (20261010000027)
-- ====================================================================================
-- Qué cubre:
-- 1. Una orden nueva nace con con_seguro = false (por defecto).
-- 2. create_work_order guarda con_seguro, aseguradora y numero_reclamo.
-- 3. El CHECK ordenes_trabajo_seguro_datos_check rechaza aseguradora o numero_reclamo
--    si con_seguro es false.
-- 4. Un técnico asignado no puede modificar con_seguro (42501).
-- 5. trg_historial registra los cambios a con_seguro, aseguradora y numero_reclamo.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(8);

-- ------------------------------------------------------------------------------------
-- Datos base: sede, admin, mecánico, cliente y vehículo
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('32000000-0000-0000-0000-000000000001', 'Sede Seguro QA', 'Calle 32', '555-3200');

INSERT INTO auth.users (id, email) VALUES
  ('32a00000-0000-0000-0000-000000000001', 'admin32@prueba.local'),
  ('32b00000-0000-0000-0000-000000000002', 'mecanico32@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('32a00000-0000-0000-0000-000000000001', 'Admin Seguro', 'admin', '32000000-0000-0000-0000-000000000001', 'admin32@prueba.local'),
  ('32b00000-0000-0000-0000-000000000002', 'Mecanico Seguro', 'mecanico', '32000000-0000-0000-0000-000000000001', 'mecanico32@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('32c00000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'Cliente Seguro', '+15553201', 'cli32@prueba.local', 'Ave 32');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('32d00000-0000-0000-0000-000000000001', '32c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2020, '1HGCR2F83HA003201', 'INS-32', 'Negro');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '32a00000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 1. Orden sin seguro por defecto vía create_work_order
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_res ordenes_trabajo;
BEGIN
  v_res := create_work_order(
    jsonb_build_object(
      'sede_id', '32000000-0000-0000-0000-000000000001',
      'cliente_id', '32c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '32d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 50000,
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-10-20',
      'creado_por', '32a00000-0000-0000-0000-000000000001'
    ),
    '[{"descripcion":"Alineacion","costo":100}]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('usuario_id', '32b00000-0000-0000-0000-000000000002', 'tipo_tarea', 'mecanica')
    )
  );
  PERFORM set_config('test.orden_particular_id', v_res.id::text, true);
END $$;

SELECT is(
  (SELECT con_seguro FROM ordenes_trabajo WHERE id = current_setting('test.orden_particular_id')::uuid),
  false,
  'create_work_order sin con_seguro nace con con_seguro = false'
);

SELECT is(
  (SELECT aseguradora FROM ordenes_trabajo WHERE id = current_setting('test.orden_particular_id')::uuid),
  NULL,
  'orden sin seguro tiene aseguradora = NULL'
);

-- ------------------------------------------------------------------------------------
-- 2. create_work_order con seguro, aseguradora y numero_reclamo
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_res ordenes_trabajo;
BEGIN
  v_res := create_work_order(
    jsonb_build_object(
      'sede_id', '32000000-0000-0000-0000-000000000001',
      'cliente_id', '32c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '32d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 50000,
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-10-25',
      'creado_por', '32a00000-0000-0000-0000-000000000001',
      'con_seguro', true,
      'aseguradora', 'State Farm',
      'numero_reclamo', 'CLM-987654'
    ),
    '[{"descripcion":"Suspension","costo":400}]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('usuario_id', '32b00000-0000-0000-0000-000000000002', 'tipo_tarea', 'mecanica')
    )
  );
  PERFORM set_config('test.orden_seguro_id', v_res.id::text, true);
END $$;

SELECT row_eq(
  $$ SELECT con_seguro, aseguradora, numero_reclamo FROM ordenes_trabajo WHERE id = current_setting('test.orden_seguro_id')::uuid $$,
  ROW(true, 'State Farm'::text, 'CLM-987654'::text),
  'create_work_order guarda con_seguro = true, aseguradora y numero_reclamo'
);

-- ------------------------------------------------------------------------------------
-- 3. CHECK ordenes_trabajo_seguro_datos_check
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo
     SET con_seguro = false, aseguradora = 'Geico'
     WHERE id = current_setting('test.orden_seguro_id')::uuid $$,
  '23514',
  NULL,
  'CHECK rechaza aseguradora cuando con_seguro es false'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo
     SET con_seguro = false, aseguradora = NULL, numero_reclamo = 'REC-123'
     WHERE id = current_setting('test.orden_seguro_id')::uuid $$,
  '23514',
  NULL,
  'CHECK rechaza numero_reclamo cuando con_seguro es false'
);

-- ------------------------------------------------------------------------------------
-- 4. Un técnico asignado no puede cambiar con_seguro (42501)
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '32b00000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo
     SET con_seguro = true, aseguradora = 'Allstate', numero_reclamo = 'ALL-1'
     WHERE id = current_setting('test.orden_particular_id')::uuid $$,
  '42501',
  NULL,
  'Tecnico asignado no puede cambiar con_seguro (rechazado con 42501)'
);

-- ------------------------------------------------------------------------------------
-- 5. trg_historial audita los cambios a con_seguro, aseguradora y numero_reclamo
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '32a00000-0000-0000-0000-000000000001';

UPDATE ordenes_trabajo
SET con_seguro = true, aseguradora = 'Progressive', numero_reclamo = 'PROG-777'
WHERE id = current_setting('test.orden_particular_id')::uuid;

SELECT ok(
  EXISTS (
    SELECT 1 FROM historial_orden
    WHERE orden_id = current_setting('test.orden_particular_id')::uuid
      AND entidad = 'orden'
      AND accion = 'cambiar'
      AND cambios ? 'con_seguro'
      AND cambios ? 'aseguradora'
      AND cambios ? 'numero_reclamo'
  ),
  'trg_historial registra cambios en con_seguro, aseguradora y numero_reclamo'
);

SELECT is(
  (SELECT cambios->'con_seguro'->>'despues'
   FROM historial_orden
   WHERE orden_id = current_setting('test.orden_particular_id')::uuid
     AND entidad = 'orden'
     AND accion = 'cambiar'
     AND cambios ? 'con_seguro'
   ORDER BY ocurrido_en DESC LIMIT 1),
  'true',
  'el historial guarda el valor nuevo de con_seguro en cambios'
);

SELECT * FROM finish();
ROLLBACK;
