import { workOrdersService } from '../../services/workOrders.service';
import type { PaymentMethod } from '../../types/database';

/** Valida método de pago y datos de cheque solo cuando la operación mueve dinero. */
export function paymentProblem(input: {
  needsMethod: boolean;
  metodo: PaymentMethod | '';
  numeroCheque: string;
  file: File | null;
}): string | null {
  if (!input.needsMethod) return null;
  if (!input.metodo) return 'delivery.methodRequired';
  if (input.metodo === 'cheque' && !input.numeroCheque.trim() && !input.file) {
    return 'delivery.checkRequired';
  }
  return null;
}

/** Normaliza método y número de cheque según si hace falta registrar pago. */
export function paymentFields(input: {
  needsMethod: boolean;
  metodo: PaymentMethod | '';
  numeroCheque: string;
}): { metodo: PaymentMethod | null; numeroCheque: string | null } {
  if (!input.needsMethod || !input.metodo) {
    return { metodo: null, numeroCheque: null };
  }
  return {
    metodo: input.metodo,
    numeroCheque: input.metodo === 'cheque' ? input.numeroCheque.trim() || null : null,
  };
}

/**
 * Sube el comprobante antes de llamar a la RPC (si hace falta método y hay foto) y lo borra
 * en segundo plano si la RPC falla, sin tapar el error original.
 */
export async function withReceipt<T>(
  params: {
    needsMethod: boolean;
    file: File | null;
    sedeId: string;
    numeroOrden: string;
  },
  run: (comprobanteRuta: string | null) => Promise<T>
): Promise<T> {
  const uploaded =
    params.needsMethod && params.file
      ? await workOrdersService.uploadReceipt(params.sedeId, params.numeroOrden, params.file)
      : null;
  try {
    return await run(uploaded);
  } catch (err) {
    // Sin la RPC no hay a qué colgar el comprobante: se borra en vez de dejarlo huérfano.
    if (uploaded) {
      try {
        void Promise.resolve(workOrdersService.removeDeliveryReceipt(uploaded)).catch(() => {});
      } catch {
        // El borrado es mejor esfuerzo: nunca debe ocultar el error original de la RPC.
      }
    }
    throw err;
  }
}
