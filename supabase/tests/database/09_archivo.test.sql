-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: archivar una orden a mano
-- ====================================================================================
-- Qué cubre (migración 20261005000000): un admin archiva una orden entregada; lo que no
-- está entregado no se archiva; reabrir una orden la desarchiva; un técnico no archiva.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(8);

-- ------------------------------------------------------------------------------------
-- Datos de prueba
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('19000000-0000-0000-0000-000000000001', 'Sede Archivo', 'Calle 9', '555-0900');

INSERT INTO auth.users (id, email) VALUES
  ('a9000000-0000-0000-0000-000000000001', 'admin9@prueba.local'),
  ('a9000000-0000-0000-0000-000000000002', 'mecanico9@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a9000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '19000000-0000-0000-0000-000000000001', 'admin9@prueba.local'),
  ('a9000000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '19000000-0000-0000-0000-000000000001', 'mecanico9@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c9000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'Marta Ruiz', '+15550140', '', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris'),
  ('d9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul');

-- Una entregada y una en proceso, puestas directo (sin sesión los guardias de inserción no
-- actúan) para no depender del flujo de firma y cobro, que no es lo que se prueba aquí.
INSERT INTO ordenes_trabajo (sede_id, cliente_id, vehiculo_id, tipo_trabajo, estatus, millas_ingreso,
  nivel_gasolina, fecha_estimada_entrega, creado_por)
VALUES
  ('19000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000001',
   'mecanica', 'entregado', 10, '1/2', '2026-10-01', 'a9000000-0000-0000-0000-000000000001'),
  ('19000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000002',
   'mecanica', 'en_proceso', 10, '1/2', '2026-10-01', 'a9000000-0000-0000-0000-000000000001');

CREATE TEMP VIEW t_entregada AS SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd9000000-0000-0000-0000-000000000001';
CREATE TEMP VIEW t_en_proceso AS SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd9000000-0000-0000-0000-000000000002';
GRANT SELECT ON t_entregada, t_en_proceso TO authenticated;

SELECT has_column('ordenes_trabajo', 'archivada_en', 'La orden tiene dónde anotar que se archivó');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';

-- ------------------------------------------------------------------------------------
-- 1. Un técnico no archiva
-- ------------------------------------------------------------------------------------
-- La orden entregada ya le está cerrada por `trg_guard_order_technician`, y la columna nueva
-- no está en su lista de permitidas: no hizo falta nada nuevo para esto.
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET archivada_en = NOW() WHERE id = (SELECT id FROM t_entregada) $$,
  '42501', NULL,
  'Un técnico no archiva una orden'
);

-- ------------------------------------------------------------------------------------
-- 2. El admin archiva la entregada
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET archivada_en = NOW() WHERE id = (SELECT id FROM t_entregada) $$,
  'El admin archiva una orden entregada'
);
SELECT isnt(
  (SELECT archivada_en FROM ordenes_trabajo WHERE id = (SELECT id FROM t_entregada)),
  NULL,
  'Queda la marca de cuándo se archivó'
);

-- ------------------------------------------------------------------------------------
-- 3. Lo que no está entregado no se archiva
-- ------------------------------------------------------------------------------------
-- Sin esto desaparecería de las dos listas: el tablero excluye lo archivado y el archivo
-- solo muestra entregadas.
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET archivada_en = NOW() WHERE id = (SELECT id FROM t_en_proceso) $$,
  '23514', NULL,
  'Una orden en proceso no se archiva'
);

-- ------------------------------------------------------------------------------------
-- 4. Reabrir una orden la desarchiva
-- ------------------------------------------------------------------------------------
-- Se corrige en vez de rechazar: quien la saca de Entregado está corrigiendo la entrega.
-- Directo y sin sesión, para que no intervengan la reversión del cobro ni sus confirmaciones.
RESET ROLE;
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = (SELECT id FROM t_entregada) $$,
  'Sacar de Entregado una orden archivada no choca con la restricción'
);
SELECT is(
  (SELECT archivada_en FROM ordenes_trabajo WHERE id = (SELECT id FROM t_entregada)),
  NULL,
  'Y deja de estar archivada: vuelve al tablero'
);

-- El trigger solo actúa sobre el estado: mover el avance de una orden archivada no la saca
-- del archivo.
UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE id = (SELECT id FROM t_entregada);
UPDATE ordenes_trabajo SET archivada_en = NOW() WHERE id = (SELECT id FROM t_entregada);
UPDATE ordenes_trabajo SET inspeccion_360_notas = 'nota' WHERE id = (SELECT id FROM t_entregada);
SELECT isnt(
  (SELECT archivada_en FROM ordenes_trabajo WHERE id = (SELECT id FROM t_entregada)),
  NULL,
  'Editar otra cosa de una orden archivada no la desarchiva'
);

SELECT * FROM finish();
ROLLBACK;
