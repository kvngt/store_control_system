-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: qué publica Realtime
-- ====================================================================================
-- Qué cubre (migración 20261010000002): las tablas de la orden están en la publicación
-- `supabase_realtime`, para que quien tiene una orden abierta la vea cambiar sin recargar.
-- Y la regla que hace eso seguro: Realtime manda cada fila a quien la puede leer según la
-- RLS de su tabla, así que **toda** tabla publicada tiene que tener RLS. Una sin ella
-- mandaría sus filas a cualquiera con sesión.
--
-- Que Realtime aplique de verdad la RLS (un técnico no recibe una orden ajena) no se puede
-- probar aquí: lo hace el servidor de Realtime, no Postgres. Se comprobó contra el Supabase
-- local con tres sesiones (octubre 2026).
--
-- Cómo correrlo (necesita Docker):  npx supabase start && npx supabase test db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(2);

SELECT set_eq(
  $$ SELECT tablename::text FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' $$,
  ARRAY[
    'notificaciones',
    'ordenes_trabajo', 'orden_asignaciones', 'orden_labor', 'orden_repuestos',
    'orden_avances', 'orden_media', 'presupuestos', 'orden_hallazgos'
  ],
  'Realtime publica los avisos y las tablas de la orden, y nada más'
);

SELECT is_empty(
  $$ SELECT pt.schemaname || '.' || pt.tablename
     FROM pg_publication_tables pt
     JOIN pg_class c ON c.oid = (quote_ident(pt.schemaname) || '.' || quote_ident(pt.tablename))::regclass
     WHERE pt.pubname = 'supabase_realtime' AND NOT c.relrowsecurity $$,
  'Toda tabla publicada en Realtime tiene RLS'
);

SELECT * FROM finish();
ROLLBACK;
