-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: multimedia de la orden y notificaciones
-- ====================================================================================
-- Qué cubre: quién puede subir archivos a una orden, que lo del técnico nazca
-- interno y la recepción visible, que una fila no pueda apuntar a la carpeta de
-- otra orden; que cada evento genere su aviso para la persona correcta, que
-- nadie lea los avisos de otro, y que un teléfono compartido cambie de dueño.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(21);

-- ------------------------------------------------------------------------------------
-- Datos de prueba
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sede Prueba', 'Calle 1', '555-0100');

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'mecanico@prueba.local'),
  ('a0000000-0000-0000-0000-000000000003', 'pintor@prueba.local'),
  ('a0000000-0000-0000-0000-000000000004', 'otro@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '10000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '10000000-0000-0000-0000-000000000001', 'mecanico@prueba.local'),
  ('a0000000-0000-0000-0000-000000000003', 'Sara Pintora', 'pintor', '10000000-0000-0000-0000-000000000001', 'pintor@prueba.local'),
  ('a0000000-0000-0000-0000-000000000004', 'Otro Técnico', 'mecanico', '10000000-0000-0000-0000-000000000001', 'otro@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta@prueba.local', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';

-- Un admin crea la orden y asigna al mecánico.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
-- DO y no SELECT: un SELECT suelto imprime una fila que no es salida TAP.
DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica', 'millas_ingreso', 45000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Frenos","costo":200}]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
  -- La firma de recepción autoriza la mano de obra cotizada (fase 5): sin ella la
  -- orden no tendría nada que cobrar ni comisión que generar.
  UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png'
  WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
END $do$;

-- ------------------------------------------------------------------------------------
-- 1. Avisos: el correcto, para la persona correcta, y privados
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones WHERE tipo = 'asignacion'),
  1,
  'El mecánico asignado recibe el aviso "Nueva orden asignada"'
);

SELECT is(
  (SELECT titulo FROM notificaciones WHERE tipo = 'asignacion' LIMIT 1) LIKE 'Nueva orden asignada · ORD-%',
  true,
  'El aviso lleva el número de orden'
);

SELECT throws_ok(
  $$ UPDATE notificaciones SET titulo = 'Otra cosa' WHERE tipo = 'asignacion' $$,
  '42501', NULL,
  'De un aviso solo se puede cambiar el estado de leído'
);

SELECT lives_ok(
  $$ UPDATE notificaciones SET leida_en = NOW() WHERE tipo = 'asignacion' $$,
  'La persona puede marcar su aviso como leído'
);

SELECT throws_ok(
  $$ INSERT INTO notificaciones (usuario_id, tipo, titulo) VALUES ('a0000000-0000-0000-0000-000000000003', 'falso', 'Aviso falso') $$,
  '42501', NULL,
  'Nadie puede crear avisos desde la API'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
SELECT is_empty('SELECT * FROM notificaciones', 'Otra persona no ve los avisos del mecánico');

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT is_empty(
  $$ SELECT * FROM notificaciones WHERE tipo = 'asignacion' $$,
  'Quien hace la acción no se avisa a sí mismo (el admin que asignó)'
);

-- ------------------------------------------------------------------------------------
-- 2. El técnico documenta y termina; el admin se entera
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT lives_ok(
  $$ INSERT INTO orden_avances (orden_id, usuario_id, descripcion)
     SELECT id, 'a0000000-0000-0000-0000-000000000002', 'Cambié las pastillas' FROM ordenes_trabajo
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
     UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El mecánico agrega un avance y marca la orden como finalizada'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT results_eq(
  $$ SELECT tipo FROM notificaciones WHERE tipo IN ('avance_tecnico', 'orden_finalizada') ORDER BY tipo $$,
  $$ VALUES ('avance_tecnico'::text), ('orden_finalizada'::text) $$,
  'El admin recibe "Nuevo avance" y "Lista para entregar"'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El admin entrega la orden'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones WHERE tipo = 'comision_generada'),
  1,
  'El mecánico recibe "Comisión generada" al entregarse la orden'
);

-- ------------------------------------------------------------------------------------
-- 3. Push: un teléfono compartido cambia de dueño; solo se encola a quien tiene teléfono
-- ------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT registrar_push('https://push.example.test/tablet-del-taller', 'p256dh-x', 'auth-x', 'Prueba') $$,
  'El mecánico activa push en la tablet'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
SELECT lives_ok(
  $$ SELECT registrar_push('https://push.example.test/tablet-del-taller', 'p256dh-x', 'auth-x', 'Prueba') $$,
  'La pintora inicia sesión en la misma tablet'
);

RESET ROLE;
SELECT is(
  (SELECT usuario_id FROM push_suscripciones WHERE endpoint = 'https://push.example.test/tablet-del-taller'),
  'a0000000-0000-0000-0000-000000000003'::uuid,
  'La tablet ahora recibe los avisos de la pintora, no los del mecánico'
);

-- Una orden nueva sin entregar, con la pintora asignada, para seguir probando.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul');
-- DO y no SELECT: un SELECT suelto imprime una fila que no es salida TAP.
DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000002',
      'tipo_trabajo', 'pintura', 'millas_ingreso', 1, 'nivel_gasolina', '1/4',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000003","tipo_tarea":"pintura"}]'::jsonb
  );
END $do$;

RESET ROLE;
SELECT is(
  (SELECT COUNT(*)::int FROM cola_envios WHERE canal = 'push' AND destinatario = 'a0000000-0000-0000-0000-000000000003'),
  1,
  'Asignar a quien tiene teléfono con push encola un envío'
);
SELECT is(
  (SELECT COUNT(*)::int FROM cola_envios WHERE canal = 'push' AND destinatario = 'a0000000-0000-0000-0000-000000000002'),
  0,
  'A quien no tiene teléfono con push no se le encola nada'
);

-- ------------------------------------------------------------------------------------
-- 4. Multimedia
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';

SELECT lives_ok(
  $$ INSERT INTO orden_media (orden_id, tipo, origen, zona, ruta, mime, bytes)
     SELECT id, 'foto', 'recepcion', 'front',
            '10000000-0000-0000-0000-000000000001/' || id || '/foto-1.jpg', 'image/jpeg', 300000
     FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002' $$,
  'La técnica asignada sube una foto de recepción'
);

SELECT lives_ok(
  $$ INSERT INTO orden_avances (id, orden_id, usuario_id, descripcion)
     SELECT 'e0000000-0000-0000-0000-000000000001', id, 'a0000000-0000-0000-0000-000000000003', ''
     FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002';
     INSERT INTO orden_media (orden_id, avance_id, tipo, origen, ruta, mime, bytes, duracion_seg, visible_cliente)
     SELECT id, 'e0000000-0000-0000-0000-000000000001', 'video', 'avance',
            '10000000-0000-0000-0000-000000000001/' || id || '/video-1.mp4', 'video/mp4', 25000000, 95, true
     FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002' $$,
  'La técnica sube un video a un avance (intentando publicarlo al cliente)'
);

SELECT results_eq(
  $$ SELECT origen, visible_cliente FROM orden_media ORDER BY origen $$,
  $$ VALUES ('avance'::text, false), ('recepcion'::text, true) $$,
  'La recepción nace visible al cliente; lo del técnico, interno aunque lo pida'
);

SELECT throws_ok(
  $$ INSERT INTO orden_media (orden_id, tipo, origen, ruta, mime, bytes)
     SELECT id, 'foto', 'recepcion', '10000000-0000-0000-0000-000000000001/otra-orden/foto.jpg', 'image/jpeg', 1000
     FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002' $$,
  '42501', NULL,
  'Una fila no puede apuntar a un archivo de la carpeta de otra orden'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
SELECT throws_ok(
  $$ INSERT INTO orden_media (orden_id, tipo, origen, ruta, mime, bytes)
     SELECT id, 'foto', 'recepcion', '10000000-0000-0000-0000-000000000001/' || id || '/foto-2.jpg', 'image/jpeg', 1000
     FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002' $$,
  '42501', NULL,
  'Un técnico no asignado no puede subir archivos a la orden'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
