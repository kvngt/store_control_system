-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: arreglos del QA del 18/10/2026 (20261010000037)
-- ====================================================================================
-- Qué cubre:
-- 1. Número de orden: del 999 al 1001 no se repite ni se recorta (ORD-AAAA-1000, no ORD-AAAA-100).
-- 2. agregar_trabajo_del_catalogo rechaza una orden entregada (42501) y sigue sirviendo en una activa.
-- 3. Inspección: completar dos veces no avisa dos veces; publicada, el técnico ya no cambia puntos
--    (42501) y administración sí.
-- 4. Nota del próximo servicio: entra en _textos_cliente, encola la traducción, y datos_servicio
--    manda la traducción; la nota sugerida (interna) no se traduce.
-- 5. Reloj: uno abierto de más de 12 horas se cierra en el tope al abrir otro, al detenerlo y al
--    marcar la tarea hecha.
-- 6. indicadores_taller: la tarifa efectiva ignora las tareas sin horas, y las horas de reloj de
--    otra sede no se suman.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(21);

-- ------------------------------------------------------------------------------------
-- Datos base
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, tarifa_hora, zona_horaria) VALUES
  ('41000000-0000-0000-0000-000000000001', 'Sede QA 41-1', 'Calle 41-1', '555-4101', 85.00, 'America/New_York'),
  ('41000000-0000-0000-0000-000000000002', 'Sede QA 41-2', 'Calle 41-2', '555-4102', 90.00, 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('41a00000-0000-0000-0000-000000000001', 'admin41@prueba.local'),
  ('41b00000-0000-0000-0000-000000000002', 'mecanico41@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('41a00000-0000-0000-0000-000000000001', 'Admin 41', 'admin', '41000000-0000-0000-0000-000000000001', 'admin41@prueba.local'),
  ('41b00000-0000-0000-0000-000000000002', 'Mecanico 41', 'mecanico', '41000000-0000-0000-0000-000000000001', 'mecanico41@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('41c00000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Cliente 41', '+15554101', 'cli41@prueba.local', 'Ave 41', true);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('41d00000-0000-0000-0000-000000000001', '41c00000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2021, '2T1BURHE0MC004101', 'QA-411', 'Blanco'),
  ('41d00000-0000-0000-0000-000000000002', '41c00000-0000-0000-0000-000000000001', 'Honda', 'Civic', 2022, '2T1BURHE0MC004102', 'QA-412', 'Negro'),
  ('41d00000-0000-0000-0000-000000000003', '41c00000-0000-0000-0000-000000000001', 'Mazda', '3', 2020, '2T1BURHE0MC004103', 'QA-413', 'Rojo');

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '41a00000-0000-0000-0000-000000000001';
SELECT set_config('restorify.presupuesto', 'on', true);

-- ------------------------------------------------------------------------------------
-- 1. Número de orden: cruzar el 999
-- ------------------------------------------------------------------------------------
INSERT INTO numero_orden_contadores (anio, ultimo_numero)
VALUES (EXTRACT(YEAR FROM NOW())::int, 998)
ON CONFLICT (anio) DO UPDATE SET ultimo_numero = 998;

DO $$
DECLARE
  v_n TEXT[] := ARRAY[]::TEXT[];
  v_num TEXT;
  i INT;
BEGIN
  FOR i IN 1..3 LOOP
    INSERT INTO ordenes_trabajo (
      sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
    ) VALUES (
      '41000000-0000-0000-0000-000000000001', '41c00000-0000-0000-0000-000000000001', '41d00000-0000-0000-0000-000000000001',
      'mecanica', 1000 + i, 'full', '2026-11-01', '41a00000-0000-0000-0000-000000000001', 'en_proceso'
    ) RETURNING numero_orden INTO v_num;
    v_n := v_n || v_num;
  END LOOP;
  PERFORM set_config('test.numeros', array_to_string(v_n, ','), true);
END $$;

SELECT is(
  current_setting('test.numeros'),
  'ORD-' || EXTRACT(YEAR FROM NOW())::int || '-999,ORD-' || EXTRACT(YEAR FROM NOW())::int || '-1000,ORD-' || EXTRACT(YEAR FROM NOW())::int || '-1001',
  'las órdenes 999, 1000 y 1001 salen completas, sin recortar ni repetir'
);

SELECT is(
  (SELECT numero_orden FROM ordenes_trabajo WHERE numero_orden = 'ORD-' || EXTRACT(YEAR FROM NOW())::int || '-100'),
  NULL,
  'no se creó una ORD-AAAA-100 por recorte'
);

-- ------------------------------------------------------------------------------------
-- Datos para el resto: órdenes y tareas
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_activa    UUID;
  v_entregada UUID;
  v_cat       UUID;
  v_l1        UUID;
  v_l2        UUID;
  v_l3        UUID;
  v_ajena     UUID;
  v_cat_ajena UUID;
BEGIN
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
  ) VALUES (
    '41000000-0000-0000-0000-000000000001', '41c00000-0000-0000-0000-000000000001', '41d00000-0000-0000-0000-000000000002',
    'mecanica', 12000, 'full', '2026-11-01', '41a00000-0000-0000-0000-000000000001', 'en_proceso'
  ) RETURNING id INTO v_activa;

  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
  VALUES (v_activa, '41b00000-0000-0000-0000-000000000002', 'mecanica');

  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus, fecha_finalizacion
  ) VALUES (
    '41000000-0000-0000-0000-000000000001', '41c00000-0000-0000-0000-000000000001', '41d00000-0000-0000-0000-000000000003',
    'mecanica', 14000, 'full', '2026-11-01', '41a00000-0000-0000-0000-000000000001', 'entregado', now()
  ) RETURNING id INTO v_entregada;

  INSERT INTO catalogo_trabajos (sede_id, nombre) VALUES ('41000000-0000-0000-0000-000000000001', 'Frenos QA 41')
  RETURNING id INTO v_cat;

  -- Tareas del reloj: una con horas, una sin horas, y una de otra sede (para el filtro de sede).
  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
  VALUES (v_activa, 'Frenos delanteros', 200, 2.0, 'mecanica', '41b00000-0000-0000-0000-000000000002', 'aprobado', false)
  RETURNING id INTO v_l1;
  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
  VALUES (v_activa, 'Frenos traseros', 150, 1.5, 'mecanica', '41b00000-0000-0000-0000-000000000002', 'aprobado', false)
  RETURNING id INTO v_l2;
  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
  VALUES (v_activa, 'Alineación', 100, 1.0, 'mecanica', '41b00000-0000-0000-0000-000000000002', 'aprobado', false)
  RETURNING id INTO v_l3;

  -- Orden de la otra sede con una tarea del mismo mecánico (caso raro, pero la base no lo impide).
  INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
    ('41c00000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'Cliente 41-2', '+15554102', 'cli41b@prueba.local', 'Ave 41-2', true);
  INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color)
  VALUES ('41d00000-0000-0000-0000-000000000004', '41c00000-0000-0000-0000-000000000002', 'Ford', 'Focus', 2019, '2T1BURHE0MC004104', 'QA-414', 'Azul');
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
  ) VALUES (
    '41000000-0000-0000-0000-000000000002', '41c00000-0000-0000-0000-000000000002', '41d00000-0000-0000-0000-000000000004',
    'mecanica', 9000, 'full', '2026-11-01', '41a00000-0000-0000-0000-000000000001', 'en_proceso'
  ) RETURNING id INTO v_ajena;
  INSERT INTO catalogo_trabajos (sede_id, nombre) VALUES ('41000000-0000-0000-0000-000000000002', 'Catálogo ajeno QA 41')
  RETURNING id INTO v_cat_ajena;

  PERFORM set_config('test.activa', v_activa::text, true);
  PERFORM set_config('test.entregada', v_entregada::text, true);
  PERFORM set_config('test.cat', v_cat::text, true);
  PERFORM set_config('test.l1', v_l1::text, true);
  PERFORM set_config('test.l2', v_l2::text, true);
  PERFORM set_config('test.l3', v_l3::text, true);
  PERFORM set_config('test.ajena', v_ajena::text, true);
END $$;
SELECT set_config('restorify.presupuesto', 'off', true);

-- ------------------------------------------------------------------------------------
-- 2. Catálogo en una orden entregada
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '41a00000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$ SELECT public.agregar_trabajo_del_catalogo(current_setting('test.entregada')::uuid, current_setting('test.cat')::uuid) $$,
  '42501', 'No se pueden agregar trabajos a una orden entregada.',
  'agregar un trabajo del catálogo a una orden entregada da 42501'
);

SELECT is(
  (SELECT count(*)::int FROM orden_trabajos WHERE orden_id = current_setting('test.entregada')::uuid),
  0,
  'la orden entregada no recibió ningún trabajo'
);

SELECT ok(
  public.agregar_trabajo_del_catalogo(current_setting('test.activa')::uuid, current_setting('test.cat')::uuid) IS NOT NULL,
  'en una orden activa el trabajo del catálogo sí se agrega'
);

-- ------------------------------------------------------------------------------------
-- 3. Inspección
-- ------------------------------------------------------------------------------------
-- La completa el técnico asignado: a quien actúa no se le avisa a sí mismo.
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '41b00000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_insp UUID;
  v_r RECORD;
BEGIN
  v_insp := public.iniciar_inspeccion(current_setting('test.activa')::uuid);
  FOR v_r IN SELECT id FROM orden_inspeccion_puntos WHERE inspeccion_id = v_insp LOOP
    PERFORM public.marcar_punto_inspeccion(v_r.id, 'bien', NULL);
  END LOOP;
  PERFORM set_config('test.insp', v_insp::text, true);
  PERFORM set_config('test.punto', (SELECT id::text FROM orden_inspeccion_puntos WHERE inspeccion_id = v_insp LIMIT 1), true);
END $$;

SELECT lives_ok(
  $$ SELECT public.completar_inspeccion(current_setting('test.insp')::uuid) $$,
  'completar la inspección la primera vez funciona'
);
SELECT lives_ok(
  $$ SELECT public.completar_inspeccion(current_setting('test.insp')::uuid) $$,
  'completarla otra vez no falla'
);

RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM notificaciones
   WHERE tipo = 'inspeccion_completada' AND orden_id = current_setting('test.activa')::uuid),
  1,
  'completarla dos veces avisa a administración una sola vez'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '41a00000-0000-0000-0000-000000000001';
SELECT public.publicar_inspeccion(current_setting('test.insp')::uuid, true);

SET LOCAL request.jwt.claim.sub = '41b00000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT public.marcar_punto_inspeccion(current_setting('test.punto')::uuid, 'urgente', 'Cambiado tarde') $$,
  '42501', NULL,
  'el técnico no cambia un punto de una inspección ya publicada'
);

SET LOCAL request.jwt.claim.sub = '41a00000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ SELECT public.marcar_punto_inspeccion(current_setting('test.punto')::uuid, 'atencion', 'Corregido por admin') $$,
  'administración sí cambia un punto publicado'
);

-- ------------------------------------------------------------------------------------
-- 4. Nota del próximo servicio
-- ------------------------------------------------------------------------------------
SELECT public.programar_proximo_servicio(current_setting('test.activa')::uuid, '2027-04-14'::date, 65000, 'Cambio de aceite sintético');

RESET ROLE;
SELECT ok(
  'Cambio de aceite sintético' = ANY (public._textos_cliente(current_setting('test.activa')::uuid)),
  '_textos_cliente incluye la nota del próximo servicio'
);

SELECT is(
  (SELECT count(*)::int FROM cola_envios
   WHERE canal = 'traduccion' AND estado = 'pendiente' AND orden_id = current_setting('test.activa')::uuid),
  1,
  'escribir la nota encola una traducción'
);

SELECT public.guardar_traducciones(
  '41000000-0000-0000-0000-000000000001'::uuid, 'en',
  '[{"original":"Cambio de aceite sintético","traduccion":"Synthetic oil change"}]'::jsonb
);

SELECT is(
  public.datos_servicio((SELECT token FROM orden_proximo_servicio WHERE orden_id = current_setting('test.activa')::uuid))
    -> 'traducciones' ->> 'Cambio de aceite sintético',
  'Synthetic oil change',
  'datos_servicio manda la traducción de la nota'
);

-- La nota sugerida por el técnico es interna: no se traduce.
UPDATE orden_proximo_servicio SET sugerido_nota = 'Revisar frenos antes' WHERE orden_id = current_setting('test.activa')::uuid;
SELECT ok(
  NOT ('Revisar frenos antes' = ANY (public._textos_cliente(current_setting('test.activa')::uuid))),
  'la nota sugerida (interna) no entra en lo que se traduce'
);

-- ------------------------------------------------------------------------------------
-- 5. Reloj con tope
-- ------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '41b00000-0000-0000-0000-000000000002';

SELECT public.iniciar_reloj(current_setting('test.l1')::uuid);
RESET ROLE;
-- Se "olvidó" abierto hace 30 horas.
UPDATE orden_labor_tiempos SET inicio = now() - interval '30 hours' WHERE labor_id = current_setting('test.l1')::uuid;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '41b00000-0000-0000-0000-000000000002';
SELECT public.iniciar_reloj(current_setting('test.l2')::uuid);

RESET ROLE;
SELECT is(
  (SELECT (fin - inicio) FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l1')::uuid),
  interval '12 hours',
  'al abrir otro reloj, el olvidado se cierra en el tope de 12 horas, no en 30'
);

UPDATE orden_labor_tiempos SET inicio = now() - interval '20 hours' WHERE labor_id = current_setting('test.l2')::uuid;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '41b00000-0000-0000-0000-000000000002';
SELECT public.detener_reloj(current_setting('test.l2')::uuid);
RESET ROLE;
SELECT is(
  (SELECT (fin - inicio) FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l2')::uuid),
  interval '12 hours',
  'detener un reloj de 20 horas lo deja en el tope de 12'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '41b00000-0000-0000-0000-000000000002';
SELECT public.iniciar_reloj(current_setting('test.l3')::uuid);
RESET ROLE;
UPDATE orden_labor_tiempos SET inicio = now() - interval '15 hours' WHERE labor_id = current_setting('test.l3')::uuid;
UPDATE orden_labor SET completado_en = now() WHERE id = current_setting('test.l3')::uuid;
SELECT is(
  (SELECT (fin - inicio) FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l3')::uuid),
  interval '12 hours',
  'marcar la tarea hecha cierra un reloj de 15 horas en el tope'
);

-- Un reloj normal no se toca: cerrar a los 2 minutos deja 2 minutos.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '41b00000-0000-0000-0000-000000000002';
SELECT lives_ok(
  $$ SELECT public.iniciar_reloj(current_setting('test.l1')::uuid) $$,
  'se puede abrir un reloj de nuevo en una tarea con tiempo anterior'
);
RESET ROLE;
UPDATE orden_labor_tiempos SET inicio = now() - interval '2 minutes' WHERE labor_id = current_setting('test.l1')::uuid AND fin IS NULL;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '41b00000-0000-0000-0000-000000000002';
SELECT public.detener_reloj(current_setting('test.l1')::uuid);
RESET ROLE;
SELECT ok(
  (SELECT (fin - inicio) BETWEEN interval '119 seconds' AND interval '125 seconds'
   FROM orden_labor_tiempos WHERE labor_id = current_setting('test.l1')::uuid AND fin IS NOT NULL ORDER BY inicio DESC LIMIT 1),
  'un reloj de 2 minutos queda en 2 minutos'
);

-- ------------------------------------------------------------------------------------
-- 6. Indicadores
-- ------------------------------------------------------------------------------------
-- Una entregada con dos tareas aprobadas: A $100 con 1 hora y B $200 sin horas.
SET LOCAL request.jwt.claim.sub = '41a00000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_o UUID := current_setting('test.entregada')::uuid;
BEGIN
  PERFORM set_config('restorify.presupuesto', 'on', true);
  INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
  VALUES (v_o, 'Tarea A', 100, 1.0, 'mecanica', '41b00000-0000-0000-0000-000000000002', 'aprobado', false),
         (v_o, 'Tarea B', 200, NULL, 'mecanica', '41b00000-0000-0000-0000-000000000002', 'aprobado', false);
  PERFORM set_config('restorify.presupuesto', 'off', true);
END $$;

-- Reloj de 8 horas del mismo mecánico en una orden de OTRA sede, dentro del período (la API no deja
-- asignarle esa tarea, pero la tabla no lo impide: la cuenta no debe depender de eso).
INSERT INTO orden_labor (orden_id, descripcion, costo, horas, especialidad, asignado_a, estado, reparto_heredado)
SELECT current_setting('test.ajena')::uuid, 'Tarea otra sede', 50, 1.0, 'mecanica', NULL, 'pendiente', false;
INSERT INTO orden_labor_tiempos (labor_id, orden_id, usuario_id, inicio, fin)
SELECT l.id, l.orden_id, '41b00000-0000-0000-0000-000000000002', now() - interval '10 hours', now() - interval '2 hours'
FROM orden_labor l WHERE l.orden_id = current_setting('test.ajena')::uuid AND l.descripcion = 'Tarea otra sede';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '41a00000-0000-0000-0000-000000000001';

SELECT is(
  (public.indicadores_taller('41000000-0000-0000-0000-000000000001', (now() - interval '2 days')::date, (now() + interval '2 days')::date)
    ->> 'tarifa_efectiva')::numeric,
  100.00,
  'la tarifa efectiva divide solo el dinero de las tareas con horas ($100 / 1 h), no los $300'
);

SELECT is(
  (SELECT (t ->> 'horas_reloj')::numeric
   FROM jsonb_array_elements(
     public.indicadores_taller('41000000-0000-0000-0000-000000000001', (now() - interval '2 days')::date, (now() + interval '2 days')::date) -> 'por_tecnico'
   ) t WHERE t ->> 'usuario_id' = '41b00000-0000-0000-0000-000000000002'),
  (SELECT round(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - inicio)) / 3600.0), 0)::numeric, 2)
   FROM orden_labor_tiempos t JOIN ordenes_trabajo o ON o.id = t.orden_id
   WHERE t.usuario_id = '41b00000-0000-0000-0000-000000000002' AND t.fin IS NOT NULL
     AND o.sede_id = '41000000-0000-0000-0000-000000000001'),
  'las horas de reloj de un técnico cuentan solo las órdenes de la sede consultada'
);

SELECT * FROM finish();
ROLLBACK;
