import type { OrderMedia, WorkOrder } from '../types/database';

/**
 * Lo que un reporte para el cliente puede mostrar de la multimedia: solo fotos que
 * un admin dejó visibles. Es la misma regla del portal (`datos_portal`): el PDF es
 * la versión impresa de ese reporte, no un volcado de la orden.
 */
export function customerReportPhotos(order: Pick<WorkOrder, 'media'>) {
  const photos = (order.media || []).filter((m) => m.tipo === 'foto' && m.visible_cliente);
  return {
    reception: photos.filter((m) => m.origen === 'recepcion'),
    progress: photos.filter((m) => m.origen === 'avance'),
  };
}

/** La miniatura (480 px) alcanza para una foto de 5 cm en papel y pesa diez veces menos. */
export function reportImagePath(media: OrderMedia): string {
  return media.ruta_miniatura ?? media.ruta;
}

/** Todas las rutas que el PDF necesita firmadas: fotos visibles y la firma. */
export function reportAssetPaths(order: Pick<WorkOrder, 'media' | 'firma_ruta'>): string[] {
  const { reception, progress } = customerReportPhotos(order);
  return [...reception, ...progress].map(reportImagePath).concat(order.firma_ruta ? [order.firma_ruta] : []);
}

/** Fotos de avances agrupadas por día (fecha local), en orden. */
export function groupByDay(media: OrderMedia[]): { day: string; items: OrderMedia[] }[] {
  const groups = new Map<string, OrderMedia[]>();
  for (const item of [...media].sort((a, b) => a.creado_en.localeCompare(b.creado_en))) {
    const d = new Date(item.creado_en);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()].map(([day, items]) => ({ day, items }));
}
