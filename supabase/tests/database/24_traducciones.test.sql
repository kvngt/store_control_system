BEGIN;

SELECT plan(22);

-- 1. Tabla
SELECT has_table('traducciones', 'Existe la tabla traducciones');
SELECT has_column('traducciones', 'sede_id');
SELECT has_column('traducciones', 'md5_hash');
SELECT has_column('traducciones', 'idioma_destino');
SELECT has_column('traducciones', 'texto_original');
SELECT has_column('traducciones', 'traduccion');
SELECT has_column('traducciones', 'origen');

-- 2. Funciones
SELECT has_function('_textos_cliente', ARRAY['uuid'], 'Existe _textos_cliente');
SELECT has_function('traducciones_portal', ARRAY['text'], 'Existe traducciones_portal');
SELECT has_function('traducciones_orden', ARRAY['uuid'], 'Existe traducciones_orden');

-- Permisos
SELECT function_privs_are('public', '_textos_cliente', ARRAY['uuid'], 'public', ARRAY[]::text[], 'Nadie ejecuta _textos_cliente directo');
SELECT function_privs_are('public', 'traducciones_portal', ARRAY['text'], 'anon', ARRAY['EXECUTE'], 'anon ejecuta traducciones_portal');
SELECT function_privs_are('public', 'traducciones_orden', ARRAY['uuid'], 'authenticated', ARRAY['EXECUTE'], 'authenticated ejecuta traducciones_orden');

-- 3. Inserciones y colas
SET ROLE postgres;
\set admin_id '00000000-0000-0000-0000-000000000001'
\set sede_id '00000000-0000-0000-0000-000000000001'
\set cliente_id '00000000-0000-0000-0000-000000000002'

INSERT INTO ordenes_trabajo (id, sede_id, cliente_id, vehiculo_id, estatus, inspeccion_360_notas)
VALUES ('00000000-0000-0000-0000-000000000010', :'sede_id', :'cliente_id', NULL, 'en_proceso', 'Notas del taller');

-- Al crear con notas, debe encolar traducción
SELECT results_eq(
    $$ SELECT count(*)::int FROM cola_envios WHERE canal = 'traduccion' AND orden_id = '00000000-0000-0000-0000-000000000010' $$,
    ARRAY[1],
    'Crear orden con notas encola traducción'
);

-- Limpiamos cola
DELETE FROM cola_envios;

-- Al añadir labor, repuestos o avances visibles, debe encolar
INSERT INTO orden_labor (id, orden_id, descripcion, cantidad, precio_unitario, estatus)
VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000010', 'Cambio de aceite', 1, 50, 'borrador');

SELECT results_eq(
    $$ SELECT count(*)::int FROM cola_envios WHERE canal = 'traduccion' AND orden_id = '00000000-0000-0000-0000-000000000010' $$,
    ARRAY[1],
    'Añadir labor encola traducción'
);
DELETE FROM cola_envios;

-- Avance interno no encola
INSERT INTO orden_avances (id, orden_id, tipo, descripcion, visible_cliente)
VALUES ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000010', 'nota', 'Nota interna', false);

SELECT results_eq(
    $$ SELECT count(*)::int FROM cola_envios WHERE canal = 'traduccion' AND orden_id = '00000000-0000-0000-0000-000000000010' $$,
    ARRAY[0],
    'Avance interno no encola traducción'
);

-- Avance público sí encola
INSERT INTO orden_avances (id, orden_id, tipo, descripcion, visible_cliente)
VALUES ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000010', 'nota', 'Avance para cliente', true);

SELECT results_eq(
    $$ SELECT count(*)::int FROM cola_envios WHERE canal = 'traduccion' AND orden_id = '00000000-0000-0000-0000-000000000010' $$,
    ARRAY[1],
    'Avance público encola traducción'
);

-- 4. Extracción
SELECT results_eq(
    $$ SELECT array_length(_textos_cliente('00000000-0000-0000-0000-000000000010'), 1) $$,
    ARRAY[3],
    'Extrae 3 textos visibles (notas, labor, avance público)'
);

-- 5. Diccionarios
INSERT INTO traducciones (sede_id, md5_hash, idioma_destino, texto_original, traduccion)
VALUES (:'sede_id', md5('Cambio de aceite'), 'en', 'Cambio de aceite', 'Oil change');

-- App interna
SET ROLE authenticated;
SET request.jwt.claims TO '{"role": "authenticated", "sub": "00000000-0000-0000-0000-000000000001", "user_metadata": {"sede_id": "00000000-0000-0000-0000-000000000001", "role": "admin"}}';

SELECT results_eq(
    $$ SELECT traducciones_orden('00000000-0000-0000-0000-000000000010') ->> 'Cambio de aceite' $$,
    ARRAY['Oil change'],
    'App interna obtiene diccionario con permiso'
);

-- Portal
SET ROLE postgres;
INSERT INTO orden_enlaces (orden_id, sede_id, token) VALUES ('00000000-0000-0000-0000-000000000010', :'sede_id', 'test_token');

SET ROLE anon;
SELECT results_eq(
    $$ SELECT traducciones_portal('test_token') ->> 'Cambio de aceite' $$,
    ARRAY['Oil change'],
    'Portal obtiene diccionario con token'
);

-- RLS de la tabla
SET ROLE authenticated;
SET request.jwt.claims TO '{"role": "authenticated", "sub": "00000000-0000-0000-0000-000000000003", "user_metadata": {"sede_id": "00000000-0000-0000-0000-000000000001", "role": "mecanico"}}';
-- El técnico no lee la tabla, pero la función de orden la usa por SECURITY DEFINER
SELECT results_eq(
    $$ SELECT count(*)::int FROM traducciones $$,
    ARRAY[0],
    'Técnico no lee la tabla directo'
);
SELECT results_eq(
    $$ SELECT traducciones_orden('00000000-0000-0000-0000-000000000010') ->> 'Cambio de aceite' $$,
    ARRAY['Oil change'],
    'Técnico sí obtiene traducción de su orden por RPC'
);

SELECT * FROM finish();
ROLLBACK;
