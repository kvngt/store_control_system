-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: presupuestos y autorización por línea
-- ====================================================================================
-- Qué cubre (migración 20260924000000): lo cotizado no se cobra hasta que se
-- autoriza; la firma de recepción aprueba lo que había; un presupuesto bloquea sus
-- líneas; el cliente responde por línea desde su enlace (con evidencia) y el equipo
-- se entera; un cambio en el presupuesto invalida la respuesta; no se entrega con un
-- presupuesto abierto; cancelar devuelve a borrador; el admin registra autorizaciones
-- por teléfono; el costo de repuestos al entregar cuenta solo lo aprobado; nadie
-- aprueba una línea con un UPDATE.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(32);

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
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta@prueba.local', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris');

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
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Diagnóstico","costo":100}]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
CREATE TEMP VIEW t_orden AS
  SELECT o.*, m.total_general, m.total_repuestos FROM ordenes_trabajo o JOIN orden_montos m ON m.orden_id = o.id
  WHERE o.vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
CREATE TEMP VIEW t_lineas AS
  SELECT id, descripcion, estado, 'labor' AS tipo FROM orden_labor WHERE orden_id = (SELECT id FROM t_orden)
  UNION ALL
  SELECT id, descripcion, estado, 'parte' FROM orden_repuestos WHERE orden_id = (SELECT id FROM t_orden);

-- ------------------------------------------------------------------------------------
-- 1. Borrador: no se cobra; la firma de recepción lo aprueba
-- ------------------------------------------------------------------------------------
SELECT is((SELECT estado FROM t_lineas WHERE descripcion = 'Diagnóstico'), 'borrador', 'Lo cotizado al crear la orden nace como borrador');
SELECT is((SELECT total_general FROM t_orden), 0.00::numeric, 'Un borrador no suma al total de la orden');

UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
SELECT is((SELECT estado FROM t_lineas WHERE descripcion = 'Diagnóstico'), 'aprobado', 'La firma de recepción aprueba lo cotizado');
SELECT is((SELECT total_general FROM t_orden), 100.00::numeric, 'Lo aprobado ya suma al total');
SELECT results_eq(
  $$ SELECT estado, respondido_via, respondido_por_nombre FROM presupuestos WHERE orden_id = (SELECT id FROM t_orden) $$,
  $$ VALUES ('respondido'::text, 'firma_recepcion'::text, 'Marta Ruiz'::text) $$,
  'La aprobación por firma deja su presupuesto como evidencia'
);

-- Después de la firma se agregan trabajos: quedan en borrador.
INSERT INTO orden_labor (orden_id, descripcion, costo, estado) SELECT id, 'Frenos', 300, 'aprobado' FROM t_orden;
INSERT INTO orden_labor (orden_id, descripcion, costo) SELECT id, 'Pintura', 500 FROM t_orden;
INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, precio_venta_unitario) SELECT id, 'Pastillas', 2, 40 FROM t_orden;
SELECT is(
  (SELECT COUNT(*)::int FROM t_lineas WHERE estado = 'borrador'),
  3,
  'Una línea nueva nace en borrador aunque se pida "aprobado"'
);
SELECT is((SELECT total_general FROM t_orden), 100.00::numeric, 'Los borradores no mueven el total');

-- ------------------------------------------------------------------------------------
-- 2. Nadie aprueba con un UPDATE; un técnico no envía presupuestos
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ UPDATE orden_labor SET estado = 'aprobado' WHERE descripcion = 'Frenos' $$,
  '42501', NULL,
  'Ni un admin aprueba una línea con un UPDATE directo'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT enviar_presupuesto((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001')) $$,
  '42501', NULL,
  'Un técnico no puede enviar presupuestos'
);
SELECT is_empty('SELECT * FROM presupuestos', 'Un técnico no lee los presupuestos');

-- ------------------------------------------------------------------------------------
-- 3. Enviar: las líneas quedan pendientes y bloqueadas; se avisa al cliente
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ SELECT enviar_presupuesto((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001')) $$,
  'El admin envía el presupuesto'
);

RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT is((SELECT COUNT(*)::int FROM t_lineas WHERE estado = 'pendiente'), 3, 'Las tres líneas quedan pendientes');
SELECT results_eq(
  $$ SELECT numero, total_propuesto FROM presupuestos WHERE orden_id = (SELECT id FROM t_orden) AND estado = 'enviado' $$,
  $$ VALUES (2, 880.00::numeric) $$,
  'Es el presupuesto 2 de la orden, por $880 (300 + 500 + 2 × 40)'
);
SELECT is(
  (SELECT COUNT(*)::int FROM cola_envios WHERE plantilla = 'presupuesto' AND estado = 'pendiente' AND orden_id = (SELECT id FROM t_orden)),
  1,
  'Se programa el correo del presupuesto al cliente'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ UPDATE orden_labor SET costo = 1 WHERE descripcion = 'Pintura' $$,
  '42501', NULL,
  'Una línea pendiente no se puede editar (el cliente está viendo ese monto)'
);
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'P0001', NULL,
  'No se entrega una orden con un presupuesto esperando respuesta'
);

-- ------------------------------------------------------------------------------------
-- 4. El cliente responde desde su enlace
-- ------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE t_p AS
  SELECT p.id, e.token FROM presupuestos p JOIN orden_enlaces e ON e.orden_id = p.orden_id AND e.revocado_en IS NULL
  WHERE p.orden_id = (SELECT id FROM t_orden) AND p.estado = 'enviado';

-- Como la edge function `portal`: con la llave de servicio y sin usuario. Así nadie
-- queda excluido de los avisos por ser "quien hizo la acción".
SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL request.jwt.claim.sub = '';

SELECT is(
  (SELECT responder_presupuesto_portal(
     (SELECT token FROM t_p), (SELECT id FROM t_p),
     ARRAY(SELECT id FROM t_lineas WHERE descripcion IN ('Frenos', 'Pastillas')),
     ARRAY(SELECT id FROM t_lineas WHERE descripcion IN ('Frenos', 'Pastillas')),
     'Marta Ruiz', NULL, '203.0.113.9', 'Prueba') ->> 'motivo'),
  'presupuesto_cambio',
  'Si el cliente no vio todas las líneas pendientes, la respuesta se rechaza'
);
SELECT is(
  (SELECT responder_presupuesto_portal(
     (SELECT token FROM t_p), (SELECT id FROM t_p),
     ARRAY[]::uuid[], ARRAY(SELECT id FROM t_lineas WHERE estado = 'pendiente'),
     ' ', NULL, NULL, NULL) ->> 'motivo'),
  'nombre_requerido',
  'Autorizar exige el nombre de quien autoriza'
);

-- El caso real: el mecánico la mandó a esperar autorización y el cliente responde.
UPDATE ordenes_trabajo SET estatus = 'espera_autorizacion', motivo_autorizacion = 'Faltan pastillas'
WHERE id = (SELECT id FROM t_orden);

SELECT is(
  (SELECT responder_presupuesto_portal(
     (SELECT token FROM t_p), (SELECT id FROM t_p),
     ARRAY(SELECT id FROM t_lineas WHERE descripcion IN ('Frenos', 'Pastillas')),
     ARRAY(SELECT id FROM t_lineas WHERE estado = 'pendiente'),
     'Marta Ruiz', 'La pintura después', '203.0.113.9', 'Prueba') ->> 'ok'),
  'true',
  'El cliente autoriza frenos y pastillas, y no la pintura'
);

SELECT results_eq(
  $$ SELECT descripcion, estado FROM t_lineas WHERE descripcion IN ('Frenos', 'Pintura', 'Pastillas') ORDER BY descripcion $$,
  $$ VALUES ('Frenos'::text, 'aprobado'::text), ('Pastillas'::text, 'aprobado'::text), ('Pintura'::text, 'rechazado'::text) $$,
  'Cada línea queda como la decidió el cliente'
);
SELECT is((SELECT total_general FROM t_orden), 480.00::numeric, 'El total suma solo lo aprobado: 100 + 300 + 80');
SELECT results_eq(
  $$ SELECT estatus::text, motivo_autorizacion FROM t_orden $$,
  $$ VALUES ('en_proceso'::text, NULL::text) $$,
  'Autorizar saca la orden de espera de autorización y limpia el motivo'
);
SELECT results_eq(
  $$ SELECT respondido_via, respondido_por_nombre, ip, comentario_cliente, total_aprobado
     FROM presupuestos WHERE id = (SELECT id FROM t_p) $$,
  $$ VALUES ('cliente_portal'::text, 'Marta Ruiz'::text, '203.0.113.9'::text, 'La pintura después'::text, 380.00::numeric) $$,
  'Queda la evidencia: vía, nombre, IP, comentario y total autorizado'
);
SELECT is(
  -- Por presupuesto y no por fecha: la firma de recepción también avisó, en la misma
  -- transacción, y NOW() es igual para los dos.
  (SELECT cuerpo FROM notificaciones WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002' AND tipo = 'presupuesto_respondido'
   AND datos->>'presupuesto_id' = (SELECT id FROM t_p)::text),
  'Autorizado: Frenos, Pastillas. No realizar: Pintura.',
  'El mecánico asignado recibe qué hacer y qué no'
);
SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones WHERE usuario_id = 'a0000000-0000-0000-0000-000000000001' AND tipo = 'presupuesto_respondido_cliente'),
  1,
  'El admin se entera de que el cliente respondió'
);
SELECT results_eq(
  $$ SELECT plantilla, estado FROM cola_envios WHERE orden_id = (SELECT id FROM t_orden) AND plantilla LIKE 'presupuesto%' ORDER BY plantilla $$,
  $$ VALUES ('presupuesto'::text, 'omitido'::text), ('presupuesto_confirmacion'::text, 'pendiente'::text) $$,
  'El correo del presupuesto que no salió se omite y se programa la constancia'
);
SELECT is(
  (SELECT responder_presupuesto_portal(
     (SELECT token FROM t_p), (SELECT id FROM t_p), ARRAY[]::uuid[], ARRAY[]::uuid[], 'Marta Ruiz', NULL, NULL, NULL) ->> 'motivo'),
  'ya_respondido',
  'Un presupuesto no se responde dos veces'
);

-- ------------------------------------------------------------------------------------
-- 5. Corregir lo rechazado, cancelar y registrar por teléfono
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
UPDATE orden_labor SET costo = 450 WHERE descripcion = 'Pintura';
SELECT is((SELECT estado FROM t_lineas WHERE descripcion = 'Pintura'), 'borrador', 'Corregir una línea rechazada la vuelve a borrador');

SET LOCAL ROLE authenticated;
DO $do$ BEGIN
  PERFORM enviar_presupuesto((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001'), false);
  PERFORM cancelar_presupuesto((SELECT id FROM presupuestos WHERE estado = 'enviado'));
END $do$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT is((SELECT estado FROM t_lineas WHERE descripcion = 'Pintura'), 'borrador', 'Cancelar el presupuesto devuelve sus líneas a borrador');

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ SELECT registrar_autorizacion(
       (SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001'),
       ARRAY(SELECT id FROM orden_labor WHERE descripcion = 'Pintura'),
       ARRAY(SELECT id FROM orden_labor WHERE descripcion = 'Pintura'),
       'admin_telefono', NULL, 'Llamó por la tarde') $$,
  'El admin registra que el cliente autorizó la pintura por teléfono'
);
RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT results_eq(
  $$ SELECT (SELECT estado FROM t_lineas WHERE descripcion = 'Pintura'), total_general FROM t_orden $$,
  $$ VALUES ('aprobado'::text, 930.00::numeric) $$,
  'La pintura queda aprobada y el total pasa a $930'
);

-- ------------------------------------------------------------------------------------
-- 6. Al entregar, el costo de repuestos cuenta solo lo aprobado
-- ------------------------------------------------------------------------------------
INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, precio_venta_unitario) SELECT id, 'Faro', 1, 200 FROM t_orden;
UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END) FROM finanzas_movimientos
   WHERE referencia_orden_id = (SELECT id FROM t_orden) AND categoria = 'compra_repuesto'),
  80.00::numeric,
  'El costo de repuestos al entregar es solo lo aprobado ($80), no el faro en borrador'
);

-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
