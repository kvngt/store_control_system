-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: hallazgos de la auditoría de septiembre 2026
-- ====================================================================================
-- Qué cubre (migración 20260926000000): nadie sin rol ejecuta las funciones internas
-- de dinero; un técnico no inserta una orden ya entregada ni con otro número; solo la
-- primera firma autoriza lo cotizado; montos negativos rechazados; un aviso que tumba
-- la función termina en error; no se borra una orden con comisiones pagadas.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(25);

-- ------------------------------------------------------------------------------------
-- 1. Funciones internas fuera del alcance de la API
-- ------------------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('anon', 'public.reverse_order_delivery_finance(uuid)', 'EXECUTE'),
  'Sin sesión no se puede revertir el cobro de una orden');
SELECT ok(NOT has_function_privilege('authenticated', 'public.reverse_order_delivery_finance(uuid)', 'EXECUTE'),
  'Con sesión tampoco: solo el trigger de des-entregar la llama');
SELECT ok(NOT has_function_privilege('authenticated', 'public.sync_order_commissions(uuid)', 'EXECUTE'),
  'Nadie recalcula comisiones por la API');
SELECT ok(NOT has_function_privilege('authenticated', 'public.sync_order_parts_expense(uuid)', 'EXECUTE'),
  'Nadie asienta costo de repuestos por la API');
SELECT ok(NOT has_function_privilege('authenticated', 'public.recalculate_order_totals(uuid)', 'EXECUTE'),
  'Nadie recalcula totales por la API');
SELECT ok(NOT has_function_privilege('anon', 'public.pay_commissions(uuid, uuid[], date, text, text, text, text)', 'EXECUTE'),
  'Sin sesión no se llama pay_commissions');
SELECT ok(has_function_privilege('authenticated', 'public.pay_commissions(uuid, uuid[], date, text, text, text, text)', 'EXECUTE'),
  'Con sesión sí (la función valida que sea admin)');

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
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', '', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '2HGFG12678H500001', NULL, 'Azul');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';

-- ------------------------------------------------------------------------------------
-- 2. Un técnico que inserta directo por la API
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

SELECT lives_ok(
  $$ INSERT INTO ordenes_trabajo (numero_orden, sede_id, cliente_id, vehiculo_id, tipo_trabajo, estatus,
       millas_ingreso, nivel_gasolina, fecha_estimada_entrega, porcentaje_avance, total_labor, creado_por, firma_ruta)
     VALUES ('ORD-2026-900', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
       'd0000000-0000-0000-0000-000000000002', 'mecanica', 'entregado', 10, '1/2', '2026-10-01', 90, 5000,
       'a0000000-0000-0000-0000-000000000001', 'otra/orden/firma-1.png') $$,
  'Un técnico puede registrar una recepción directo por la API'
);

RESET ROLE;
SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002'),
  'recepcion',
  'La orden nace en recepción aunque la pida entregada'
);
SELECT ok(
  (SELECT porcentaje_avance = 0 AND total_labor = 0 AND firma_ruta IS NULL
          AND creado_por = 'a0000000-0000-0000-0000-000000000002'
   FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002'),
  'Sin avance, sin mano de obra, sin firma ajena y con el técnico como autor'
);
SELECT isnt(
  (SELECT numero_orden FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002'),
  'ORD-2026-900',
  'El número lo genera el sistema'
);
SELECT ok(
  COALESCE((SELECT ultimo_numero FROM numero_orden_contadores WHERE anio = EXTRACT(YEAR FROM NOW())::int), 0) < 900,
  'El contador de folios no salta'
);

-- ------------------------------------------------------------------------------------
-- 3. Solo la primera firma autoriza
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

DO $do$ BEGIN
  PERFORM create_work_order(
    jsonb_build_object(
      'sede_id', '10000000-0000-0000-0000-000000000001', 'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd0000000-0000-0000-0000-000000000001', 'tipo_trabajo', 'mecanica', 'millas_ingreso', 1,
      'nivel_gasolina', '1/2', 'deposito_inicial', 0, 'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-10-01',
      'creado_por', 'a0000000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Frenos","costo":1000}]'::jsonb, '[]'::jsonb,
    '[{"usuario_id":"a0000000-0000-0000-0000-000000000002","tipo_tarea":"mecanica"}]'::jsonb
  );
END $do$;

RESET ROLE;
CREATE TEMP VIEW t_orden AS
  SELECT id, sede_id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
CREATE TEMP VIEW t_orden_tecnico AS
  SELECT id, sede_id FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000002';
GRANT SELECT ON t_orden, t_orden_tecnico TO authenticated;

-- El archivo de la primera firma, como lo deja la app antes de guardar la ruta.
INSERT INTO storage.objects (bucket_id, name)
SELECT 'orden_media', sede_id || '/' || id || '/firma-1.png' FROM t_orden;
SET LOCAL ROLE authenticated;

UPDATE ordenes_trabajo SET firma_ruta = (SELECT sede_id || '/' || id || '/firma-1.png' FROM t_orden)
WHERE id = (SELECT id FROM t_orden);

SELECT is(
  (SELECT total_general FROM orden_montos WHERE orden_id = (SELECT id FROM t_orden)),
  1000.00::numeric,
  'La primera firma autoriza lo cotizado ($1,000)'
);

-- Limpiar la firma, agregar un trabajo y volver a firmar.
UPDATE ordenes_trabajo SET firma_ruta = NULL, firma_fecha = NULL WHERE id = (SELECT id FROM t_orden);
INSERT INTO orden_labor (orden_id, descripcion, costo) SELECT id, 'Pintura', 500 FROM t_orden;

RESET ROLE;
INSERT INTO storage.objects (bucket_id, name)
SELECT 'orden_media', sede_id || '/' || id || '/firma-2.png' FROM t_orden;
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ UPDATE ordenes_trabajo SET firma_ruta = (SELECT sede_id || '/' || id || '/firma-2.png' FROM t_orden)
     WHERE id = (SELECT id FROM t_orden) $$,
  'Se puede volver a firmar'
);
SELECT is(
  (SELECT estado FROM orden_labor WHERE orden_id = (SELECT id FROM t_orden) AND descripcion = 'Pintura'),
  'borrador',
  'Volver a firmar no autoriza lo que se agregó después'
);
SELECT is(
  (SELECT total_general FROM orden_montos WHERE orden_id = (SELECT id FROM t_orden)),
  1000.00::numeric,
  'El total sigue siendo lo autorizado'
);

-- La orden del técnico se firmó sin nada cotizado (no quedó presupuesto); el admin
-- cotiza después, alguien limpia la firma y vuelve a firmar.
RESET ROLE;
INSERT INTO storage.objects (bucket_id, name)
SELECT 'orden_media', sede_id || '/' || id || '/firma-' || n || '.png' FROM t_orden_tecnico, (VALUES (1), (2)) AS v(n);
SET LOCAL ROLE authenticated;
UPDATE ordenes_trabajo SET firma_ruta = (SELECT sede_id || '/' || id || '/firma-1.png' FROM t_orden_tecnico)
WHERE id = (SELECT id FROM t_orden_tecnico);
UPDATE ordenes_trabajo SET firma_ruta = NULL WHERE id = (SELECT id FROM t_orden_tecnico);
INSERT INTO orden_labor (orden_id, descripcion, costo) SELECT id, 'Alineación', 300 FROM t_orden_tecnico;
UPDATE ordenes_trabajo SET firma_ruta = (SELECT sede_id || '/' || id || '/firma-2.png' FROM t_orden_tecnico)
WHERE id = (SELECT id FROM t_orden_tecnico);

SELECT is(
  (SELECT estado FROM orden_labor WHERE orden_id = (SELECT id FROM t_orden_tecnico)),
  'borrador',
  'Tampoco autoriza cuando la primera firma no tenía nada que aprobar'
);

-- ------------------------------------------------------------------------------------
-- 4. Montos de las líneas
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO orden_labor (orden_id, descripcion, costo) SELECT id, 'Descuento', -50 FROM t_orden $$,
  '23514', NULL,
  'Mano de obra negativa rechazada'
);
SELECT throws_ok(
  $$ INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal)
     SELECT id, 'Filtro', 0, 10, 10, 0 FROM t_orden $$,
  '23514', NULL,
  'Cantidad cero rechazada'
);
SELECT throws_ok(
  $$ INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal)
     SELECT id, 'Filtro', 1, -10, -10, -10 FROM t_orden $$,
  '23514', NULL,
  'Precio negativo rechazado'
);

-- ------------------------------------------------------------------------------------
-- 5. No se borra una orden con comisiones pagadas
-- ------------------------------------------------------------------------------------
DELETE FROM orden_labor WHERE orden_id = (SELECT id FROM t_orden) AND descripcion = 'Pintura';
UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE id = (SELECT id FROM t_orden);
DO $do$ BEGIN
  PERFORM pay_commissions('a0000000-0000-0000-0000-000000000002',
    ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002'),
    CURRENT_DATE, 'cheque', '2001', NULL, NULL);
END $do$;

SELECT throws_ok(
  $$ DELETE FROM ordenes_trabajo WHERE id = (SELECT id FROM t_orden) $$,
  'P0001', NULL,
  'Borrar una orden con comisiones pagadas pide deshacer el pago primero'
);
SELECT isnt_empty(
  $$ SELECT 1 FROM ordenes_trabajo WHERE id = (SELECT id FROM t_orden) $$,
  'La orden sigue ahí'
);

DELETE FROM comision_pagos WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002';
SELECT lives_ok(
  $$ DELETE FROM ordenes_trabajo WHERE id = (SELECT id FROM t_orden) $$,
  'Deshecho el pago, la orden se borra'
);

-- ------------------------------------------------------------------------------------
-- 6. Un aviso que tumba la función termina en error
-- ------------------------------------------------------------------------------------
RESET ROLE;
INSERT INTO cola_envios (canal, destinatario, plantilla, estado, intentos, bloqueado_en)
VALUES ('push', 'a0000000-0000-0000-0000-000000000002', 'prueba', 'procesando', 5, NOW() - INTERVAL '10 minutes');

SELECT is_empty(
  $$ SELECT * FROM claim_outbox(25) WHERE plantilla = 'prueba' $$,
  'Al quinto intento interrumpido no se vuelve a tomar'
);
SELECT is(
  (SELECT estado FROM cola_envios WHERE plantilla = 'prueba'),
  'error',
  'Queda en error, con el motivo'
);

SELECT * FROM finish();
ROLLBACK;
