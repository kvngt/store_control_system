-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: hallazgos y la nueva espera (F6)
-- ====================================================================================
-- Qué cubre (migraciones 20261010000010 y 20261010000011): el técnico asignado reporta
-- trabajo adicional y la orden queda en pausa con un avance interno para las fotos y UN
-- aviso a administración; nadie más lo reporta ni lo lee; solo un admin lo cotiza o lo
-- descarta; el técnico no publica el avance del hallazgo; un hallazgo cotizado no basta
-- para enviar un presupuesto (hace falta la tarea); la respuesta del cliente, el descarte
-- y la cancelación sacan la orden de espera solo cuando no queda nada pendiente; al
-- volver a "en proceso" no sale otro correo de estado; el portal recibe solo el texto del
-- admin de lo descartado que va al reporte.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

-- Desde 20261010000022 la firma de recepción no autoriza lo cotizado. Estas pruebas parten de
-- una orden ya autorizada: esto la autoriza como lo hacía la firma (mismo presupuesto como
-- evidencia, vía 'firma_recepcion'), sin depender de la firma.
CREATE FUNCTION pg_temp.autorizar_cotizado(p_orden UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $h$
DECLARE
  v_p presupuestos;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orden_labor WHERE orden_id = p_orden AND estado = 'borrador')
     AND NOT EXISTS (SELECT 1 FROM orden_repuestos WHERE orden_id = p_orden AND estado = 'borrador') THEN
    RETURN;
  END IF;
  v_p := public._crear_presupuesto(p_orden);
  PERFORM public._resolver_presupuesto(
    v_p.id, public._lineas_pendientes(v_p.id), 'firma_recepcion',
    (SELECT c.nombre FROM ordenes_trabajo o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = p_orden),
    NULL, NULL, 'Autorizado en la prueba.', NULL, NULL);
END $h$;

SELECT plan(44);

-- ------------------------------------------------------------------------------------
-- Datos de prueba: un admin, un mecánico asignado y uno que no lo está
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
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta@prueba.local', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica', 'millas_ingreso', 45000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Diagnóstico","costo":100}]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

RESET ROLE;
CREATE TEMP TABLE t_orden_id AS
  SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
GRANT SELECT ON t_orden_id TO authenticated;
CREATE TEMP VIEW t_orden AS
  SELECT * FROM ordenes_trabajo WHERE id = (SELECT id FROM t_orden_id);
-- Lo que la base dejó, visto sin RLS.
CREATE TEMP VIEW t_h AS
  SELECT * FROM orden_hallazgos WHERE orden_id = (SELECT id FROM t_orden_id);
GRANT SELECT ON t_orden, t_h TO authenticated;

-- Lo cotizado está autorizado y la orden arranca. Sin cola previa: así se ve qué correos
-- salen por los hallazgos.
UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png', estatus = 'en_proceso'
WHERE id = (SELECT id FROM t_orden_id);
DO $do$ BEGIN PERFORM pg_temp.autorizar_cotizado((SELECT id FROM t_orden_id)); END $do$;
DELETE FROM notificaciones;
CREATE TEMP TABLE t_res (k TEXT PRIMARY KEY, v JSONB);
GRANT ALL ON t_res TO authenticated;

-- ------------------------------------------------------------------------------------
-- 1. Quién reporta
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
SELECT throws_ok(
  $$ SELECT reportar_hallazgo((SELECT id FROM t_orden_id), 'Fuga de aceite') $$,
  '42501', NULL,
  'Un técnico que no está en la orden no reporta trabajo adicional'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT reportar_hallazgo((SELECT id FROM t_orden_id), '') $$,
  '42501', 'Escribe qué encontraste y qué hay que hacer.',
  'Un hallazgo sin texto se rechaza'
);

INSERT INTO t_res SELECT 'h1', reportar_hallazgo((SELECT id FROM t_orden_id), '  Pastillas de freno gastadas  ');

SELECT ok((SELECT v ? 'hallazgo_id' AND v ? 'avance_id' FROM t_res WHERE k = 'h1'),
  'Reportar devuelve el hallazgo y el avance donde subir las fotos');

RESET ROLE;
SELECT results_eq(
  $$ SELECT estado, descripcion, reportado_por::text, en_reporte FROM t_h $$,
  $$ VALUES ('pendiente'::text, 'Pastillas de freno gastadas'::text, 'a0000000-0000-0000-0000-000000000002'::text, false) $$,
  'El hallazgo nace pendiente, a nombre de quien lo reportó y sin los espacios de los extremos'
);
SELECT results_eq(
  $$ SELECT estatus::text, motivo_autorizacion FROM t_orden $$,
  $$ VALUES ('espera_autorizacion'::text, 'Pastillas de freno gastadas'::text) $$,
  'La orden queda en pausa con el hallazgo como motivo'
);
SELECT results_eq(
  $$ SELECT a.visible_cliente, a.usuario_id::text FROM orden_avances a JOIN t_h ON t_h.avance_id = a.id $$,
  $$ VALUES (false, 'a0000000-0000-0000-0000-000000000002'::text) $$,
  'El avance del hallazgo es interno y es del técnico'
);
SELECT results_eq(
  $$ SELECT tipo, COUNT(*)::int FROM notificaciones GROUP BY tipo $$,
  $$ VALUES ('hallazgo_reportado'::text, 1) $$,
  'Administración recibe UN aviso (ni "Nuevo avance" ni "Requiere autorización" además)'
);
SELECT is(
  (SELECT usuario_id::text FROM notificaciones),
  'a0000000-0000-0000-0000-000000000001',
  'El aviso es para el admin'
);

-- ------------------------------------------------------------------------------------
-- 2. Quién lo lee y qué puede hacer el técnico con su avance
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT is((SELECT COUNT(*)::int FROM orden_hallazgos), 1, 'El técnico de la orden ve el hallazgo');

SELECT throws_ok(
  $$ UPDATE orden_avances SET visible_cliente = true WHERE id = (SELECT avance_id FROM t_h) $$,
  '42501', NULL,
  'El técnico no publica el avance de un hallazgo'
);

SELECT throws_ok(
  $$ INSERT INTO orden_hallazgos (orden_id, sede_id, reportado_por, descripcion)
     SELECT id, sede_id, 'a0000000-0000-0000-0000-000000000002', 'Por la API' FROM t_orden $$,
  '42501', NULL,
  'Nadie escribe orden_hallazgos por la API'
);

SELECT throws_ok(
  $$ SELECT cotizar_hallazgo((SELECT id FROM t_h)) $$,
  '42501', NULL,
  'Un técnico no cotiza un hallazgo'
);
SELECT throws_ok(
  $$ SELECT descartar_hallazgo((SELECT id FROM t_h), false, NULL) $$,
  '42501', NULL,
  'Un técnico no descarta un hallazgo (ni con eso saca la orden de espera)'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
SELECT is_empty('SELECT * FROM orden_hallazgos', 'Un técnico de otra orden no ve sus hallazgos');

RESET ROLE;
SELECT is((SELECT estado FROM t_h), 'pendiente', 'Los intentos del técnico no tocaron el hallazgo');

-- ------------------------------------------------------------------------------------
-- 3. Cotizar: la orden sigue esperando hasta que responda el cliente
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT cotizar_hallazgo((SELECT id FROM t_h)) ->> 'descripcion'),
  'Pastillas de freno gastadas',
  'El admin cotiza y recibe el texto para precargar la tarea'
);
SELECT throws_ok(
  $$ SELECT cotizar_hallazgo((SELECT id FROM t_h)) $$,
  '42501', 'Este trabajo adicional ya se resolvió.',
  'Un hallazgo no se cotiza dos veces'
);
SELECT is((SELECT estatus::text FROM t_orden), 'espera_autorizacion', 'Cotizar no saca la orden de espera');

-- Cotizado, pero sin la tarea todavía: no hay nada que mandarle al cliente.
SELECT throws_ok(
  $$ SELECT enviar_presupuesto((SELECT id FROM t_orden_id), false) $$,
  'P0001', 'No hay trabajos sin autorizar para enviar al cliente.',
  'Un hallazgo cotizado sin tarea no crea un presupuesto vacío'
);

INSERT INTO orden_labor (orden_id, descripcion, costo, reparto_heredado, asignado_a)
SELECT id, 'Pastillas de freno', 250, false, 'a0000000-0000-0000-0000-000000000002' FROM t_orden;
INSERT INTO t_res SELECT 'p1', enviar_presupuesto((SELECT id FROM t_orden_id), false);

SELECT is(
  (SELECT presupuesto_id::text FROM t_h),
  (SELECT v->>'presupuesto_id' FROM t_res WHERE k = 'p1'),
  'Enviar el presupuesto vincula el hallazgo cotizado'
);

-- Un segundo hallazgo mientras el cliente decide: no se pisa el motivo ni se repite la pausa.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
INSERT INTO t_res SELECT 'h2', reportar_hallazgo((SELECT id FROM t_orden_id), 'Llantas traseras a la mitad');
SELECT is((SELECT motivo_autorizacion FROM t_orden), 'Pastillas de freno gastadas',
  'Un hallazgo con la orden ya en pausa no cambia el motivo');

-- El cliente autoriza por teléfono, pero queda un hallazgo pendiente: sigue en pausa.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
DELETE FROM t_res WHERE k = 'r1';
INSERT INTO t_res SELECT 'r1', registrar_autorizacion(
  (SELECT id FROM t_orden_id),
  ARRAY(SELECT id FROM orden_labor WHERE orden_id = (SELECT id FROM t_orden_id) AND estado = 'pendiente'),
  ARRAY(SELECT id FROM orden_labor WHERE orden_id = (SELECT id FROM t_orden_id) AND estado = 'pendiente' ORDER BY id),
  'admin_telefono'
);
SELECT is((SELECT estatus::text FROM t_orden), 'espera_autorizacion',
  'Con un hallazgo pendiente, la respuesta del cliente no saca la orden de espera');

-- ------------------------------------------------------------------------------------
-- 4. Descartar: decide el admin qué ve el cliente
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT descartar_hallazgo((SELECT id FROM t_h WHERE descripcion LIKE 'Llantas%'), true, '  ') $$,
  '42501', 'Escribe el texto que verá el cliente en su reporte.',
  'Mandar al reporte exige el texto para el cliente'
);
SELECT throws_ok(
  $$ SELECT descartar_hallazgo((SELECT id FROM t_h WHERE descripcion LIKE 'Pastillas%'), false, NULL) $$,
  '42501', 'Este trabajo adicional ya se resolvió.',
  'Un hallazgo que ya salió en un presupuesto no se descarta'
);

-- Los correos de estado que había, para ver que la vuelta a "en proceso" no agrega otro.
RESET ROLE;
-- El cliente ya recibió su "en proceso": lo pendiente se da por enviado, así un correo
-- nuevo sería una fila más (y no se fundiría con una pendiente por su clave).
UPDATE cola_envios SET estado = 'enviado'
WHERE orden_id = (SELECT id FROM t_orden_id) AND plantilla = 'estatus' AND estado = 'pendiente';
INSERT INTO cola_envios (canal, plantilla, orden_id, destinatario, estado)
SELECT 'email', 'estatus', id, 'marta@prueba.local', 'enviado' FROM t_orden;
CREATE TEMP TABLE t_correos AS
  SELECT COUNT(*) AS n FROM cola_envios WHERE orden_id = (SELECT id FROM t_orden_id) AND plantilla = 'estatus';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT descartar_hallazgo((SELECT id FROM t_h WHERE descripcion LIKE 'Llantas%'), true,
       '  Las llantas traseras están a la mitad; conviene cambiarlas en unos meses.  ') $$,
  'El admin descarta el hallazgo y lo manda al reporte con su propio texto'
);
SELECT results_eq(
  $$ SELECT estado, en_reporte, texto_cliente, resuelto_por::text FROM t_h WHERE descripcion LIKE 'Llantas%' $$,
  $$ VALUES ('descartado'::text, true,
             'Las llantas traseras están a la mitad; conviene cambiarlas en unos meses.'::text,
             'a0000000-0000-0000-0000-000000000001'::text) $$,
  'Queda descartado, con el texto del admin y quién lo resolvió'
);
SELECT results_eq(
  $$ SELECT estatus::text, motivo_autorizacion FROM t_orden $$,
  $$ VALUES ('en_proceso'::text, NULL::text) $$,
  'Sin nada pendiente, la orden vuelve a "en proceso" y el motivo se limpia'
);

RESET ROLE;
SELECT is(
  (SELECT COUNT(*) FROM cola_envios WHERE orden_id = (SELECT id FROM t_orden_id) AND plantilla = 'estatus'),
  (SELECT n FROM t_correos),
  'Volver de la pausa no le manda al cliente otro correo de "en proceso"'
);

-- ------------------------------------------------------------------------------------
-- 5. El portal: solo el texto del admin, y solo lo que va al reporte
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
INSERT INTO t_res SELECT 'h3', reportar_hallazgo((SELECT id FROM t_orden_id), 'Ruido raro en la suspensión, nota interna');
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ SELECT descartar_hallazgo((SELECT id FROM t_h WHERE descripcion LIKE 'Ruido%'), false, 'No va al reporte') $$,
  'Un hallazgo se puede descartar sin mandarlo al reporte'
);

RESET ROLE;
CREATE TEMP TABLE t_portal AS
  SELECT datos_portal((SELECT token FROM orden_enlaces WHERE orden_id = (SELECT id FROM t_orden_id) AND revocado_en IS NULL LIMIT 1)) AS d;
SELECT ok((SELECT d ? 'observaciones' FROM t_portal), 'El portal trae la clave observaciones');
SELECT is(
  (SELECT jsonb_array_length(d->'observaciones') FROM t_portal),
  1,
  'Solo sale el hallazgo que el admin mandó al reporte'
);
SELECT is(
  (SELECT d->'observaciones'->0->>'texto' FROM t_portal),
  'Las llantas traseras están a la mitad; conviene cambiarlas en unos meses.',
  'Sale el texto del admin'
);
SELECT unalike(
  (SELECT d::text FROM t_portal),
  '%nota interna%',
  'La descripción interna del mecánico no llega al cliente'
);
SELECT unalike(
  (SELECT d::text FROM t_portal),
  '%Luis%',
  'Ni el nombre del técnico'
);
SELECT is(
  (SELECT jsonb_array_length(d->'avances') FROM t_portal),
  0,
  'Los avances de los hallazgos no se publican solos'
);

-- ------------------------------------------------------------------------------------
-- 6. Cancelar el presupuesto ya no deja la orden trabada
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
INSERT INTO t_res SELECT 'h4', reportar_hallazgo((SELECT id FROM t_orden_id), 'Batería débil');
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok($$ SELECT cotizar_hallazgo((SELECT id FROM t_h WHERE descripcion = 'Batería débil')) $$,
  'El admin cotiza el segundo hallazgo');
INSERT INTO orden_labor (orden_id, descripcion, costo, reparto_heredado, asignado_a)
SELECT id, 'Batería nueva', 180, false, 'a0000000-0000-0000-0000-000000000002' FROM t_orden;
INSERT INTO t_res SELECT 'p2', enviar_presupuesto((SELECT id FROM t_orden_id), false);
SELECT is((SELECT estatus::text FROM t_orden), 'espera_autorizacion', 'Con el presupuesto enviado la orden espera');

SELECT lives_ok(
  $$ SELECT cancelar_presupuesto((SELECT (v->>'presupuesto_id')::uuid FROM t_res WHERE k = 'p2')) $$,
  'El admin cancela el presupuesto'
);
SELECT is((SELECT estatus::text FROM t_orden), 'en_proceso', 'Cancelar saca la orden de espera');
SELECT results_eq(
  $$ SELECT estado, presupuesto_id FROM t_h WHERE descripcion = 'Batería débil' $$,
  $$ VALUES ('cotizado'::text, NULL::uuid) $$,
  'El hallazgo sigue cotizado y sale con el próximo presupuesto'
);

-- Y un hallazgo cotizado que no llegó a enviarse se puede descartar.
SELECT lives_ok(
  $$ SELECT descartar_hallazgo((SELECT id FROM t_h WHERE descripcion = 'Batería débil'), false, NULL) $$,
  'Un hallazgo cotizado sin presupuesto se puede descartar'
);

-- ------------------------------------------------------------------------------------
-- 7. Una orden entregada no recibe hallazgos
-- ------------------------------------------------------------------------------------
RESET ROLE;
-- Sin pasar por la entrega con cobro: aquí solo importa el estado.
SET LOCAL session_replication_role = replica;
UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE id = (SELECT id FROM t_orden_id);
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT reportar_hallazgo((SELECT id FROM t_orden_id), 'Otra cosa') $$,
  '42501', NULL,
  'Una orden entregada no recibe hallazgos'
);

-- Ni la función interna ni las RPC quedan abiertas a anon.
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon', 'public.reportar_hallazgo(uuid, text)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.cotizar_hallazgo(uuid)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.descartar_hallazgo(uuid, boolean, text)', 'EXECUTE'),
  'anon no ejecuta las RPC de hallazgos');
SELECT ok(NOT has_function_privilege('authenticated', 'public._salir_de_espera(uuid)', 'EXECUTE'),
  'Nadie con sesión llama _salir_de_espera');

SELECT * FROM finish();
ROLLBACK;
