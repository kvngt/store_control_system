-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: traducciones automáticas
-- ====================================================================================
-- Qué cubre (migraciones 20261010000013 y 20261010000015): guardar mano de obra, repuestos,
-- avances y notas de inspección **funciona** (la 013 rompía toda alta o edición de mano de obra
-- y de repuestos), y encola una sola traducción pendiente por orden, solo cuando cambia un texto
-- que ve el cliente; quién lee las traducciones (admin y técnico asignado sí, otro técnico no,
-- nadie la tabla directo) y que el portal no responde con un enlace revocado o vencido.
--
-- Reescrita el 05/10/2026: la versión que llegó con la 013 insertaba en columnas que no
-- existen y nunca llegó a correr.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(24);

-- ------------------------------------------------------------------------------------
-- Datos: una sede, un admin, un mecánico asignado y otro que no lo está
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
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', '', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris');

DELETE FROM cola_envios;

-- ------------------------------------------------------------------------------------
-- 1. Lo que la 013 rompía: dar de alta una orden con mano de obra y repuestos
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ SELECT create_work_order(
       jsonb_build_object(
         'sede_id', '10000000-0000-0000-0000-000000000001',
         'cliente_id', 'c0000000-0000-0000-0000-000000000001',
         'vehiculo_id', 'd0000000-0000-0000-0000-000000000001',
         'tipo_trabajo', 'mecanica', 'millas_ingreso', 45000, 'nivel_gasolina', '1/2',
         'deposito_inicial', 0, 'inspeccion_360_notas', 'Rayón en la puerta',
         'fecha_estimada_entrega', '2026-12-31',
         'creado_por', 'a0000000-0000-0000-0000-000000000001'),
       '[{"descripcion":"Cambio de aceite","costo":50,"asignado_a":"a0000000-0000-0000-0000-000000000002","reparto_heredado":false}]'::jsonb,
       '[{"descripcion":"Filtro","cantidad":1,"precio_venta_unitario":10}]'::jsonb,
       '[]'::jsonb) $$,
  'Se crea una orden con mano de obra y repuestos'
);

RESET ROLE;
CREATE TEMP TABLE t_o AS SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
GRANT SELECT ON t_o TO authenticated, anon;
CREATE TEMP VIEW t_cola AS
  SELECT * FROM cola_envios WHERE canal = 'traduccion' AND orden_id = (SELECT id FROM t_o);
GRANT SELECT ON t_cola TO authenticated;

SELECT is((SELECT COUNT(*)::int FROM t_cola WHERE estado = 'pendiente'), 1,
  'Una sola traducción pendiente por orden, aunque se guardaron varias líneas');

-- ------------------------------------------------------------------------------------
-- 2. Qué encola y qué no (como admin, por la API)
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, reparto_heredado)
     VALUES ((SELECT id FROM t_o), 'Frenos', 100, 'mecanica', false) $$,
  '"Agregar trabajo" funciona'
);
SELECT lives_ok(
  $$ INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal)
     VALUES ((SELECT id FROM t_o), 'Pastillas', 2, 20, 20, 40) $$,
  'Agregar un repuesto funciona'
);
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM t_cola WHERE estado = 'pendiente'), 1,
  'Siguen siendo una sola pendiente: se corre al final, no se duplica');

DELETE FROM cola_envios;
SET LOCAL ROLE authenticated;
UPDATE orden_labor SET costo = 120 WHERE descripcion = 'Frenos';
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM t_cola), 0, 'Cambiar el precio no encola (no cambia ningún texto)');

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ UPDATE orden_labor SET descripcion = 'Frenos delanteros' WHERE descripcion = 'Frenos' $$,
  'Cambiar la descripción de una tarea funciona'
);
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM t_cola), 1, 'Cambiar la descripción sí encola');

DELETE FROM cola_envios;
SET LOCAL ROLE authenticated;
UPDATE ordenes_trabajo SET fecha_estimada_entrega = '2026-12-30' WHERE id = (SELECT id FROM t_o);
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM t_cola), 0, 'Cambiar otra cosa de la orden no encola');

SET LOCAL ROLE authenticated;
UPDATE ordenes_trabajo SET inspeccion_360_notas = 'Rayón y abolladura' WHERE id = (SELECT id FROM t_o);
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM t_cola), 1, 'Cambiar las notas de inspección encola');

DELETE FROM cola_envios;
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ INSERT INTO orden_avances (orden_id, usuario_id, descripcion, visible_cliente)
     VALUES ((SELECT id FROM t_o), 'a0000000-0000-0000-0000-000000000001', 'Nota interna', false) $$,
  'Un avance interno se guarda'
);
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM t_cola), 0, 'Un avance interno no encola');

SET LOCAL ROLE authenticated;
UPDATE orden_avances SET visible_cliente = true WHERE descripcion = 'Nota interna';
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM t_cola), 1, 'Publicar un avance encola');

DELETE FROM cola_envios;
SET LOCAL ROLE authenticated;
INSERT INTO orden_avances (orden_id, usuario_id, descripcion, visible_cliente)
VALUES ((SELECT id FROM t_o), 'a0000000-0000-0000-0000-000000000001', 'Avance para el cliente', true);
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM t_cola), 1, 'Un avance que nace visible encola');

-- ------------------------------------------------------------------------------------
-- 3. Quién lee las traducciones
-- ------------------------------------------------------------------------------------
INSERT INTO traducciones (sede_id, md5_hash, idioma_destino, texto_original, traduccion)
VALUES ('10000000-0000-0000-0000-000000000001', md5('Cambio de aceite'), 'en', 'Cambio de aceite', 'Oil change');
-- Los tokens son 64 caracteres hexadecimales (CHECK de orden_enlaces) y hay un solo enlace
-- activo por orden: el revocado entra ya revocado.
INSERT INTO orden_enlaces (orden_id, sede_id, token, revocado_en) VALUES
  ((SELECT id FROM t_o), '10000000-0000-0000-0000-000000000001', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', now());
INSERT INTO orden_enlaces (orden_id, sede_id, token) VALUES
  ((SELECT id FROM t_o), '10000000-0000-0000-0000-000000000001', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

SET LOCAL ROLE authenticated;
SELECT is((SELECT traducciones_orden((SELECT id FROM t_o)) ->> 'Cambio de aceite'), 'Oil change',
  'Administración lee las traducciones de la orden');

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT is((SELECT traducciones_orden((SELECT id FROM t_o)) ->> 'Cambio de aceite'), 'Oil change',
  'El técnico asignado también');
SELECT is((SELECT COUNT(*)::int FROM traducciones), 0, 'Un técnico no lee la tabla directo');

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
SELECT is((SELECT traducciones_orden((SELECT id FROM t_o))), '{}'::jsonb,
  'Un técnico que no está en la orden no recibe nada (antes recibía las de cualquier orden)');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT is((SELECT traducciones_portal('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') ->> 'Cambio de aceite'), 'Oil change',
  'El portal recibe el diccionario con un enlace vigente');
SELECT is((SELECT traducciones_portal('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')), '{}'::jsonb,
  'Con un enlace revocado, nada');
SELECT is((SELECT traducciones_portal('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')), '{}'::jsonb,
  'Con un enlace que no existe, nada');

-- ------------------------------------------------------------------------------------
-- 4. Permisos de las funciones
-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT ok(NOT has_function_privilege('authenticated', 'public._textos_cliente(uuid)', 'EXECUTE'),
  'Nadie con sesión llama _textos_cliente');
SELECT ok(NOT has_function_privilege('authenticated', 'public.trg_encolar_traduccion()', 'EXECUTE'),
  'Ni la función del trigger');
SELECT ok(NOT has_function_privilege('authenticated', 'public.guardar_traducciones(uuid, text, jsonb)', 'EXECUTE'),
  'Ni guardar_traducciones (solo la edge function, con service_role)');

SELECT * FROM finish();
ROLLBACK;
