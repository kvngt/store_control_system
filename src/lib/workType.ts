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
