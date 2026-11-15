import type { OrderStatus } from '../types/database';

/** Lista ordenada de estados de una orden para selectores, filtros y tableros. */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  'recepcion',
  'en_proceso',
  'espera_autorizacion',
  'finalizado',
  'entregado',
];

/**
 * La clave de traducción del tipo de trabajo de una orden. Sin ella, el detalle de la orden y
 * los historiales del cliente y del vehículo mostraban el valor de la base («mecanica»).
 */
export function workTypeKey(tipo: string | null | undefined): string {
  switch (tipo) {
    case 'pintura':
      return 'workOrders.typePintura';
    case 'combinado':
      return 'workOrders.typeCombinado';
    default:
      return 'workOrders.typeMecanica';
  }
}

/** La clave de traducción del estado de una orden. */
export function orderStatusKey(estatus: OrderStatus | string | null | undefined): string {
  switch (estatus) {
    case 'recepcion':
      return 'workOrders.intake';
    case 'en_proceso':
      return 'workOrders.inProgress';
    case 'espera_autorizacion':
      return 'workOrders.waitingAuthorization';
    case 'finalizado':
      return 'workOrders.completed';
    case 'entregado':
      return 'workOrders.delivered';
    default:
      return 'workOrders.intake';
  }
}
