-- ------------------------------------------------------------------------------------
-- Las órdenes en tiempo real
-- ------------------------------------------------------------------------------------
-- Reportado por el taller (octubre 2026): una técnica finalizó una orden y el admin, con la
-- orden abierta, no vio el cambio hasta recargar. La campana sí le avisaba al instante
-- (`trg_notify_order_finished` → `notificaciones`, que ya estaba en Realtime), pero la
-- pantalla de la orden, el tablero y el Kanban solo se releían al guardar algo en ellos o al
-- volver a entrar pasados 30 s.
--
-- Cambio: las tablas de la orden entran a la publicación `supabase_realtime`. La app escucha
-- sus cambios (`useOrderSync`) y con cada uno vuelve a leer esa orden y el tablero por las
-- consultas de siempre. El contenido del evento no se pinta: solo dice qué orden cambió.
--
-- Quién recibe qué: Realtime aplica a cada evento la política de SELECT de la tabla con la
-- sesión de cada suscriptor, igual que PostgREST. Un admin recibe todo; un técnico, solo las
-- filas de sus órdenes (`mis_ordenes_asignadas()`, 20261007000000); `orden_repuestos` y
-- `presupuestos` son de administración y al técnico no le llega nada de ellas. Ninguna de
-- estas tablas tiene permisos por columna, así que el evento no lleva nada que la persona no
-- pudiera leer ya con un SELECT. `15_tiempo_real.test.sql` fija que toda tabla publicada
-- tenga RLS: una sin ella mandaría sus filas a cualquiera con sesión.
--
-- Lo que no se puede filtrar: un DELETE. Realtime no puede evaluar la política sobre una fila
-- que ya no existe, así que lo entrega a todo suscriptor de la tabla, pero solo con la llave
-- primaria (un UUID, sin datos). La app lo usa solo para quitar del tablero una orden
-- borrada; el de una hija no dice de qué orden era y se ignora. Borrar una línea de dinero
-- igual actualiza los totales de la orden, y ese UPDATE sí llega con su id.
--
-- Una tabla hija nueva de la orden que otra persona necesite ver al momento se agrega aquí,
-- en una migración nueva, y en `ORDER_TABLES` de `workOrders.service.ts`.
-- ------------------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'ordenes_trabajo', 'orden_asignaciones', 'orden_labor', 'orden_repuestos',
    'orden_avances', 'orden_media', 'presupuestos'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;
