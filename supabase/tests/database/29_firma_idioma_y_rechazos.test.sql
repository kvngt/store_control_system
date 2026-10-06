-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: pedidos del taller del 06/10/2026
-- ====================================================================================
-- Qué cubre (migración 20261010000022): la firma de recepción ya no autoriza lo cotizado;
-- si el cliente no autoriza nada, el técnico de la orden se entera; el cliente elige el
-- idioma desde su enlace (inglés por defecto) y los correos y el portal lo reciben junto con
-- las traducciones; lo que administración manda al reporte también se traduce; "Mis
-- comisiones" suma en la base solo lo de quien la llama.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(21);

INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('29000000-0000-0000-0000-000000000001', 'Sede 29', 'Calle 1', '555-0100');

INSERT INTO auth.users (id, email) VALUES
  ('a2900000-0000-0000-0000-000000000001', 'admin29@prueba.local'),
  ('a2900000-0000-0000-0000-000000000002', 'mecanico29@prueba.local'),
  ('a2900000-0000-0000-0000-000000000003', 'pintor29@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a2900000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '29000000-0000-0000-0000-000000000001', 'admin29@prueba.local'),
  ('a2900000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '29000000-0000-0000-0000-000000000001', 'mecanico29@prueba.local'),
  ('a2900000-0000-0000-0000-000000000003', 'Paula Pintora', 'pintor', '29000000-0000-0000-0000-000000000001', 'pintor29@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c2900000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta29@prueba.local', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d2900000-0000-0000-0000-000000000001', 'c2900000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A290001', NULL, 'Gris');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a2900000-0000-0000-0000-000000000001';

DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '29000000-0000-0000-0000-000000000001',
      'cliente_id', 'c2900000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd2900000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 0, 'inspeccion_360_notas', 'Rayón en la puerta', 'fecha_estimada_entrega', '2026-10-20',
      'creado_por', 'a2900000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Cambio de aceite","costo":100,"asignado_a":"a2900000-0000-0000-0000-000000000002","reparto_heredado":false}]'::jsonb,
    '[]'::jsonb,
    '[{"usuario_id":"a2900000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

RESET ROLE;
CREATE FUNCTION pg_temp.o() RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd2900000-0000-0000-0000-000000000001' $$;
CREATE TEMP TABLE t_res (k TEXT PRIMARY KEY, v JSONB);
GRANT ALL ON t_res TO authenticated;

-- ------------------------------------------------------------------------------------
-- 1. La firma no autoriza lo cotizado
-- ------------------------------------------------------------------------------------
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_order_quote_signature'),
  'Ya no existe el trigger que aprobaba lo cotizado al firmar');

SET LOCAL ROLE authenticated;
UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png', firma_fecha = NOW()
WHERE id = pg_temp.o();
RESET ROLE;

SELECT results_eq(
  $$ SELECT (SELECT estado FROM orden_labor WHERE orden_id = pg_temp.o()),
            (SELECT total_general FROM orden_montos WHERE orden_id = pg_temp.o()),
            (SELECT COUNT(*)::int FROM presupuestos WHERE orden_id = pg_temp.o()) $$,
  $$ VALUES ('borrador'::text, 0.00::numeric, 0) $$,
  'Firmar deja lo cotizado en borrador, sin total ni presupuesto'
);
SELECT ok(
  (SELECT firma_ruta IS NOT NULL FROM ordenes_trabajo WHERE id = pg_temp.o()),
  'La firma sí queda guardada: es la conformidad con cómo se recibió el vehículo'
);

-- ------------------------------------------------------------------------------------
-- 2. El cliente no autoriza nada: el técnico se entera y la orden sale de espera
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = pg_temp.o();
DO $do$ BEGIN PERFORM enviar_presupuesto(pg_temp.o(), false); END $do$;
RESET ROLE;
DELETE FROM notificaciones;

SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = pg_temp.o()),
  'espera_autorizacion',
  'Enviado el presupuesto, la orden espera la respuesta'
);

-- Como la edge function `portal`: con la llave de servicio y sin usuario.
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claim.role = 'service_role';
INSERT INTO t_res SELECT 'resp', responder_presupuesto_portal(
  (SELECT token FROM orden_enlaces WHERE orden_id = pg_temp.o() AND revocado_en IS NULL),
  (SELECT id FROM presupuestos WHERE orden_id = pg_temp.o() AND estado = 'enviado'),
  ARRAY[]::uuid[],
  ARRAY(SELECT id FROM orden_labor WHERE orden_id = pg_temp.o()),
  'Marta Ruiz', NULL, NULL, NULL);
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a2900000-0000-0000-0000-000000000001';

SELECT is((SELECT v->>'rechazados' FROM t_res WHERE k = 'resp'), '1', 'El cliente no autorizó el trabajo');
SELECT results_eq(
  $$ SELECT (SELECT estado FROM orden_labor WHERE orden_id = pg_temp.o()),
            (SELECT estatus::text FROM ordenes_trabajo WHERE id = pg_temp.o()) $$,
  $$ VALUES ('rechazado'::text, 'en_proceso'::text) $$,
  'La línea queda rechazada y la orden vuelve a "en proceso"'
);
SELECT results_eq(
  $$ SELECT titulo, cuerpo, (datos->>'autorizados')::int FROM notificaciones
     WHERE usuario_id = 'a2900000-0000-0000-0000-000000000002' AND tipo = 'presupuesto_respondido' $$,
  $$ VALUES ((SELECT 'Trabajo no autorizado · ' || numero_orden FROM ordenes_trabajo WHERE id = pg_temp.o()),
             'No realizar: Cambio de aceite.'::text, 0) $$,
  'El mecánico asignado recibe que el trabajo no se hace'
);

-- ------------------------------------------------------------------------------------
-- 3. Idioma del cliente
-- ------------------------------------------------------------------------------------
SELECT is((SELECT idioma FROM clientes WHERE id = 'c2900000-0000-0000-0000-000000000001'), 'en',
  'Un cliente nace con los correos en inglés');
SELECT throws_ok(
  $$ UPDATE clientes SET idioma = 'fr' WHERE id = 'c2900000-0000-0000-0000-000000000001' $$,
  '23514', NULL,
  'Solo español o inglés'
);
SELECT ok(NOT has_function_privilege('anon', 'public.preferencia_idioma_portal(text, text)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.preferencia_idioma_portal(text, text)', 'EXECUTE'),
  'El idioma se cambia solo por la edge function del portal');

INSERT INTO t_res SELECT 'mal', preferencia_idioma_portal(repeat('0', 64), 'es');
INSERT INTO t_res SELECT 'es', preferencia_idioma_portal(
  (SELECT token FROM orden_enlaces WHERE orden_id = pg_temp.o() AND revocado_en IS NULL), 'es');
INSERT INTO t_res SELECT 'fr', preferencia_idioma_portal(
  (SELECT token FROM orden_enlaces WHERE orden_id = pg_temp.o() AND revocado_en IS NULL), 'fr');
SELECT is((SELECT v->>'ok' FROM t_res WHERE k = 'mal'), 'false', 'Un enlace que no existe no cambia nada');
SELECT is((SELECT v->>'ok' FROM t_res WHERE k = 'fr'), 'false', 'Un idioma que no existe tampoco');
SELECT is((SELECT idioma FROM clientes WHERE id = 'c2900000-0000-0000-0000-000000000001'), 'es',
  'El cliente eligió español en su enlace');

-- ------------------------------------------------------------------------------------
-- 4. Traducciones: el portal y los correos las reciben
-- ------------------------------------------------------------------------------------
INSERT INTO traducciones (sede_id, md5_hash, idioma_destino, texto_original, traduccion) VALUES
  ('29000000-0000-0000-0000-000000000001', md5('Cambio de aceite'), 'en', 'Cambio de aceite', 'Oil change'),
  ('29000000-0000-0000-0000-000000000001', md5('Rayón en la puerta'), 'en', 'Rayón en la puerta', 'Scratch on the door'),
  -- De otra orden: no tiene que salir.
  ('29000000-0000-0000-0000-000000000001', md5('Pintura completa'), 'en', 'Pintura completa', 'Full paint job');

INSERT INTO t_res SELECT 'portal', datos_portal(
  (SELECT token FROM orden_enlaces WHERE orden_id = pg_temp.o() AND revocado_en IS NULL));
SELECT is((SELECT v->'traducciones' FROM t_res WHERE k = 'portal'),
  '{"Cambio de aceite": "Oil change", "Rayón en la puerta": "Scratch on the door"}'::jsonb,
  'El portal recibe las traducciones de los textos de ESTA orden');
SELECT is((SELECT v->'cliente'->>'idioma' FROM t_res WHERE k = 'portal'), 'es',
  'Y el idioma que eligió el cliente');

INSERT INTO cola_envios (id, canal, destinatario, plantilla, orden_id, datos)
VALUES ('e2900000-0000-0000-0000-000000000001', 'email', 'marta29@prueba.local', 'reporte', pg_temp.o(), '{}'::jsonb);
INSERT INTO t_res SELECT 'correo', datos_correo('e2900000-0000-0000-0000-000000000001');
SELECT results_eq(
  $$ SELECT v->'cliente'->>'idioma', v->'traducciones'->>'Cambio de aceite' FROM t_res WHERE k = 'correo' $$,
  $$ VALUES ('es'::text, 'Oil change'::text) $$,
  'El correo sale con el idioma del cliente y las traducciones'
);

-- Lo que administración manda al reporte también se traduce.
DELETE FROM cola_envios WHERE canal = 'traduccion';
INSERT INTO orden_hallazgos (orden_id, sede_id, reportado_por, descripcion, estado, en_reporte, texto_cliente)
VALUES (pg_temp.o(), '29000000-0000-0000-0000-000000000001', 'a2900000-0000-0000-0000-000000000002',
        'Llantas a la mitad', 'descartado', true, 'Las llantas traseras están a la mitad');
SELECT is(
  (SELECT COUNT(*)::int FROM cola_envios WHERE canal = 'traduccion' AND orden_id = pg_temp.o() AND estado = 'pendiente'),
  1,
  'Una observación que va al reporte encola su traducción'
);
SELECT ok(
  'Las llantas traseras están a la mitad' = ANY (_textos_cliente(pg_temp.o()))
  AND NOT ('Llantas a la mitad' = ANY (_textos_cliente(pg_temp.o()))),
  'Se traduce el texto de administración, nunca el del mecánico'
);

-- ------------------------------------------------------------------------------------
-- 5. "Mis comisiones": cada quien suma solo lo suyo
-- ------------------------------------------------------------------------------------
INSERT INTO comision_pagos (id, sede_id, usuario_id, monto, fecha_pago, metodo) VALUES
  ('f2900000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'a2900000-0000-0000-0000-000000000002', 150, hoy_taller('29000000-0000-0000-0000-000000000001'), 'efectivo'),
  ('f2900000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001', 'a2900000-0000-0000-0000-000000000002', 50, '2026-01-15', 'cheque'),
  ('f2900000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000001', 'a2900000-0000-0000-0000-000000000003', 999, hoy_taller('29000000-0000-0000-0000-000000000001'), 'efectivo');
INSERT INTO comisiones (orden_id, usuario_id, sede_id, base_ganancia, porcentaje, tecnicos, monto, especialidad, estado) VALUES
  (pg_temp.o(), 'a2900000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001', 100, 40, 1, 40, 'mecanica', 'aceptada'),
  (pg_temp.o(), 'a2900000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000001', 100, 30, 1, 30, 'pintura', 'aceptada');

SELECT ok(NOT has_function_privilege('anon', 'public.resumen_mis_comisiones()', 'EXECUTE'),
  'anon no la llama');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2900000-0000-0000-0000-000000000002';
INSERT INTO t_res SELECT 'mias', resumen_mis_comisiones();
RESET ROLE;
SELECT is((SELECT v FROM t_res WHERE k = 'mias'),
  '{"por_cobrar": 40.00, "pagado_mes": 150.00, "pagado_total": 200.00, "pagos": 2}'::jsonb,
  'El mecánico ve lo que tiene por cobrar y lo que le pagaron, sin lo de su compañera');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2900000-0000-0000-0000-000000000003';
SELECT is((SELECT (resumen_mis_comisiones()->>'pagado_total')::numeric), 999.00::numeric,
  'Y la pintora, solo lo suyo');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
