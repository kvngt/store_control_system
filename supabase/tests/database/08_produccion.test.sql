-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: revisión antes de salir a producción
-- ====================================================================================
-- Qué cubre (migración 20260927000000): los totales del panel salen bien con más de
-- 1.000 movimientos y respetan RLS; importar un estado de cuenta es todo o nada;
-- pagar dos veces las mismas comisiones falla; una cuenta sin perfil no ve sedes; los
-- índices y el search_path existen; el avance no pasa de 100.
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(22);

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
-- 3. Pagar dos veces las mismas comisiones
-- ------------------------------------------------------------------------------------
UPDATE ordenes_trabajo SET firma_ruta = sede_id || '/' || id || '/firma-1.png'
WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';
UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE vehiculo_id = 'd0000000-0000-0000-0000-000000000001';

DO $do$ BEGIN
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
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ UPDATE ordenes_trabajo SET porcentaje_avance = 150
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
