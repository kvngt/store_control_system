-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: marcas de daños en el vehículo (20261010000031)
-- ====================================================================================
-- Qué cubre:
-- 1. El valor por defecto de marcas_danos es []
-- 2. Acepta una marca válida
-- 3-9. Rechaza: vista inválida, x > 1, x como texto, sin tipo, tipo inválido, elemento no objeto, > 60 marcas
-- 10. create_work_order guarda marcas_danos
-- 11. Admin cambia marcas_danos antes de la firma
-- 12. Después de la firma (firma_ruta IS NOT NULL), cambiar marcas_danos lanza 42501
-- 13. Técnico asignado puede leer marcas_danos
-- 14. Técnico asignado no puede modificar marcas_danos
-- 15. datos_portal devuelve marcas_danos sin llaves adicionales
-- 16. trg_historial audita cambios a marcas_danos
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(16);

-- ------------------------------------------------------------------------------------
-- Datos base: sede, admin, mecánico, cliente y vehículo
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('36000000-0000-0000-0000-000000000001', 'Sede Danos QA', 'Calle 36', '555-3600');

INSERT INTO auth.users (id, email) VALUES
  ('36a00000-0000-0000-0000-000000000001', 'admin36@prueba.local'),
  ('36b00000-0000-0000-0000-000000000002', 'mecanico36@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('36a00000-0000-0000-0000-000000000001', 'Admin Danos', 'admin', '36000000-0000-0000-0000-000000000001', 'admin36@prueba.local'),
  ('36b00000-0000-0000-0000-000000000002', 'Mecanico Danos', 'mecanico', '36000000-0000-0000-0000-000000000001', 'mecanico36@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('36c00000-0000-0000-0000-000000000001', '36000000-0000-0000-0000-000000000001', 'Cliente Danos', '+15553601', 'cli36@prueba.local', 'Ave 36');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('36d00000-0000-0000-0000-000000000001', '36c00000-0000-0000-0000-000000000001', 'Nissan', 'Sentra', 2022, '3N1AB8CV4NY003601', 'DAN-36', 'Azul');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '36a00000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 1. Valor por defecto de marcas_danos es []
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_res ordenes_trabajo;
BEGIN
  v_res := create_work_order(
    jsonb_build_object(
      'sede_id', '36000000-0000-0000-0000-000000000001',
      'cliente_id', '36c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '36d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 20000,
      'nivel_gasolina', '1/2',
      'fecha_estimada_entrega', '2026-10-30',
      'creado_por', '36a00000-0000-0000-0000-000000000001'
    ),
    '[{"descripcion":"Revision inicial","costo":150}]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('usuario_id', '36b00000-0000-0000-0000-000000000002', 'tipo_tarea', 'mecanica')
    )
  );
  PERFORM set_config('test.orden_danos_id', v_res.id::text, true);
END $$;

SELECT is(
  (SELECT marcas_danos FROM ordenes_trabajo WHERE id = current_setting('test.orden_danos_id')::uuid),
  '[]'::jsonb,
  'el valor por defecto de marcas_danos es []'
);

-- ------------------------------------------------------------------------------------
-- 2. Acepta una marca válida
-- ------------------------------------------------------------------------------------
UPDATE ordenes_trabajo
SET marcas_danos = '[{"vista":"frontal","x":0.5,"y":0.4,"tipo":"golpe"}]'::jsonb
WHERE id = current_setting('test.orden_danos_id')::uuid;

SELECT is(
  (SELECT marcas_danos FROM ordenes_trabajo WHERE id = current_setting('test.orden_danos_id')::uuid),
  '[{"vista":"frontal","x":0.5,"y":0.4,"tipo":"golpe"}]'::jsonb,
  'acepta una marca valida'
);

-- ------------------------------------------------------------------------------------
-- 3-9. Restricción CHECK rechaza datos inválidos
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET marcas_danos = '[{"vista":"diagonal","x":0.5,"y":0.4,"tipo":"golpe"}]'::jsonb WHERE id = current_setting('test.orden_danos_id')::uuid $$,
  '23514',
  NULL,
  'rechaza vista invalida'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET marcas_danos = '[{"vista":"frontal","x":1.5,"y":0.4,"tipo":"golpe"}]'::jsonb WHERE id = current_setting('test.orden_danos_id')::uuid $$,
  '23514',
  NULL,
  'rechaza x mayor que 1'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET marcas_danos = '[{"vista":"frontal","x":"0.5","y":0.4,"tipo":"golpe"}]'::jsonb WHERE id = current_setting('test.orden_danos_id')::uuid $$,
  '23514',
  NULL,
  'rechaza x como texto'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET marcas_danos = '[{"vista":"frontal","x":0.5,"y":0.4}]'::jsonb WHERE id = current_setting('test.orden_danos_id')::uuid $$,
  '23514',
  NULL,
  'rechaza marca sin tipo'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET marcas_danos = '[{"vista":"frontal","x":0.5,"y":0.4,"tipo":"desconocido"}]'::jsonb WHERE id = current_setting('test.orden_danos_id')::uuid $$,
  '23514',
  NULL,
  'rechaza tipo invalido'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET marcas_danos = '["frontal"]'::jsonb WHERE id = current_setting('test.orden_danos_id')::uuid $$,
  '23514',
  NULL,
  'rechaza elemento que no es objeto'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo
     SET marcas_danos = (
       SELECT jsonb_agg(jsonb_build_object('vista', 'frontal', 'x', 0.5, 'y', 0.5, 'tipo', 'golpe'))
       FROM generate_series(1, 61)
     )
     WHERE id = current_setting('test.orden_danos_id')::uuid $$,
  '23514',
  NULL,
  'rechaza mas de 60 marcas'
);

-- ------------------------------------------------------------------------------------
-- 10. create_work_order guarda marcas_danos
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_res ordenes_trabajo;
BEGIN
  v_res := create_work_order(
    jsonb_build_object(
      'sede_id', '36000000-0000-0000-0000-000000000001',
      'cliente_id', '36c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '36d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 20000,
      'nivel_gasolina', '1/4',
      'fecha_estimada_entrega', '2026-11-05',
      'creado_por', '36a00000-0000-0000-0000-000000000001',
      'marcas_danos', '[{"vista":"trasera","x":0.2,"y":0.3,"tipo":"rayon"}]'::jsonb
    ),
    '[{"descripcion":"Pintura parachoques","costo":300}]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('usuario_id', '36b00000-0000-0000-0000-000000000002', 'tipo_tarea', 'mecanica')
    )
  );
  PERFORM set_config('test.orden_con_marcas_id', v_res.id::text, true);
END $$;

SELECT is(
  (SELECT marcas_danos FROM ordenes_trabajo WHERE id = current_setting('test.orden_con_marcas_id')::uuid),
  '[{"vista":"trasera","x":0.2,"y":0.3,"tipo":"rayon"}]'::jsonb,
  'create_work_order guarda marcas_danos'
);

-- ------------------------------------------------------------------------------------
-- 11. Admin cambia marcas_danos antes de la firma
-- ------------------------------------------------------------------------------------
UPDATE ordenes_trabajo
SET marcas_danos = '[{"vista":"trasera","x":0.2,"y":0.3,"tipo":"rayon"},{"vista":"superior","x":0.8,"y":0.1,"tipo":"pintura"}]'::jsonb
WHERE id = current_setting('test.orden_con_marcas_id')::uuid;

SELECT is(
  (SELECT marcas_danos FROM ordenes_trabajo WHERE id = current_setting('test.orden_con_marcas_id')::uuid),
  '[{"vista":"trasera","x":0.2,"y":0.3,"tipo":"rayon"},{"vista":"superior","x":0.8,"y":0.1,"tipo":"pintura"}]'::jsonb,
  'un admin cambia las marcas antes de la firma'
);

-- ------------------------------------------------------------------------------------
-- 12. Después de la firma (firma_ruta IS NOT NULL), cambiar marcas_danos da 42501
-- ------------------------------------------------------------------------------------
UPDATE ordenes_trabajo
SET firma_ruta = sede_id || '/' || id || '/firma.png', firma_fecha = NOW()
WHERE id = current_setting('test.orden_con_marcas_id')::uuid;

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo
     SET marcas_danos = '[]'::jsonb
     WHERE id = current_setting('test.orden_con_marcas_id')::uuid $$,
  '42501',
  'El cliente ya firmó la recepción: los daños marcados no se pueden cambiar.',
  'despues de la firma, cambiar marcas_danos lanza 42501'
);

-- ------------------------------------------------------------------------------------
-- 13. El técnico asignado las lee
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '36b00000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT marcas_danos FROM ordenes_trabajo WHERE id = current_setting('test.orden_con_marcas_id')::uuid),
  '[{"vista":"trasera","x":0.2,"y":0.3,"tipo":"rayon"},{"vista":"superior","x":0.8,"y":0.1,"tipo":"pintura"}]'::jsonb,
  'el tecnico asignado lee las marcas_danos'
);

-- ------------------------------------------------------------------------------------
-- 14. El técnico asignado no las cambia
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo
     SET marcas_danos = '[{"vista":"frontal","x":0.1,"y":0.1,"tipo":"otro"}]'::jsonb
     WHERE id = current_setting('test.orden_danos_id')::uuid $$,
  '42501',
  NULL,
  'el tecnico asignado no puede modificar marcas_danos'
);

-- ------------------------------------------------------------------------------------
-- 15. datos_portal trae las marcas sin llaves de más
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE postgres;

-- El alta ya deja un enlace activo para la orden: se usa ese.

SELECT is(
  (SELECT datos_portal((SELECT token FROM orden_enlaces WHERE orden_id = current_setting('test.orden_con_marcas_id')::uuid AND revocado_en IS NULL ORDER BY creado_en DESC LIMIT 1))->'orden'->'marcas_danos'),
  '[{"tipo":"rayon","vista":"trasera","x":0.2,"y":0.3},{"tipo":"pintura","vista":"superior","x":0.8,"y":0.1}]'::jsonb,
  'datos_portal trae las marcas sin llaves de mas'
);

-- ------------------------------------------------------------------------------------
-- 16. El historial registra el cambio
-- ------------------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM historial_orden
    WHERE orden_id = current_setting('test.orden_danos_id')::uuid
      AND entidad = 'orden'
      AND accion = 'cambiar'
      AND cambios ? 'marcas_danos'
  ),
  'el historial registra el cambio en marcas_danos'
);

SELECT * FROM finish();
ROLLBACK;
