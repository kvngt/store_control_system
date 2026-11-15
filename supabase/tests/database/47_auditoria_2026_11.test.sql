-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: Auditoría 2026-11 (20261010000043)
-- ====================================================================================
-- Qué cubre (puntos 1–10 y 12–15; el punto 11 es solo de plantillas de correo en TS):
--  1. recalculate_order_totals, aplicar_descuento, _recalcular_parqueo y
--     ajustar_parqueo_orden toman candado FOR UPDATE sobre ordenes_trabajo.
--  2. trg_guard_perfil_privilegios impide cambiar email por API autenticada (no admin).
--  3. orden_media_delete excluye objetos de inspecciones publicadas (y conserva dueño/admin).
--  4. trg_guard_order_technician impide escribir fecha_finalizacion sin romper transiciones.
--  5. orden_avances_delete impide borrar un avance ligado a orden_hallazgos.
--  6. trg_guard_order_delete_entregada impide borrar con sesión una orden con dinero registrado en Finanzas.
--  7. descartar_hallazgo rechaza (42501) si la orden ya fue entregada.
--  8. iniciar_reloj rechaza (42501) a quien no es admin en una orden finalizado.
--  9. Enlace revocado manualmente (revocado_por): correos omitidos; Crear enlace sí regenera.
-- 10. datos_correo expone orden.retirada_sin_reparar.
-- 12. traducciones_admin_select / update globales para administración (todas las sedes).
-- 13. is_assigned_to_order exige sede actual del técnico.
-- 14. datos_servicio devuelve diccionario hacia 'en' aunque el sticker sea 'es'.
-- 15. traducciones_portal revocada de anon/authenticated (queda service_role).
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(48);

-- ------------------------------------------------------------------------------------
-- Datos base propios (UUIDs con prefijo hexadecimal 47)
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('47000000-0000-0000-0000-000000000001', 'Sede QA 47-A', 'Calle 47A', '555-4701', 'America/New_York'),
  ('47000000-0000-0000-0000-000000000002', 'Sede QA 47-B', 'Calle 47B', '555-4702', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('47a00000-0000-0000-0000-000000000001', 'admin47@prueba.com'),
  ('47b00000-0000-0000-0000-000000000001', 'tec47@prueba.com');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('47a00000-0000-0000-0000-000000000001', 'Admin 47', 'admin',    '47000000-0000-0000-0000-000000000001', 'admin47@prueba.com'),
  ('47b00000-0000-0000-0000-000000000001', 'Tec 47',   'mecanico', '47000000-0000-0000-0000-000000000001', 'tec47@prueba.com');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos, idioma) VALUES
  ('47c00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Cliente 47', '+15554701', 'cli47@prueba.com', 'Ave 47', true, 'es');

INSERT INTO vehiculos (id, cliente_id, sede_id, marca, modelo, anio, vin, placa, color) VALUES
  ('47d00000-0000-0000-0000-000000000001', '47c00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Toyota', 'Camry',   2022, '4T1BURHE0MC004701', 'QA-471', 'Gris'),
  ('47d00000-0000-0000-0000-000000000002', '47c00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Honda',  'Civic',   2021, '4T1BURHE0MC004702', 'QA-472', 'Azul'),
  ('47d00000-0000-0000-0000-000000000003', '47c00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Ford',   'Focus',   2020, '4T1BURHE0MC004703', 'QA-473', 'Rojo'),
  ('47d00000-0000-0000-0000-000000000004', '47c00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Mazda',  'Mazda3',  2019, '4T1BURHE0MC004704', 'QA-474', 'Negro'),
  ('47d00000-0000-0000-0000-000000000005', '47c00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Nissan', 'Sentra',  2018, '4T1BURHE0MC004705', 'QA-475', 'Blanco'),
  ('47d00000-0000-0000-0000-000000000006', '47c00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Kia',    'Forte',   2023, '4T1BURHE0MC004706', 'QA-476', 'Plata'),
  ('47d00000-0000-0000-0000-000000000007', '47c00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Hyundai','Elantra', 2022, '4T1BURHE0MC004707', 'QA-477', 'Verde'),
  ('47d00000-0000-0000-0000-000000000008', '47c00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Subaru', 'Impreza', 2021, '4T1BURHE0MC004708', 'QA-478', 'Gris');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '47a00000-0000-0000-0000-000000000001';

-- Órdenes de prueba:
--  ..01 en_proceso (puntos 1, 4, 5, 7 permitido, 8 permitido, 9, 13)
--  ..02 finalizado (punto 8)
--  ..03 entregada normal (puntos 7, 10)
--  ..04 en_proceso con anticipo (punto 6 rechazo)
--  ..05 en_proceso sin dinero (punto 6 borrado permitido)
--  ..06 en_proceso con movimiento finanzas (punto 6 borrado permitido sin sesión)
--  ..07 en_proceso servicio próximo (punto 14)
--  ..08 en_proceso para retirar sin reparar (punto 10)
INSERT INTO ordenes_trabajo (
  id, sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
) VALUES
  ('47e00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', '47c00000-0000-0000-0000-000000000001', '47d00000-0000-0000-0000-000000000001', 'mecanica', 1000, 'full', '2026-12-01', '47a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('47e00000-0000-0000-0000-000000000002', '47000000-0000-0000-0000-000000000001', '47c00000-0000-0000-0000-000000000001', '47d00000-0000-0000-0000-000000000002', 'mecanica', 2000, 'full', '2026-12-01', '47a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('47e00000-0000-0000-0000-000000000003', '47000000-0000-0000-0000-000000000001', '47c00000-0000-0000-0000-000000000001', '47d00000-0000-0000-0000-000000000003', 'mecanica', 3000, 'full', '2026-12-01', '47a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('47e00000-0000-0000-0000-000000000004', '47000000-0000-0000-0000-000000000001', '47c00000-0000-0000-0000-000000000001', '47d00000-0000-0000-0000-000000000004', 'mecanica', 4000, 'full', '2026-12-01', '47a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('47e00000-0000-0000-0000-000000000005', '47000000-0000-0000-0000-000000000001', '47c00000-0000-0000-0000-000000000001', '47d00000-0000-0000-0000-000000000005', 'mecanica', 5000, 'full', '2026-12-01', '47a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('47e00000-0000-0000-0000-000000000006', '47000000-0000-0000-0000-000000000001', '47c00000-0000-0000-0000-000000000001', '47d00000-0000-0000-0000-000000000006', 'mecanica', 6000, 'full', '2026-12-01', '47a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('47e00000-0000-0000-0000-000000000007', '47000000-0000-0000-0000-000000000001', '47c00000-0000-0000-0000-000000000001', '47d00000-0000-0000-0000-000000000007', 'mecanica', 7000, 'full', '2026-12-01', '47a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('47e00000-0000-0000-0000-000000000008', '47000000-0000-0000-0000-000000000001', '47c00000-0000-0000-0000-000000000001', '47d00000-0000-0000-0000-000000000008', 'mecanica', 8000, 'full', '2026-12-01', '47a00000-0000-0000-0000-000000000001', 'en_proceso');

INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea) VALUES
  ('47e00000-0000-0000-0000-000000000001', '47b00000-0000-0000-0000-000000000001', 'mecanica'),
  ('47e00000-0000-0000-0000-000000000002', '47b00000-0000-0000-0000-000000000001', 'mecanica');

SELECT set_config('restorify.presupuesto', 'on', true);
INSERT INTO orden_labor (id, orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado, completado_en) VALUES
  ('47f00000-0000-0000-0000-000000000001', '47e00000-0000-0000-0000-000000000001', 'Servicio mayor', 200, 'mecanica', '47b00000-0000-0000-0000-000000000001', 'aprobado', false, NULL),
  ('47f00000-0000-0000-0000-000000000002', '47e00000-0000-0000-0000-000000000002', 'Diagnóstico',    120, 'mecanica', '47b00000-0000-0000-0000-000000000001', 'aprobado', false, NULL);
SELECT set_config('restorify.presupuesto', 'off', true);

UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = '47e00000-0000-0000-0000-000000000002';

INSERT INTO orden_avances (id, orden_id, usuario_id, descripcion) VALUES
  ('47f10000-0000-0000-0000-000000000001', '47e00000-0000-0000-0000-000000000001', '47b00000-0000-0000-0000-000000000001', 'Avance ligado a hallazgo'),
  ('47f10000-0000-0000-0000-000000000002', '47e00000-0000-0000-0000-000000000001', '47b00000-0000-0000-0000-000000000001', 'Avance libre'),
  ('47f10000-0000-0000-0000-000000000003', '47e00000-0000-0000-0000-000000000007', '47b00000-0000-0000-0000-000000000001', 'Avance ligado borrado por admin');

INSERT INTO orden_hallazgos (id, orden_id, sede_id, reportado_por, descripcion, estado, avance_id) VALUES
  ('47f20000-0000-0000-0000-000000000001', '47e00000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', '47b00000-0000-0000-0000-000000000001', 'Junta dañada',        'descartado', '47f10000-0000-0000-0000-000000000001'),
  ('47f20000-0000-0000-0000-000000000002', '47e00000-0000-0000-0000-000000000003', '47000000-0000-0000-0000-000000000001', '47b00000-0000-0000-0000-000000000001', 'Hallazgo preentrega', 'pendiente',  NULL),
  ('47f20000-0000-0000-0000-000000000003', '47e00000-0000-0000-0000-000000000007', '47000000-0000-0000-0000-000000000001', '47b00000-0000-0000-0000-000000000001', 'Hallazgo admin test', 'pendiente',  '47f10000-0000-0000-0000-000000000003');

-- Anticipos / movimientos del sistema para punto 6
SELECT public.registrar_anticipo('47e00000-0000-0000-0000-000000000004', 50, 'efectivo');
SELECT public.registrar_anticipo('47e00000-0000-0000-0000-000000000006', 50, 'efectivo');

-- Enlace y entregas para puntos 7 y 10
SELECT public.crear_enlace_cliente('47e00000-0000-0000-0000-000000000003');
SELECT public.entregar_orden('47e00000-0000-0000-0000-000000000003');

SELECT public.crear_enlace_cliente('47e00000-0000-0000-0000-000000000008');
SELECT public.retirar_sin_reparar('47e00000-0000-0000-0000-000000000008');

-- Traducciones y próximo servicio para puntos 12 y 14
INSERT INTO traducciones (sede_id, md5_hash, idioma_destino, texto_original, traduccion, origen) VALUES
  ('47000000-0000-0000-0000-000000000001', md5('Cambio de aceite y filtro'), 'en', 'Cambio de aceite y filtro', 'Oil and filter change', 'manual'),
  ('47000000-0000-0000-0000-000000000002', md5('Balanceo de llantas'),       'en', 'Balanceo de llantas',       'Tire balancing auto',   'auto');

INSERT INTO orden_proximo_servicio (orden_id, sede_id, fecha, millas, nota, token, idioma) VALUES
  ('47e00000-0000-0000-0000-000000000007', '47000000-0000-0000-0000-000000000001', '2026-12-15', 55000, 'Cambio de aceite y filtro', repeat('a7', 32), 'es');

-- ====================================================================================
-- PUNTO 1: recalculate_order_totals toma FOR UPDATE sobre ordenes_trabajo
-- ====================================================================================
-- [1] Falla sin la migración
SELECT matches(
  pg_get_functiondef('public.recalculate_order_totals(uuid)'::regprocedure),
  'FROM\s+ordenes_trabajo\s+WHERE\s+id\s*=\s*target_order_id\s+FOR\s+UPDATE',
  '1. recalculate_order_totals toma candado FOR UPDATE sobre ordenes_trabajo antes de leer'
);

SELECT set_config('restorify.descuento', 'on', true);
UPDATE orden_montos
SET descuento = 25, descuento_motivo = 'Cortesía'
WHERE orden_id = '47e00000-0000-0000-0000-000000000001';
SELECT set_config('restorify.descuento', 'off', true);

-- [2] Permitido: recálculo funciona normalmente
SELECT lives_ok(
  $$ SELECT public.recalculate_order_totals('47e00000-0000-0000-0000-000000000001') $$,
  '1. recalculate_order_totals recalcula los totales sin error'
);

-- [3] Total correcto tras descuento
SELECT is(
  (SELECT total_general FROM orden_montos WHERE orden_id = '47e00000-0000-0000-0000-000000000001'),
  175.00::numeric,
  '1. el total_general refleja labor aprobada menos descuento'
);

-- [4b-1] Orden de candados: aplicar_descuento toma FOR UPDATE sobre ordenes_trabajo antes de orden_montos
SELECT matches(
  pg_get_functiondef('public.aplicar_descuento(uuid, numeric, text, numeric)'::regprocedure),
  'FROM\s+ordenes_trabajo\s+WHERE\s+id\s*=\s*p_orden_id\s+FOR\s+UPDATE',
  '1. aplicar_descuento toma candado FOR UPDATE sobre ordenes_trabajo antes de orden_montos'
);

-- [4b-2] Orden de candados: _recalcular_parqueo toma FOR UPDATE sobre ordenes_trabajo
SELECT matches(
  pg_get_functiondef('public._recalcular_parqueo(uuid)'::regprocedure),
  'FROM\s+ordenes_trabajo\s+WHERE\s+id\s*=\s*p_orden_id\s+FOR\s+UPDATE',
  '1. _recalcular_parqueo toma candado FOR UPDATE sobre ordenes_trabajo al inicio'
);

-- [4b-3] Orden de candados: ajustar_parqueo_orden toma FOR UPDATE sobre ordenes_trabajo
SELECT matches(
  pg_get_functiondef('public.ajustar_parqueo_orden(uuid, jsonb)'::regprocedure),
  'FROM\s+ordenes_trabajo\s+WHERE\s+id\s*=\s*p_orden_id\s+FOR\s+UPDATE',
  '1. ajustar_parqueo_orden toma candado FOR UPDATE sobre ordenes_trabajo al inicio'
);

SET LOCAL ROLE authenticated;

-- [4b-4] aplicar_descuento sigue funcionando con el candado nuevo
SELECT is(
  (public.aplicar_descuento('47e00000-0000-0000-0000-000000000001', 10, 'Promo QA')->>'total')::numeric,
  190.00::numeric,
  '1. aplicar_descuento sigue aplicando el descuento y recalculando el total'
);

-- [4b-5] ajustar_parqueo_orden (y _recalcular_parqueo) sigue funcionando con el candado nuevo
DO $$
DECLARE
  v_parqueo JSONB;
BEGIN
  v_parqueo := public.ajustar_parqueo_orden(
    '47e00000-0000-0000-0000-000000000001',
    '{"dias_exonerados": 2, "nota": "Ajuste QA"}'::jsonb
  );
  PERFORM set_config('test.parqueo47', (v_parqueo IS NOT NULL)::text, true);
END $$;

RESET ROLE;

SELECT is(
  current_setting('test.parqueo47')::boolean
    AND (SELECT nota = 'Ajuste QA' AND dias_exonerados = 2 FROM orden_parqueo WHERE orden_id = '47e00000-0000-0000-0000-000000000001'),
  true,
  '1. ajustar_parqueo_orden y _recalcular_parqueo siguen guardando el ajuste de parqueo'
);

-- ====================================================================================
-- PUNTO 2: Correo del perfil en trg_guard_perfil_privilegios
-- ====================================================================================
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '47b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [4] Falla sin la migración
SELECT throws_ok(
  $$ UPDATE perfiles SET email = 'hack47@prueba.com' WHERE id = '47b00000-0000-0000-0000-000000000001' $$,
  '42501', 'Solo un administrador puede cambiar el correo de un usuario.',
  '2. un usuario no admin no puede cambiar su propio email por la API'
);

-- [5] Permitido: editar su teléfono sigue permitido
SELECT lives_ok(
  $$ UPDATE perfiles SET telefono = '555-9999' WHERE id = '47b00000-0000-0000-0000-000000000001' $$,
  '2. un usuario no admin sí puede actualizar su teléfono'
);

RESET ROLE;
SET LOCAL request.jwt.claim.sub = '47a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [6] Permitido: un admin sí puede cambiar el email
SELECT lives_ok(
  $$ UPDATE perfiles SET email = 'tec47-edit@prueba.com' WHERE id = '47b00000-0000-0000-0000-000000000001' $$,
  '2. administración sí puede cambiar el email de un perfil'
);

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL request.jwt.claim.sub  = '';

-- [7] Permitido: la ruta de servicio (update-employee) sigue pudiendo cambiar email
SELECT lives_ok(
  $$ UPDATE perfiles SET email = 'tec47@prueba.com' WHERE id = '47b00000-0000-0000-0000-000000000001' $$,
  '2. la ruta service_role sigue pudiendo actualizar email'
);

-- ====================================================================================
-- PUNTO 3: Fotos de inspección publicada protegidas en orden_media_delete
-- ====================================================================================
-- Nota: storage.protect_delete() impide DELETE directo por SQL en storage.objects; se valida
-- la definición vigente de la política RLS en pg_policies.

-- [8] Falla sin la migración
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'orden_media_delete'
      AND qual LIKE '%orden_inspecciones%'
      AND qual LIKE '%publicada_en%'
  ),
  '3. la política orden_media_delete excluye objetos de inspecciones con publicada_en'
);

-- [9] Permitido: conserva borrado por dueño antes de publicar y por admin
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'orden_media_delete'
      AND qual LIKE '%is_admin%'
      AND qual LIKE '%owner%'
  ),
  '3. orden_media_delete conserva el permiso para dueño (antes de publicar) y administración'
);

-- ====================================================================================
-- PUNTO 4: fecha_finalizacion quitada de v_permitidas en trg_guard_order_technician
-- ====================================================================================
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '47b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [10] Falla sin la migración
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET fecha_finalizacion = NOW() WHERE id = '47e00000-0000-0000-0000-000000000001' $$,
  '42501', 'Solo un administrador puede cambiar los datos de recepción de una orden.',
  '4. el técnico asignado no puede escribir fecha_finalizacion'
);

-- [11] Permitido: el técnico reporta trabajo adicional -> orden pasa a espera_autorizacion
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.reportar_hallazgo('47e00000-0000-0000-0000-000000000001', 'Falta aprobar junta');
  PERFORM set_config('test.hallazgo47', v_res->>'hallazgo_id', true);
END $$;

SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = '47e00000-0000-0000-0000-000000000001'),
  'espera_autorizacion',
  '4. reportar_hallazgo pasa la orden de en_proceso a espera_autorizacion'
);

RESET ROLE;
SET LOCAL request.jwt.claim.sub = '47a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
-- Administración descarta el hallazgo: _salir_de_espera devuelve la orden sola a en_proceso
SELECT public.descartar_hallazgo(current_setting('test.hallazgo47')::uuid, false, NULL);

-- [12] Comprobar retorno automático a en_proceso tras descartar el hallazgo pendiente
SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = '47e00000-0000-0000-0000-000000000001'),
  'en_proceso',
  '4. descartar_hallazgo vuelve la orden sola a en_proceso (_salir_de_espera)'
);

RESET ROLE;
SET LOCAL request.jwt.claim.sub = '47b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [13] Permitido: en_proceso -> finalizado (la orden tiene labor '47f00000-...-01' aprobada, regla 041)
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = '47e00000-0000-0000-0000-000000000001' $$,
  '4. el técnico sigue pudiendo pasar en_proceso -> finalizado'
);

RESET ROLE;
SET LOCAL request.jwt.claim.sub = '47a00000-0000-0000-0000-000000000001';
UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = '47e00000-0000-0000-0000-000000000001';

-- ====================================================================================
-- PUNTO 5: Avance ligado a un hallazgo no se borra por quien no es admin
-- ====================================================================================
SET LOCAL request.jwt.claim.sub = '47b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

DELETE FROM orden_avances WHERE id = '47f10000-0000-0000-0000-000000000001';

-- [14] Falla sin la migración
SELECT ok(
  EXISTS (SELECT 1 FROM orden_avances WHERE id = '47f10000-0000-0000-0000-000000000001'),
  '5. un técnico no puede borrar un avance propio ligado a un hallazgo'
);

UPDATE orden_avances SET descripcion = 'Avance actualizado' WHERE id = '47f10000-0000-0000-0000-000000000001';

-- [15] Permitido: editar su avance ligado sigue permitido
SELECT ok(
  (SELECT descripcion = 'Avance actualizado' FROM orden_avances WHERE id = '47f10000-0000-0000-0000-000000000001'),
  '5. el técnico sí puede editar su propio avance ligado a un hallazgo'
);

DELETE FROM orden_avances WHERE id = '47f10000-0000-0000-0000-000000000002';

-- [16] Permitido: borrar su avance sin hallazgo ligado sigue permitido
SELECT ok(
  NOT EXISTS (SELECT 1 FROM orden_avances WHERE id = '47f10000-0000-0000-0000-000000000002'),
  '5. el técnico sí puede borrar un avance propio sin hallazgo ligado'
);

RESET ROLE;
SET LOCAL request.jwt.claim.sub = '47a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

DELETE FROM orden_avances WHERE id = '47f10000-0000-0000-0000-000000000003';

-- [17] Permitido: admin sí puede borrar un avance ligado a un hallazgo
SELECT ok(
  NOT EXISTS (SELECT 1 FROM orden_avances WHERE id = '47f10000-0000-0000-0000-000000000003'),
  '5. administración sí puede borrar un avance aunque esté ligado a un hallazgo'
);

-- ====================================================================================
-- PUNTO 6: Orden sin entregar con dinero registrado en finanzas_movimientos no se borra
-- ====================================================================================
-- [18] Falla sin la migración
SELECT throws_ok(
  $$ DELETE FROM ordenes_trabajo WHERE id = '47e00000-0000-0000-0000-000000000004' $$,
  '42501', 'Esta orden ya tiene dinero registrado en Finanzas. Para cancelarla usa «Retirada sin reparar», que registra la devolución.',
  '6. con sesión no se puede borrar una orden sin entregar con movimientos en finanzas_movimientos'
);

-- [19] Permitido: orden sin dinero cobrado sí se puede borrar
SELECT lives_ok(
  $$ DELETE FROM ordenes_trabajo WHERE id = '47e00000-0000-0000-0000-000000000005' $$,
  '6. una orden sin dinero cobrado sí se puede borrar'
);

RESET ROLE;
SET LOCAL request.jwt.claim.role = '';
SET LOCAL request.jwt.claim.sub  = '';

-- [20] Permitido: sin sesión (scripts de mantenimiento) no se frena
SELECT lives_ok(
  $$ DELETE FROM ordenes_trabajo WHERE id = '47e00000-0000-0000-0000-000000000006' $$,
  '6. sin sesión (auth.uid() IS NULL) sí se puede borrar para mantenimiento'
);

-- ====================================================================================
-- PUNTO 7: descartar_hallazgo en orden entregada
-- ====================================================================================
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '47a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [21] Falla sin la migración
SELECT throws_ok(
  $$ SELECT public.descartar_hallazgo('47f20000-0000-0000-0000-000000000002', false, NULL) $$,
  '42501', 'La orden ya fue entregada: su reporte ya no se cambia.',
  '7. descartar_hallazgo rechaza en una orden entregada'
);

-- [22] Permitido: descartar_hallazgo en orden no entregada sigue funcionando
SELECT lives_ok(
  $$ SELECT public.descartar_hallazgo('47f20000-0000-0000-0000-000000000003', true, 'Descartado en proceso') $$,
  '7. descartar_hallazgo sigue permitido en una orden abierta'
);

-- ====================================================================================
-- PUNTO 8: iniciar_reloj en orden finalizado (técnico vs admin)
-- ====================================================================================
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '47b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [23] Falla sin la migración
SELECT throws_ok(
  $$ SELECT public.iniciar_reloj('47f00000-0000-0000-0000-000000000002') $$,
  '42501', 'La orden ya está terminada. Si falta algo, pide a administración que la reabra.',
  '8. el técnico no inicia el reloj en una orden finalizado'
);

-- [24] Permitido: el técnico sí inicia el reloj en una orden en_proceso
SELECT lives_ok(
  $$ SELECT public.iniciar_reloj('47f00000-0000-0000-0000-000000000001') $$,
  '8. el técnico sí puede iniciar el reloj en una orden en_proceso'
);

RESET ROLE;
SET LOCAL request.jwt.claim.sub = '47a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [25] Permitido: administración sí inicia el reloj en una orden finalizado
SELECT lives_ok(
  $$ SELECT public.iniciar_reloj('47f00000-0000-0000-0000-000000000002') $$,
  '8. administración sí puede iniciar el reloj en una orden finalizado'
);

-- ====================================================================================
-- PUNTO 9: Enlace desactivado a mano no se recrea en caminos automáticos
-- ====================================================================================
SELECT public.crear_enlace_cliente('47e00000-0000-0000-0000-000000000001');
SELECT public.revocar_enlace_cliente('47e00000-0000-0000-0000-000000000001');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL request.jwt.claim.sub  = '';

-- [26] revocado_por guarda quién desactivó el enlace
SELECT is(
  (SELECT revocado_por FROM orden_enlaces WHERE orden_id = '47e00000-0000-0000-0000-000000000001' AND revocado_en IS NOT NULL LIMIT 1),
  '47a00000-0000-0000-0000-000000000001'::uuid,
  '9. revocar_enlace_cliente guarda revocado_por con auth.uid()'
);

-- [27] Camino automático encolar_correo_cliente no encola y retorna NULL
SELECT is(
  public.encolar_correo_cliente('47e00000-0000-0000-0000-000000000001', 'estatus', '{"estatus":"en_proceso"}'::jsonb),
  NULL::uuid,
  '9. encolar_correo_cliente devuelve NULL si el enlace fue revocado a mano'
);

-- [28] Falla sin la migración: no existe ningún enlace activo recreado automáticamente
SELECT ok(
  NOT EXISTS (SELECT 1 FROM orden_enlaces WHERE orden_id = '47e00000-0000-0000-0000-000000000001' AND revocado_en IS NULL),
  '9. el camino automático no crea un nuevo enlace activo tras revocación manual'
);

-- [29] Queda constancia en cola_envios con estado omitido
SELECT ok(
  EXISTS (
    SELECT 1 FROM cola_envios
    WHERE orden_id = '47e00000-0000-0000-0000-000000000001'
      AND estado = 'omitido'
      AND ultimo_error = 'El enlace del cliente fue desactivado manualmente.'
  ),
  '9. encolar_correo_cliente registra estado omitido con ultimo_error'
);

-- Fila preexistente en cola_envios procesada por datos_correo tras revocación manual
INSERT INTO cola_envios (id, canal, destinatario, plantilla, datos, orden_id, estado) VALUES
  ('47f30000-0000-0000-0000-000000000001', 'email', 'cli47@prueba.com', 'estatus', '{}'::jsonb, '47e00000-0000-0000-0000-000000000001', 'pendiente');

-- [30] datos_correo también devuelve NULL sin recrear enlace
SELECT is(
  public.datos_correo('47f30000-0000-0000-0000-000000000001'),
  NULL::jsonb,
  '9. datos_correo devuelve NULL si el enlace más reciente fue revocado a mano'
);

-- [31] Y marca ese correo como omitido
SELECT is(
  (SELECT estado FROM cola_envios WHERE id = '47f30000-0000-0000-0000-000000000001'),
  'omitido',
  '9. datos_correo marca la fila de cola_envios como omitido'
);

SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '47a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [32] Permitido: el botón manual «Crear enlace» sí crea un nuevo enlace activo
SELECT ok(
  (public.crear_enlace_cliente('47e00000-0000-0000-0000-000000000001')).id IS NOT NULL,
  '9. crear_enlace_cliente (botón manual) sí crea un nuevo enlace activo tras revocar'
);

-- ====================================================================================
-- PUNTO 10: datos_correo expone retirada_sin_reparar
-- ====================================================================================
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL request.jwt.claim.sub  = '';

INSERT INTO cola_envios (id, canal, destinatario, plantilla, datos, orden_id, estado) VALUES
  ('47f30000-0000-0000-0000-000000000002', 'email', 'cli47@prueba.com', 'estatus', '{}'::jsonb, '47e00000-0000-0000-0000-000000000008', 'pendiente'),
  ('47f30000-0000-0000-0000-000000000003', 'email', 'cli47@prueba.com', 'estatus', '{}'::jsonb, '47e00000-0000-0000-0000-000000000003', 'pendiente');

-- [33] Falla sin la migración
SELECT is(
  ((public.datos_correo('47f30000-0000-0000-0000-000000000002')->'orden'->>'retirada_sin_reparar')::boolean),
  true,
  '10. datos_correo expone orden.retirada_sin_reparar = true en retirada sin reparar'
);

-- [34] Permitido / entrega normal mantiene false
SELECT is(
  ((public.datos_correo('47f30000-0000-0000-0000-000000000003')->'orden'->>'retirada_sin_reparar')::boolean),
  false,
  '10. datos_correo expone orden.retirada_sin_reparar = false en entrega normal'
);

-- ====================================================================================
-- PUNTO 12: traducciones globales para administración
-- ====================================================================================
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '47a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [35] Falla sin la migración: Admin de Sede A ve traducciones de Sede B
SELECT ok(
  EXISTS (SELECT 1 FROM public.traducciones WHERE sede_id = '47000000-0000-0000-0000-000000000002' AND texto_original = 'Balanceo de llantas'),
  '12. administración ve traducciones de otra sede'
);

UPDATE public.traducciones
SET traduccion = 'Tire balancing manual', origen = 'manual'
WHERE sede_id = '47000000-0000-0000-0000-000000000002' AND texto_original = 'Balanceo de llantas';

-- [36] Admin de Sede A puede actualizar traducciones de Sede B
SELECT is(
  (SELECT traduccion FROM public.traducciones WHERE sede_id = '47000000-0000-0000-0000-000000000002' AND texto_original = 'Balanceo de llantas'),
  'Tire balancing manual',
  '12. administración puede editar traducciones de cualquier sede'
);

RESET ROLE;
SET LOCAL request.jwt.claim.sub = '47b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [37] Permitido / seguridad conservada: un técnico sigue sin ver traducciones
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.traducciones WHERE sede_id = '47000000-0000-0000-0000-000000000002'),
  '12. quien no es admin sigue sin ver la tabla traducciones'
);

-- ====================================================================================
-- PUNTO 13: is_assigned_to_order exige sede actual del técnico
-- ====================================================================================
-- [38] Permitido: asignado en su sede actual devuelve true
SELECT is(
  public.is_assigned_to_order('47e00000-0000-0000-0000-000000000001'),
  true,
  '13. is_assigned_to_order devuelve true cuando la orden pertenece a la sede actual del técnico'
);

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL request.jwt.claim.sub  = '';
UPDATE perfiles SET sede_id = '47000000-0000-0000-0000-000000000002' WHERE id = '47b00000-0000-0000-0000-000000000001';

SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '47b00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [39] Falla sin la migración: tras cambiar de sede ya no cuenta como asignado a orden de sede anterior
SELECT is(
  public.is_assigned_to_order('47e00000-0000-0000-0000-000000000001'),
  false,
  '13. is_assigned_to_order devuelve false si la orden es de otra sede aunque exista asignación previa'
);

-- ====================================================================================
-- PUNTO 14: datos_servicio devuelve diccionario hacia 'en' aunque sticker sea 'es'
-- ====================================================================================
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL request.jwt.claim.sub  = '';

-- [40] Falla sin la migración
SELECT is(
  (public.datos_servicio(repeat('a7', 32))->'traducciones'->>'Cambio de aceite y filtro'),
  'Oil and filter change',
  '14. datos_servicio incluye traducción al inglés aunque el idioma del sticker sea es'
);

-- [41] Permitido / sticker conserva idioma = es
SELECT is(
  (public.datos_servicio(repeat('a7', 32))->>'idioma'),
  'es',
  '14. datos_servicio conserva el idioma propio del sticker (es)'
);

-- ====================================================================================
-- PUNTO 15: traducciones_portal revocada para anon y authenticated
-- ====================================================================================
-- [42] Falla sin la migración
SELECT ok(
  NOT has_function_privilege('anon', 'public.traducciones_portal(text)', 'EXECUTE'),
  '15. anon no tiene EXECUTE sobre traducciones_portal'
);

-- [43] Permitido: service_role conserva EXECUTE para la edge function portal
SELECT ok(
  has_function_privilege('service_role', 'public.traducciones_portal(text)', 'EXECUTE'),
  '15. service_role conserva EXECUTE sobre traducciones_portal'
);

SELECT * FROM finish();
ROLLBACK;
