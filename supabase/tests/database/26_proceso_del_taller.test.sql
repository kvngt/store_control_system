-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: el proceso del taller (05/10/2026)
-- ====================================================================================
-- Qué cubre (migraciones 20261010000016 a 18, docs/analisis-del-proceso-2026-10.md):
--   * la fecha del taller en los movimientos automáticos (no la de UTC);
--   * tarjeta y Zelle como métodos de pago;
--   * lo importado del banco no cuenta como cobro de la orden ni en el panel;
--   * el costo de un repuesto: por defecto el precio, y se queda si administración lo cambia;
--     el costo automático no se mezcla con una compra a mano;
--   * repuestos pedidos y recibidos (con aviso al técnico);
--   * el avance sale de las tareas, pesado por su precio, y el técnico lo puede corregir;
--   * el descuento lo absorbe el taller: baja el total, no las comisiones;
--   * comisiones: solo se paga lo aceptado, y se aceptan en bloque;
--   * retirada sin reparar: cancelar todo, cobrar solo la revisión o cobrar los trabajos que se
--     hicieron (con su comisión); devuelve o cobra la diferencia; no cuenta como terminada;
--   * anticipos con su método, descuento en porcentaje y lo pendiente de visitas anteriores;
--   * el enlace del cliente: el depósito no se repite en "pagado", saldo con signo, descuento,
--     piezas en espera;
--   * el historial registra descuento, costo y pedido.
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

SELECT plan(82);

-- ------------------------------------------------------------------------------------
-- Datos: una sede al 35 %, un admin y dos mecánicos.
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, comision_porcentaje) VALUES
  ('26000000-0000-0000-0000-000000000001', 'Sede Proceso', 'Calle 26', '555-2600', 35);

INSERT INTO auth.users (id, email) VALUES
  ('a2600000-0000-0000-0000-000000000001', 'admin26@prueba.local'),
  ('a2600000-0000-0000-0000-000000000002', 'mario26@prueba.local'),
  ('a2600000-0000-0000-0000-000000000003', 'teo26@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a2600000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '26000000-0000-0000-0000-000000000001', 'admin26@prueba.local'),
  ('a2600000-0000-0000-0000-000000000002', 'Mario Mecánico', 'mecanico', '26000000-0000-0000-0000-000000000001', 'mario26@prueba.local'),
  ('a2600000-0000-0000-0000-000000000003', 'Teo Mecánico', 'mecanico', '26000000-0000-0000-0000-000000000001', 'teo26@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c2600000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'Rosa Díaz', '+15550260', '', 'Elm 26');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d2600000-0000-0000-0000-00000000000a', 'c2600000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2018, '1HGCM82633A026001', NULL, 'Azul'),
  ('d2600000-0000-0000-0000-00000000000b', 'c2600000-0000-0000-0000-000000000001', 'Ford', 'Focus', 2015, '1HGCM82633A026002', NULL, 'Rojo'),
  ('d2600000-0000-0000-0000-00000000000c', 'c2600000-0000-0000-0000-000000000001', 'Nissan', 'Sentra', 2017, '1HGCM82633A026003', NULL, 'Blanco');

-- ------------------------------------------------------------------------------------
-- 1. La fecha del taller
-- ------------------------------------------------------------------------------------
SELECT is(public.hoy_taller('26000000-0000-0000-0000-000000000001'), (now() AT TIME ZONE 'America/New_York')::date,
  'La fecha del taller es la de Maryland, no la de UTC');
UPDATE sedes SET zona_horaria = 'Marte/Olimpo' WHERE id = '26000000-0000-0000-0000-000000000001';
SELECT is(public.hoy_taller('26000000-0000-0000-0000-000000000001'), (now() AT TIME ZONE 'America/New_York')::date,
  'Una zona mal escrita no rompe nada: cae a la de Maryland');
UPDATE sedes SET zona_horaria = 'America/New_York' WHERE id = '26000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 2. Orden A: depósito con tarjeta, dos tareas y dos repuestos (uno con costo)
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';

SELECT lives_ok($$
  SELECT create_work_order(
    jsonb_build_object(
      'sede_id', '26000000-0000-0000-0000-000000000001',
      'cliente_id', 'c2600000-0000-0000-0000-000000000001',
      'vehiculo_id', 'd2600000-0000-0000-0000-00000000000a',
      'tipo_trabajo', 'mecanica', 'millas_ingreso', 1000, 'nivel_gasolina', '1/2',
      'deposito_inicial', 100, 'deposito_metodo', 'tarjeta',
      'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-12-31',
      'creado_por', 'a2600000-0000-0000-0000-000000000001'),
    '[{"descripcion":"Aceite","costo":50,"especialidad":"mecanica","asignado_a":"a2600000-0000-0000-0000-000000000002","reparto_heredado":false},
      {"descripcion":"Amortiguadores","costo":400,"especialidad":"mecanica","asignado_a":"a2600000-0000-0000-0000-000000000002","reparto_heredado":false}]'::jsonb,
    '[{"descripcion":"Filtro","cantidad":1,"precio_venta_unitario":20},
      {"descripcion":"Amortiguador","cantidad":2,"precio_venta_unitario":150,"costo_unitario":90}]'::jsonb,
    '[]'::jsonb)
$$, 'Se abre una orden con depósito pagado con tarjeta');
RESET ROLE;

CREATE TEMP TABLE t_o AS
  SELECT id, vehiculo_id FROM ordenes_trabajo WHERE vehiculo_id IN ('d2600000-0000-0000-0000-00000000000a', 'd2600000-0000-0000-0000-00000000000b');
GRANT SELECT ON t_o TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.oa() RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd2600000-0000-0000-0000-00000000000a' $$;
CREATE OR REPLACE FUNCTION pg_temp.labor(p TEXT) RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM orden_labor WHERE orden_id = pg_temp.oa() AND descripcion = p $$;
CREATE TEMP TABLE t_res (k TEXT PRIMARY KEY, v JSONB);
GRANT ALL ON t_res TO authenticated;

SELECT results_eq(
  $$ SELECT metodo_pago, fecha FROM finanzas_movimientos WHERE referencia_orden_id = pg_temp.oa() AND categoria = 'pago_cliente' $$,
  $$ VALUES ('tarjeta'::text, public.hoy_taller('26000000-0000-0000-0000-000000000001')) $$,
  'El depósito queda con tarjeta y con la fecha del taller'
);
SELECT results_eq(
  $$ SELECT descripcion, costo_unitario FROM orden_repuestos WHERE orden_id = pg_temp.oa() ORDER BY descripcion $$,
  $$ VALUES ('Amortiguador'::text, 90::numeric), ('Filtro', 20) $$,
  'Sin costo, el costo es el precio; con costo, se queda el que mandó administración'
);

-- Lo cotizado está autorizado.
UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png' WHERE id = pg_temp.oa();
DO $do$ BEGIN PERFORM pg_temp.autorizar_cotizado(pg_temp.oa()); END $do$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
UPDATE orden_repuestos SET precio_venta_unitario = 25 WHERE orden_id = pg_temp.oa() AND descripcion = 'Filtro';
UPDATE orden_repuestos SET precio_venta_unitario = 160 WHERE orden_id = pg_temp.oa() AND descripcion = 'Amortiguador';
SELECT lives_ok(
  $$ UPDATE orden_repuestos SET costo_unitario = 95 WHERE orden_id = pg_temp.oa() AND descripcion = 'Amortiguador' $$,
  'Administración corrige el costo de un repuesto ya autorizado'
);
SELECT throws_ok(
  $$ UPDATE orden_repuestos SET costo_unitario = -1 WHERE orden_id = pg_temp.oa() AND descripcion = 'Filtro' $$,
  '23514', NULL, 'Un costo negativo se rechaza'
);
RESET ROLE;

SELECT results_eq(
  $$ SELECT descripcion, costo_unitario, estado FROM orden_repuestos WHERE orden_id = pg_temp.oa() ORDER BY descripcion $$,
  $$ VALUES ('Amortiguador'::text, 95::numeric, 'aprobado'::text), ('Filtro', 25, 'aprobado') $$,
  'El costo que siguió al precio cambia con él; el que se escribió se queda; cambiar el costo no toca la autorización'
);
SELECT is((SELECT total_general FROM orden_montos WHERE orden_id = pg_temp.oa()), 795.00::numeric,
  'Total: $450 de mano de obra + $345 de repuestos a precio de venta');

-- ------------------------------------------------------------------------------------
-- 3. El avance sale de las tareas
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = pg_temp.oa();
SELECT marcar_labor_completada(pg_temp.labor('Amortiguadores'), true);
RESET ROLE;
SELECT is((SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = pg_temp.oa()), 89,
  'Hecha la tarea de $400 de $450: 89 %, no 50 % (las tareas pesan por su precio)');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
SELECT lives_ok($$ UPDATE ordenes_trabajo SET porcentaje_avance = 70 WHERE id = pg_temp.oa() $$,
  'El técnico lo corrige a mano');
RESET ROLE;
SELECT is((SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = pg_temp.oa()), 70, 'Y se queda lo que puso');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
SELECT marcar_labor_completada(pg_temp.labor('Aceite'), true);
RESET ROLE;
SELECT is((SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = pg_temp.oa()), 100,
  'La siguiente tarea que marca lo vuelve a calcular: todo hecho, 100 %');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
SELECT marcar_labor_completada(pg_temp.labor('Aceite'), false);
RESET ROLE;
SELECT is((SELECT porcentaje_avance FROM ordenes_trabajo WHERE id = pg_temp.oa()), 89, 'Reabrir una tarea lo baja');

-- ------------------------------------------------------------------------------------
-- 4. Descuento
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
SELECT throws_ok($$ SELECT aplicar_descuento(pg_temp.oa(), 10) $$, '42501', NULL, 'Un técnico no aplica descuentos');
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT throws_ok($$ SELECT aplicar_descuento(pg_temp.oa(), 1000) $$, '22023', NULL,
  'Un descuento mayor que lo autorizado se rechaza');
SELECT throws_ok($$ SELECT aplicar_descuento(pg_temp.oa(), -5) $$, '22023', NULL, 'Un descuento negativo se rechaza');
SELECT lives_ok($$ SELECT aplicar_descuento(pg_temp.oa(), 45, 'Cliente frecuente') $$, 'Administración aplica $45 de descuento');
SELECT throws_ok($$ UPDATE orden_montos SET descuento = 10 WHERE orden_id = pg_temp.oa() $$, '42501', NULL,
  'El descuento no se escribe directo: pasa por aplicar_descuento');
RESET ROLE;
SELECT results_eq(
  $$ SELECT descuento, descuento_motivo, total_general FROM orden_montos WHERE orden_id = pg_temp.oa() $$,
  $$ VALUES (45.00::numeric, 'Cliente frecuente'::text, 750.00::numeric) $$,
  'El total baja a $750; la mano de obra no cambia'
);

-- ------------------------------------------------------------------------------------
-- 5. Lo importado del banco es contabilidad aparte
-- ------------------------------------------------------------------------------------
INSERT INTO finanzas_importaciones (id, sede_id, nombre_archivo, ruta_archivo, total_transacciones)
VALUES ('e2600000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'sept.pdf', '26000000-0000-0000-0000-000000000001/sept.pdf', 2);
INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id, importacion_id) VALUES
  ('26000000-0000-0000-0000-000000000001', 'ingreso', 'pago_cliente', 500, 'BANKCARD DEPOSIT', '2026-09-15', pg_temp.oa(), 'e2600000-0000-0000-0000-000000000001'),
  ('26000000-0000-0000-0000-000000000001', 'egreso', 'comision_bancaria', 30, 'CLOVER FEE', '2026-09-30', NULL, 'e2600000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT is((saldo_orden(pg_temp.oa())->>'saldo')::numeric, 650.00::numeric,
  'Un depósito del banco vinculado a la orden no cambia lo que debe el cliente ($750 − $100)');
SELECT is((resumen_panel('26000000-0000-0000-0000-000000000001', CURRENT_DATE, 'America/New_York')->>'ingresos_total')::numeric, 100.00::numeric,
  'El panel cuenta lo que registró la app, no lo importado');
SELECT is(
  (SELECT jsonb_build_object('n', x->'movimientos', 'ingresos', x->'ingresos', 'egresos', x->'egresos')
   FROM jsonb_array_elements(resumen_importaciones('26000000-0000-0000-0000-000000000001')) x),
  '{"n": 2, "ingresos": 500.00, "egresos": 30.00}'::jsonb,
  'Lo importado se resume aparte, por estado de cuenta'
);
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
SELECT throws_ok($$ SELECT resumen_importaciones(NULL) $$, '42501', NULL, 'Un técnico no ve los estados de cuenta');
RESET ROLE;

-- ------------------------------------------------------------------------------------
-- 6. Repuestos pedidos y recibidos
-- ------------------------------------------------------------------------------------
-- La firma ya le creó su enlace al cliente; si no, uno nuevo.
INSERT INTO orden_enlaces (orden_id, sede_id, token)
SELECT pg_temp.oa(), '26000000-0000-0000-0000-000000000001', 'c26c26c26c26c26c26c26c26c26c26c26c26c26c26c26c26c26c26c26c26c26c'
WHERE NOT EXISTS (SELECT 1 FROM orden_enlaces WHERE orden_id = pg_temp.oa() AND revocado_en IS NULL);
CREATE OR REPLACE FUNCTION pg_temp.tok() RETURNS TEXT LANGUAGE sql AS
  $$ SELECT token FROM orden_enlaces WHERE orden_id = pg_temp.oa() AND revocado_en IS NULL LIMIT 1 $$;
DELETE FROM notificaciones;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
UPDATE orden_repuestos SET estado_pedido = 'pedido' WHERE orden_id = pg_temp.oa() AND descripcion = 'Amortiguador';
SELECT ok(pg_temp.oa() IN (SELECT * FROM ordenes_esperando_repuestos()), 'La orden aparece esperando una pieza');
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
SELECT results_eq(
  $$ SELECT descripcion, estado_pedido FROM repuestos_de_orden(pg_temp.oa()) ORDER BY descripcion $$,
  $$ VALUES ('Amortiguador'::text, 'pedido'::text), ('Filtro', NULL) $$,
  'El técnico ve qué pieza falta, sin precio'
);
SELECT ok(pg_temp.oa() IN (SELECT * FROM ordenes_esperando_repuestos()), 'El técnico asignado también la ve esperando');
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000003';
SELECT is((SELECT COUNT(*)::int FROM ordenes_esperando_repuestos()), 0, 'Otro técnico no ve las órdenes ajenas');
RESET ROLE;

SELECT is(
  (SELECT datos_portal(pg_temp.tok())->'esperando_repuestos'->0->>'descripcion'),
  'Amortiguador',
  'El cliente ve qué pieza se espera'
);
SELECT ok((SELECT pedido_en IS NOT NULL AND recibido_en IS NULL FROM orden_repuestos WHERE orden_id = pg_temp.oa() AND descripcion = 'Amortiguador'),
  'Pedido: queda la fecha del pedido');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
UPDATE orden_repuestos SET estado_pedido = 'recibido' WHERE orden_id = pg_temp.oa() AND descripcion = 'Amortiguador';
SELECT is((SELECT COUNT(*)::int FROM ordenes_esperando_repuestos()), 0, 'Al llegar, la orden ya no espera');
RESET ROLE;
SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones WHERE tipo = 'repuesto_recibido' AND usuario_id = 'a2600000-0000-0000-0000-000000000002'),
  1, 'El técnico de la orden recibe el aviso de que llegó la pieza'
);

-- ------------------------------------------------------------------------------------
-- 7. Entrega con Zelle y comisiones: solo se paga lo aceptado
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT throws_ok($$ SELECT entregar_orden(pg_temp.oa(), 'bitcoin') $$, '22023', NULL, 'Un método desconocido se rechaza');
SELECT lives_ok($$ SELECT entregar_orden(pg_temp.oa(), 'zelle') $$, 'Se entrega cobrando el saldo por Zelle');
RESET ROLE;

SELECT results_eq(
  $$ SELECT monto, metodo_pago, fecha FROM finanzas_movimientos
     WHERE referencia_orden_id = pg_temp.oa() AND descripcion LIKE 'Pago final%' $$,
  $$ VALUES (650.00::numeric, 'zelle'::text, public.hoy_taller('26000000-0000-0000-0000-000000000001')) $$,
  'El pago final: $650 por Zelle, con la fecha del taller'
);
SELECT is(
  (SELECT SUM(monto) FROM comisiones WHERE orden_id = pg_temp.oa()), 157.50::numeric,
  'Las comisiones salen de la mano de obra completa: el descuento lo absorbe el taller (35 % de $450)'
);
SELECT is(
  (SELECT SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END) FROM finanzas_movimientos
   WHERE referencia_orden_id = pg_temp.oa() AND categoria = 'compra_repuesto'),
  215.00::numeric,
  'El costo de repuestos al entregar es el costo real ($25 + 2 × $95), no el precio'
);

-- Una compra a mano vinculada a la orden no mueve el costo automático.
INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, referencia_orden_id, registrado_por)
VALUES ('26000000-0000-0000-0000-000000000001', 'egreso', 'compra_repuesto', 50, 'Tornillos', CURRENT_DATE, pg_temp.oa(), 'a2600000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
UPDATE orden_repuestos SET costo_unitario = 15 WHERE orden_id = pg_temp.oa() AND descripcion = 'Filtro';
RESET ROLE;
SELECT is(
  (SELECT SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END) FROM finanzas_movimientos
   WHERE referencia_orden_id = pg_temp.oa() AND categoria = 'compra_repuesto' AND registrado_por IS NULL),
  205.00::numeric,
  'Corregir el costo después de entregar asienta el ajuste ($205), sin tocar la compra a mano'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ SELECT pay_commissions('a2600000-0000-0000-0000-000000000002',
       ARRAY(SELECT id FROM comisiones WHERE orden_id = pg_temp.oa()), CURRENT_DATE, 'zelle', NULL, NULL, NULL) $$,
  'P0001', 'Esas comisiones todavía no están aceptadas. Revísalas y acéptalas antes de pagarlas.',
  'No se paga una comisión que nadie revisó'
);
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
SELECT throws_ok($$ SELECT aprobar_comisiones(ARRAY(SELECT id FROM comisiones)) $$, '42501', NULL,
  'Un técnico no acepta comisiones');
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
DELETE FROM notificaciones;
INSERT INTO t_res VALUES ('aceptadas', to_jsonb(aprobar_comisiones(ARRAY(SELECT id FROM comisiones WHERE orden_id = pg_temp.oa()))));
RESET ROLE;
SELECT is((SELECT v FROM t_res WHERE k = 'aceptadas'), '2'::jsonb, 'Administración acepta las dos de un golpe');
SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones
   WHERE tipo = 'comision_generada' AND usuario_id = 'a2600000-0000-0000-0000-000000000002' AND cuerpo LIKE '$157.50%'),
  1, 'Un solo aviso al técnico por orden, con la suma aceptada'
);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ SELECT pay_commissions('a2600000-0000-0000-0000-000000000002',
       ARRAY(SELECT id FROM comisiones WHERE orden_id = pg_temp.oa()), CURRENT_DATE, 'zelle', NULL, NULL, NULL) $$,
  'Aceptadas, se pagan'
);
RESET ROLE;
SELECT is((SELECT COUNT(*)::int FROM comisiones WHERE orden_id = pg_temp.oa() AND pago_id IS NULL), 0, 'Y quedan pagadas');

-- ------------------------------------------------------------------------------------
-- 8. Lo que ve el cliente
-- ------------------------------------------------------------------------------------
INSERT INTO t_res VALUES ('portal_a', datos_portal(pg_temp.tok())->'cuenta');
SELECT is(
  (SELECT jsonb_build_object('subtotal', v->'subtotal', 'descuento', v->'descuento', 'total', v->'total',
                             'deposito', v->'deposito', 'pagado', v->'pagado', 'otros_pagos', v->'otros_pagos', 'saldo', v->'saldo')
   FROM t_res WHERE k = 'portal_a'),
  '{"subtotal": 795.00, "descuento": 45.00, "total": 750.00, "deposito": 100.00, "pagado": 750.00, "otros_pagos": 650.00, "saldo": 0.00}'::jsonb,
  'El cliente ve el descuento, su depósito y lo que pagó después por separado; lo del banco no cuenta'
);
SELECT is(
  (SELECT datos_portal(pg_temp.tok())->'esperando_repuestos'),
  '[]'::jsonb, 'Entregada, ya no hay piezas en espera'
);

-- ------------------------------------------------------------------------------------
-- 9. El historial
-- ------------------------------------------------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM historial_orden WHERE orden_id = pg_temp.oa() AND entidad = 'descuento'
          AND cambios->'descuento'->>'despues' = '45.00'),
  'El historial registra el descuento como tal'
);
SELECT ok(
  EXISTS (SELECT 1 FROM historial_orden WHERE orden_id = pg_temp.oa() AND entidad = 'repuesto' AND cambios ? 'costo_unitario'),
  'Y el cambio de costo de un repuesto'
);
SELECT ok(
  EXISTS (SELECT 1 FROM historial_orden WHERE orden_id = pg_temp.oa() AND entidad = 'repuesto'
          AND cambios->'estado_pedido'->>'despues' = 'recibido'),
  'Y que la pieza llegó'
);

-- ------------------------------------------------------------------------------------
-- 10. Orden B: retirada sin reparar
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT create_work_order(
  jsonb_build_object(
    'sede_id', '26000000-0000-0000-0000-000000000001',
    'cliente_id', 'c2600000-0000-0000-0000-000000000001',
    'vehiculo_id', 'd2600000-0000-0000-0000-00000000000b',
    'tipo_trabajo', 'mecanica', 'millas_ingreso', 2000, 'nivel_gasolina', '1/4',
    'deposito_inicial', 200, 'deposito_metodo', 'efectivo',
    'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-12-31',
    'creado_por', 'a2600000-0000-0000-0000-000000000001'),
  '[{"descripcion":"Motor","costo":1000,"especialidad":"mecanica","asignado_a":"a2600000-0000-0000-0000-000000000002","reparto_heredado":false}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb);
RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.ob() RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd2600000-0000-0000-0000-00000000000b' $$;
UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png' WHERE id = pg_temp.ob();
DO $do$ BEGIN PERFORM pg_temp.autorizar_cotizado(pg_temp.ob()); END $do$;
INSERT INTO orden_hallazgos (orden_id, sede_id, reportado_por, descripcion)
VALUES (pg_temp.ob(), '26000000-0000-0000-0000-000000000001', 'a2600000-0000-0000-0000-000000000002', 'Fuga de aceite');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
SELECT throws_ok($$ SELECT retirar_sin_reparar(pg_temp.ob(), 50, NULL, 'efectivo') $$, '42501', NULL,
  'Un técnico no cierra una orden');
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT is(saldo_retiro(pg_temp.ob(), 50), '{"cobrado": 200.00, "trabajos": 0.00, "revision": 50.00, "cobro": 50.00, "saldo": -150.00}'::jsonb,
  'Antes de cerrar, la base dice cuánto se devuelve si se cobran $50 de diagnóstico');
SELECT throws_ok($$ SELECT retirar_sin_reparar(pg_temp.ob(), 50) $$, '22023', NULL,
  'Sin decir cómo se devuelve, no se cierra');
INSERT INTO t_res VALUES ('retiro', retirar_sin_reparar(pg_temp.ob(), 50, NULL, 'efectivo'));
RESET ROLE;

SELECT is((SELECT v->>'tipo' FROM t_res WHERE k = 'retiro'), 'egreso', 'Se registra una devolución');
SELECT results_eq(
  $$ SELECT estatus::text, retirada_sin_reparar FROM ordenes_trabajo WHERE id = pg_temp.ob() $$,
  $$ VALUES ('entregado'::text, true) $$,
  'La orden queda cerrada como retirada sin reparar'
);
SELECT results_eq(
  $$ SELECT descripcion, costo, estado FROM orden_labor WHERE orden_id = pg_temp.ob() ORDER BY descripcion $$,
  $$ VALUES ('Diagnóstico'::text, 50.00::numeric, 'aprobado'::text), ('Motor', 1000.00, 'rechazado') $$,
  'Lo que no se hizo no se cobra; el diagnóstico sí'
);
SELECT results_eq(
  $$ SELECT monto, metodo_pago FROM finanzas_movimientos WHERE referencia_orden_id = pg_temp.ob() AND descripcion LIKE 'Devolución%' $$,
  $$ VALUES (150.00::numeric, 'efectivo'::text) $$,
  'Se devuelven $150 en efectivo ($200 de depósito − $50)'
);
SELECT is((SELECT COUNT(*)::int FROM comisiones WHERE orden_id = pg_temp.ob()), 0, 'Una retirada no genera comisiones');
SELECT is((SELECT estado FROM orden_hallazgos WHERE orden_id = pg_temp.ob()), 'descartado', 'Y el hallazgo pendiente se descarta');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT is((resumen_panel('26000000-0000-0000-0000-000000000001', (now() AT TIME ZONE 'America/New_York')::date, 'America/New_York')->>'ordenes_finalizadas_mes')::int, 1,
  'En el panel cuenta como terminada solo la orden reparada');
SELECT throws_ok($$ UPDATE ordenes_trabajo SET retirada_sin_reparar = false WHERE id = pg_temp.ob() $$, '42501', NULL,
  'La marca no se cambia a mano');
SELECT lives_ok($$ UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = pg_temp.ob() $$,
  'Administración la reabre (se cerró por error)');
RESET ROLE;
SELECT is((SELECT retirada_sin_reparar FROM ordenes_trabajo WHERE id = pg_temp.ob()), false, 'Al reabrirla deja de estar retirada');

-- ------------------------------------------------------------------------------------
-- 10b. Orden C: anticipo, descuento en porcentaje y retirada con algunos trabajos hechos
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT create_work_order(
  jsonb_build_object(
    'sede_id', '26000000-0000-0000-0000-000000000001',
    'cliente_id', 'c2600000-0000-0000-0000-000000000001',
    'vehiculo_id', 'd2600000-0000-0000-0000-00000000000c',
    'tipo_trabajo', 'mecanica', 'millas_ingreso', 3000, 'nivel_gasolina', '1/2',
    'deposito_inicial', 300, 'deposito_metodo', 'efectivo',
    'inspeccion_360_notas', '', 'fecha_estimada_entrega', '2026-12-31',
    'creado_por', 'a2600000-0000-0000-0000-000000000001'),
  '[{"descripcion":"Motor","costo":1000,"especialidad":"mecanica","asignado_a":"a2600000-0000-0000-0000-000000000002","reparto_heredado":false},
    {"descripcion":"Frenos","costo":200,"especialidad":"mecanica","asignado_a":"a2600000-0000-0000-0000-000000000002","reparto_heredado":false}]'::jsonb,
  '[{"descripcion":"Pastillas","cantidad":1,"precio_venta_unitario":80}]'::jsonb, '[]'::jsonb);
RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.oc() RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM ordenes_trabajo WHERE vehiculo_id = 'd2600000-0000-0000-0000-00000000000c' $$;
CREATE OR REPLACE FUNCTION pg_temp.linea_c(p TEXT) RETURNS UUID LANGUAGE sql AS
  $$ SELECT id FROM orden_labor WHERE orden_id = pg_temp.oc() AND descripcion = p
     UNION ALL SELECT id FROM orden_repuestos WHERE orden_id = pg_temp.oc() AND descripcion = p $$;
UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma.png' WHERE id = pg_temp.oc();
DO $do$ BEGIN PERFORM pg_temp.autorizar_cotizado(pg_temp.oc()); END $do$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000002';
SELECT throws_ok($$ SELECT registrar_anticipo(pg_temp.oc(), 50, 'efectivo') $$, '42501', NULL,
  'Un técnico no registra anticipos');
SELECT throws_ok($$ SELECT trabajos_pendientes_vehiculo('d2600000-0000-0000-0000-00000000000c') $$, '42501', NULL,
  'Un técnico no ve los pendientes de un vehículo');
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
SELECT throws_ok($$ SELECT registrar_anticipo(pg_temp.oc(), 0, 'efectivo') $$, '22023', NULL, 'Un anticipo de cero se rechaza');
SELECT throws_ok($$ SELECT registrar_anticipo(pg_temp.oc(), 50, 'cheque') $$, '22023', NULL,
  'Un anticipo con cheque pide el número o la foto');
SELECT lives_ok($$ SELECT registrar_anticipo(pg_temp.oc(), 200, 'zelle') $$, 'Administración registra un anticipo de $200 por Zelle');
SELECT throws_ok($$ SELECT aplicar_descuento(pg_temp.oc(), NULL, NULL, 150) $$, '22023', NULL,
  'Un porcentaje de descuento fuera de 0–100 se rechaza');
INSERT INTO t_res VALUES ('desc_pct', aplicar_descuento(pg_temp.oc(), NULL, 'Promoción', 10));
INSERT INTO t_res VALUES ('saldo_parcial', saldo_retiro(pg_temp.oc(), 30, ARRAY[pg_temp.linea_c('Frenos'), pg_temp.linea_c('Pastillas')]));
SELECT throws_ok(
  $$ SELECT retirar_sin_reparar(pg_temp.oc(), 0, NULL, 'zelle', NULL, NULL, ARRAY[pg_temp.labor('Aceite')]) $$,
  '22023', 'Solo se pueden cobrar trabajos autorizados de esta orden.',
  'No se cobra en una orden un trabajo de otra'
);
INSERT INTO t_res VALUES ('retiro_parcial',
  retirar_sin_reparar(pg_temp.oc(), 30, 'Revisión', 'zelle', NULL, NULL, ARRAY[pg_temp.linea_c('Frenos'), pg_temp.linea_c('Pastillas')]));
RESET ROLE;

SELECT results_eq(
  $$ SELECT monto, metodo_pago FROM finanzas_movimientos WHERE referencia_orden_id = pg_temp.oc() AND descripcion LIKE 'Anticipo%' $$,
  $$ VALUES (200.00::numeric, 'zelle'::text) $$,
  'El anticipo queda en Finanzas con su método'
);
SELECT is((SELECT v->>'descuento' FROM t_res WHERE k = 'desc_pct'), '128.00',
  'El 10 % de descuento lo calcula la base: $128 de $1,280 autorizados');
SELECT is(
  (SELECT jsonb_build_object('cobrado', v->'cobrado', 'trabajos', v->'trabajos', 'cobro', v->'cobro', 'saldo', v->'saldo') FROM t_res WHERE k = 'saldo_parcial'),
  '{"cobrado": 500.00, "trabajos": 280.00, "cobro": 310.00, "saldo": -190.00}'::jsonb,
  'Antes de cerrar: recibió $500 (depósito y anticipo), se cobran $280 de trabajos y $30 de revisión, se devuelven $190'
);
SELECT results_eq(
  $$ SELECT descripcion, estado, completado_en IS NOT NULL FROM orden_labor WHERE orden_id = pg_temp.oc() ORDER BY descripcion $$,
  $$ VALUES ('Frenos'::text, 'aprobado'::text, true), ('Motor', 'rechazado', false), ('Revisión', 'aprobado', true) $$,
  'Lo hecho se cobra y queda hecho; lo no hecho pasa a no autorizado'
);
SELECT is((SELECT estado FROM orden_repuestos WHERE orden_id = pg_temp.oc()), 'aprobado', 'El repuesto instalado se cobra');
SELECT results_eq(
  $$ SELECT monto, metodo_pago FROM finanzas_movimientos WHERE referencia_orden_id = pg_temp.oc() AND descripcion LIKE 'Devolución%' $$,
  $$ VALUES (190.00::numeric, 'zelle'::text) $$,
  'Se devuelven $190 por Zelle, sin el descuento (se quita al cerrar así)'
);
SELECT results_eq(
  $$ SELECT l.descripcion, c.monto FROM comisiones c JOIN orden_labor l ON l.id = c.labor_id WHERE c.orden_id = pg_temp.oc() $$,
  $$ VALUES ('Frenos'::text, 70.00::numeric) $$,
  'Solo la tarea hecha paga comisión (35 % de $200); lo no hecho y la revisión, no'
);
SELECT is(
  (SELECT SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE -monto END) FROM finanzas_movimientos
   WHERE referencia_orden_id = pg_temp.oc() AND categoria = 'compra_repuesto'),
  80.00::numeric, 'El repuesto instalado sí se asienta como costo'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a2600000-0000-0000-0000-000000000001';
INSERT INTO t_res VALUES ('pendientes_c', trabajos_pendientes_vehiculo('d2600000-0000-0000-0000-00000000000c'));
INSERT INTO t_res VALUES ('pendientes_c_excl', trabajos_pendientes_vehiculo('d2600000-0000-0000-0000-00000000000c', pg_temp.oc()));
RESET ROLE;
SELECT is(
  (SELECT jsonb_build_object('tipo', x->'tipo', 'descripcion', x->'descripcion', 'monto', x->'monto', 'retirada', x->'retirada')
   FROM t_res, jsonb_array_elements(v) x WHERE k = 'pendientes_c'),
  '{"tipo": "mano_obra", "descripcion": "Motor", "monto": 1000.00, "retirada": true}'::jsonb,
  'Lo que no se hizo queda como pendiente del vehículo, para ofrecerlo en la próxima visita'
);
SELECT is((SELECT jsonb_array_length(v) FROM t_res WHERE k = 'pendientes_c_excl'), 0,
  'Sin la orden que se está viendo, no hay más pendientes');

-- ------------------------------------------------------------------------------------
-- 11. Permisos de las funciones nuevas
-- ------------------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('authenticated', 'public.hoy_taller(uuid)', 'EXECUTE'), 'hoy_taller no es una RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.retirar_sin_reparar(uuid, numeric, text, text, text, text, uuid[])', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.aplicar_descuento(uuid, numeric, text, numeric)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.aprobar_comisiones(uuid[])', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.saldo_retiro(uuid, numeric, uuid[])', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.registrar_anticipo(uuid, numeric, text, text, text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.trabajos_pendientes_vehiculo(uuid, uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.ordenes_esperando_repuestos()', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.resumen_importaciones(uuid)', 'EXECUTE'),
  'Sin sesión no se llama ninguna de las RPC nuevas');
SELECT ok(NOT has_function_privilege('authenticated', 'public._avance_por_tareas(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.trg_avance_por_tareas()', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.trg_guard_retirada()', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.trg_repuesto_pedido()', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.trg_notify_repuesto_recibido()', 'EXECUTE'),
  'Las funciones internas no son RPC');

SELECT * FROM finish();
ROLLBACK;
