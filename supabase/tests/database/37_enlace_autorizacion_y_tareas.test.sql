-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: enlace, autorización y tareas (20261010000032)
-- ====================================================================================
-- Qué cubre:
-- 1. Enlace:
--    - orden creada con create_work_order tiene enlace activo.
--    - INSERT directo de admin también lo tiene.
--    - firmar no crea un segundo enlace.
-- 2. Correo:
--    - pasar a en_proceso sin firma no encola correo estatus.
--    - pasar a en_proceso con firma sí encola correo estatus.
-- 3. Autorización:
--    - registrar_autorizacion con línea aprobada pasa la orden a en_proceso.
--    - con todo rechazado se queda en recepcion.
--    - el alta con autorizado_en_recepcion = true termina en en_proceso.
--    - una orden en espera_autorizacion no la toca este trigger.
-- 4. Tareas:
--    - asignar mecánico (origen manual) toma la de mecánica sin técnico.
--    - la de pintura, la rechazada y la ajena no cambian.
--    - origen = 'tarea' no toma nada.
--    - una orden entregada no cambia.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(15);

-- ------------------------------------------------------------------------------------
-- Datos base: sede, admin, 2 mecánicos, 1 pintor, cliente y vehículos
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('37000000-0000-0000-0000-000000000001', 'Sede Enlace QA', 'Calle 37', '555-3700');

INSERT INTO auth.users (id, email) VALUES
  ('37a00000-0000-0000-0000-000000000001', 'admin37@prueba.local'),
  ('37b00000-0000-0000-0000-000000000002', 'mecanico37a@prueba.local'),
  ('37b00000-0000-0000-0000-000000000003', 'mecanico37b@prueba.local'),
  ('37b00000-0000-0000-0000-000000000004', 'pintor37@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('37a00000-0000-0000-0000-000000000001', 'Admin 37', 'admin', '37000000-0000-0000-0000-000000000001', 'admin37@prueba.local'),
  ('37b00000-0000-0000-0000-000000000002', 'Mecanico 37A', 'mecanico', '37000000-0000-0000-0000-000000000001', 'mecanico37a@prueba.local'),
  ('37b00000-0000-0000-0000-000000000003', 'Mecanico 37B', 'mecanico', '37000000-0000-0000-0000-000000000001', 'mecanico37b@prueba.local'),
  ('37b00000-0000-0000-0000-000000000004', 'Pintor 37', 'pintor', '37000000-0000-0000-0000-000000000001', 'pintor37@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('37c00000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', 'Cliente 37', '+15553701', 'cli37@prueba.local', 'Ave 37', true);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('37d00000-0000-0000-0000-000000000001', '37c00000-0000-0000-0000-000000000001', 'Toyota', 'RAV4', 2022, '2T1BURHE0MC003701', 'QA-371', 'Azul'),
  ('37d00000-0000-0000-0000-000000000002', '37c00000-0000-0000-0000-000000000001', 'Honda', 'CR-V', 2021, '2T1BURHE0MC003702', 'QA-372', 'Rojo'),
  ('37d00000-0000-0000-0000-000000000003', '37c00000-0000-0000-0000-000000000001', 'Nissan', 'Rogue', 2020, '2T1BURHE0MC003703', 'QA-373', 'Blanco'),
  ('37d00000-0000-0000-0000-000000000004', '37c00000-0000-0000-0000-000000000001', 'Ford', 'Escape', 2019, '2T1BURHE0MC003704', 'QA-374', 'Negro'),
  ('37d00000-0000-0000-0000-000000000005', '37c00000-0000-0000-0000-000000000001', 'Mazda', 'CX-5', 2023, '2T1BURHE0MC003705', 'QA-375', 'Gris'),
  ('37d00000-0000-0000-0000-000000000006', '37c00000-0000-0000-0000-000000000001', 'Subaru', 'Forester', 2020, '2T1BURHE0MC003706', 'QA-376', 'Plata');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '37a00000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 1. Enlace: nace al crear y firmar no crea un segundo enlace
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_o1 ordenes_trabajo;
  v_o2_id UUID;
BEGIN
  v_o1 := create_work_order(
    jsonb_build_object(
      'sede_id', '37000000-0000-0000-0000-000000000001',
      'cliente_id', '37c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '37d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 20000,
      'nivel_gasolina', '1/2',
      'fecha_estimada_entrega', '2026-11-01',
      'creado_por', '37a00000-0000-0000-0000-000000000001'
    ),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  PERFORM set_config('test.o1_id', v_o1.id::text, true);

  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '37000000-0000-0000-0000-000000000001', '37c00000-0000-0000-0000-000000000001', '37d00000-0000-0000-0000-000000000002',
    'mecanica', 10000, '1/2', '2026-11-01', '37a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_o2_id;
  PERFORM set_config('test.o2_id', v_o2_id::text, true);
END $$;

SELECT ok(
  EXISTS (SELECT 1 FROM orden_enlaces WHERE orden_id = current_setting('test.o1_id')::uuid AND revocado_en IS NULL),
  'una orden recién creada con create_work_order tiene un enlace activo'
);

SELECT ok(
  EXISTS (SELECT 1 FROM orden_enlaces WHERE orden_id = current_setting('test.o2_id')::uuid AND revocado_en IS NULL),
  'el INSERT directo de un admin también tiene enlace activo'
);

-- De aquí en adelante los datos se preparan a mano: sin RLS, con el admin en el JWT (los
-- guardias leen el `sub`).
RESET ROLE;

UPDATE ordenes_trabajo
SET firma_ruta = sede_id || '/' || id || '/firma.png'
WHERE id = current_setting('test.o1_id')::uuid;

SELECT is(
  (SELECT COUNT(*)::int FROM orden_enlaces WHERE orden_id = current_setting('test.o1_id')::uuid AND revocado_en IS NULL),
  1,
  'firmar no crea un segundo enlace'
);

-- ------------------------------------------------------------------------------------
-- 2. Correo: aviso de en_proceso espera la firma
-- ------------------------------------------------------------------------------------
-- En o2 (sin firma): pasar a en_proceso no encola correo 'estatus'
DELETE FROM cola_envios WHERE orden_id = current_setting('test.o2_id')::uuid;
UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = current_setting('test.o2_id')::uuid;

SELECT is(
  (SELECT COUNT(*)::int FROM cola_envios WHERE orden_id = current_setting('test.o2_id')::uuid AND canal = 'email' AND plantilla = 'estatus'),
  0,
  'pasar a en_proceso sin firma no encola un correo estatus'
);

-- En o1 (con firma): pasar a en_proceso sí encola correo 'estatus'
DELETE FROM cola_envios WHERE orden_id = current_setting('test.o1_id')::uuid;
UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = current_setting('test.o1_id')::uuid;

SELECT is(
  (SELECT COUNT(*)::int FROM cola_envios WHERE orden_id = current_setting('test.o1_id')::uuid AND canal = 'email' AND plantilla = 'estatus'),
  1,
  'pasar a en_proceso con firma sí encola correo estatus'
);

-- ------------------------------------------------------------------------------------
-- 3. Autorización: pone la orden en proceso
-- ------------------------------------------------------------------------------------
-- 3a. registrar_autorizacion con línea aprobada deja la orden en en_proceso
DO $$
DECLARE
  v_o3 ordenes_trabajo;
  v_l3 UUID;
BEGIN
  v_o3 := create_work_order(
    jsonb_build_object(
      'sede_id', '37000000-0000-0000-0000-000000000001',
      'cliente_id', '37c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '37d00000-0000-0000-0000-000000000003',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 30000,
      'nivel_gasolina', '1/4',
      'fecha_estimada_entrega', '2026-11-05',
      'creado_por', '37a00000-0000-0000-0000-000000000001'
    ),
    '[{"descripcion":"Frenos","costo":150,"especialidad":"mecanica","reparto_heredado":false}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
  SELECT id INTO v_l3 FROM orden_labor WHERE orden_id = v_o3.id LIMIT 1;
  PERFORM public.registrar_autorizacion(v_o3.id, ARRAY[v_l3], ARRAY[v_l3], 'admin_presencial', NULL, 'Aprobado');
  PERFORM set_config('test.o3_id', v_o3.id::text, true);
END $$;

SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = current_setting('test.o3_id')::uuid),
  'en_proceso',
  'registrar_autorizacion con la línea aprobada deja la orden en en_proceso'
);

-- 3b. con todo rechazado se queda en recepcion
DO $$
DECLARE
  v_o4 ordenes_trabajo;
  v_l4 UUID;
BEGIN
  v_o4 := create_work_order(
    jsonb_build_object(
      'sede_id', '37000000-0000-0000-0000-000000000001',
      'cliente_id', '37c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '37d00000-0000-0000-0000-000000000004',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 35000,
      'nivel_gasolina', '1/4',
      'fecha_estimada_entrega', '2026-11-05',
      'creado_por', '37a00000-0000-0000-0000-000000000001'
    ),
    '[{"descripcion":"Suspension","costo":200,"especialidad":"mecanica","reparto_heredado":false}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
  SELECT id INTO v_l4 FROM orden_labor WHERE orden_id = v_o4.id LIMIT 1;
  PERFORM public.registrar_autorizacion(v_o4.id, ARRAY[]::uuid[], ARRAY[v_l4], 'admin_presencial', NULL, 'Rechazado');
  PERFORM set_config('test.o4_id', v_o4.id::text, true);
END $$;

SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = current_setting('test.o4_id')::uuid),
  'recepcion',
  'con todo rechazado se queda en recepcion'
);

-- 3c. el alta con autorizado_en_recepcion = true termina en en_proceso
DO $$
DECLARE
  v_o5 ordenes_trabajo;
BEGIN
  v_o5 := create_work_order(
    jsonb_build_object(
      'sede_id', '37000000-0000-0000-0000-000000000001',
      'cliente_id', '37c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '37d00000-0000-0000-0000-000000000005',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 40000,
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-11-05',
      'creado_por', '37a00000-0000-0000-0000-000000000001',
      'autorizado_en_recepcion', true
    ),
    '[{"descripcion":"Alineacion","costo":80,"especialidad":"mecanica","reparto_heredado":false}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
  PERFORM set_config('test.o5_id', v_o5.id::text, true);
END $$;

SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = current_setting('test.o5_id')::uuid),
  'en_proceso',
  'el alta con autorizado_en_recepcion = true termina en en_proceso'
);

-- 3d. una orden en espera_autorizacion no la toca este trigger
DO $$
DECLARE
  v_o6 ordenes_trabajo;
  v_l6 UUID;
  v_p6 UUID;
BEGIN
  v_o6 := create_work_order(
    jsonb_build_object(
      'sede_id', '37000000-0000-0000-0000-000000000001',
      'cliente_id', '37c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '37d00000-0000-0000-0000-000000000006',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 50000,
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-11-05',
      'creado_por', '37a00000-0000-0000-0000-000000000001'
    ),
    '[{"descripcion":"Revision inicial","costo":50,"especialidad":"mecanica","reparto_heredado":false}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
  -- Poner en espera de autorizacion con un hallazgo pendiente para que _salir_de_espera no la mueva
  INSERT INTO orden_hallazgos (orden_id, sede_id, reportado_por, descripcion, estado)
  VALUES (v_o6.id, '37000000-0000-0000-0000-000000000001', '37a00000-0000-0000-0000-000000000001', 'Fuga de aceite pendiente', 'pendiente');

  UPDATE ordenes_trabajo SET estatus = 'espera_autorizacion', motivo_autorizacion = 'Esperando aprobacion' WHERE id = v_o6.id;

  -- Crear presupuesto y responderlo
  INSERT INTO presupuestos (orden_id, sede_id, numero, estado)
  VALUES (v_o6.id, '37000000-0000-0000-0000-000000000001', 1, 'enviado')
  RETURNING id INTO v_p6;

  UPDATE presupuestos SET estado = 'respondido' WHERE id = v_p6;

  PERFORM set_config('test.o6_id', v_o6.id::text, true);
END $$;

SELECT is(
  (SELECT estatus::text FROM ordenes_trabajo WHERE id = current_setting('test.o6_id')::uuid),
  'espera_autorizacion',
  'una orden en espera_autorizacion no la toca este trigger'
);

-- ------------------------------------------------------------------------------------
-- 4. Tareas: asignar técnico le pasa las tareas sin técnico de su oficio
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_o7 ordenes_trabajo;
  v_o8 ordenes_trabajo;
  v_o9 ordenes_trabajo;
  v_l_mec_sin UUID;
  v_l_pin_sin UUID;
  v_l_mec_rec UUID;
  v_l_mec_otr UUID;
  v_l_o8 UUID;
  v_l_o9 UUID;
BEGIN
  -- Orden 7: abierta
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '37000000-0000-0000-0000-000000000001', '37c00000-0000-0000-0000-000000000001', '37d00000-0000-0000-0000-000000000001',
    'mecanica', 10000, '1/2', '2026-11-10', '37a00000-0000-0000-0000-000000000001'
  ) RETURNING * INTO v_o7;

  INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado) VALUES
    (v_o7.id, 'Mecanica libre', 100, 'mecanica', NULL, 'borrador', false) RETURNING id INTO v_l_mec_sin;
  INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado) VALUES
    (v_o7.id, 'Pintura libre', 150, 'pintura', NULL, 'borrador', false) RETURNING id INTO v_l_pin_sin;
  INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado) VALUES
    (v_o7.id, 'Mecanica rechazada', 120, 'mecanica', NULL, 'rechazado', false) RETURNING id INTO v_l_mec_rec;
  INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado) VALUES
    (v_o7.id, 'Mecanica ajena', 200, 'mecanica', '37b00000-0000-0000-0000-000000000003', 'borrador', false) RETURNING id INTO v_l_mec_otr;
  -- Una línea nace en borrador aunque el INSERT diga otra cosa: el rechazo pasa por la
  -- bandera de los presupuestos, como en `_resolver_presupuesto`.
  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET estado = 'rechazado' WHERE id = v_l_mec_rec;
  PERFORM set_config('restorify.presupuesto', 'off', true);

  -- Asignar mecanico 1 a la orden (origen manual por defecto)
  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
  VALUES (v_o7.id, '37b00000-0000-0000-0000-000000000002', 'mecanica');

  PERFORM set_config('test.l_mec_sin', v_l_mec_sin::text, true);
  PERFORM set_config('test.l_pin_sin', v_l_pin_sin::text, true);
  PERFORM set_config('test.l_mec_rec', v_l_mec_rec::text, true);
  PERFORM set_config('test.l_mec_otr', v_l_mec_otr::text, true);

  -- Orden 8: origen = 'tarea' no toma nada
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '37000000-0000-0000-0000-000000000001', '37c00000-0000-0000-0000-000000000001', '37d00000-0000-0000-0000-000000000002',
    'mecanica', 10000, '1/2', '2026-11-10', '37a00000-0000-0000-0000-000000000001'
  ) RETURNING * INTO v_o8;

  INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado) VALUES
    (v_o8.id, 'Mecanica libre 8', 100, 'mecanica', NULL, 'borrador', false) RETURNING id INTO v_l_o8;

  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, origen)
  VALUES (v_o8.id, '37b00000-0000-0000-0000-000000000002', 'mecanica', 'tarea');

  PERFORM set_config('test.l_o8', v_l_o8::text, true);

  -- Orden 9: entregada no cambia
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
  ) VALUES (
    '37000000-0000-0000-0000-000000000001', '37c00000-0000-0000-0000-000000000001', '37d00000-0000-0000-0000-000000000003',
    'mecanica', 10000, '1/2', '2026-11-10', '37a00000-0000-0000-0000-000000000001', 'entregado'
  ) RETURNING * INTO v_o9;

  INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, asignado_a, estado, reparto_heredado) VALUES
    (v_o9.id, 'Mecanica entregada 9', 100, 'mecanica', NULL, 'aprobado', false) RETURNING id INTO v_l_o9;

  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea, origen)
  VALUES (v_o9.id, '37b00000-0000-0000-0000-000000000002', 'mecanica', 'manual');

  PERFORM set_config('test.l_o9', v_l_o9::text, true);
END $$;

SELECT is(
  (SELECT asignado_a FROM orden_labor WHERE id = current_setting('test.l_mec_sin')::uuid),
  '37b00000-0000-0000-0000-000000000002'::uuid,
  'al asignar un mecánico toma la tarea de mecánica sin técnico'
);

SELECT ok(
  (SELECT asignado_a IS NULL FROM orden_labor WHERE id = current_setting('test.l_pin_sin')::uuid),
  'la tarea de pintura sigue sin técnico'
);

SELECT ok(
  (SELECT asignado_a IS NULL FROM orden_labor WHERE id = current_setting('test.l_mec_rec')::uuid),
  'la tarea de mecánica rechazada sigue sin técnico'
);

SELECT is(
  (SELECT asignado_a FROM orden_labor WHERE id = current_setting('test.l_mec_otr')::uuid),
  '37b00000-0000-0000-0000-000000000003'::uuid,
  'la tarea de mecánica ya asignada a otro mecánico no cambia'
);

SELECT ok(
  (SELECT asignado_a IS NULL FROM orden_labor WHERE id = current_setting('test.l_o8')::uuid),
  'una fila con origen = tarea no toma nada'
);

SELECT ok(
  (SELECT asignado_a IS NULL FROM orden_labor WHERE id = current_setting('test.l_o9')::uuid),
  'una orden entregada no cambia al asignar'
);

SELECT * FROM finish();
ROLLBACK;
