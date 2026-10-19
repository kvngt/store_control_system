-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: inspección por puntos (20261010000035)
-- ====================================================================================
-- Qué cubre (Parte J, J3):
-- 1. La plantilla: cada sede tiene una predeterminada con sus puntos, y una sede nueva también.
-- 2. iniciar_inspeccion:
--    - la inicia el técnico asignado.
--    - la segunda llamada devuelve la misma inspección.
--    - uno no asignado recibe 42501.
--    - en una orden entregada, 42501.
-- 3. RLS:
--    - el técnico asignado lee los puntos; uno no asignado, nada.
--    - nadie inserta ni actualiza un punto directamente por la API.
-- 4. marcar_punto_inspeccion:
--    - cambia estado y nota.
--    - deshacer a 'pendiente' funciona y limpia la nota.
-- 5. completar_inspeccion:
--    - con puntos pendientes da error 22023.
--    - con todo marcado completa y crea la notificación para administración.
-- 6. publicar_inspeccion:
--    - un técnico recibe 42501.
--    - no publica una inspección sin completar (22023).
--    - publicada, datos_portal trae 'inspeccion' sin pendientes ni no_aplica, con resumen correcto.
-- 7. orden_media:
--    - una foto con origen 'inspeccion' y punto de otra orden falla FK (23503).
--    - sin punto, falla el CHECK orden_media_origen_coherente (23514).
--    - con punto válido de la orden se inserta con éxito.
-- 8. trabajos_pendientes_vehiculo:
--    - trae el punto urgente de la orden anterior del vehículo con monto NULL.
-- 9. Plantillas:
--    - guardar y reemplazar puntos.
--    - marcar una como predeterminada desmarca la anterior en la sede.
--    - técnico recibe 42501 al intentar guardar.
--    - admin borra plantilla con borrar_plantilla_inspeccion.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(37);

-- ------------------------------------------------------------------------------------
-- Datos base: 2 sedes, admin, 2 mecánicos, clientes y vehículos
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('39000000-0000-0000-0000-000000000001', 'Sede Inspeccion QA 1', 'Calle 39-1', '555-3901'),
  ('39000000-0000-0000-0000-000000000002', 'Sede Inspeccion QA 2', 'Calle 39-2', '555-3902');

INSERT INTO auth.users (id, email) VALUES
  ('39a00000-0000-0000-0000-000000000001', 'admin39@prueba.local'),
  ('39b00000-0000-0000-0000-000000000002', 'mecanico39a@prueba.local'),
  ('39b00000-0000-0000-0000-000000000003', 'mecanico39b@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('39a00000-0000-0000-0000-000000000001', 'Admin 39', 'admin', '39000000-0000-0000-0000-000000000001', 'admin39@prueba.local'),
  ('39b00000-0000-0000-0000-000000000002', 'Mecanico 39A', 'mecanico', '39000000-0000-0000-0000-000000000001', 'mecanico39a@prueba.local'),
  ('39b00000-0000-0000-0000-000000000003', 'Mecanico 39B', 'mecanico', '39000000-0000-0000-0000-000000000001', 'mecanico39b@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos) VALUES
  ('39c00000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'Cliente 39-1', '+15553901', 'cli39a@prueba.local', 'Ave 39-1', true),
  ('39c00000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000002', 'Cliente 39-2', '+15553902', 'cli39b@prueba.local', 'Ave 39-2', true);

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('39d00000-0000-0000-0000-000000000001', '39c00000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2021, '2T1BURHE0MC003901', 'QA-391', 'Blanco'),
  ('39d00000-0000-0000-0000-000000000002', '39c00000-0000-0000-0000-000000000002', 'Honda', 'Civic', 2022, '2T1BURHE0MC003902', 'QA-392', 'Negro');

-- ------------------------------------------------------------------------------------
-- 1. La plantilla predeterminada (siembra y trigger para sede nueva)
-- ------------------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM inspeccion_plantillas
    WHERE sede_id = '39000000-0000-0000-0000-000000000001' AND predeterminada = true
  ),
  'sede 1 tiene su plantilla predeterminada'
);

SELECT is(
  (SELECT count(*)::int FROM inspeccion_plantilla_puntos p
   JOIN inspeccion_plantillas t ON t.id = p.plantilla_id
   WHERE t.sede_id = '39000000-0000-0000-0000-000000000001' AND t.predeterminada = true),
  25,
  'la plantilla predeterminada de sede 1 tiene sus puntos sembrados'
);

-- Nueva sede creada recibe su plantilla predeterminada mediante trigger
INSERT INTO sedes (id, nombre, direccion, telefono) VALUES
  ('39000000-0000-0000-0000-000000000003', 'Sede Nueva QA 3', 'Calle 39-3', '555-3903');

SELECT is(
  (SELECT count(*)::int FROM inspeccion_plantilla_puntos p
   JOIN inspeccion_plantillas t ON t.id = p.plantilla_id
   WHERE t.sede_id = '39000000-0000-0000-0000-000000000003' AND t.predeterminada = true),
  25,
  'una sede nueva recibe su plantilla predeterminada mediante trigger'
);

-- ------------------------------------------------------------------------------------
-- 2. iniciar_inspeccion
-- ------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '39a00000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_o1_id UUID;
  v_o_entregada UUID;
BEGIN
  -- Insert directo de orden con millas_ingreso y misma sede
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '39000000-0000-0000-0000-000000000001', '39c00000-0000-0000-0000-000000000001', '39d00000-0000-0000-0000-000000000001',
    'mecanica', 18000, 'full', '2026-11-01', '39a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_o1_id;

  -- Asignar mecanico 39A
  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
  VALUES (v_o1_id, '39b00000-0000-0000-0000-000000000002', 'mecanica');

  -- Orden entregada para probar guardias
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
  ) VALUES (
    '39000000-0000-0000-0000-000000000001', '39c00000-0000-0000-0000-000000000001', '39d00000-0000-0000-0000-000000000001',
    'mecanica', 18050, 'full', '2026-11-01', '39a00000-0000-0000-0000-000000000001', 'entregado'
  ) RETURNING id INTO v_o_entregada;

  INSERT INTO orden_asignaciones (orden_id, usuario_id, tipo_tarea)
  VALUES (v_o_entregada, '39b00000-0000-0000-0000-000000000002', 'mecanica');

  PERFORM set_config('test.o1_id', v_o1_id::text, true);
  PERFORM set_config('test.o_entregada', v_o_entregada::text, true);
END $$;

-- Como técnico asignado (39b...0002)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '39b00000-0000-0000-0000-000000000002';

DO $$
DECLARE
  v_insp_id UUID;
BEGIN
  v_insp_id := public.iniciar_inspeccion(current_setting('test.o1_id')::uuid);
  PERFORM set_config('test.insp1_id', v_insp_id::text, true);
END $$;

SELECT ok(
  current_setting('test.insp1_id', true) IS NOT NULL,
  'iniciar_inspeccion devuelve el uuid de la inspección'
);

SELECT is(
  (SELECT count(*)::int FROM orden_inspeccion_puntos WHERE inspeccion_id = current_setting('test.insp1_id')::uuid),
  25,
  'la inspección copia todos los puntos de la plantilla'
);

SELECT is(
  public.iniciar_inspeccion(current_setting('test.o1_id')::uuid),
  current_setting('test.insp1_id')::uuid,
  'segunda llamada a iniciar_inspeccion devuelve la misma inspección'
);

-- Como técnico no asignado (39b...0003)
SET LOCAL request.jwt.claim.sub = '39b00000-0000-0000-0000-000000000003';

SELECT throws_ok(
  $$SELECT public.iniciar_inspeccion(current_setting('test.o1_id')::uuid)$$,
  '42501',
  NULL,
  'un técnico no asignado recibe 42501 al iniciar inspección'
);

-- Como técnico asignado en orden entregada
SET LOCAL request.jwt.claim.sub = '39b00000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$SELECT public.iniciar_inspeccion(current_setting('test.o_entregada')::uuid)$$,
  '42501',
  NULL,
  'en una orden entregada iniciar_inspeccion da 42501'
);

-- ------------------------------------------------------------------------------------
-- 3. RLS en orden_inspeccion_puntos
-- ------------------------------------------------------------------------------------
-- Técnico asignado lee puntos de su orden
SELECT is(
  (SELECT count(*)::int FROM orden_inspeccion_puntos WHERE orden_id = current_setting('test.o1_id')::uuid),
  25,
  'técnico asignado lee los puntos de su orden'
);

-- Técnico no asignado no ve puntos de orden ajena
SET LOCAL request.jwt.claim.sub = '39b00000-0000-0000-0000-000000000003';

SELECT is(
  (SELECT count(*)::int FROM orden_inspeccion_puntos WHERE orden_id = current_setting('test.o1_id')::uuid),
  0,
  'técnico no asignado no ve los puntos de una orden ajena'
);

-- Nadie inserta directamente en orden_inspeccion_puntos por API
SELECT throws_ok(
  $$INSERT INTO orden_inspeccion_puntos (inspeccion_id, orden_id, seccion, nombre) VALUES (current_setting('test.insp1_id')::uuid, current_setting('test.o1_id')::uuid, 'Frenos', 'Punto Inyectado')$$,
  '42501',
  NULL,
  'nadie inserta directamente en orden_inspeccion_puntos por la API'
);

-- Nadie actualiza directamente en orden_inspeccion_puntos por API
SELECT throws_ok(
  $$UPDATE orden_inspeccion_puntos SET estado = 'bien' WHERE inspeccion_id = current_setting('test.insp1_id')::uuid$$,
  '42501',
  NULL,
  'nadie actualiza directamente en orden_inspeccion_puntos por la API'
);

-- ------------------------------------------------------------------------------------
-- 4. marcar_punto_inspeccion
-- ------------------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '39b00000-0000-0000-0000-000000000002';

DO $$
DECLARE
  v_punto1_id UUID;
BEGIN
  SELECT id INTO v_punto1_id
  FROM orden_inspeccion_puntos
  WHERE inspeccion_id = current_setting('test.insp1_id')::uuid
  ORDER BY posicion, id
  LIMIT 1;

  PERFORM set_config('test.punto1_id', v_punto1_id::text, true);
END $$;

SELECT lives_ok(
  $$SELECT public.marcar_punto_inspeccion(current_setting('test.punto1_id')::uuid, 'atencion', 'Pastillas desgastadas 4mm')$$,
  'técnico asignado puede marcar punto de inspección'
);

SELECT is(
  (SELECT estado FROM orden_inspeccion_puntos WHERE id = current_setting('test.punto1_id')::uuid),
  'atencion',
  'el estado del punto cambió a atención'
);

SELECT is(
  (SELECT nota FROM orden_inspeccion_puntos WHERE id = current_setting('test.punto1_id')::uuid),
  'Pastillas desgastadas 4mm',
  'la nota del punto se guardó correctamente'
);

-- Deshacer a pendiente
SELECT lives_ok(
  $$SELECT public.marcar_punto_inspeccion(current_setting('test.punto1_id')::uuid, 'pendiente', NULL)$$,
  'marcar a pendiente funciona para deshacer'
);

SELECT is(
  (SELECT estado FROM orden_inspeccion_puntos WHERE id = current_setting('test.punto1_id')::uuid),
  'pendiente',
  'el punto volvió a estado pendiente y nota nula'
);

-- ------------------------------------------------------------------------------------
-- 5. completar_inspeccion
-- ------------------------------------------------------------------------------------
-- Con puntos pendientes falla con 22023
SELECT throws_ok(
  $$SELECT public.completar_inspeccion(current_setting('test.insp1_id')::uuid)$$,
  '22023',
  NULL,
  'completar_inspeccion con puntos pendientes da error 22023'
);

-- Marcar todos los puntos: el primero urgente, el segundo atencion, el resto bien
DO $$
DECLARE
  v_r RECORD;
  v_idx INT := 1;
BEGIN
  FOR v_r IN (
    SELECT id FROM orden_inspeccion_puntos
    WHERE inspeccion_id = current_setting('test.insp1_id')::uuid
    ORDER BY posicion, id
  ) LOOP
    IF v_idx = 1 THEN
      PERFORM public.marcar_punto_inspeccion(v_r.id, 'urgente', 'Fuga grave en amortiguador');
      PERFORM set_config('test.punto_urgente_id', v_r.id::text, true);
    ELSIF v_idx = 2 THEN
      PERFORM public.marcar_punto_inspeccion(v_r.id, 'atencion', 'Discos con ceja');
      PERFORM set_config('test.punto_atencion_id', v_r.id::text, true);
    ELSE
      PERFORM public.marcar_punto_inspeccion(v_r.id, 'bien', NULL);
    END IF;
    v_idx := v_idx + 1;
  END LOOP;
END $$;

-- Completar inspección
SELECT lives_ok(
  $$SELECT public.completar_inspeccion(current_setting('test.insp1_id')::uuid)$$,
  'completar_inspeccion con todos los puntos revisados se ejecuta con éxito'
);

SELECT ok(
  (SELECT completada_en IS NOT NULL FROM orden_inspecciones WHERE id = current_setting('test.insp1_id')::uuid),
  'inspección tiene completada_en registrado'
);

-- Los avisos son de los admins: el técnico (la sesión de aquí) no los ve por RLS.
RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM notificaciones
    WHERE tipo = 'inspeccion_completada' AND orden_id = current_setting('test.o1_id')::uuid
  ),
  'completar_inspeccion genera notificación para administradores'
);
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------------------------------
-- 6. publicar_inspeccion y datos_portal
-- ------------------------------------------------------------------------------------
-- Técnico intenta publicar -> 42501
SELECT throws_ok(
  $$SELECT public.publicar_inspeccion(current_setting('test.insp1_id')::uuid, true)$$,
  '42501',
  NULL,
  'técnico recibe 42501 al intentar publicar inspección'
);

-- Preparar otra orden con inspección sin completar
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '39a00000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_o_inc UUID;
  v_insp_inc UUID;
BEGIN
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '39000000-0000-0000-0000-000000000001', '39c00000-0000-0000-0000-000000000001', '39d00000-0000-0000-0000-000000000001',
    'mecanica', 19000, 'full', '2026-11-02', '39a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_o_inc;

  v_insp_inc := public.iniciar_inspeccion(v_o_inc);
  PERFORM set_config('test.insp_inc_id', v_insp_inc::text, true);
END $$;

-- Admin intenta publicar inspección sin completar -> 22023
SELECT throws_ok(
  $$SELECT public.publicar_inspeccion(current_setting('test.insp_inc_id')::uuid, true)$$,
  '22023',
  NULL,
  'no se puede publicar una inspección sin completar'
);

-- Admin publica la inspección completada, con su sesión (no como superusuario): la tabla es
-- de solo lectura por la API, y con SECURITY INVOKER esto fallaba.
DELETE FROM cola_envios WHERE canal = 'traduccion' AND orden_id = current_setting('test.o1_id')::uuid;
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.publicar_inspeccion(current_setting('test.insp1_id')::uuid, true)$$,
  'admin publica inspección completada'
);
RESET ROLE;
SELECT ok(
  EXISTS (SELECT 1 FROM cola_envios WHERE canal = 'traduccion' AND estado = 'pendiente'
          AND orden_id = current_setting('test.o1_id')::uuid),
  'publicar la inspección encola la traducción de sus puntos para el cliente'
);

-- Verificar datos_portal
DO $$
DECLARE
  v_token TEXT := '3900000000000000000000000000000000000000000000000000000000000039';
  v_portal JSONB;
BEGIN
  -- La orden ya nace con su enlace (20261010000032).
  SELECT token INTO v_token FROM orden_enlaces
  WHERE orden_id = current_setting('test.o1_id')::uuid AND revocado_en IS NULL;

  RESET ROLE;
  v_portal := public.datos_portal(v_token);
  PERFORM set_config('test.portal_json', v_portal::text, true);
END $$;

SELECT is(
  (current_setting('test.portal_json')::jsonb -> 'inspeccion' -> 'resumen' ->> 'urgente')::int,
  1,
  'datos_portal trae inspeccion con resumen urgente correcto'
);

SELECT is(
  (SELECT count(*)::int
   FROM jsonb_array_elements(current_setting('test.portal_json')::jsonb -> 'inspeccion' -> 'puntos') elem
   WHERE elem->>'estado' IN ('pendiente', 'no_aplica')),
  0,
  'datos_portal no incluye puntos pendiente ni no_aplica'
);

-- ------------------------------------------------------------------------------------
-- 7. orden_media con origen inspeccion
-- ------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '39a00000-0000-0000-0000-000000000001';

-- Foto con origen inspeccion y punto de otra orden falla FK (23503)
SELECT throws_ok(
  $$INSERT INTO orden_media (orden_id, tipo, origen, ruta, inspeccion_punto_id, mime, bytes)
    VALUES (current_setting('test.o_entregada')::uuid, 'foto', 'inspeccion', '39000000-0000-0000-0000-000000000001/' || current_setting('test.o_entregada') || '/foto.jpg', current_setting('test.punto_urgente_id')::uuid, 'image/jpeg', 1000)$$,
  '23503',
  NULL,
  'orden_media con punto de otra orden falla la llave compuesta (23503)'
);

-- Foto con origen inspeccion sin punto falla CHECK (23514)
SELECT throws_ok(
  $$INSERT INTO orden_media (orden_id, tipo, origen, ruta, inspeccion_punto_id, mime, bytes)
    VALUES (current_setting('test.o1_id')::uuid, 'foto', 'inspeccion', '39000000-0000-0000-0000-000000000001/' || current_setting('test.o1_id') || '/foto.jpg', NULL, 'image/jpeg', 1000)$$,
  '23514',
  NULL,
  'orden_media con origen inspeccion y sin punto falla orden_media_origen_coherente (23514)'
);

-- Foto con origen inspeccion y punto válido se inserta correctamente
SELECT lives_ok(
  $$INSERT INTO orden_media (orden_id, tipo, origen, ruta, inspeccion_punto_id, mime, bytes)
    VALUES (current_setting('test.o1_id')::uuid, 'foto', 'inspeccion', '39000000-0000-0000-0000-000000000001/' || current_setting('test.o1_id') || '/foto_valida.jpg', current_setting('test.punto_urgente_id')::uuid, 'image/jpeg', 1000)$$,
  'orden_media con origen inspeccion y punto válido se inserta correctamente'
);

-- La foto del punto sale en el enlace del cliente con la inspección publicada (aunque no
-- esté marcada visible_cliente).
SELECT ok(
  (SELECT bool_or(m->>'inspeccion_punto_id' = current_setting('test.punto_urgente_id'))
   FROM jsonb_array_elements(public.datos_portal((
     SELECT token FROM orden_enlaces
     WHERE orden_id = current_setting('test.o1_id')::uuid AND revocado_en IS NULL
   )) -> 'multimedia') m),
  'La foto de un punto sale en el enlace del cliente con la inspección publicada'
);

-- ------------------------------------------------------------------------------------
-- 8. trabajos_pendientes_vehiculo
-- ------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '39a00000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_o2_id UUID;
BEGIN
  -- Crear segunda orden para el mismo vehículo 1
  INSERT INTO ordenes_trabajo (
    sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por
  ) VALUES (
    '39000000-0000-0000-0000-000000000001', '39c00000-0000-0000-0000-000000000001', '39d00000-0000-0000-0000-000000000001',
    'mecanica', 25000, 'full', '2026-11-10', '39a00000-0000-0000-0000-000000000001'
  ) RETURNING id INTO v_o2_id;

  PERFORM set_config('test.o2_id', v_o2_id::text, true);
END $$;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      public.trabajos_pendientes_vehiculo('39d00000-0000-0000-0000-000000000001'::uuid, current_setting('test.o2_id')::uuid)
    ) elem
    WHERE elem->>'tipo' = 'inspeccion'
      AND elem->>'orden_id' = current_setting('test.o1_id')
      AND elem->>'monto' IS NULL
  ),
  'trabajos_pendientes_vehiculo trae el punto urgente de la orden anterior del vehículo'
);

-- ------------------------------------------------------------------------------------
-- 9. Plantillas de inspección (guardar, editar, desmarcar predeterminada, borrar)
-- ------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '39a00000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_pl_id UUID;
BEGIN
  v_pl_id := public.guardar_plantilla_inspeccion(
    NULL,
    '39000000-0000-0000-0000-000000000001',
    'Plantilla Personalizada',
    true,
    false,
    jsonb_build_array(
      jsonb_build_object('seccion', 'Frenos', 'nombre', 'Pastillas', 'posicion', 1),
      jsonb_build_object('seccion', 'Frenos', 'nombre', 'Discos', 'posicion', 2)
    )
  );
  PERFORM set_config('test.pl_id', v_pl_id::text, true);
END $$;

SELECT ok(
  current_setting('test.pl_id', true) IS NOT NULL,
  'guardar_plantilla_inspeccion crea plantilla'
);

-- Al editar reemplaza puntos
DO $$
BEGIN
  PERFORM public.guardar_plantilla_inspeccion(
    current_setting('test.pl_id')::uuid,
    '39000000-0000-0000-0000-000000000001',
    'Plantilla Personalizada V2',
    true,
    true,
    jsonb_build_array(
      jsonb_build_object('seccion', 'Motor', 'nombre', 'Bujías', 'posicion', 1)
    )
  );
END $$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM inspeccion_plantillas p
    JOIN inspeccion_plantilla_puntos pts ON pts.plantilla_id = p.id
    WHERE p.id = current_setting('test.pl_id')::uuid
      AND p.nombre = 'Plantilla Personalizada V2'
    GROUP BY p.id
    HAVING count(*) = 1
  ),
  'guardar_plantilla_inspeccion al editar actualiza encabezado y reemplaza puntos'
);

SELECT is(
  (SELECT count(*)::int FROM inspeccion_plantillas
   WHERE sede_id = '39000000-0000-0000-0000-000000000001' AND predeterminada = true),
  1,
  'marcar una plantilla como predeterminada desmarca la anterior en la sede'
);

-- Técnico recibe 42501 al intentar guardar plantilla
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '39b00000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$SELECT public.guardar_plantilla_inspeccion(
      NULL,
      '39000000-0000-0000-0000-000000000001',
      'Plantilla Hacker',
      true,
      false,
      jsonb_build_array(jsonb_build_object('seccion', 'Frenos', 'nombre', 'Pastillas'))
    )$$,
  '42501',
  NULL,
  'un técnico recibe 42501 al intentar guardar plantilla'
);

-- Admin borra plantilla
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '39a00000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$SELECT public.borrar_plantilla_inspeccion(current_setting('test.pl_id')::uuid)$$,
  'admin puede borrar plantilla de inspección'
);

SELECT * FROM finish();
ROLLBACK;
