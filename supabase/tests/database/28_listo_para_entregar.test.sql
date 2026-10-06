-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: finalizar y "Listo para entregar"
-- ====================================================================================
-- Qué cubre (migración 20261010000021, pedido del taller del 05/10/2026):
--   * el técnico finaliza, pero no reabre (ni por `reportar_hallazgo`): solo administración;
--   * finalizar NO le avisa al cliente: el correo pendiente es el de "en proceso", y
--     `datos_correo` / `datos_portal` lo tratan como "en proceso" / "no lista";
--   * administración marca "Listo para entregar" y recién entonces sale el correo "finalizado";
--   * la marca solo la escribe la RPC, no se repite, y se borra al reabrir;
--   * el aviso a administración dice que el trabajo terminó, y `requiere_atencion` lo cuenta
--     como "por revisar" hasta que se marca;
--   * permisos de las funciones nuevas.
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

SELECT plan(23);

INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('28000000-0000-0000-0000-000000000001', 'Sede Listo', 'Calle 28', '555-2800');

INSERT INTO auth.users (id, email) VALUES
  ('a2800000-0000-0000-0000-000000000001', 'admin28@prueba.local'),
  ('a2800000-0000-0000-0000-000000000002', 'tec28@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a2800000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '28000000-0000-0000-0000-000000000001', 'admin28@prueba.local'),
  ('a2800000-0000-0000-0000-000000000002', 'Tec Mecánico', 'mecanico', '28000000-0000-0000-0000-000000000001', 'tec28@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c2800000-0000-0000-0000-000000000001', '28000000-0000-0000-0000-000000000001', 'Marta Ruiz', '+15550280', 'marta28@prueba.local', 'Oak 28');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d2800000-0000-0000-0000-000000000001', 'c2800000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A028001', NULL, 'Gris');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a2800000-0000-0000-0000-000000000001';
SELECT create_work_order(
  jsonb_build_object(
    'sede_id', '28000000-0000-0000-0000-000000000001',
    'cliente_id', 'c2800000-0000-0000-0000-000000000001',
    'vehiculo_id', 'd2800000-0000-0000-0000-000000000001',
    'tipo_trabajo', 'mecanica', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
    'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-12-31',
    'creado_por', 'a2800000-0000-0000-0000-000000000001'),
  '[{"descripcion":"Frenos","costo":200,"especialidad":"mecanica","asignado_a":"a2800000-0000-0000-0000-000000000002","reparto_heredado":false}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb);
RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.o() RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd2800000-0000-0000-0000-000000000001' $$;
CREATE TEMP TABLE t_res (k TEXT PRIMARY KEY, v JSONB);
GRANT ALL ON t_res TO authenticated;

UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png', estatus = 'en_proceso' WHERE id = pg_temp.o();
DO $do$ BEGIN PERFORM pg_temp.autorizar_cotizado(pg_temp.o()); END $do$;
DELETE FROM notificaciones;
DELETE FROM cola_envios WHERE canal = 'email' AND plantilla = 'estatus';

-- ------------------------------------------------------------------------------------
-- 1. El técnico finaliza, pero no reabre
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2800000-0000-0000-0000-000000000002';
SELECT lives_ok($$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = pg_temp.o() $$,
  'El técnico asignado finaliza la orden');
SELECT throws_ok($$ UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = pg_temp.o() $$,
  '42501', 'La orden ya está finalizada. Solo un administrador puede reabrirla.',
  'Pero no la vuelve a poner en proceso');
SELECT throws_ok($$ SELECT reportar_hallazgo(pg_temp.o(), 'Se ve algo más') $$,
  '42501', 'La orden ya está finalizada. Solo un administrador puede reabrirla.',
  'Ni la reabre reportando trabajo adicional');
SELECT throws_ok($$ SELECT marcar_lista_para_entregar(pg_temp.o()) $$, '42501', NULL,
  'Un técnico no marca "listo para entregar"');
SELECT throws_ok($$ UPDATE ordenes_trabajo SET lista_para_entregar_en = now() WHERE id = pg_temp.o() $$, '42501', NULL,
  'Y no escribe la marca directo');
RESET ROLE;

-- ------------------------------------------------------------------------------------
-- 2. Finalizar no le avisa al cliente
-- ------------------------------------------------------------------------------------
SELECT is((SELECT COUNT(*)::int FROM cola_envios WHERE orden_id = pg_temp.o() AND canal = 'email' AND plantilla = 'estatus'
           AND datos->>'estatus' = 'finalizado'), 0,
  'Finalizar no encola el correo "su vehículo está listo"');

-- Un correo cualquiera de la orden, solo para preguntarle a `datos_correo` qué estatus leería
-- el `process-outbox` ahora mismo.
INSERT INTO cola_envios (canal, destinatario, plantilla, orden_id)
VALUES ('email', 'marta28@prueba.local', 'reporte', pg_temp.o());
CREATE OR REPLACE FUNCTION pg_temp.job() RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM cola_envios WHERE orden_id = pg_temp.o() AND canal = 'email' AND plantilla = 'reporte' LIMIT 1 $$;
SELECT is((public.datos_correo(pg_temp.job())->'orden'->>'estatus'), 'en_proceso',
  'Mientras no se confirme, el correo recibe el estatus "en proceso"');
SELECT is((SELECT datos_portal(token)->'orden'->>'lista_para_entregar' FROM orden_enlaces WHERE orden_id = pg_temp.o() AND revocado_en IS NULL),
  'false', 'El enlace del cliente sabe que todavía no está lista');
SELECT is((SELECT COUNT(*)::int FROM notificaciones WHERE tipo = 'orden_finalizada' AND titulo LIKE 'Trabajo terminado%'
           AND usuario_id = 'a2800000-0000-0000-0000-000000000001'), 1,
  'Administración recibe el aviso de que el trabajo terminó (hay que revisarlo)');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2800000-0000-0000-0000-000000000001';
INSERT INTO t_res VALUES ('antes', requiere_atencion('28000000-0000-0000-0000-000000000001', '2026-10-05'));
RESET ROLE;
SELECT is((SELECT v->'por_revisar'->>'total' FROM t_res WHERE k = 'antes'), '1',
  'La orden cuenta como "por revisar" en el panel de administración');

-- ------------------------------------------------------------------------------------
-- 3. Administración la marca lista
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2800000-0000-0000-0000-000000000001';
INSERT INTO t_res VALUES ('marca', marcar_lista_para_entregar(pg_temp.o()));
INSERT INTO t_res VALUES ('marca2', marcar_lista_para_entregar(pg_temp.o()));
INSERT INTO t_res VALUES ('despues', requiere_atencion('28000000-0000-0000-0000-000000000001', '2026-10-05'));
RESET ROLE;

SELECT is((SELECT v->>'ya_estaba' FROM t_res WHERE k = 'marca'), 'false', 'Administración la marca lista para entregar');
SELECT is((SELECT v->>'ya_estaba' FROM t_res WHERE k = 'marca2'), 'true', 'Marcarla otra vez no hace nada');
SELECT ok((SELECT lista_para_entregar_en IS NOT NULL AND lista_para_entregar_por = 'a2800000-0000-0000-0000-000000000001'
           FROM ordenes_trabajo WHERE id = pg_temp.o()), 'Queda quién y cuándo');
SELECT is((SELECT COUNT(*)::int FROM cola_envios WHERE orden_id = pg_temp.o() AND canal = 'email' AND plantilla = 'estatus'
           AND datos->>'estatus' = 'finalizado'), 1,
  'Entonces sí se encola el correo "finalizado", y una sola vez');
SELECT is((public.datos_correo(pg_temp.job())->'orden'->>'estatus'), 'finalizado',
  'Y el correo ya anuncia "finalizado"');
SELECT is((SELECT datos_portal(token)->'orden'->>'lista_para_entregar' FROM orden_enlaces WHERE orden_id = pg_temp.o() AND revocado_en IS NULL),
  'true', 'El enlace del cliente ya dice que está lista');
SELECT is((SELECT v->'por_revisar'->>'total' FROM t_res WHERE k = 'despues'), '0', 'Y sale de "por revisar"');
SELECT ok(EXISTS (SELECT 1 FROM historial_orden WHERE orden_id = pg_temp.o() AND cambios ? 'lista_para_entregar_en'),
  'El historial registra la marca');

-- ------------------------------------------------------------------------------------
-- 4. Reabrir borra la marca; volver a finalizar exige marcar de nuevo
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2800000-0000-0000-0000-000000000001';
SELECT lives_ok($$ UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = pg_temp.o() $$, 'Administración reabre la orden');
RESET ROLE;
SELECT ok((SELECT lista_para_entregar_en IS NULL FROM ordenes_trabajo WHERE id = pg_temp.o()), 'Reabrirla borra la marca');
SELECT throws_ok($$ SELECT marcar_lista_para_entregar(pg_temp.o()) $$, '22023', NULL,
  'Solo una orden finalizada se marca lista para entregar');

-- ------------------------------------------------------------------------------------
-- 5. Permisos de las funciones nuevas
-- ------------------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('anon', 'public.marcar_lista_para_entregar(uuid)', 'EXECUTE')
      AND has_function_privilege('authenticated', 'public.marcar_lista_para_entregar(uuid)', 'EXECUTE'),
  'marcar_lista_para_entregar: sin sesión no, con sesión sí (y adentro exige admin)');
SELECT ok(NOT has_function_privilege('authenticated', 'public._estatus_cliente(order_status, timestamptz)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.trg_guard_lista_para_entregar()', 'EXECUTE'),
  'Las funciones internas no son RPC');

SELECT * FROM finish();
ROLLBACK;
