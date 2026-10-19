-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: horas, reloj por tarea e indicadores (20261010000036)
-- ====================================================================================
-- Qué cubre (Parte L, L3):
-- 1. Reloj:
--    - el técnico asignado inicia;
--    - iniciar otra línea cierra la primera;
--    - otro técnico recibe 42501;
--    - una línea sin aprobar o una orden entregada, 42501;
--    - marcar la tarea hecha cierra su reloj;
--    - nadie inserta tiempos por la API;
--    - el técnico no ve los tiempos de una orden ajena.
-- 2. indicadores_taller, con dos órdenes entregadas en el período y una fuera:
--    - los dos carros entregados;
--    - las ventas de mano de obra y de repuestos, y el costo de repuestos;
--    - el ticket promedio;
--    - las horas y la tarifa efectiva;
--    - una división entre cero da NULL;
--    - la eficiencia del técnico con su reloj;
--    - un técnico recibe 42501.
-- 3. El catálogo y el alta llevan las horas.
-- 4. El historial registra un cambio de horas.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(40);

-- ------------------------------------------------------------------------------------
-- Datos base: 2 sedes, admin, 2 mecánicos, 1 pintor, clientes y vehículos
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, tarifa_hora, zona_horaria) VALUES
  ('40000000-0000-0000-0000-000000000001', 'Sede Horas QA 1', 'Calle 40-1', '555-4001', 85.00, 'America/New_York'),
  ('40000000-0000-0000-0000-000000000002', 'Sede Horas QA 2', 'Calle 40-2', '555-4002', 90.00, 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('40a00000-0000-0000-0000-000000000001', 'admin40@prueba.local'),
  ('40b00000-0000-0000-0000-000000000002', 'mecanico40a@prueba.local'),
  ('40b00000-0000-0000-0000-000000000003', 'mecanico40b@prueba.local'),
  ('40b00000-0000-0000-0000-000000000004', 'pintor40@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('40a00000-0000-0000-0000-000000000001', 'Admin 40', 'admin', '40000000-0000-0000-0000-000000000001', 'admin40@prueba.local'),
  ('40b00000-0000-0000-0000-000000000002', 'Mecanico 40A', 'mecanico', '40000000-0000-0000-0000-000000000001', 'mecanico40a@prueba.local'),
  ('40b00000-0000-0000-0000-000000000003', 'Mecanico 40B', 'mecanico', '40000000-0000-0000-0000-000000000001', 'mecanico40b@prueba.local'),
  ('40b00000-0000-0000-0000-000000000004', 'Pintor 40', 'pintor', '40000000-0000-0000-0000-000000000001', 'pintor40@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('40c00000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Cliente 40-1', '+15554001', 'cli40a@prueba.local', 'Ave 40-1', true),
  ('40c00000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Cliente 40-2', '+15554002', 'cli40b@prueba.local', 'Ave 40-2', true);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('40d00000-0000-0000-0000-000000000001', '40c00000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2021, '2T1BURHE0MC004001', 'QA-401', 'Blanco'),
  ('40d00000-0000-0000-0000-000000000002', '40c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2022, '2T1BURHE0MC004002', 'QA-402', 'Negro'),
  ('40d00000-0000-0000-0000-000000000003', '40c00000-0000-0000-0000-000000000001', 'Mazda', '3', 2020, '2T1BURHE0MC004003', 'QA-403', 'Rojo'),
  ('40d00000-0000-0000-0000-000000000004', '40c00000-0000-0000-0000-000000000001', 'Ford', 'Focus', 2019, '2T1BURHE0MC004004', 'QA-404', 'Azul'),
  ('40d00000-0000-0000-0000-000000000005', '40c00000-0000-0000-0000-000000000002', 'Nissan', 'Sentra', 2023, '2T1BURHE0MC004005', 'QA-405', 'Gris');

-- ------------------------------------------------------------------------------------
-- Preparación de órdenes y tareas para la prueba de reloj
-- ------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '40a00000-0000-0000-0000-000000000001';
-- Los datos se dejan aprobados a mano: la bandera de los presupuestos deja que una línea nazca así.
SELECT set_config('restorify.presupuesto', 'on', true);

DO $$
DECLARE
  v_o1_id        UUID;
  v_o_entregada  UUID;
  v_o_ajena      UUID;
  v_l1_id        UUID;
  v_l2_id        UUID;
  v_l3_id        UUID;
  v_l4_id        UUID;
  v_l5_id        UUID;
BEGIN
  -- Orden activa de Mecanico 40A
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
  ) VALUES (
    '40000000-0000-0000-0000-000000000001', '40c00000-0000-0000-0000-000000000001', '40d00000-0000-0000-0000-000000000001',
    'mecanica', 12000, 'full', '2026-11-01', '40a00000-0000-0000-0000-000000000001', 'en_proceso'
  ) RETURNING id INTO v_o1_id;

  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
  VALUES (v_o1_id, '40b00000-0000-0000-0000-000000000002', 'mecanica');

  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
  VALUES (v_o1_id, 'Frenos delanteros', 200, 2.0, 'mecanica', '40b00000-0000-0000-0000-000000000002', 'aprobado', false)
  RETURNING id INTO v_l1_id;

  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
  VALUES (v_o1_id, 'Frenos traseros', 150, 1.5, 'mecanica', '40b00000-0000-0000-0000-000000000002', 'aprobado', false)
  RETURNING id INTO v_l2_id;

  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
  VALUES (v_o1_id, 'Alineación', 100, 1.0, 'mecanica', '40b00000-0000-0000-0000-000000000002', 'borrador', false)
  RETURNING id INTO v_l3_id;

  -- Orden entregada
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus, fecha_finalizacion
  ) VALUES (
    '40000000-0000-0000-0000-000000000001', '40c00000-0000-0000-0000-000000000001', '40d00000-0000-0000-0000-000000000002',
    'mecanica', 14000, 'full', '2026-11-01', '40a00000-0000-0000-0000-000000000001', 'entregado', now()
  ) RETURNING id INTO v_o_entregada;

  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
  VALUES (v_o_entregada, '40b00000-0000-0000-0000-000000000002', 'mecanica');

  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
  VALUES (v_o_entregada, 'Cambio de aceite', 80, 1.0, 'mecanica', '40b00000-0000-0000-0000-000000000002', 'aprobado', false)
  RETURNING id INTO v_l4_id;

  -- Orden ajena de Mecanico 40B
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
  ) VALUES (
    '40000000-0000-0000-0000-000000000001', '40c00000-0000-0000-0000-000000000001', '40d00000-0000-0000-0000-000000000003',
    'mecanica', 16000, 'full', '2026-11-01', '40a00000-0000-0000-0000-000000000001', 'en_proceso'
  ) RETURNING id INTO v_o_ajena;

  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
  VALUES (v_o_ajena, '40b00000-0000-0000-0000-000000000003', 'mecanica');

  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
  VALUES (v_o_ajena, 'Amortiguadores', 250, 2.5, 'mecanica', '40b00000-0000-0000-0000-000000000003', 'aprobado', false)
  RETURNING id INTO v_l5_id;

  PERFORM set_config('test.o1_id', v_o1_id::text, true);
  PERFORM set_config('test.o_entregada', v_o_entregada::text, true);
  PERFORM set_config('test.o_ajena', v_o_ajena::text, true);
  PERFORM set_config('test.l1_id', v_l1_id::text, true);
  PERFORM set_config('test.l2_id', v_l2_id::text, true);
  PERFORM set_config('test.l3_id', v_l3_id::text, true);
  PERFORM set_config('test.l4_id', v_l4_id::text, true);
  PERFORM set_config('test.l5_id', v_l5_id::text, true);
END $$;
SELECT set_config('restorify.presupuesto', 'off', true);


-- ------------------------------------------------------------------------------------
-- 1. Pruebas de Reloj
-- ------------------------------------------------------------------------------------

-- Como técnico asignado (40b...0002)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '40b00000-0000-0000-0000-000000000002';

-- Caso 1: El técnico asignado inicia el reloj
SELECT ok(
  public.iniciar_reloj(current_setting('test.l1_id')::uuid) IS NOT NULL,
  'el técnico asignado inicia el reloj con éxito'
);

-- Caso 2 y 3: Iniciar otra línea cierra la primera y abre la segunda
SELECT ok(
  public.iniciar_reloj(current_setting('test.l2_id')::uuid) IS NOT NULL,
  'iniciar otra línea abre el segundo reloj'
);

SELECT ok(
  (SELECT fin IS NOT NULL FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l1_id')::uuid),
  'iniciar otra línea cierra automáticamente la primera'
);

SELECT ok(
  (SELECT fin IS NULL FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l2_id')::uuid),
  'el segundo reloj queda en estado activo (fin IS NULL)'
);

-- Caso 4: Detener el reloj cierra el tiempo activo
SELECT lives_ok(
  $$ SELECT public.detener_reloj(current_setting('test.l2_id')::uuid) $$,
  'detener_reloj se ejecuta sin errores'
);

SELECT ok(
  (SELECT fin IS NOT NULL FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l2_id')::uuid),
  'el segundo reloj queda cerrado con marca de fin'
);

-- Caso 5: Otro técnico recibe 42501 al intentar iniciar
SET LOCAL request.jwt.claim.sub = '40b00000-0000-0000-0000-000000000003';
SELECT throws_ok(
  $$ SELECT public.iniciar_reloj(current_setting('test.l1_id')::uuid) $$,
  '42501', NULL,
  'un técnico no asignado recibe 42501 al intentar iniciar el reloj'
);

-- Caso 6: Línea sin aprobar da 42501
SET LOCAL request.jwt.claim.sub = '40b00000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT public.iniciar_reloj(current_setting('test.l3_id')::uuid) $$,
  '42501', NULL,
  'iniciar reloj en una línea sin aprobar da 42501'
);

-- Caso 7: Orden entregada da 42501
SELECT throws_ok(
  $$ SELECT public.iniciar_reloj(current_setting('test.l4_id')::uuid) $$,
  '42501', NULL,
  'iniciar reloj en una orden entregada da 42501'
);

-- Caso 8: Marcar la tarea completada cierra su reloj activo
DO $$
BEGIN
  PERFORM public.iniciar_reloj(current_setting('test.l1_id')::uuid);
  -- El técnico marca su tarea por la RPC (un UPDATE directo no le está permitido).
  PERFORM public.marcar_labor_completada(current_setting('test.l1_id')::uuid);
END $$;

SELECT ok(
  (SELECT fin IS NOT NULL FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l1_id')::uuid ORDER BY inicio DESC LIMIT 1),
  'marcar la tarea hecha cierra su reloj activo vía trigger'
);

-- Caso 9: Nadie inserta tiempos directamente por la API
SELECT throws_ok(
  $$ INSERT INTO orden_labor_tiempos (labor_id, orden_id, usuario_id)
     SELECT current_setting('test.l1_id')::uuid, current_setting('test.o1_id')::uuid, auth.uid() $$,
  '42501', NULL,
  'nadie inserta tiempos directamente por la API (bloqueado por RLS/grants)'
);

-- Preparar tiempo en orden ajena
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '40b00000-0000-0000-0000-000000000003';
SELECT public.iniciar_reloj(current_setting('test.l5_id')::uuid);

-- Caso 10: Técnico no ve tiempos de orden ajena (con RLS: sesión de técnico, no superusuario)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '40b00000-0000-0000-0000-000000000002';
SELECT is_empty(
  $$ SELECT 1 FROM orden_labor_tiempos WHERE orden_id = current_setting('test.o_ajena')::uuid $$,
  'un técnico no ve los registros de tiempo de una orden ajena'
);

-- Caso 11 y 12: corregir_tiempo (admin lives_ok, técnico 42501)
SELECT throws_ok(
  $$ SELECT public.corregir_tiempo(
       (SELECT id FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l1_id')::uuid LIMIT 1),
       '2026-10-10 08:00:00-04'::timestamptz,
       '2026-10-10 10:00:00-04'::timestamptz
     ) $$,
  '42501', NULL,
  'técnico recibe 42501 al intentar corregir tiempo'
);

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '40a00000-0000-0000-0000-000000000001';
-- Con la sesión del admin (no como superusuario): la tabla es de solo lectura por la API.
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT public.corregir_tiempo(
       (SELECT id FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l1_id')::uuid LIMIT 1),
       '2026-10-10 08:00:00-04'::timestamptz,
       '2026-10-10 10:00:00-04'::timestamptz
     ) $$,
  'administración puede corregir un registro de tiempo'
);

-- Caso 13 y 14: borrar_tiempo (técnico 42501, admin lives_ok)
SET LOCAL request.jwt.claim.sub = '40b00000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT public.borrar_tiempo(
       (SELECT id FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l1_id')::uuid LIMIT 1)
     ) $$,
  '42501', NULL,
  'técnico recibe 42501 al intentar borrar tiempo'
);

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '40a00000-0000-0000-0000-000000000001';
-- Los datos se dejan aprobados a mano: la bandera de los presupuestos deja que una línea nazca así.
SELECT set_config('restorify.presupuesto', 'on', true);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ SELECT public.borrar_tiempo(
       (SELECT id FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l1_id')::uuid LIMIT 1)
     ) $$,
  'administración puede borrar un registro de tiempo'
);
RESET ROLE;


-- ------------------------------------------------------------------------------------
-- 2. Pruebas de indicadores_taller
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_ok1 UUID;
  v_ok2 UUID;
  v_ok3 UUID;
  v_lab1 UUID;
  v_lab2 UUID;
  v_lab3 UUID;
  v_pres UUID;
BEGIN
  -- Las órdenes se arman por el camino real (20261010000036, corregido por Claude): nacen en
  -- recepción, sus líneas aprobadas entran con la bandera de los presupuestos (activa en este
  -- tramo), el descuento va por aplicar_descuento, se entregan y las comisiones que genera la
  -- base se aceptan con aprobar_comision. Los totales los calcula la base.
  INSERT INTO perfiles_pago (usuario_id, esquema, comision_porcentaje)
  VALUES ('40b00000-0000-0000-0000-000000000002', 'comision', 30)
  ON CONFLICT (usuario_id) DO UPDATE SET esquema = 'comision', comision_porcentaje = 30;

  -- Orden K1 (entregada en el período: 2026-10-05 a 2026-10-08, 3.0 días): 300 de mano de obra,
  -- 120 de repuestos (costo 80) → total 420, comisión 90.
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina,
    fecha_estimada_entrega, creado_por, fecha_ingreso
  ) VALUES (
    '40000000-0000-0000-0000-000000000001', '40c00000-0000-0000-0000-000000000001', '40d00000-0000-0000-0000-000000000001',
    'mecanica', 20000, 'full', '2026-10-10', '40a00000-0000-0000-0000-000000000001', '2026-10-05 09:00:00-04'
  ) RETURNING id INTO v_ok1;
  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, completado_en, completado_por, reparto_heredado)
  VALUES (v_ok1, 'Frenos K1', 300.00, 3.00, 'mecanica', '40b00000-0000-0000-0000-000000000002', 'aprobado', '2026-10-07 15:00:00-04', '40b00000-0000-0000-0000-000000000002', false)
  RETURNING id INTO v_lab1;
  INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal, estado)
  VALUES (v_ok1, 'Pastillas', 2, 40.00, 60.00, 120.00, 'aprobado');

  -- Orden K2 (entregada en el período: 2026-10-10 a 2026-10-12, 2.0 días): 200 + 80 (costo 50)
  -- − 20 de descuento → total 260, comisión 60.
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina,
    fecha_estimada_entrega, creado_por, fecha_ingreso
  ) VALUES (
    '40000000-0000-0000-0000-000000000001', '40c00000-0000-0000-0000-000000000001', '40d00000-0000-0000-0000-000000000002',
    'mecanica', 25000, 'full', '2026-10-15', '40a00000-0000-0000-0000-000000000001', '2026-10-10 09:00:00-04'
  ) RETURNING id INTO v_ok2;
  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, completado_en, completado_por, reparto_heredado)
  VALUES (v_ok2, 'Suspensión K2', 200.00, 2.00, 'mecanica', '40b00000-0000-0000-0000-000000000002', 'aprobado', '2026-10-11 16:00:00-04', '40b00000-0000-0000-0000-000000000002', false)
  RETURNING id INTO v_lab2;
  INSERT INTO orden_repuestos (orden_id, descripcion, cantidad, costo_unitario, precio_venta_unitario, subtotal, estado)
  VALUES (v_ok2, 'Rótula', 1, 50.00, 80.00, 80.00, 'aprobado');
  PERFORM public.aplicar_descuento(v_ok2, 20.00, 'Prueba de indicadores');

  -- Orden K3 (entregada FUERA del período, en septiembre): 500 de mano de obra.
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina,
    fecha_estimada_entrega, creado_por, fecha_ingreso
  ) VALUES (
    '40000000-0000-0000-0000-000000000001', '40c00000-0000-0000-0000-000000000001', '40d00000-0000-0000-0000-000000000003',
    'mecanica', 30000, 'full', '2026-09-15', '40a00000-0000-0000-0000-000000000001', '2026-09-01 09:00:00-04'
  ) RETURNING id INTO v_ok3;
  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, completado_en, completado_por, reparto_heredado)
  VALUES (v_ok3, 'Motor K3', 500.00, 5.00, 'mecanica', '40b00000-0000-0000-0000-000000000002', 'aprobado', '2026-09-08 10:00:00-04', '40b00000-0000-0000-0000-000000000002', false);

  -- Se entregan. La fecha de entrega se fija después, por si un trigger la pone en "ahora".
  UPDATE ordenes_trabajo SET estatus = 'entregado' WHERE id IN (v_ok1, v_ok2, v_ok3);
  UPDATE ordenes_trabajo SET fecha_finalizacion = '2026-10-08 09:00:00-04' WHERE id = v_ok1;
  UPDATE ordenes_trabajo SET fecha_finalizacion = '2026-10-12 09:00:00-04' WHERE id = v_ok2;
  UPDATE ordenes_trabajo SET fecha_finalizacion = '2026-09-10 09:00:00-04' WHERE id = v_ok3;
  PERFORM public.aprobar_comision(c.id) FROM comisiones c WHERE c.orden_id IN (v_ok1, v_ok2);

  -- Presupuesto respondido en el período
  INSERT INTO presupuestos (
    orden_id, sede_id, numero, estado, respondido_en, total_propuesto, total_aprobado
  ) VALUES (
    v_ok1, '40000000-0000-0000-0000-000000000001', 401, 'respondido', '2026-10-15 12:00:00-04', 1000.00, 800.00
  );

  -- Tiempos registrados para Mecanico 40A en el período:
  -- 2 horas (08:00 a 10:00) + 2.5 horas (08:00 a 10:30) = 4.50 horas
  INSERT INTO orden_labor_tiempos (labor_id, orden_id, usuario_id, inicio, fin)
  VALUES (v_lab1, v_ok1, '40b00000-0000-0000-0000-000000000002', '2026-10-06 08:00:00-04', '2026-10-06 10:00:00-04');

  INSERT INTO orden_labor_tiempos (labor_id, orden_id, usuario_id, inicio, fin)
  VALUES (v_lab2, v_ok2, '40b00000-0000-0000-0000-000000000002', '2026-10-11 08:00:00-04', '2026-10-11 10:30:00-04');
END $$;
SELECT set_config('restorify.presupuesto', 'off', true);

-- Evaluar indicadores_taller como administrador
DO $$
DECLARE
  v_ind JSONB;
BEGIN
  v_ind := public.indicadores_taller('40000000-0000-0000-0000-000000000001', '2026-10-01'::date, '2026-10-15'::date);
  PERFORM set_config('test.indicadores', v_ind::text, true);
END $$;

-- Caso 15: Carros entregados en el período = 2
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'carros_entregados')::int,
  2,
  'indicadores: 2 carros entregados en el período'
);

-- Caso 16: Carros recibidos en el período = 2
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'carros_recibidos')::int,
  2,
  'indicadores: 2 carros recibidos en el período'
);

-- Caso 17: Ventas mano de obra = 500.00 (300 + 200)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'ventas_mano_obra')::numeric,
  500.00,
  'indicadores: ventas de mano de obra suman 500.00'
);

-- Caso 18: Ventas repuestos = 200.00 (120 + 80)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'ventas_repuestos')::numeric,
  200.00,
  'indicadores: ventas de repuestos suman 200.00'
);

-- Caso 19: Costo repuestos = 130.00 (2*40 + 1*50)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'costo_repuestos')::numeric,
  130.00,
  'indicadores: costo de repuestos suma 130.00'
);

-- Caso 20: Descuentos = 20.00
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'descuentos')::numeric,
  20.00,
  'indicadores: descuentos suman 20.00'
);

-- Caso 21: Ticket promedio = 340.00 ((420 + 260) / 2)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'ticket_promedio')::numeric,
  340.00,
  'indicadores: ticket promedio es 340.00'
);

-- Caso 22: Comisiones = 150.00 (90 + 60)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'comisiones')::numeric,
  150.00,
  'indicadores: comisiones aceptadas suman 150.00'
);

-- Caso 23: Margen mano de obra = 0.7000 ((500 - 150) / 500)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'margen_mano_obra')::numeric,
  0.7000,
  'indicadores: margen de mano de obra es 70% (0.7000)'
);

-- Caso 24: Margen repuestos = 0.3500 ((200 - 130) / 200)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'margen_repuestos')::numeric,
  0.3500,
  'indicadores: margen de repuestos es 35% (0.3500)'
);

-- Caso 25: Horas facturadas = 5.00 (3.0 + 2.0)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'horas_facturadas')::numeric,
  5.00,
  'indicadores: horas facturadas aprobadas suman 5.00'
);

-- Caso 26: Tarifa efectiva = 100.00 (500.00 / 5.00)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'tarifa_efectiva')::numeric,
  100.00,
  'indicadores: tarifa efectiva es 100.00 por hora'
);

-- Caso 27: Horas por orden = 2.50 (5.00 / 2)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'horas_por_orden')::numeric,
  2.50,
  'indicadores: horas por orden es 2.50'
);

-- Caso 28: Tarifa hora sede = 85.00
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'tarifa_hora_sede')::numeric,
  85.00,
  'indicadores: tarifa hora sede de referencia es 85.00'
);

-- Caso 29: Aprobación presupuestos = 0.8000 (800 / 1000)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'aprobacion_presupuestos')::numeric,
  0.8000,
  'indicadores: aprobación de presupuestos es 80% (0.8000)'
);

-- Caso 30: Días promedio en taller = 2.5 días ((3.0 + 2.0) / 2)
SELECT is(
  (current_setting('test.indicadores')::jsonb ->> 'dias_promedio_en_taller')::numeric,
  2.5,
  'indicadores: días promedio en taller es 2.5'
);

-- Caso 31: Eficiencia por técnico = 5.0 facturadas / 6.5 de reloj = 0.7692. El reloj suma 4.5 h
-- de K1 y K2 más las 2 h (10/10, 08:00–10:00) que dejó corregir_tiempo en el caso 11.
SELECT is(
  (SELECT (elem->>'eficiencia')::numeric
   FROM jsonb_array_elements(current_setting('test.indicadores')::jsonb -> 'por_tecnico') elem
   WHERE elem->>'usuario_id' = '40b00000-0000-0000-0000-000000000002'),
  0.7692,
  'indicadores por_tecnico: eficiencia del técnico es 0.7692'
);

-- Caso 32: División entre cero da NULL en sede sin órdenes entregadas
DO $$
DECLARE
  v_vacio JSONB;
BEGIN
  v_vacio := public.indicadores_taller('40000000-0000-0000-0000-000000000002', '2026-10-01'::date, '2026-10-15'::date);
  PERFORM set_config('test.ind_vacio', v_vacio::text, true);
END $$;

SELECT ok(
  (current_setting('test.ind_vacio')::jsonb ->> 'ticket_promedio') IS NULL
  AND (current_setting('test.ind_vacio')::jsonb ->> 'tarifa_efectiva') IS NULL
  AND (current_setting('test.ind_vacio')::jsonb ->> 'horas_por_orden') IS NULL
  AND (current_setting('test.ind_vacio')::jsonb ->> 'margen_mano_obra') IS NULL,
  'indicadores: períodos o sedes sin entregadas devuelven NULL en divisiones por cero'
);

-- Caso 33: Técnico recibe 42501 al llamar indicadores_taller
SET LOCAL request.jwt.claim.sub = '40b00000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT public.indicadores_taller('40000000-0000-0000-0000-000000000001', '2026-10-01'::date, '2026-10-15'::date) $$,
  '42501', NULL,
  'técnico recibe 42501 al intentar consultar los indicadores del taller'
);


-- ------------------------------------------------------------------------------------
-- 3. Pruebas de Catálogo y Alta con horas
-- ------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '40a00000-0000-0000-0000-000000000001';

-- Caso 34: guardar_trabajo_catalogo guarda horas
DO $$
DECLARE
  v_cat_id UUID;
BEGIN
  v_cat_id := public.guardar_trabajo_catalogo(
    NULL,
    '40000000-0000-0000-0000-000000000001',
    'Servicio 40K',
    true,
    jsonb_build_array(
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Afinación mayor', 'especialidad', 'mecanica', 'precio', 350.00, 'horas', 3.5),
      jsonb_build_object('tipo', 'repuesto', 'descripcion', 'Bujías Iridium', 'cantidad', 4, 'precio', 25.00)
    )
  );
  PERFORM set_config('test.cat_id', v_cat_id::text, true);
END $$;

SELECT ok(
  (SELECT horas = 3.5 FROM public.catalogo_trabajo_lineas WHERE catalogo_id = current_setting('test.cat_id')::uuid AND tipo = 'mano_obra'),
  'guardar_trabajo_catalogo guarda correctamente la columna horas'
);

-- Caso 35: catalogo_de_trabajos devuelve horas en su JSON
SELECT is(
  (SELECT (l->>'horas')::numeric
   FROM jsonb_array_elements(
     (SELECT elem->'lineas'
      FROM jsonb_array_elements(public.catalogo_de_trabajos('40000000-0000-0000-0000-000000000001')) elem
      WHERE elem->>'id' = current_setting('test.cat_id'))
   ) l
   WHERE l->>'tipo' = 'mano_obra'),
  3.5,
  'catalogo_de_trabajos devuelve la columna horas'
);

-- Caso 36: agregar_trabajo_del_catalogo copia horas a orden_labor
DO $$
DECLARE
  v_ord_cat_id UUID;
  v_trb_id     UUID;
BEGIN
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '40000000-0000-0000-0000-000000000001', '40c00000-0000-0000-0000-000000000001', '40d00000-0000-0000-0000-000000000004',
    'mecanica', 28000, 'full', '2026-11-10', '40a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_ord_cat_id;

  v_trb_id := public.agregar_trabajo_del_catalogo(
    v_ord_cat_id,
    current_setting('test.cat_id')::uuid,
    '40b00000-0000-0000-0000-000000000002'
  );
  PERFORM set_config('test.ord_cat_id', v_ord_cat_id::text, true);
END $$;

SELECT is(
  (SELECT horas FROM public.orden_labor WHERE orden_id = current_setting('test.ord_cat_id')::uuid AND descripcion = 'Afinación mayor' LIMIT 1),
  3.5,
  'agregar_trabajo_del_catalogo copia horas a orden_labor'
);

-- Caso 37: create_work_order guarda horas al crear la orden
DO $$
DECLARE
  v_nueva_ord ordenes_trabajo;
BEGIN
  v_nueva_ord := public.create_work_order(
    jsonb_build_object(
      'sede_id', '40000000-0000-0000-0000-000000000001',
      'cliente_id', '40c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '40d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 32000,
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-11-15',
      'creado_por', '40a00000-0000-0000-0000-000000000001'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'descripcion', 'Cambio de embrague',
        'costo', 450.00,
        'horas', 4.5,
        'especialidad', 'mecanica',
        'asignado_a', '40b00000-0000-0000-0000-000000000002'
      )
    )
  );
  PERFORM set_config('test.nueva_ord_id', v_nueva_ord.id::text, true);
END $$;

SELECT is(
  (SELECT horas FROM public.orden_labor WHERE orden_id = current_setting('test.nueva_ord_id')::uuid AND descripcion = 'Cambio de embrague'),
  4.5,
  'create_work_order guarda horas en orden_labor'
);


-- ------------------------------------------------------------------------------------
-- 4. Pruebas de Historial con horas
-- ------------------------------------------------------------------------------------
-- Caso 38: Modificar horas genera registro en historial_orden
DO $$
DECLARE
  v_lab_edit UUID;
BEGIN
  SELECT id INTO v_lab_edit
  FROM public.orden_labor
  WHERE orden_id = current_setting('test.nueva_ord_id')::uuid
  LIMIT 1;

  UPDATE public.orden_labor
  SET horas = 5.5
  WHERE id = v_lab_edit;
END $$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.historial_orden
    WHERE orden_id = current_setting('test.nueva_ord_id')::uuid
      AND entidad = 'mano_obra'
      AND accion = 'cambiar'
      AND cambios ? 'horas'
      AND (cambios->'horas'->>'antes')::numeric = 4.5
      AND (cambios->'horas'->>'despues')::numeric = 5.5
  ),
  'el historial de la orden registra el cambio de horas con antes y después'
);

SELECT * FROM finish();
ROLLBACK;
