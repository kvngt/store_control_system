import type { WorkOrder } from '../../types/database';

/**
 * La búsqueda de la página de órdenes, la misma en la lista y en el tablero (F7): número de
 * orden o nombre del cliente, sin distinguir mayúsculas. Vacía, deja pasar todo.
 */
export function matchesOrderSearch(order: Pick<WorkOrder, 'numero_orden' | 'cliente'>, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return (
    order.numero_orden.toLowerCase().includes(needle) ||
    (order.cliente?.nombre || '').toLowerCase().includes(needle)
  );
}
