import type { KeyboardEvent } from 'react';
import {
  PAYMENT_METHODS,
  type CatalogJob,
  type Customer,
  type PaymentMethod,
  type Specialty,
  type UserProfile,
} from '../../../types/database';
import { isValidPhone, toWhatsAppNumber } from '../../../lib/phone';
import type { WorkOrderFormApi } from '../useWorkOrderForm';

/**
 * Refuses the keys that put a minus sign into a `type="number"` box.
 *
 * `min={0}` is inert here: the form is `noValidate`, so the browser never runs
 * its own constraint check, and the schema only speaks up on "Siguiente" or
 * submit — by which point the user has already typed the number and been told
 * off for it. This stops the common case at the keyboard instead. It
 * deliberately does not clamp the value: a paste or an autofill still has to
 * reach the schema and be reported, because silently rewriting somebody's -500
 * to 0 is worse than telling them it is wrong.
 */
export const blockNegativeKeys = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
};

export function toPaymentMethod(value: string): PaymentMethod | null {
  return PAYMENT_METHODS.find((m) => m === value) ?? null;
}

export function getErrorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null || !('code' in err)) return null;
  return typeof err.code === 'string' && err.code !== '' ? err.code : null;
}

/**
 * Busca un cliente de la misma sede cuyo teléfono coincide en formato internacional.
 * Sirve para avisar en el alta de cliente nuevo sin prohibir cuentas que comparten número.
 */
export function findDuplicateCustomerByPhone(
  customers: Customer[],
  phone: string,
  sedeId?: string
): Customer | null {
  if (!isValidPhone(phone)) return null;
  const target = toWhatsAppNumber(phone);
  if (!target) return null;
  return (
    customers.find(
      (c) => (!sedeId || c.sede_id === sedeId) && toWhatsAppNumber(c.telefono) === target
    ) ?? null
  );
}

/** Agrega un trabajo del catálogo y sus líneas al borrador del formulario de alta. */
export function appendCatalogJobToForm(
  form: WorkOrderFormApi,
  operators: UserProfile[],
  selectedJob: CatalogJob,
  assignedTechId: string | null
): void {
  const grupo = crypto.randomUUID();
  form.jobs.append({
    grupo,
    titulo: selectedJob.nombre,
    catalogo_id: selectedJob.id,
  });

  const tech = operators.find((o) => o.id === assignedTechId);
  for (const l of selectedJob.lineas ?? []) {
    if (l.tipo === 'mano_obra') {
      const spec: Specialty = l.especialidad ?? 'mecanica';
      const matches =
        (spec === 'mecanica' && tech?.rol === 'mecanico') ||
        (spec === 'pintura' && tech?.rol === 'pintor');
      form.labor.append({
        descripcion: l.descripcion,
        costo: l.precio.toString(),
        especialidad: spec,
        asignado_a: matches ? (assignedTechId || '') : '',
        horas: l.horas != null ? l.horas.toString() : '',
        grupo,
      });
    } else if (l.tipo === 'repuesto') {
      form.parts.append({
        descripcion: l.descripcion,
        cantidad: l.cantidad.toString(),
        precio_venta_unitario: l.precio.toString(),
        costo_unitario:
          l.costo_unitario != null ? l.costo_unitario.toString() : '',
        grupo,
      });
    }
  }
}
