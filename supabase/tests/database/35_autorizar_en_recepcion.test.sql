-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: autorizar en recepción (20261010000030)
-- ====================================================================================
-- Qué cubre:
-- 1. con true, trabajo 750 y depósito 300: línea aprobado, presupuesto respondido_via
--    = admin_presencial a nombre del cliente, total_general = 750 y depósito = 300.
-- 2. con false o sin la llave: líneas en borrador y no hay presupuesto respondido.
-- 3. con true y sin líneas: no da error ni crea presupuesto.
-- 4. con repuestos además de trabajo: ambos quedan en aprobado y se suman a total_general.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(15);

-- ------------------------------------------------------------------------------------
-- Datos base: sede, admin, mecánico, cliente y vehículo
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('35000000-0000-0000-0000-000000000001', 'Sede Autorizar QA', 'Calle 35', '555-3500');

INSERT INTO auth.users (id, email) VALUES
  ('35a00000-0000-0000-0000-000000000001', 'admin35@prueba.local'),
  ('35b00000-0000-0000-0000-000000000002', 'mecanico35@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('35a00000-0000-0000-0000-000000000001', 'Admin Autorizar', 'admin', '35000000-0000-0000-0000-000000000001', 'admin35@prueba.local'),
  ('35b00000-0000-0000-0000-000000000002', 'Mecanico Autorizar', 'mecanico', '35000000-0000-0000-0000-000000000001', 'mecanico35@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('35c00000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'Cliente Autorizacion', '+15553501', 'cli35@prueba.local', 'Ave 35');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('35d00000-0000-0000-0000-000000000001', '35c00000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2021, '2T1BURHE0MC003501', 'AUT-35', 'Blanco');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '35a00000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 1. con true, trabajo 750 y depósito 300
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_res ordenes_trabajo;
BEGIN
  v_res := create_work_order(
    jsonb_build_object(
      'sede_id', '35000000-0000-0000-0000-000000000001',
      'cliente_id', '35c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '35d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 45000,
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-10-25',
      'creado_por', '35a00000-0000-0000-0000-000000000001',
      'deposito_inicial', 300,
      'deposito_metodo', 'efectivo',
      'autorizado_en_recepcion', true
    ),
    '[{"descripcion":"Reparacion mayor","costo":750}]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('usuario_id', '35b00000-0000-0000-0000-000000000002', 'tipo_tarea', 'mecanica')
    )
  );
  PERFORM set_config('test.orden_auth_id', v_res.id::text, true);
END $$;

SELECT is(
  (SELECT estado FROM orden_labor WHERE orden_id = current_setting('test.orden_auth_id')::uuid LIMIT 1),
  'aprobado',
  'con autorizado_en_recepcion = true, el trabajo queda en estado aprobado'
);

SELECT is(
  (SELECT respondido_via FROM presupuestos WHERE orden_id = current_setting('test.orden_auth_id')::uuid LIMIT 1),
  'admin_presencial',
  'el presupuesto se registra con respondido_via = admin_presencial'
);

SELECT is(
  (SELECT respondido_por_nombre FROM presupuestos WHERE orden_id = current_setting('test.orden_auth_id')::uuid LIMIT 1),
  'Cliente Autorizacion',
  'el presupuesto queda con el nombre del cliente'
);

SELECT is(
  (SELECT total_general FROM orden_montos WHERE orden_id = current_setting('test.orden_auth_id')::uuid),
  750::numeric,
  'orden_montos.total_general refleja los 750 aprobados'
);

SELECT is(
  (SELECT deposito_inicial FROM orden_montos WHERE orden_id = current_setting('test.orden_auth_id')::uuid),
  300::numeric,
  'el deposito_inicial sigue en 300'
);

-- ------------------------------------------------------------------------------------
-- 2a. con false: líneas quedan en borrador y no hay presupuesto respondido
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_res ordenes_trabajo;
BEGIN
  v_res := create_work_order(
    jsonb_build_object(
      'sede_id', '35000000-0000-0000-0000-000000000001',
      'cliente_id', '35c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '35d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-10-25',
      'creado_por', '35a00000-0000-0000-0000-000000000001',
      'autorizado_en_recepcion', false
    ),
    '[{"descripcion":"Frenos","costo":200}]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('usuario_id', '35b00000-0000-0000-0000-000000000002', 'tipo_tarea', 'mecanica')
    )
  );
  PERFORM set_config('test.orden_false_id', v_res.id::text, true);
END $$;

SELECT is(
  (SELECT estado FROM orden_labor WHERE orden_id = current_setting('test.orden_false_id')::uuid LIMIT 1),
  'borrador',
  'con autorizado_en_recepcion = false, la linea queda en borrador'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM presupuestos
    WHERE orden_id = current_setting('test.orden_false_id')::uuid
      AND respondido_via IS NOT NULL
  ),
  'con false no hay presupuesto respondido'
);

-- ------------------------------------------------------------------------------------
-- 2b. sin la llave autorizado_en_recepcion: líneas en borrador
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_res ordenes_trabajo;
BEGIN
  v_res := create_work_order(
    jsonb_build_object(
      'sede_id', '35000000-0000-0000-0000-000000000001',
      'cliente_id', '35c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '35d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-10-25',
      'creado_por', '35a00000-0000-0000-0000-000000000001'
    ),
    '[{"descripcion":"Suspension","costo":150}]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('usuario_id', '35b00000-0000-0000-0000-000000000002', 'tipo_tarea', 'mecanica')
    )
  );
  PERFORM set_config('test.orden_no_key_id', v_res.id::text, true);
END $$;

SELECT is(
  (SELECT estado FROM orden_labor WHERE orden_id = current_setting('test.orden_no_key_id')::uuid LIMIT 1),
  'borrador',
  'sin la llave autorizado_en_recepcion, la linea queda en borrador'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM presupuestos
    WHERE orden_id = current_setting('test.orden_no_key_id')::uuid
      AND respondido_via IS NOT NULL
  ),
  'sin la llave no hay presupuesto respondido'
);

-- ------------------------------------------------------------------------------------
-- 3. con true y sin líneas: no da error ni crea presupuesto
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_res ordenes_trabajo;
BEGIN
  v_res := create_work_order(
    jsonb_build_object(
      'sede_id', '35000000-0000-0000-0000-000000000001',
      'cliente_id', '35c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '35d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-10-25',
      'creado_por', '35a00000-0000-0000-0000-000000000001',
      'autorizado_en_recepcion', true
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('usuario_id', '35b00000-0000-0000-0000-000000000002', 'tipo_tarea', 'mecanica')
    )
  );
  PERFORM set_config('test.orden_empty_id', v_res.id::text, true);
END $$;

SELECT ok(
  current_setting('test.orden_empty_id') IS NOT NULL,
  'con true y sin lineas se crea la orden sin error'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM presupuestos WHERE orden_id = current_setting('test.orden_empty_id')::uuid
  ),
  'con true y sin lineas no crea presupuesto'
);

-- ------------------------------------------------------------------------------------
-- 4. con repuestos además del trabajo: se autorizan los dos
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_res ordenes_trabajo;
BEGIN
  v_res := create_work_order(
    jsonb_build_object(
      'sede_id', '35000000-0000-0000-0000-000000000001',
      'cliente_id', '35c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '35d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-10-25',
      'creado_por', '35a00000-0000-0000-0000-000000000001',
      'autorizado_en_recepcion', true
    ),
    '[{"descripcion":"Cambio de radiador","costo":300}]'::jsonb,
    '[{"descripcion":"Radiador OEM","cantidad":1,"costo_unitario":250,"precio_venta_unitario":400}]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('usuario_id', '35b00000-0000-0000-0000-000000000002', 'tipo_tarea', 'mecanica')
    )
  );
  PERFORM set_config('test.orden_ambos_id', v_res.id::text, true);
END $$;

SELECT is(
  (SELECT estado FROM orden_labor WHERE orden_id = current_setting('test.orden_ambos_id')::uuid LIMIT 1),
  'aprobado',
  'el trabajo queda en aprobado'
);

SELECT is(
  (SELECT estado FROM orden_repuestos WHERE orden_id = current_setting('test.orden_ambos_id')::uuid LIMIT 1),
  'aprobado',
  'el repuesto queda en aprobado'
);

SELECT is(
  (SELECT respondido_via FROM presupuestos WHERE orden_id = current_setting('test.orden_ambos_id')::uuid LIMIT 1),
  'admin_presencial',
  'el presupuesto conjunto se autoriza como admin_presencial'
);

SELECT is(
  (SELECT total_general FROM orden_montos WHERE orden_id = current_setting('test.orden_ambos_id')::uuid),
  700::numeric,
  'total_general suma trabajo (300) y repuesto (400) = 700'
);

SELECT * FROM finish();
ROLLBACK;
