-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: revisión antes de salir a producción
-- ====================================================================================
-- Qué cubre (migraciones 20260927000000 y 20261003000000): los totales del panel salen
-- bien con más de 1.000 movimientos y respetan RLS; importar un estado de cuenta es todo o
-- nada, y deshacerla también;
-- pagar dos veces las mismas comisiones falla; una cuenta sin perfil no ve sedes; los
-- índices y el search_path existen; el avance no pasa de 100.
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

SELECT plan(31);

-- ------------------------------------------------------------------------------------
-- Datos de prueba
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sede Prueba', 'Calle 1', '555-0100');

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'mecanico@prueba.local'),
  ('a0000000-0000-0000-0000-000000000009', 'intruso@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ana Admin', 'admin', '10000000-0000-0000-0000-000000000001', 'admin@prueba.local'),
  ('a0000000-0000-0000-0000-000000000002', 'Luis Mecánico', 'mecanico', '10000000-0000-0000-0000-000000000001', 'mecanico@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marta Ruiz', '555-0140', '', 'Oak 12');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2019, '1HGCM82633A004352', NULL, 'Gris');

-- 1.500 ingresos de $10 este mes y uno de $500 hace dos meses: más de lo que devuelve
-- la API en una sola consulta.
INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha)
SELECT '10000000-0000-0000-0000-000000000001', 'ingreso', 'gasto_operativo', 10, 'PRUEBA ' || g, CURRENT_DATE
FROM generate_series(1, 1500) AS g;
INSERT INTO finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha)
VALUES ('10000000-0000-0000-0000-000000000001', 'ingreso', 'gasto_operativo', 500, 'PRUEBA anterior',
        (date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::date);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
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

-- ------------------------------------------------------------------------------------
-- 1. Resumen del panel
-- ------------------------------------------------------------------------------------
RESET ROLE;
CREATE TEMP TABLE t_resumen_admin AS SELECT '{}'::jsonb AS r;
GRANT ALL ON t_resumen_admin TO authenticated;
SET LOCAL ROLE authenticated;

UPDATE t_resumen_admin SET r = resumen_panel('10000000-0000-0000-0000-000000000001', CURRENT_DATE, 'UTC');

SELECT is((SELECT (r->>'ingresos_mes')::numeric FROM t_resumen_admin), 15000::numeric,
  'Los ingresos del mes suman los 1.500 movimientos, no los primeros 1.000');
SELECT is((SELECT (r->>'ingresos_total')::numeric FROM t_resumen_admin), 15500::numeric,
  'El total histórico incluye los meses anteriores');
SELECT is((SELECT jsonb_array_length(r->'ingresos_por_mes') FROM t_resumen_admin), 6,
  'El resumen mensual trae los últimos seis meses');
SELECT is((SELECT (r->'ingresos_por_mes'->5->>'ingresos')::numeric FROM t_resumen_admin), 15000::numeric,
  'El último mes del resumen es el mes actual');
SELECT is((SELECT (r->>'ordenes_activas')::int FROM t_resumen_admin), 1,
  'Cuenta la orden activa');
SELECT is((SELECT (r->'ordenes_por_estatus'->>'recepcion')::int FROM t_resumen_admin), 1,
  'Cuenta órdenes por estatus');
SELECT is((SELECT (r->>'clientes_nuevos_mes')::int FROM t_resumen_admin), 1,
  'Cuenta los clientes nuevos del mes');

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT is(
  (SELECT (resumen_panel('10000000-0000-0000-0000-000000000001', CURRENT_DATE, 'UTC')->>'ingresos_mes')::numeric),
  0::numeric,
  'Un técnico recibe cero en el dinero (RLS decide)'
);

-- ------------------------------------------------------------------------------------
-- 2. Importar un estado de cuenta
-- ------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT importar_estado_cuenta('{"sede_id":"10000000-0000-0000-0000-000000000001","nombre_archivo":"x.pdf","ruta_archivo":"x"}',
       '[{"tipo":"egreso","categoria":"gasto_operativo","monto":5,"fecha":"2026-09-01","descripcion":"x"}]') $$,
  '42501', NULL,
  'Un técnico no importa estados de cuenta'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ SELECT importar_estado_cuenta('{"sede_id":"10000000-0000-0000-0000-000000000001","nombre_archivo":"malo.pdf","ruta_archivo":"malo","hash_archivo":"h-malo"}',
       '[{"tipo":"egreso","categoria":"gasto_operativo","monto":5,"fecha":"2026-09-01","descripcion":"bien"},
         {"tipo":"egreso","categoria":"no_existe","monto":7,"fecha":"2026-09-02","descripcion":"mal"}]') $$,
  NULL, NULL,
  'Un movimiento inválido hace fallar la importación entera'
);
SELECT is_empty(
  $$ SELECT 1 FROM finanzas_importaciones WHERE hash_archivo = 'h-malo' $$,
  'Si falla, no queda un lote sin movimientos que bloquee reimportar'
);
SELECT lives_ok(
  $$ SELECT importar_estado_cuenta('{"sede_id":"10000000-0000-0000-0000-000000000001","nombre_archivo":"bueno.pdf","ruta_archivo":"bueno","hash_archivo":"h-bueno"}',
       '[{"tipo":"egreso","categoria":"gasto_operativo","monto":5,"fecha":"2026-09-01","descripcion":"uno","numero_cheque":" 1001 "},
         {"tipo":"ingreso","categoria":"pago_cliente","monto":7,"fecha":"2026-09-02","descripcion":"dos"}]') $$,
  'Un estado de cuenta válido se importa'
);
SELECT is(
  (SELECT COUNT(*)::int FROM finanzas_movimientos f JOIN finanzas_importaciones i ON i.id = f.importacion_id WHERE i.hash_archivo = 'h-bueno'),
  2,
  'El lote y sus dos movimientos quedan juntos'
);

-- ------------------------------------------------------------------------------------
-- 2b. Deshacer la importación: los movimientos y el lote se van juntos o no se van
-- ------------------------------------------------------------------------------------
-- Eran dos DELETE seguidos desde el navegador. Si el segundo no salía, el dinero ya estaba
-- borrado y el lote seguía anunciando las transacciones que acababan de desaparecer.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT deshacer_importacion_estado_cuenta(
       (SELECT id FROM finanzas_importaciones WHERE hash_archivo = 'h-bueno')) $$,
  '42501', NULL,
  'Un técnico no deshace una importación'
);
SELECT is(
  (SELECT COUNT(*)::int FROM finanzas_movimientos WHERE descripcion IN ('uno', 'dos')),
  0,
  'El técnico tampoco los ve (la RLS del dinero es solo admin)'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT COUNT(*)::int FROM finanzas_movimientos WHERE descripcion IN ('uno', 'dos')),
  2,
  'Tras el intento del técnico los dos movimientos siguen ahí'
);
SELECT is(
  (SELECT deshacer_importacion_estado_cuenta(
     (SELECT id FROM finanzas_importaciones WHERE hash_archivo = 'h-bueno'))),
  2,
  'El admin deshace la importación y le dice cuántos movimientos borró'
);
SELECT is_empty(
  $$ SELECT 1 FROM finanzas_movimientos WHERE descripcion IN ('uno', 'dos') $$,
  'No quedan movimientos huérfanos con importacion_id en null'
);
-- Un DELETE que la RLS rechaza devuelve cero filas sin error: por eso la función mira el
-- ROW_COUNT del lote y levanta 42501 en vez de reportar un borrado que no ocurrió.
SELECT throws_ok(
  $$ SELECT deshacer_importacion_estado_cuenta('11111111-1111-1111-1111-111111111111') $$,
  '42501', NULL,
  'Deshacer una importación que no existe falla en vez de decir que borró cero'
);

-- ------------------------------------------------------------------------------------
-- 3. Pagar dos veces las mismas comisiones
-- ------------------------------------------------------------------------------------
UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-1.png'
WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
DO $do$ BEGIN
  PERFORM pg_temp.autorizar_cotizado(id) FROM ordenes_trabajo WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
END $do$;
UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';

DO $do$ BEGIN
  PERFORM aprobar_comisiones(ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002'));
  PERFORM pay_commissions('a0000000-0000-0000-0000-000000000002',
    ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002'),
    CURRENT_DATE, 'cheque', '3001', NULL, NULL);
END $do$;

SELECT throws_ok(
  $$ SELECT pay_commissions('a0000000-0000-0000-0000-000000000002',
       ARRAY(SELECT id FROM comisiones WHERE usuario_id = 'a0000000-0000-0000-0000-000000000002'),
       CURRENT_DATE, 'cheque', '3002', NULL, NULL) $$,
  'P0001', NULL,
  'Pagar otra vez las mismas comisiones falla en vez de registrar un segundo cheque'
);

-- ------------------------------------------------------------------------------------
-- 4. Una cuenta sin perfil
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000009';
SELECT is_empty($$ SELECT id FROM sedes $$, 'Una cuenta de Auth sin perfil no lee las sedes');

-- ------------------------------------------------------------------------------------
-- 5. Índices y search_path
-- ------------------------------------------------------------------------------------
RESET ROLE;
SELECT ok(
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'
     AND indexname IN ('idx_orden_labor_orden', 'idx_orden_asignaciones_orden', 'idx_finanzas_movimientos_sede_fecha', 'idx_ordenes_trabajo_sede_creado')) = 4,
  'Existen los índices de las llaves foráneas más usadas'
);
SELECT ok(
  (SELECT proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = 'public.create_work_order(jsonb,jsonb,jsonb,jsonb)'::regprocedure),
  'create_work_order tiene search_path fijo'
);
-- Como admin: sin sesión, el trigger que cierra las órdenes entregadas falla antes.
-- Y sobre la orden abierta en la misma sentencia: en una cerrada el avance queda en 100
-- (20261010000001) y el CHECK nunca ve el 150. El CHECK salta después de los BEFORE y
-- antes de los AFTER, así que la reversión de la entrega no llega a correr.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 150, estatus = 'en_proceso'
     WHERE sede_id = '10000000-0000-0000-0000-000000000001' $$,
  '23514', NULL,
  'El avance de una orden no puede pasar de 100'
);

-- ------------------------------------------------------------------------------------
-- Recordatorio de órdenes que pasaron su fecha de entrega
-- ------------------------------------------------------------------------------------
RESET ROLE;
UPDATE ordenes_trabajo SET fecha_estimada_entrega = (NOW() AT TIME ZONE 'America/Chicago')::date - 3,
                           estatus = 'en_proceso'
WHERE sede_id = '10000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT recordar_ordenes_vencidas()),
  1,
  'El barrido avisa de la orden atrasada'
);

SELECT ok(
  (SELECT cuerpo LIKE '3 día(s)%' FROM notificaciones WHERE tipo = 'orden_vencida' LIMIT 1),
  'El aviso dice cuántos días lleva de retraso'
);

-- Una vez al día como mucho: si no, el taller aprende a ignorarlo.
SELECT is(
  (SELECT recordar_ordenes_vencidas()),
  0,
  'El mismo día no vuelve a avisar'
);

-- Al día siguiente sí vuelve a avisar, pero reemplaza el aviso de ayer (20261005000001). Antes
-- cada día dejaba una fila nueva, y una orden con una semana de retraso llenaba la campana
-- con siete avisos casi iguales.
UPDATE ordenes_trabajo SET recordado_entrega_en = NOW() - INTERVAL '21 hours'
WHERE sede_id = '10000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT recordar_ordenes_vencidas()),
  1,
  'Al día siguiente vuelve a avisar'
);
SELECT is(
  (SELECT MAX(n)::int FROM (SELECT COUNT(*) AS n FROM notificaciones
     WHERE tipo = 'orden_vencida' GROUP BY usuario_id, orden_id) t),
  1,
  'Pero queda un solo aviso por orden y persona, no uno por día'
);
SELECT is(
  (SELECT COUNT(*)::int FROM notificaciones WHERE tipo = 'orden_vencida' AND leida_en IS NULL),
  (SELECT COUNT(*)::int FROM notificaciones WHERE tipo = 'orden_vencida'),
  'Y el de hoy llega sin leer: el empujón diario sigue'
);

-- El trabajo se acabó: una orden entregada con la fecha pasada no es un retraso.
UPDATE ordenes_trabajo SET estatus = 'entregado', recordado_entrega_en = NULL
WHERE sede_id = '10000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT recordar_ordenes_vencidas()),
  0,
  'Una orden entregada no genera recordatorio'
);

SELECT * FROM finish();
ROLLBACK;
