import type { OrderStatus, TaskStatus } from '../../types/domain/enums';
import type { LaborItem } from '../../types/domain/workOrder.types';

/**
 * Cómo va la parte de una persona asignada a la orden, para la tarjeta de "Técnico asignado".
 *
 * Sale de lo que de verdad pasó y no de `orden_asignaciones.estatus_tarea`: esa columna nace en
 * `pendiente` y nada la cambia, así que en una orden entregada decía «Pendiente» (revisión del
 * 30/10/2026 con las órdenes reales).
 *
 * - Orden finalizada o entregada: completada.
 * - Con tareas propias aprobadas: completada si están todas tachadas; en curso si hay alguna tachada
 *   o la orden ya está en proceso; si no, pendiente.
 * - Sin tareas propias: en curso mientras la orden está en proceso o esperando autorización;
 *   pendiente en recepción.
 */
export function assignmentStatus(orderStatus: OrderStatus, labor: LaborItem[], usuarioId: string): TaskStatus {
  if (orderStatus === 'finalizado' || orderStatus === 'entregado') return 'completada';
  const inProgress = orderStatus === 'en_proceso' || orderStatus === 'espera_autorizacion';
  // Sin estado = línea anterior a los presupuestos: cuenta como aprobada (ver LaborItem.estado).
  const mine = labor.filter((l) => l.asignado_a === usuarioId && (l.estado ?? 'aprobado') === 'aprobado');
  if (mine.length > 0) {
    const done = mine.filter((l) => l.completado_en).length;
    if (done === mine.length) return 'completada';
    if (done > 0 || inProgress) return 'en_curso';
    return 'pendiente';
  }
  return inProgress ? 'en_curso' : 'pendiente';
}
