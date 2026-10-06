import type { OrderFinding, OrderMedia, WorkOrder } from '../types/database';

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

/** El día local (AAAA-MM-DD) de una fecha y hora. */
function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fotos de avances agrupadas por día (fecha local), en orden. */
export function groupByDay(media: OrderMedia[]): { day: string; items: OrderMedia[] }[] {
  const groups = new Map<string, OrderMedia[]>();
  for (const item of [...media].sort((a, b) => a.creado_en.localeCompare(b.creado_en))) {
    const day = localDay(item.creado_en);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()].map(([day, items]) => ({ day, items }));
}

/**
 * El texto de los avances que el cliente ve: los que se marcaron visibles y dicen algo. Misma
 * regla que `avances` en `datos_portal`. Faltaba en el PDF (pedido del taller del 06/10/2026):
 * el enlace los mostraba y el documento impreso no.
 */
export function customerProgressNotes(order: Pick<WorkOrder, 'avances'>): { creado_en: string; texto: string }[] {
  return (order.avances || [])
    .filter((a) => a.visible_cliente && !!a.descripcion?.trim())
    .map((a) => ({ creado_en: a.creado_en, texto: a.descripcion.trim() }))
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
}

/** Los avances para el cliente por día: lo que se escribió y las fotos publicadas de ese día. */
export function progressTimeline(
  order: Pick<WorkOrder, 'avances' | 'media'>
): { day: string; notes: string[]; photos: OrderMedia[] }[] {
  const days = new Map<string, { notes: string[]; photos: OrderMedia[] }>();
  const at = (day: string) => {
    const entry = days.get(day) ?? { notes: [], photos: [] };
    days.set(day, entry);
    return entry;
  };
  for (const note of customerProgressNotes(order)) at(localDay(note.creado_en)).notes.push(note.texto);
  for (const { day, items } of groupByDay(customerReportPhotos(order).progress)) at(day).photos.push(...items);
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, entry]) => ({ day, ...entry }));
}

/**
 * "Observaciones del taller" (F6): los hallazgos descartados que administración mandó al
 * reporte, con SU texto. La descripción del técnico es interna y nunca sale. Misma regla que
 * `observaciones` en `datos_portal`.
 */
export function customerObservations(order: Pick<WorkOrder, 'hallazgos'>): OrderFinding[] {
  return (order.hallazgos || [])
    .filter((h) => h.estado === 'descartado' && h.en_reporte && !!h.texto_cliente?.trim())
    .sort((a, b) => (a.resuelto_en ?? '').localeCompare(b.resuelto_en ?? ''));
}
