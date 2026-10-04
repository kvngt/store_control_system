-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: lo que un técnico puede tocar de una orden
-- ====================================================================================
-- Qué cubre (migración 20260922000000): un técnico ve y modifica una orden solo si está
-- asignado (verla, desde 20261007000000) y la orden no está entregada, y aun así solo estado y avance (la firma de
-- recepción es de administración desde 20261006000000);
-- no puede sacar una orden de Entregado; los avances siguen la misma regla; ni un
-- avance ni una asignación cambian de orden; la firma apunta a la carpeta de su
-- orden; los buckets del modelo anterior quedan cerrados.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(42);

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
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', 'marta@prueba.local', 'Oak 12'),
  ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Pedro Gil', '555-0141', 'pedro@prueba.local', 'Elm 3');

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
      'deposito_inicial', 100, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Frenos","costo":500}]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

CREATE TEMP VIEW t_orden AS
  SELECT * FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
GRANT SELECT ON t_orden TO authenticated;

-- El id, guardado con la sesión del admin: el técnico no asignado ya no ve la orden
-- (20261007000000), y el INSERT de abajo tiene que chocar con la política, no quedarse sin
-- filas.
CREATE TEMP TABLE t_orden_id AS SELECT id FROM t_orden;

-- ------------------------------------------------------------------------------------
-- 1. Técnico NO asignado: ni la ve, ni la modifica
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';

-- Acordado con el taller (sept. 2026): cada técnico ve su trabajo y nada más. Antes veía
-- todas las órdenes de su sede en solo lectura.
SELECT is_empty('SELECT * FROM t_orden', 'Un técnico no asignado no ve la orden de su sede');

-- La RLS la esconde, así que un UPDATE no llega ni al guardia: cero filas, sin cambios.
SELECT is_empty(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = (SELECT id FROM t_orden_id) RETURNING id $$,
  'Un técnico no asignado no puede cambiar el estado'
);

SELECT is_empty(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 50 WHERE id = (SELECT id FROM t_orden_id) RETURNING id $$,
  'Un técnico no asignado no puede mover el avance'
);

SELECT is_empty(
  $$ UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-1.png', firma_fecha = NOW()
     WHERE id = (SELECT id FROM t_orden_id) RETURNING id $$,
  'Un técnico no asignado no puede capturar la firma'
);

SELECT throws_ok(
  $$ INSERT INTO orden_avances (orden_id, usuario_id, descripcion)
     SELECT id, 'a0000000-0000-0000-0000-000000000004', 'Intento' FROM t_orden_id $$,
  '42501', NULL,
  'Un técnico no asignado no puede agregar avances'
);

-- ------------------------------------------------------------------------------------
-- 2. Técnico asignado: estado y avance, nada más
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso', fecha_finalizacion = NULL
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El técnico asignado cambia el estado'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 40 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El técnico asignado mueve el avance'
);

-- La primera firma aprueba lo cotizado (trg_quote_on_signature): una firma tomada por el
-- técnico fuera de su momento autorizaba dinero. Es de mostrador, aunque esté asignado.
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-1.png', firma_fecha = NOW()
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', 'La firma del cliente la toma administración en la recepción.',
  'El técnico asignado no captura la firma de recepción'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET firma_fecha = NOW()
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Ni cambia solo la fecha de la firma'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-1.png', firma_fecha = NOW()
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Administración captura la firma en la carpeta de la orden'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/otra-orden/firma.png'
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'La firma no puede apuntar a la carpeta de otra orden, tampoco para un admin'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

-- Volver a recepción es donde se captura la firma y donde la primera firma
-- autoriza lo cotizado: es una decisión de administración, no del taller.
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'recepcion'
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'El técnico asignado no puede devolver la orden a Recepción'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado'
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El técnico asignado sí puede darla por finalizada'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso', fecha_finalizacion = NULL
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'Y volver a ponerla en proceso'
);

-- Pedir autorización es lo que un mecánico hace cuando descubre que falta algo. Sin el
-- motivo, el admin no sabe qué cotizar, así que el estado no se puede fijar sin él.
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'espera_autorizacion'
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'El técnico no puede pedir autorización sin decir por qué'
);

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo
     SET estatus = 'espera_autorizacion', motivo_autorizacion = '  El radiador está picado  '
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El técnico pide autorización con su motivo'
);

SELECT is(
  (SELECT motivo_autorizacion FROM t_orden),
  'El radiador está picado',
  'El motivo se guarda sin los espacios de los extremos'
);

-- Al salir del estado, el motivo deja de ser cierto y no debe quedar colgado.
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'en_proceso'
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El técnico saca la orden de espera de autorización'
);

SELECT is(
  (SELECT motivo_autorizacion FROM t_orden),
  NULL::text,
  'Salir del estado limpia el motivo'
);

-- ------------------------------------------------------------------------------------
-- 2b. Marcar un trabajo como completado
-- ------------------------------------------------------------------------------------
-- La firma de recepción ya aprobó los borradores, así que la línea se puede tachar.
SELECT is((SELECT estado FROM orden_labor WHERE descripcion = 'Frenos'), 'aprobado',
  'Punto de partida: la firma de recepción dejó la línea aprobada');

-- La tabla sigue cerrada: un UPDATE directo no pasa la RLS y devuelve cero filas.
SELECT is_empty(
  $$ UPDATE orden_labor SET completado_en = NOW()
     WHERE descripcion = 'Frenos' RETURNING id $$,
  'Un técnico no escribe orden_labor directamente, ni la columna nueva'
);

SELECT lives_ok(
  $$ SELECT marcar_labor_completada((SELECT id FROM orden_labor WHERE descripcion = 'Frenos')) $$,
  'El técnico asignado marca el trabajo por la RPC'
);

SELECT results_eq(
  $$ SELECT completado_en IS NOT NULL, completado_por, costo, estado
     FROM orden_labor WHERE descripcion = 'Frenos' $$,
  $$ VALUES (true, 'a0000000-0000-0000-0000-000000000002'::uuid, 500.00::numeric, 'aprobado'::text) $$,
  'Queda quién y cuándo, y no se toca ni el costo ni el estado de la línea'
);

SELECT lives_ok(
  $$ SELECT marcar_labor_completada((SELECT id FROM orden_labor WHERE descripcion = 'Frenos'), false) $$,
  'Y lo puede desmarcar'
);

SELECT is(
  (SELECT completado_en FROM orden_labor WHERE descripcion = 'Frenos'),
  NULL::timestamptz,
  'Desmarcar borra la marca'
);

-- Un técnico de la misma sede que no está en la orden no decide qué se hizo en ella. El id se
-- toma antes: él ya no ve la línea, y con un NULL la RPC fallaría por otra razón.
CREATE TEMP TABLE t_frenos AS SELECT id FROM orden_labor WHERE descripcion = 'Frenos';
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
SELECT throws_ok(
  $$ SELECT marcar_labor_completada((SELECT id FROM t_frenos)) $$,
  '42501', 'Solo el personal asignado puede marcar el trabajo de esta orden. Pide a administración que te asigne.',
  'Un técnico no asignado no marca el trabajo de esa orden'
);
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

-- Anular la firma rehacía el respaldo de lo autorizado, y además dejaba a
-- trg_quote_on_signature listo para aprobar los borradores en la firma siguiente.
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET firma_ruta = NULL, firma_fecha = NULL
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'El técnico asignado no puede anular la firma de recepción'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET cliente_id = 'c0000000-0000-0000-0000-000000000002'
     WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'El técnico asignado no puede cambiar el cliente de la orden'
);

SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET millas_ingreso = 1 WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'El técnico asignado no puede cambiar las millas de recepción'
);

SELECT lives_ok(
  $$ INSERT INTO orden_avances (id, orden_id, usuario_id, descripcion)
     SELECT 'e0000000-0000-0000-0000-000000000001', id, 'a0000000-0000-0000-0000-000000000002', 'Pastillas cambiadas'
     FROM t_orden $$,
  'El técnico asignado agrega un avance'
);

SELECT throws_ok(
  $$ UPDATE orden_avances SET orden_id = gen_random_uuid() WHERE id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Un avance no se puede mover a otra orden'
);

-- Desde 20261010000006 una asignación solo la edita administración (el técnico cambiaba su
-- propio `tipo_tarea` y con eso movía su comisión): su UPDATE no llega a ninguna fila.
SELECT is_empty(
  $$ UPDATE orden_asignaciones SET usuario_id = 'a0000000-0000-0000-0000-000000000004'
     WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002' RETURNING id $$,
  'El técnico no edita su asignación (ni para pasársela a otra persona)'
);

-- Y ni administración la pasa a otra persona: eso sería quitar a uno y asignar a otro sin
-- que se entere ninguno de los dos.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ UPDATE orden_asignaciones SET usuario_id = 'a0000000-0000-0000-0000-000000000004'
     WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002' $$,
  '42501', NULL,
  'Una asignación no se puede pasar a otra persona'
);
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

-- ------------------------------------------------------------------------------------
-- 3. Orden entregada: cerrada para el técnico, abierta para el admin
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El admin entrega la orden'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'Ni el técnico asignado puede sacar una orden de Entregado (revertiría el cobro y sus comisiones)'
);

RESET ROLE;
SELECT is(
  (SELECT estatus::text FROM t_orden),
  'entregado',
  'La orden sigue entregada tras el intento'
);
SELECT is(
  (SELECT COUNT(*)::int FROM comisiones c JOIN t_orden o ON o.id = c.orden_id),
  1,
  'Y su comisión sigue ahí'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ INSERT INTO orden_avances (orden_id, usuario_id, descripcion)
     SELECT id, 'a0000000-0000-0000-0000-000000000002', 'Después de entregar' FROM t_orden $$,
  '42501', NULL,
  'El técnico no agrega avances a una orden entregada'
);

SELECT is_empty(
  $$ DELETE FROM orden_avances WHERE id = 'e0000000-0000-0000-0000-000000000001' RETURNING id $$,
  'El técnico no borra su avance de una orden entregada (se llevaría sus archivos)'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'El admin sí puede sacar una orden de Entregado'
);

-- ------------------------------------------------------------------------------------
-- 4. Buckets del modelo anterior
-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'vehiculos_fotos'),
  false,
  'El bucket viejo de fotos de vehículos ya no es público'
);
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'firmas'),
  false,
  'El bucket viejo de firmas ya no es público'
);

-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
