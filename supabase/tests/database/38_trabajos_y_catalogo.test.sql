-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: trabajos agrupados y catálogo (20261010000034)
-- ====================================================================================
-- Qué cubre:
-- 1. RLS:
--    - un técnico asignado lee el orden_trabajos de su orden; uno no asignado, nada.
--    - un técnico no lee el catálogo y no puede insertar un trabajo.
-- 2. guardar_trabajo_catalogo:
--    - crea, y al editar reemplaza las líneas.
--    - sin líneas, error 22023.
--    - con un nombre repetido en la sede, 23505.
--    - un técnico recibe 42501.
-- 3. catalogo_de_trabajos:
--    - con 1 mano de obra de 120 y 2 repuestos de 40, el total es 200.
--    - el inactivo no sale salvo que se pida.
-- 4. agregar_trabajo_del_catalogo:
--    - crea el trabajo con su título y las líneas en borrador, con trabajo_id,
--      los precios del catálogo y la especialidad.
--    - p_asignado_a de un mecánico queda solo en la mano de obra de mecánica.
--    - un catálogo de otra sede da 42501.
-- 5. Llave compuesta:
--    - una línea con el trabajo_id de otra orden da error (23503).
-- 6. _resolver_presupuesto:
--    - con un trabajo de 2 líneas y una línea suelta, aprobar una línea del trabajo
--      aprueba las 2 y deja la suelta como se indicó (rechazada).
-- 7. quitar_trabajo:
--    - borra el trabajo y sus líneas.
--    - en una orden entregada, falla y no borra nada.
-- 8. create_work_order:
--    - con trabajos: [{grupo:'g1', titulo:'Frenos'}] y dos líneas con grupo:'g1':
--      las dos quedan en el mismo trabajo.
-- 9. datos_portal:
--    - las líneas del presupuesto traen 'trabajo' y 'trabajo_id'.
--    - el presupuesto suma 'trabajos' con el total correcto.
-- 10. trabajos_de_orden:
--     - total y total_aprobado correctos.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(32);

-- ------------------------------------------------------------------------------------
-- Datos base: 2 sedes, admin, 2 mecánicos, 1 pintor, clientes y vehículos
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('38000000-0000-0000-0000-000000000001', 'Sede Trabajos QA 1', 'Calle 38-1', '555-3801'),
  ('38000000-0000-0000-0000-000000000002', 'Sede Trabajos QA 2', 'Calle 38-2', '555-3802');

INSERT INTO auth.users (id, email) VALUES
  ('38a00000-0000-0000-0000-000000000001', 'admin38@prueba.local'),
  ('38b00000-0000-0000-0000-000000000002', 'mecanico38a@prueba.local'),
  ('38b00000-0000-0000-0000-000000000003', 'mecanico38b@prueba.local'),
  ('38b00000-0000-0000-0000-000000000004', 'pintor38@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('38a00000-0000-0000-0000-000000000001', 'Admin 38', 'admin', '38000000-0000-0000-0000-000000000001', 'admin38@prueba.local'),
  ('38b00000-0000-0000-0000-000000000002', 'Mecanico 38A', 'mecanico', '38000000-0000-0000-0000-000000000001', 'mecanico38a@prueba.local'),
  ('38b00000-0000-0000-0000-000000000003', 'Mecanico 38B', 'mecanico', '38000000-0000-0000-0000-000000000001', 'mecanico38b@prueba.local'),
  ('38b00000-0000-0000-0000-000000000004', 'Pintor 38', 'pintor', '38000000-0000-0000-0000-000000000001', 'pintor38@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('38c00000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000001', 'Cliente 38-1', '+15553801', 'cli38a@prueba.local', 'Ave 38-1', true),
  ('38c00000-0000-0000-0000-000000000002', '38000000-0000-0000-0000-000000000002', 'Cliente 38-2', '+15553802', 'cli38b@prueba.local', 'Ave 38-2', true);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('38d00000-0000-0000-0000-000000000001', '38c00000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2020, '2T1BURHE0MC003801', 'QA-381', 'Blanco'),
  ('38d00000-0000-0000-0000-000000000002', '38c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2021, '2T1BURHE0MC003802', 'QA-382', 'Negro'),
  ('38d00000-0000-0000-0000-000000000003', '38c00000-0000-0000-0000-000000000001', 'Mazda', '3', 2019, '2T1BURHE0MC003803', 'QA-383', 'Rojo'),
  ('38d00000-0000-0000-0000-000000000004', '38c00000-0000-0000-0000-000000000001', 'Nissan', 'Sentra', 2022, '2T1BURHE0MC003804', 'QA-384', 'Azul'),
  ('38d00000-0000-0000-0000-000000000005', '38c00000-0000-0000-0000-000000000001', 'Ford', 'Focus', 2018, '2T1BURHE0MC003805', 'QA-385', 'Gris'),
  ('38d00000-0000-0000-0000-000000000006', '38c00000-0000-0000-0000-000000000002', 'Subaru', 'Impreza', 2023, '2T1BURHE0MC003806', 'QA-386', 'Plata');

-- Preparación con admin en el JWT
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '38a00000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------------------------
-- 1. RLS en orden_trabajos y catálogo
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_o1_id UUID;
  v_tj1_id UUID;
  v_cat1_id UUID;
BEGIN
  -- Insert directo de orden con millas_ingreso
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '38000000-0000-0000-0000-000000000001', '38c00000-0000-0000-0000-000000000001', '38d00000-0000-0000-0000-000000000001',
    'mecanica', 15000, 'full', '2026-11-01', '38a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_o1_id;

  -- Asignar a mecanico 38A
  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
  VALUES (v_o1_id, '38b00000-0000-0000-0000-000000000002', 'mecanica');

  -- Crear trabajo en orden
  INSERT INTO orden_trabajos (orden_id, titulo, creado_por)
  VALUES (v_o1_id, 'Diagnostico general', '38a00000-0000-0000-0000-000000000001')
  RETURNING id INTO v_tj1_id;

  -- Crear trabajo en catalogo
  INSERT INTO catalogo_trabajos (sede_id, nombre, activo, creado_por)
  VALUES ('38000000-0000-0000-0000-000000000001', 'Catalogo RLS', true, '38a00000-0000-0000-0000-000000000001')
  RETURNING id INTO v_cat1_id;

  PERFORM set_config('test.o1_id', v_o1_id::text, true);
  PERFORM set_config('test.tj1_id', v_tj1_id::text, true);
  PERFORM set_config('test.cat1_id', v_cat1_id::text, true);
END $$;

-- Probar como técnico asignado (38b...0002)
SET LOCAL request.jwt.claim.sub = '38b00000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT COUNT(*)::int FROM orden_trabajos WHERE orden_id = current_setting('test.o1_id')::uuid),
  1,
  'un técnico asignado lee el orden_trabajos de su orden'
);

SELECT is(
  (SELECT COUNT(*)::int FROM catalogo_trabajos),
  0,
  'un técnico no lee el catálogo'
);

SELECT throws_ok(
  $$INSERT INTO orden_trabajos (orden_id, titulo) VALUES (current_setting('test.o1_id')::uuid, 'Intento No Autorizado')$$,
  '42501',
  NULL,
  'un técnico no puede insertar un trabajo en orden_trabajos'
);

-- Probar como técnico no asignado (38b...0003)
SET LOCAL request.jwt.claim.sub = '38b00000-0000-0000-0000-000000000003';

SELECT is(
  (SELECT COUNT(*)::int FROM orden_trabajos WHERE orden_id = current_setting('test.o1_id')::uuid),
  0,
  'un técnico no asignado no ve el orden_trabajos de una orden ajena'
);

-- ------------------------------------------------------------------------------------
-- 2. guardar_trabajo_catalogo
-- ------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '38a00000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_cat_id UUID;
BEGIN
  -- Crear trabajo en catalogo con 2 lineas
  v_cat_id := public.guardar_trabajo_catalogo(
    NULL,
    '38000000-0000-0000-0000-000000000001',
    'Alineacion y Balanceo',
    true,
    jsonb_build_array(
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Alineacion', 'especialidad', 'mecanica', 'precio', 50),
      jsonb_build_object('tipo', 'repuesto', 'descripcion', 'Plomos', 'cantidad', 2, 'precio', 10)
    )
  );
  PERFORM set_config('test.cat_edit_id', v_cat_id::text, true);
END $$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM catalogo_trabajos c
    JOIN catalogo_trabajo_lineas l ON l.catalogo_id = c.id
    WHERE c.id = current_setting('test.cat_edit_id')::uuid
    GROUP BY c.id
    HAVING COUNT(*) = 2
  ),
  'guardar_trabajo_catalogo crea trabajo con sus líneas'
);

-- Al editar reemplaza las líneas (pasa de 2 líneas a 1)
DO $$
BEGIN
  PERFORM public.guardar_trabajo_catalogo(
    current_setting('test.cat_edit_id')::uuid,
    '38000000-0000-0000-0000-000000000001',
    'Alineacion Pro',
    true,
    jsonb_build_array(
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Alineacion laser', 'especialidad', 'mecanica', 'precio', 75)
    )
  );
END $$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM catalogo_trabajos c
    JOIN catalogo_trabajo_lineas l ON l.catalogo_id = c.id
    WHERE c.id = current_setting('test.cat_edit_id')::uuid
      AND c.nombre = 'Alineacion Pro'
    GROUP BY c.id
    HAVING COUNT(*) = 1
  ),
  'guardar_trabajo_catalogo al editar actualiza encabezado y reemplaza líneas'
);

-- Sin líneas da error 22023
SELECT throws_ok(
  $$SELECT public.guardar_trabajo_catalogo(NULL, '38000000-0000-0000-0000-000000000001', 'Sin Lineas', true, '[]'::jsonb)$$,
  '22023',
  'Un trabajo del catálogo necesita al menos una línea.',
  'guardar_trabajo_catalogo sin líneas da error 22023'
);

-- Nombre repetido en la sede da 23505
SELECT throws_ok(
  $$SELECT public.guardar_trabajo_catalogo(
    NULL,
    '38000000-0000-0000-0000-000000000001',
    'Alineacion Pro',
    true,
    jsonb_build_array(
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Alineacion', 'especialidad', 'mecanica', 'precio', 50)
    )
  )$$,
  '23505',
  NULL,
  'guardar_trabajo_catalogo con nombre repetido en la sede da 23505'
);

-- Un técnico recibe 42501
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '38b00000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$SELECT public.guardar_trabajo_catalogo(
    NULL,
    '38000000-0000-0000-0000-000000000001',
    'Nuevo Trabajo Tech',
    true,
    jsonb_build_array(
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Frenos', 'especialidad', 'mecanica', 'precio', 50)
    )
  )$$,
  '42501',
  'Solo administración puede guardar trabajos en el catálogo.',
  'un técnico recibe 42501 al intentar guardar en el catálogo'
);

-- ------------------------------------------------------------------------------------
-- 3. catalogo_de_trabajos
-- ------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '38a00000-0000-0000-0000-000000000001';

DO $$
BEGIN
  -- 1 mano de obra de 120 y 2 repuestos de 40: total = 200
  PERFORM public.guardar_trabajo_catalogo(
    NULL,
    '38000000-0000-0000-0000-000000000001',
    'Frenos Completos Cat',
    true,
    jsonb_build_array(
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Mano de obra frenos', 'especialidad', 'mecanica', 'precio', 120),
      jsonb_build_object('tipo', 'repuesto', 'descripcion', 'Discos y pastillas', 'cantidad', 2, 'precio', 40, 'costo_unitario', 30)
    )
  );

  -- Trabajo inactivo
  PERFORM public.guardar_trabajo_catalogo(
    NULL,
    '38000000-0000-0000-0000-000000000001',
    'Servicio Desactivado Cat',
    false,
    jsonb_build_array(
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Servicio viejo', 'especialidad', 'mecanica', 'precio', 45)
    )
  );
END $$;

SELECT is(
  (
    SELECT (elem->>'total')::numeric
    FROM jsonb_array_elements(public.catalogo_de_trabajos('38000000-0000-0000-0000-000000000001', false)) elem
    WHERE elem->>'nombre' = 'Frenos Completos Cat'
  ),
  200::numeric,
  'catalogo_de_trabajos calcula total = 200 (120 mo + 2*40 rep)'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(public.catalogo_de_trabajos('38000000-0000-0000-0000-000000000001', false)) elem
    WHERE elem->>'nombre' = 'Servicio Desactivado Cat'
  ),
  'el trabajo inactivo no sale por defecto en catalogo_de_trabajos'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(public.catalogo_de_trabajos('38000000-0000-0000-0000-000000000001', true)) elem
    WHERE elem->>'nombre' = 'Servicio Desactivado Cat'
  ),
  'el trabajo inactivo sí sale si se pide incluir_inactivos'
);

-- ------------------------------------------------------------------------------------
-- 4. agregar_trabajo_del_catalogo
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_o2_id UUID;
  v_cat_mixto UUID;
  v_cat_sede2 UUID;
  v_tj_creado UUID;
BEGIN
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '38000000-0000-0000-0000-000000000001', '38c00000-0000-0000-0000-000000000001', '38d00000-0000-0000-0000-000000000002',
    'mecanica', 25000, 'full', '2026-11-02', '38a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_o2_id;

  v_cat_mixto := public.guardar_trabajo_catalogo(
    NULL,
    '38000000-0000-0000-0000-000000000001',
    'Frenos y Pintura Mixto',
    true,
    jsonb_build_array(
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Cambio balatas', 'especialidad', 'mecanica', 'precio', 100),
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Pintura mordazas', 'especialidad', 'pintura', 'precio', 80),
      jsonb_build_object('tipo', 'repuesto', 'descripcion', 'Balatas', 'cantidad', 1, 'precio', 60, 'costo_unitario', 45)
    )
  );

  v_cat_sede2 := public.guardar_trabajo_catalogo(
    NULL,
    '38000000-0000-0000-0000-000000000002',
    'Trabajo Sede 2',
    true,
    jsonb_build_array(
      jsonb_build_object('tipo', 'mano_obra', 'descripcion', 'Otro servicio', 'especialidad', 'mecanica', 'precio', 50)
    )
  );

  -- Agregar con mecánico 38A sugerido
  v_tj_creado := public.agregar_trabajo_del_catalogo(
    v_o2_id,
    v_cat_mixto,
    '38b00000-0000-0000-0000-000000000002'
  );

  PERFORM set_config('test.o2_id', v_o2_id::text, true);
  PERFORM set_config('test.cat_mixto', v_cat_mixto::text, true);
  PERFORM set_config('test.cat_sede2', v_cat_sede2::text, true);
  PERFORM set_config('test.tj_creado', v_tj_creado::text, true);
END $$;

SELECT is(
  (
    SELECT titulo
    FROM orden_trabajos
    WHERE id = current_setting('test.tj_creado')::uuid
      AND catalogo_id = current_setting('test.cat_mixto')::uuid
  ),
  'Frenos y Pintura Mixto',
  'agregar_trabajo_del_catalogo crea el trabajo con su título y catalogo_id'
);

SELECT is(
  (
    SELECT asignado_a
    FROM orden_labor
    WHERE trabajo_id = current_setting('test.tj_creado')::uuid
      AND especialidad = 'mecanica'
  ),
  '38b00000-0000-0000-0000-000000000002'::uuid,
  'agregar_trabajo_del_catalogo asigna al mecánico en labor de mecánica'
);

SELECT ok(
  (
    SELECT asignado_a IS NULL
    FROM orden_labor
    WHERE trabajo_id = current_setting('test.tj_creado')::uuid
      AND especialidad = 'pintura'
  ),
  'agregar_trabajo_del_catalogo deja sin técnico la labor de pintura'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM orden_repuestos
    WHERE trabajo_id = current_setting('test.tj_creado')::uuid
      AND estado = 'borrador'
      AND precio_venta_unitario = 60
      AND costo_unitario = 45
  ),
  'agregar_trabajo_del_catalogo crea repuesto con precio y costo del catálogo'
);

-- Catálogo de otra sede da 42501
SELECT throws_ok(
  $$SELECT public.agregar_trabajo_del_catalogo(
    current_setting('test.o2_id')::uuid,
    current_setting('test.cat_sede2')::uuid
  )$$,
  '42501',
  'Ese trabajo del catálogo no es de la sede de esta orden o está desactivado.',
  'catálogo de otra sede da 42501 al intentar agregarlo'
);

-- ------------------------------------------------------------------------------------
-- 5. Llave compuesta: (trabajo_id, orden_id)
-- ------------------------------------------------------------------------------------
-- Intentar insertar una línea en o1 con el trabajo_id de o2 debe fallar con 23503
SELECT throws_ok(
  $$INSERT INTO orden_labor (orden_id, trabajo_id, descripcion, costo, especialidad)
    VALUES (current_setting('test.o1_id')::uuid, current_setting('test.tj_creado')::uuid, 'Fila Ilegal', 50, 'mecanica')$$,
  '23503',
  NULL,
  'una línea con el trabajo_id de otra orden da error 23503 por llave compuesta'
);

-- ------------------------------------------------------------------------------------
-- 6. _resolver_presupuesto: aprueba el trabajo completo
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_o3_id UUID;
  v_tj3_id UUID;
  v_l1 UUID;
  v_l2 UUID;
  v_l_suelta UUID;
  v_p3_id UUID;
BEGIN
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '38000000-0000-0000-0000-000000000001', '38c00000-0000-0000-0000-000000000001', '38d00000-0000-0000-0000-000000000003',
    'mecanica', 30000, 'full', '2026-11-03', '38a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_o3_id;

  INSERT INTO orden_trabajos (orden_id, titulo, creado_por)
  VALUES (v_o3_id, 'Trabajo Presupuesto', '38a00000-0000-0000-0000-000000000001')
  RETURNING id INTO v_tj3_id;

  INSERT INTO orden_labor (orden_id, trabajo_id, descripcion, costo, especialidad, estado)
  VALUES (v_o3_id, v_tj3_id, 'Labor Trabajo', 100, 'mecanica', 'borrador')
  RETURNING id INTO v_l1;

  INSERT INTO orden_repuestos (orden_id, trabajo_id, descripcion, cantidad, precio_venta_unitario, subtotal, estado)
  VALUES (v_o3_id, v_tj3_id, 'Pieza Trabajo', 1, 50, 50, 'borrador')
  RETURNING id INTO v_l2;

  INSERT INTO orden_labor (orden_id, trabajo_id, descripcion, costo, especialidad, estado)
  VALUES (v_o3_id, NULL, 'Labor Suelta', 40, 'mecanica', 'borrador')
  RETURNING id INTO v_l_suelta;

  INSERT INTO presupuestos (orden_id, sede_id, numero, estado, total_propuesto)
  VALUES (v_o3_id, '38000000-0000-0000-0000-000000000001', 1, 'enviado', 190)
  RETURNING id INTO v_p3_id;

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET presupuesto_id = v_p3_id, estado = 'pendiente' WHERE orden_id = v_o3_id;
  UPDATE orden_repuestos SET presupuesto_id = v_p3_id, estado = 'pendiente' WHERE orden_id = v_o3_id;
  PERFORM set_config('restorify.presupuesto', 'off', true);

  -- Aprobar SOLO v_l1 (una de las dos líneas del trabajo)
  PERFORM public._resolver_presupuesto(
    v_p3_id,
    ARRAY[v_l1],
    'cliente_portal',
    'Cliente 38',
    NULL,
    NULL,
    NULL,
    '127.0.0.1',
    'pgTAP'
  );

  PERFORM set_config('test.l1', v_l1::text, true);
  PERFORM set_config('test.l2', v_l2::text, true);
  PERFORM set_config('test.l_suelta', v_l_suelta::text, true);
END $$;

SELECT is(
  (SELECT estado FROM orden_labor WHERE id = current_setting('test.l1')::uuid),
  'aprobado',
  '_resolver_presupuesto aprueba la línea seleccionada del trabajo'
);

SELECT is(
  (SELECT estado FROM orden_repuestos WHERE id = current_setting('test.l2')::uuid),
  'aprobado',
  '_resolver_presupuesto aprueba automáticamente la otra línea del mismo trabajo'
);

SELECT is(
  (SELECT estado FROM orden_labor WHERE id = current_setting('test.l_suelta')::uuid),
  'rechazado',
  '_resolver_presupuesto rechaza la línea suelta no seleccionada'
);

-- ------------------------------------------------------------------------------------
-- 7. quitar_trabajo
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_o4_id UUID;
  v_tj4_id UUID;
  v_o5_entregada UUID;
  v_tj5_id UUID;
BEGIN
  -- Orden abierta
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '38000000-0000-0000-0000-000000000001', '38c00000-0000-0000-0000-000000000001', '38d00000-0000-0000-0000-000000000004',
    'mecanica', 35000, 'full', '2026-11-04', '38a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_o4_id;

  INSERT INTO orden_trabajos (orden_id, titulo, creado_por)
  VALUES (v_o4_id, 'Trabajo a Borrar', '38a00000-0000-0000-0000-000000000001')
  RETURNING id INTO v_tj4_id;

  INSERT INTO orden_labor (orden_id, trabajo_id, descripcion, costo, especialidad)
  VALUES (v_o4_id, v_tj4_id, 'Labor a Borrar', 50, 'mecanica');

  INSERT INTO orden_repuestos (orden_id, trabajo_id, descripcion, cantidad, precio_venta_unitario, subtotal)
  VALUES (v_o4_id, v_tj4_id, 'Pieza a Borrar', 1, 30, 30);

  PERFORM set_config('test.tj4_id', v_tj4_id::text, true);

  -- Orden entregada
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
  ) VALUES (
    '38000000-0000-0000-0000-000000000001', '38c00000-0000-0000-0000-000000000001', '38d00000-0000-0000-0000-000000000005',
    'mecanica', 40000, 'full', '2026-11-04', '38a00000-0000-0000-0000-000000000001', 'entregado'
  ) RETURNING id INTO v_o5_entregada;

  INSERT INTO orden_trabajos (orden_id, titulo, creado_por)
  VALUES (v_o5_entregada, 'Trabajo Protegido', '38a00000-0000-0000-0000-000000000001')
  RETURNING id INTO v_tj5_id;

  INSERT INTO orden_labor (orden_id, trabajo_id, descripcion, costo, especialidad, estado)
  VALUES (v_o5_entregada, v_tj5_id, 'Labor Protegida', 50, 'mecanica', 'aprobado');

  PERFORM set_config('test.tj_entregada', v_tj5_id::text, true);
END $$;

-- Borrar trabajo en orden abierta
SELECT lives_ok(
  $$SELECT public.quitar_trabajo(current_setting('test.tj4_id')::uuid)$$,
  'quitar_trabajo se ejecuta sin errores en orden abierta'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM orden_trabajos WHERE id = current_setting('test.tj4_id')::uuid)
  AND NOT EXISTS (SELECT 1 FROM orden_labor WHERE trabajo_id = current_setting('test.tj4_id')::uuid)
  AND NOT EXISTS (SELECT 1 FROM orden_repuestos WHERE trabajo_id = current_setting('test.tj4_id')::uuid),
  'quitar_trabajo borra el trabajo y sus líneas'
);

-- En orden entregada falla y no borra nada
SELECT throws_ok(
  $$SELECT public.quitar_trabajo(current_setting('test.tj_entregada')::uuid)$$,
  '42501',
  NULL,
  'quitar_trabajo en una orden entregada falla'
);

SELECT ok(
  EXISTS (SELECT 1 FROM orden_trabajos WHERE id = current_setting('test.tj_entregada')::uuid)
  AND EXISTS (SELECT 1 FROM orden_labor WHERE trabajo_id = current_setting('test.tj_entregada')::uuid),
  'en la orden entregada el trabajo y sus líneas no fueron borrados'
);

-- ------------------------------------------------------------------------------------
-- 8. create_work_order con p_order->'trabajos'
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_order_creada ordenes_trabajo;
  v_tj_id UUID;
BEGIN
  v_order_creada := public.create_work_order(
    jsonb_build_object(
      'sede_id', '38000000-0000-0000-0000-000000000001',
      'cliente_id', '38c00000-0000-0000-0000-000000000001',
      'vehiculo_id', '38d00000-0000-0000-0000-000000000001',
      'tipo_trabajo', 'mecanica',
      'millas_ingreso', 55000,
      'nivel_gasolina', 'full',
      'fecha_estimada_entrega', '2026-11-05',
      'creado_por', '38a00000-0000-0000-0000-000000000001',
      'trabajos', jsonb_build_array(
        jsonb_build_object('grupo', 'g1', 'titulo', 'Frenos Delanteros')
      )
    ),
    jsonb_build_array(
      jsonb_build_object('descripcion', 'Mano de obra frenos', 'costo', 90, 'especialidad', 'mecanica', 'grupo', 'g1')
    ),
    jsonb_build_array(
      jsonb_build_object('descripcion', 'Discos delanteros', 'cantidad', 2, 'precio_venta_unitario', 40, 'grupo', 'g1')
    ),
    '[]'::jsonb
  );

  SELECT id INTO v_tj_id FROM orden_trabajos WHERE orden_id = v_order_creada.id LIMIT 1;

  PERFORM set_config('test.o_cwo_id', v_order_creada.id::text, true);
  PERFORM set_config('test.tj_cwo_id', v_tj_id::text, true);
END $$;

SELECT is(
  (SELECT titulo FROM orden_trabajos WHERE id = current_setting('test.tj_cwo_id')::uuid),
  'Frenos Delanteros',
  'create_work_order con p_order.trabajos crea el trabajo en orden_trabajos'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM orden_labor l
    JOIN orden_repuestos r ON r.orden_id = l.orden_id AND r.trabajo_id = l.trabajo_id
    WHERE l.orden_id = current_setting('test.o_cwo_id')::uuid
      AND l.trabajo_id = current_setting('test.tj_cwo_id')::uuid
  ),
  'create_work_order asocia ambas líneas al mismo trabajo_id'
);

-- ------------------------------------------------------------------------------------
-- 9. datos_portal con trabajo y trabajos
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_token TEXT;
  v_p_portal UUID;
BEGIN
  -- Crear presupuesto enviado para la orden creada en paso 8
  INSERT INTO presupuestos (orden_id, sede_id, numero, estado, total_propuesto)
  VALUES (current_setting('test.o_cwo_id')::uuid, '38000000-0000-0000-0000-000000000001', 1, 'enviado', 170)
  RETURNING id INTO v_p_portal;

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET presupuesto_id = v_p_portal, estado = 'pendiente' WHERE orden_id = current_setting('test.o_cwo_id')::uuid;
  UPDATE orden_repuestos SET presupuesto_id = v_p_portal, estado = 'pendiente' WHERE orden_id = current_setting('test.o_cwo_id')::uuid;
  PERFORM set_config('restorify.presupuesto', 'off', true);

  -- Obtener token de enlace de cliente
  SELECT token INTO v_token FROM orden_enlaces WHERE orden_id = current_setting('test.o_cwo_id')::uuid AND revocado_en IS NULL;

  PERFORM set_config('test.portal_token', v_token, true);
END $$;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      (public.datos_portal(current_setting('test.portal_token')))->'presupuesto'->'lineas'
    ) l
    WHERE l->>'trabajo' = 'Frenos Delanteros'
      AND l->>'trabajo_id' = current_setting('test.tj_cwo_id')
  ),
  'datos_portal incluye trabajo y trabajo_id en las líneas del presupuesto'
);

SELECT is(
  (
    SELECT (t->>'total')::numeric
    FROM jsonb_array_elements(
      (public.datos_portal(current_setting('test.portal_token')))->'presupuesto'->'trabajos'
    ) t
    WHERE t->>'id' = current_setting('test.tj_cwo_id')
  ),
  170::numeric,
  'datos_portal incluye el arreglo trabajos con el total correcto'
);

-- ------------------------------------------------------------------------------------
-- 10. trabajos_de_orden
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_o_tot UUID;
  v_tj_tot UUID;
BEGIN
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    -- El vehículo 006 es del cliente 2, de la sede 2.
    '38000000-0000-0000-0000-000000000002', '38c00000-0000-0000-0000-000000000002', '38d00000-0000-0000-0000-000000000006',
    'mecanica', 60000, 'full', '2026-11-06', '38a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_o_tot;

  INSERT INTO orden_trabajos (orden_id, titulo, creado_por)
  VALUES (v_o_tot, 'Trabajo Totales', '38a00000-0000-0000-0000-000000000001')
  RETURNING id INTO v_tj_tot;

  -- 1 labor de 100 aprobado
  INSERT INTO orden_labor (orden_id, trabajo_id, descripcion, costo, especialidad, estado)
  VALUES (v_o_tot, v_tj_tot, 'Labor Aprobada', 100, 'mecanica', 'borrador');

  -- 1 labor de 50 rechazado
  INSERT INTO orden_labor (orden_id, trabajo_id, descripcion, costo, especialidad, estado)
  VALUES (v_o_tot, v_tj_tot, 'Labor Rechazada', 50, 'mecanica', 'borrador');

  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET estado = 'rechazado' WHERE descripcion = 'Labor Rechazada' AND orden_id = v_o_tot;
  PERFORM set_config('restorify.presupuesto', 'off', true);

  -- 1 repuesto de 80 aprobado
  INSERT INTO orden_repuestos (orden_id, trabajo_id, descripcion, cantidad, precio_venta_unitario, subtotal, estado)
  VALUES (v_o_tot, v_tj_tot, 'Repuesto Aprobado', 1, 80, 80, 'borrador');

  -- 1 repuesto de 40 en borrador (no rechazado)
  INSERT INTO orden_repuestos (orden_id, trabajo_id, descripcion, cantidad, precio_venta_unitario, subtotal, estado)
  VALUES (v_o_tot, v_tj_tot, 'Repuesto Borrador', 1, 40, 40, 'borrador');

  -- Una línea nace en borrador: lo aprobado pasa por la bandera de los presupuestos.
  PERFORM set_config('restorify.presupuesto', 'on', true);
  UPDATE orden_labor SET estado = 'aprobado' WHERE orden_id = v_o_tot AND descripcion = 'Labor Aprobada';
  UPDATE orden_repuestos SET estado = 'aprobado' WHERE orden_id = v_o_tot AND descripcion = 'Repuesto Aprobado';
  PERFORM set_config('restorify.presupuesto', 'off', true);

  PERFORM set_config('test.o_tot_id', v_o_tot::text, true);
  PERFORM set_config('test.tj_tot_id', v_tj_tot::text, true);
END $$;

SELECT is(
  (
    SELECT (elem->>'total')::numeric
    FROM jsonb_array_elements(public.trabajos_de_orden(current_setting('test.o_tot_id')::uuid)) elem
    WHERE elem->>'id' = current_setting('test.tj_tot_id')
  ),
  220::numeric,
  'trabajos_de_orden calcula total correcto excluyendo líneas rechazadas'
);

SELECT is(
  (
    SELECT (elem->>'total_aprobado')::numeric
    FROM jsonb_array_elements(public.trabajos_de_orden(current_setting('test.o_tot_id')::uuid)) elem
    WHERE elem->>'id' = current_setting('test.tj_tot_id')
  ),
  180::numeric,
  'trabajos_de_orden calcula total_aprobado sumando solo líneas aprobadas'
);

SELECT is(
  (
    SELECT (elem->>'lineas')::int
    FROM jsonb_array_elements(public.trabajos_de_orden(current_setting('test.o_tot_id')::uuid)) elem
    WHERE elem->>'id' = current_setting('test.tj_tot_id')
  ),
  4,
  'trabajos_de_orden cuenta la cantidad total de líneas'
);

SELECT * FROM finish();
ROLLBACK;
