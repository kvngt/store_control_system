import type { OrderFinding } from '../../types/database';

/**
 * Lo que administración todavía tiene que decidir de lo que reportó el taller (F6): los
 * pendientes y los cotizados que aún no salieron en un presupuesto (falta agregar la tarea).
 */
export function findingsToReview(findings: OrderFinding[] | undefined): OrderFinding[] {
  return (findings || []).filter(
    (h) => h.estado === 'pendiente' || (h.estado === 'cotizado' && !h.presupuesto_id)
  );
}
