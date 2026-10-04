-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: la nota de voz de la recepción nace interna
-- ====================================================================================
-- Qué cubre (migración 20261010000003): fotos y videos de la recepción nacen visibles para
-- el cliente; una nota de voz de la recepción nace interna, la suba quien la suba y aunque
-- el navegador pida publicarla. Un admin la publica; un técnico no.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(8);

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
    '[]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

CREATE TEMP TABLE t_orden AS
  SELECT id, sede_id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
GRANT SELECT ON t_orden TO authenticated;

-- La vista corre como su dueño: lee la visibilidad real, sin depender de la RLS de quien
-- tenga la sesión en cada paso.
CREATE TEMP VIEW t_visible AS
  SELECT regexp_replace(ruta, '^.*/', '') AS archivo, visible_cliente
  FROM orden_media WHERE orden_id = (SELECT id FROM t_orden);
GRANT SELECT ON t_visible TO authenticated;

-- ------------------------------------------------------------------------------------
-- 1. La mecánica sube la recepción: foto, video y nota de voz
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

SELECT lives_ok(
  $$ INSERT INTO orden_media (orden_id, tipo, origen, zona, ruta, mime, bytes, duracion_seg, visible_cliente)
     SELECT id, 'foto', 'recepcion', 'front', sede_id || '/' || id || '/frontal.jpg', 'image/jpeg', 2000, NULL, false FROM t_orden
     UNION ALL
     SELECT id, 'video', 'recepcion', NULL, sede_id || '/' || id || '/recorrido.mp4', 'video/mp4', 900000, 40, false FROM t_orden
     UNION ALL
     -- Pidiendo publicarla: lo que manda el navegador se ignora.
     SELECT id, 'audio', 'recepcion', NULL, sede_id || '/' || id || '/nota.m4a', 'audio/mp4', 50000, 20, true FROM t_orden $$,
  'La mecánica asignada sube foto, video y nota de voz de la recepción'
);

SELECT results_eq(
  $$ SELECT archivo, visible_cliente FROM t_visible ORDER BY archivo $$,
  $$ VALUES ('frontal.jpg'::text, true), ('nota.m4a'::text, false), ('recorrido.mp4'::text, true) $$,
  'Foto y video de la recepción nacen visibles; la nota de voz, interna aunque la pida visible'
);

-- La política de UPDATE de orden_media es de admin: cero filas, sin cambios.
SELECT is_empty(
  $$ UPDATE orden_media SET visible_cliente = true
     WHERE orden_id = (SELECT id FROM t_orden) AND tipo = 'audio' RETURNING id $$,
  'La mecánica no publica la nota de voz'
);
SELECT is((SELECT visible_cliente FROM t_visible WHERE archivo = 'nota.m4a'), false, 'Sigue interna');

-- ------------------------------------------------------------------------------------
-- 2. Administración: también nace interna, y la publica a mano
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ INSERT INTO orden_media (orden_id, tipo, origen, ruta, mime, bytes, duracion_seg)
     SELECT id, 'audio', 'recepcion', sede_id || '/' || id || '/nota-admin.m4a', 'audio/mp4', 50000, 15 FROM t_orden $$,
  'El admin graba una nota de voz de la recepción'
);
SELECT is((SELECT visible_cliente FROM t_visible WHERE archivo = 'nota-admin.m4a'), false,
  'La nota de voz del admin también nace interna');

SELECT lives_ok(
  $$ UPDATE orden_media SET visible_cliente = true
     WHERE orden_id = (SELECT id FROM t_orden) AND regexp_replace(ruta, '^.*/', '') = 'nota.m4a' $$,
  'El admin publica la nota de voz de la mecánica'
);
SELECT is((SELECT visible_cliente FROM t_visible WHERE archivo = 'nota.m4a'), true,
  'Publicada, la ve el cliente');

SELECT * FROM finish();
ROLLBACK;
