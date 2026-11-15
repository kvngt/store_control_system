import { supabase } from '../../lib/supabase';

/**
 * Las tablas de la orden que publica Realtime (20261010000002). Una hija nueva que otra
 * persona necesite ver al momento va aquí y en una migración que la agregue a la publicación.
 */
const ORDER_TABLES = [
  'ordenes_trabajo', 'orden_asignaciones', 'orden_labor', 'orden_repuestos',
  'orden_avances', 'orden_media', 'presupuestos', 'orden_hallazgos',
  'orden_proximo_servicio', 'orden_trabajos', 'orden_inspecciones', 'orden_inspeccion_puntos',
  'orden_labor_tiempos',
] as const;

/**
 * Un nombre de canal por suscripción. `supabase.channel(nombre)` devuelve el que ya exista con
 * ese nombre, y el anterior puede seguir cerrándose (cerrar sesión y entrar con otra cuenta):
 * agregarle escuchas a un canal ya suscrito falla.
 */
let channelSeq = 0;

export const orderRealtime = {
  /**
   * Avisa qué orden cambió, en cuanto cambia, la haya cambiado quien la haya cambiado.
   *
   * Realtime aplica la RLS de cada tabla con la sesión de quien escucha, así que un técnico
   * solo se entera de sus órdenes. Del evento se usa solo el id: los datos se vuelven a leer
   * por las consultas de siempre, que traen las relaciones y pasan por las mismas reglas.
   * Un DELETE llega solo con la llave primaria (Realtime no puede revisar una fila que ya no
   * existe): sirve para la orden borrada, y el de una hija, que no dice de qué orden era, se
   * ignora.
   *
   * `onReconnect` corre cuando el canal vuelve después de un corte (red, teléfono dormido):
   * lo que cambió mientras tanto no se reenvía. Devuelve la función que cancela.
   */
  subscribeToChanges: (onChange: (orderId: string) => void, onReconnect: () => void) => {
    let channel = supabase.channel(`ordenes:${++channelSeq}`);
    for (const table of ORDER_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const row = Object.keys(payload.new ?? {}).length > 0 ? payload.new : payload.old ?? {};
          const orderId = table === 'ordenes_trabajo' ? row.id : row.orden_id;
          if (typeof orderId === 'string') onChange(orderId);
        }
      );
    }

    let joined = false;
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      // La primera vez no: las pantallas acaban de leer.
      if (joined) onReconnect();
      joined = true;
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
