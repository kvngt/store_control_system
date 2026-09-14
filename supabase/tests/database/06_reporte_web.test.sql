-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: el reporte es el enlace web
-- ====================================================================================
-- Qué cubre (migración 20260925000000): solo un admin manda el reporte; mandarlo
-- crea el enlace si faltaba y programa un solo correo aunque se pulse dos veces; un
-- cliente sin correo no recibe nada; el bucket `reportes` ya no acepta archivos.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(7);

INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sede Prueba', 'Calle 1', '555-0100');

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'mecanico@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '10000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '10000000-0000-0000-0000-000000000001', 'mecanico@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta@prueba.local', 'Oak 12'),
  ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Pedro Sin Correo', '555-0141', '', 'Elm 3');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001', 'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000001', 'tipo_trabajo', 'mecanica', 'millas_ingreso', 1,
      'nivel_gasolina', '1/2', 'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001', 'cliente_id', 'c0000000-0000-0000-0000-000000000002',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000002', 'tipo_trabajo', 'pintura', 'millas_ingreso', 1,
      'nivel_gasolina', '1/4', 'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
END $do$;

-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT enviar_reporte_cliente((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001')) $$,
  '42501', NULL,
  'Un técnico no manda el reporte al cliente'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT enviar_reporte_cliente((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001')) ->> 'correo'),
  'encolado',
  'El admin manda el reporte a un cliente con correo'
);
SELECT lives_ok(
  $$ SELECT enviar_reporte_cliente((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001')) $$,
  'Pulsarlo otra vez no falla'
);
SELECT is(
  (SELECT enviar_reporte_cliente((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002')) ->> 'correo'),
  'sin_correo',
  'A un cliente sin correo no se le programa nada'
);

RESET ROLE;
SELECT is(
  (SELECT COUNT(*)::int FROM cola_envios c JOIN ordenes_trabajo o ON o.id = c.orden_id
   WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001' AND c.plantilla = 'reporte' AND c.estado = 'pendiente'),
  1,
  'Dos toques seguidos son un solo correo'
);
SELECT is(
  (SELECT COUNT(*)::int FROM orden_enlaces e JOIN ordenes_trabajo o ON o.id = e.orden_id
   WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000002' AND e.revocado_en IS NULL),
  1,
  'Mandar el reporte crea el enlace aunque la orden no tenga firma ni correo (para compartirlo por WhatsApp)'
);
SELECT is_empty(
  $$ SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND policyname IN ('reportes_admin_insert', 'reportes_admin_update') $$,
  'El bucket de PDFs compartidos ya no acepta archivos nuevos'
);

SELECT * FROM finish();
ROLLBACK;
