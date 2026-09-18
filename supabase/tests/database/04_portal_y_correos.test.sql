-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: enlace del cliente, portal y correos
-- ====================================================================================
-- Qué cubre (migración 20260923000000): firmar crea el enlace y programa un solo
-- correo de recepción; cambios de estatus seguidos se colapsan en un aviso; el
-- cliente se da de baja desde su enlace; el portal devuelve solo lo publicado y
-- nunca costos ni comisiones; solo admin ve, crea y cambia enlaces; entregar fija
-- el vencimiento.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(26);

-- ------------------------------------------------------------------------------------
-- Datos de prueba
-- ------------------------------------------------------------------------------------
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

-- DO y no SELECT: un SELECT suelto imprime una fila que no es salida TAP.
DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica', 'millas_ingreso', 45000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 100, 'inspeccion_360_notas', 'Rayón trasero', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Frenos","costo":300}]'::jsonb,
    '[{"descripcion":"Pastillas","cantidad":2,"costo_unitario":50,"precio_venta_unitario":50}]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001',
      'cliente_id', 'c0000000-0000-0000-0000-000000000002',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000002',
      'tipo_trabajo', 'pintura', 'millas_ingreso', 1000, 'nivel_gasolina', '1/4',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
END $do$;

RESET ROLE;
CREATE TEMP VIEW t_orden AS
  SELECT * FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
CREATE TEMP VIEW t_enlace AS
  SELECT e.* FROM orden_enlaces e JOIN ordenes_trabajo o ON o.id = e.orden_id
  WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001' AND e.revocado_en IS NULL;
CREATE TEMP VIEW t_correos AS
  SELECT c.* FROM cola_envios c JOIN ordenes_trabajo o ON o.id = c.orden_id
  WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001' AND c.canal = 'email';

-- Multimedia: una foto de recepción (visible) y un video de avance (interno).
INSERT INTO orden_media (orden_id, tipo, origen, ruta, mime, bytes, subido_por)
SELECT id, 'foto', 'recepcion', sede_id || '/' || id || '/foto.jpg', 'image/jpeg', 1000, 'a0000000-0000-0000-0000-000000000001' FROM t_orden;
-- Un archivo de avance cuelga de un avance (orden_media_origen_coherente) y un video
-- lleva duración (orden_media_duracion).
INSERT INTO orden_avances (id, orden_id, usuario_id, descripcion)
SELECT 'e0000000-0000-0000-0000-000000000001', id, 'a0000000-0000-0000-0000-000000000001', 'Nota interna del taller' FROM t_orden;
INSERT INTO orden_media (orden_id, avance_id, tipo, origen, ruta, mime, bytes, duracion_seg, subido_por)
SELECT id, 'e0000000-0000-0000-0000-000000000001', 'video', 'avance', sede_id || '/' || id || '/video.mp4', 'video/mp4', 1000, 30, 'a0000000-0000-0000-0000-000000000001' FROM t_orden;

-- ------------------------------------------------------------------------------------
-- 1. Firmar la recepción: nace el enlace y un solo correo de recepción
-- ------------------------------------------------------------------------------------
SELECT is((SELECT COUNT(*)::int FROM t_enlace), 0, 'Antes de firmar la orden no tiene enlace');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-1.png', firma_fecha = NOW()
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El técnico asignado captura la firma'
);
SELECT is_empty('SELECT * FROM orden_enlaces', 'Un técnico no puede leer los enlaces del cliente');
SELECT throws_ok(
  $$ SELECT crear_enlace_cliente((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001')) $$,
  '42501', NULL,
  'Un técnico no puede crear el enlace del cliente'
);
SELECT throws_ok(
  $$ SELECT datos_portal('0000000000000000000000000000000000000000000000000000000000000000') $$,
  '42501', NULL,
  'Nadie con sesión llama datos_portal: solo la edge function con la llave de servicio'
);

RESET ROLE;
-- De aquí en adelante los cambios directos los hace el admin: los guards leen el
-- `sub` del JWT aunque la sesión ya no tenga el rol authenticated.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT is((SELECT COUNT(*)::int FROM t_enlace), 1, 'Firmar crea el enlace');
SELECT ok((SELECT token ~ '^[0-9a-f]{64}$' FROM t_enlace), 'El token tiene 64 hexadecimales');
-- La orden ya tiene una foto de recepción registrada (ver el fixture), así que el
-- aviso sale al instante: el cliente firma y el correo está en camino antes de que
-- salga del mostrador.
SELECT results_eq(
  $$ SELECT plantilla, estado, destinatario, enviar_despues_de <= NOW() FROM t_correos $$,
  $$ VALUES ('recepcion'::text, 'pendiente'::text, 'marta@prueba.local'::text, true) $$,
  'Con fotos de recepción ya registradas, el aviso al cliente sale al firmar'
);

-- Volver a firmar no reenvía la recepción.
UPDATE ordenes_trabajo SET firma_ruta = NULL WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-2.png' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
SELECT is((SELECT COUNT(*)::int FROM t_correos WHERE plantilla = 'recepcion'), 1, 'Volver a firmar no programa otro correo de recepción');

-- ------------------------------------------------------------------------------------
-- 2. Cambios de estatus seguidos: un solo aviso, con el último estado
-- ------------------------------------------------------------------------------------
UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
UPDATE ordenes_trabajo SET estatus = 'espera_repuestos' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
SELECT results_eq(
  $$ SELECT datos->>'estatus', enviar_despues_de > NOW() + INTERVAL '150 seconds' FROM t_correos WHERE plantilla = 'estatus' $$,
  $$ VALUES ('espera_repuestos'::text, true) $$,
  'Dos cambios seguidos quedan en un solo aviso pendiente, con el último estado y tres minutos de espera'
);

-- Colapsar una ráfaga está bien; aplazarla, no. Antes cada cambio REINICIABA la
-- espera, así que una orden que se mueve a menudo nunca llegaba a avisar al cliente.
CREATE TEMP TABLE t_programado AS SELECT enviar_despues_de FROM t_correos WHERE plantilla = 'estatus';
UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
SELECT ok(
  (SELECT c.enviar_despues_de <= p.enviar_despues_de FROM t_correos c, t_programado p WHERE c.plantilla = 'estatus'),
  'Un tercer cambio no aplaza el aviso: conserva la hora del primero de la ráfaga'
);

-- Se devuelve al estado que leen las pruebas de abajo: datos_correo usa el estatus
-- del momento del envío, no el de cuando se encoló.
UPDATE ordenes_trabajo SET estatus = 'espera_repuestos' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';

UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002';
SELECT is(
  (SELECT COUNT(*)::int FROM cola_envios c JOIN ordenes_trabajo o ON o.id = c.orden_id
   WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000002'),
  0,
  'Un cliente sin correo no genera correos (tampoco al moverse su orden)'
);

-- Lo que usa process-outbox al enviar.
SELECT results_eq(
  $$ SELECT d->'cliente'->>'email', d->'orden'->>'estatus', (d->>'token') = (SELECT token FROM t_enlace), d->>'vehiculo'
     FROM (SELECT datos_correo(id) AS d FROM t_correos WHERE plantilla = 'estatus') x $$,
  $$ VALUES ('marta@prueba.local'::text, 'espera_repuestos'::text, true, '2019 Toyota Camry'::text) $$,
  'datos_correo lee al enviar: correo actual, estatus actual, enlace y vehículo'
);

-- ------------------------------------------------------------------------------------
-- 3. El portal: solo lo publicado, sin costos ni comisiones
-- ------------------------------------------------------------------------------------
CREATE TEMP TABLE t_portal AS SELECT datos_portal((SELECT token FROM t_enlace)) AS d;

SELECT is((SELECT d->>'estado_enlace' FROM t_portal), 'ok', 'Un enlace activo abre el reporte');
SELECT is((SELECT jsonb_array_length(d->'multimedia') FROM t_portal), 1, 'Solo aparece la multimedia visible (la foto de recepción, no el video interno)');
SELECT results_eq(
  $$ SELECT (d->'cuenta'->>'total')::numeric, (d->'cuenta'->>'pagado')::numeric, (d->'cuenta'->>'saldo')::numeric FROM t_portal $$,
  $$ VALUES (400.00::numeric, 100.00::numeric, 300.00::numeric) $$,
  'La cuenta: total $400, depósito cobrado $100, saldo $300'
);
SELECT ok(
  (SELECT d::text NOT LIKE '%costo_unitario%' AND d::text NOT LIKE '%comision%' AND d::text NOT LIKE '%Luis Mecánico%' AND d::text NOT LIKE '%1HGCM82633A%' FROM t_portal),
  'El portal no expone costos, comisiones, técnicos ni el VIN completo'
);
SELECT is((SELECT accesos FROM t_enlace), 1, 'Abrir el reporte cuenta el acceso');

-- ------------------------------------------------------------------------------------
-- 4. Baja de correos desde el enlace
-- ------------------------------------------------------------------------------------
SELECT is(
  (SELECT preferencia_correos_portal((SELECT token FROM t_enlace), false)->>'ok'),
  'true',
  'El cliente se da de baja desde su enlace'
);
SELECT is(
  (SELECT COUNT(*)::int FROM t_correos WHERE estado = 'pendiente'),
  0,
  'La baja cancela los correos que estaban esperando'
);
UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
SELECT is((SELECT COUNT(*)::int FROM t_correos WHERE estado = 'pendiente'), 0, 'Con la baja, un cambio de estado ya no programa correos');

-- ------------------------------------------------------------------------------------
-- 5. Admin: cambiar el enlace, vencimiento al entregar
-- ------------------------------------------------------------------------------------
CREATE TEMP TABLE t_token_viejo AS SELECT token FROM t_enlace;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ SELECT regenerar_enlace_cliente((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001')) $$,
  'El admin cambia el enlace'
);
RESET ROLE;
SELECT is(
  (SELECT datos_portal((SELECT token FROM t_token_viejo))->>'estado_enlace'),
  'revocado',
  'El enlace anterior deja de abrir'
);

UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
SELECT ok(
  (SELECT expira_en BETWEEN NOW() + INTERVAL '89 days' AND NOW() + INTERVAL '91 days' FROM t_enlace),
  'Entregar fija el vencimiento del enlace a 90 días'
);
UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
SELECT is((SELECT expira_en FROM t_enlace), NULL::timestamptz, 'Sacarla de Entregado quita el vencimiento');

-- ------------------------------------------------------------------------------------
-- 6. Recepción sin fotos todavía: un piso corto, no dos minutos
-- ------------------------------------------------------------------------------------
-- Al final del archivo a propósito: borra la multimedia de recepción, y de aquí en
-- adelante nada la vuelve a mirar.
RESET ROLE;
-- La sección anterior dio de baja al cliente, y sin su consentimiento
-- encolar_correo_cliente devuelve NULL. Se vuelve a suscribir para poder medir la
-- espera, que es lo que esta prueba mira.
UPDATE clientes SET acepta_correos = true
WHERE id = (SELECT cliente_id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001');

DELETE FROM cola_envios WHERE plantilla = 'recepcion';
DELETE FROM orden_media WHERE origen = 'recepcion';
UPDATE ordenes_trabajo SET firma_ruta = NULL WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-3.png' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
SELECT ok(
  (SELECT enviar_despues_de BETWEEN NOW() AND NOW() + INTERVAL '1 minute' FROM t_correos WHERE plantilla = 'recepcion'),
  'Sin fotos todavía, el aviso espera menos de un minuto en vez de dos'
);

-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
