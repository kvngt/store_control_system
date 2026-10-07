-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: correo al técnico (20261010000023)
-- ====================================================================================
-- Qué cubre: al asignar una orden o tareas, y al responder el cliente un presupuesto, al
-- técnico le llega un correo además del aviso; varias tareas seguidas se juntan en uno; el
-- correo no lleva `orden_id` (así `datos_correo`, el del cliente, nunca lo toma); a un
-- administrador no le llega; sin un correo válido no se encola.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(8);

INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Sede 30', 'Calle 1', '555-0100');

INSERT INTO auth.users (id, email) VALUES
  ('a3000000-0000-0000-0000-000000000001', 'admin30@prueba.local'),
  ('a3000000-0000-0000-0000-000000000002', 'mecanico30@prueba.local'),
  ('a3000000-0000-0000-0000-000000000003', 'pintor30@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a3000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '30000000-0000-0000-0000-000000000001', 'admin30@prueba.local'),
  ('a3000000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '30000000-0000-0000-0000-000000000001', 'Mecanico30@Prueba.local'),
  ('a3000000-0000-0000-0000-000000000003', 'Paula Pintora', 'pintor', '30000000-0000-0000-0000-000000000001', 'sin-arroba');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c3000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta30@prueba.local', 'Oak 12');
INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A300001', NULL, 'Gris');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a3000000-0000-0000-0000-000000000001';

-- Dos tareas al mecánico y una a la pintora (sin un correo válido).
DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '30000000-0000-0000-0000-000000000001',
      'cliente_id', 'c3000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd3000000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'combinado', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-20',
      'creado_por', 'a3000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Frenos","costo":100,"especialidad":"mecanica","asignado_a":"a3000000-0000-0000-0000-000000000002","reparto_heredado":false},
      {"descripcion":"Alineación","costo":50,"especialidad":"mecanica","asignado_a":"a3000000-0000-0000-0000-000000000002","reparto_heredado":false},
      {"descripcion":"Pintar puerta","costo":300,"especialidad":"pintura","asignado_a":"a3000000-0000-0000-0000-000000000003","reparto_heredado":false}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb
  );
END $do$;
RESET ROLE;

CREATE TEMP VIEW t_correos AS
  SELECT * FROM cola_envios WHERE canal = 'email' AND plantilla = 'empleado';

SELECT results_eq(
  $$ SELECT destinatario, orden_id IS NULL, jsonb_array_length(datos->'lineas'), enviar_despues_de > NOW() FROM t_correos $$,
  $$ VALUES ('mecanico30@prueba.local'::text, true, 2, true) $$,
  'Un solo correo al mecánico por sus dos tareas, sin orden_id y con unos minutos para juntar'
);
SELECT ok(
  (SELECT datos->'lineas' ? 'Frenos — 2019 Toyota Camry' AND datos->'lineas' ? 'Alineación — 2019 Toyota Camry' FROM t_correos),
  'Cada tarea es una línea del correo'
);
SELECT is(
  (SELECT datos->>'url' FROM t_correos),
  (SELECT '/work-orders?open=' || id FROM ordenes_trabajo WHERE vehiculo_id = 'd3000000-0000-0000-0000-000000000001'),
  'Lleva el enlace a la orden'
);
SELECT is((SELECT COUNT(*)::int FROM t_correos WHERE destinatario LIKE '%sin-arroba%'), 0,
  'Sin un correo válido no se encola (la pintora sigue teniendo su aviso en la campana)');
SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones WHERE usuario_id = 'a3000000-0000-0000-0000-000000000003' AND tipo = 'tarea_asignada'),
  1, 'El aviso de la campana no cambia');
SELECT is((SELECT datos_correo(id) FROM t_correos), NULL::jsonb,
  'datos_correo (el del cliente) no lo toma: el correo del técnico nunca le llega al cliente');

-- El cliente no autoriza: correo aparte, con el resultado.
SET LOCAL ROLE authenticated;
UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE vehiculo_id = 'd3000000-0000-0000-0000-000000000001';
DO $do$ BEGIN PERFORM enviar_presupuesto((SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd3000000-0000-0000-0000-000000000001'), false); END $do$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claim.role = 'service_role';
DO $do$ BEGIN
  PERFORM responder_presupuesto_portal(
    (SELECT e.token FROM orden_enlaces e JOIN ordenes_trabajo o ON o.id = e.orden_id WHERE o.vehiculo_id = 'd3000000-0000-0000-0000-000000000001' AND e.revocado_en IS NULL),
    (SELECT p.id FROM presupuestos p JOIN ordenes_trabajo o ON o.id = p.orden_id WHERE o.vehiculo_id = 'd3000000-0000-0000-0000-000000000001' AND p.estado = 'enviado'),
    ARRAY[]::uuid[],
    ARRAY(SELECT l.id FROM orden_labor l JOIN ordenes_trabajo o ON o.id = l.orden_id WHERE o.vehiculo_id = 'd3000000-0000-0000-0000-000000000001'),
    'Marta Ruiz', NULL, NULL, NULL);
END $do$;

SELECT results_eq(
  $$ SELECT datos->>'tipo', datos->>'titulo' FROM t_correos WHERE datos->>'tipo' = 'presupuesto_respondido' $$,
  $$ SELECT 'presupuesto_respondido'::text, 'Trabajo no autorizado · ' || numero_orden FROM ordenes_trabajo WHERE vehiculo_id = 'd3000000-0000-0000-0000-000000000001' $$,
  'Cuando el cliente responde, al mecánico le llega un correo con el resultado'
);
SELECT is((SELECT COUNT(*)::int FROM t_correos WHERE destinatario = 'admin30@prueba.local'), 0,
  'A administración no le llegan estos correos');

SELECT * FROM finish();
ROLLBACK;
