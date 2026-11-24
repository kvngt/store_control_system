import type { LineState } from '../../types/database';

export type AdminNextStepResult = 'deliver' | 'markReady' | 'addWork' | 'sign' | 'authorize' | null;

export interface AdminNextStepOrder {
  estatus?: string | null;
  lista_para_entregar_en?: string | null;
  retirada_sin_reparar?: boolean | null;
  firma_ruta?: string | null;
  labor_items?: ReadonlyArray<{ estado?: LineState | null }> | null;
  repuestos?: ReadonlyArray<{ estado?: LineState | null }> | null;
}

export interface AdminNextStepOptions {
  canSign?: boolean;
  canDeliver?: boolean;
}

/**
 * Determina el siguiente paso principal de administración en una orden de trabajo (A-04).
 * Función pura hermana de `techNextStep`: garantiza un único botón principal por estado.
 *
 * 1. `entregado` -> null
 * 2. `finalizado` con `lista_para_entregar_en` -> `'deliver'`
 * 3. `finalizado` sin `lista_para_entregar_en` y no `retirada_sin_reparar` -> `'markReady'`
 * 4. Otros estados (`recepcion`, `en_proceso`, `espera_autorizacion`):
 *    - sin líneas de mano de obra -> `'addWork'`
 *    - sin firma (`!order.firma_ruta`) -> `'sign'`
 *    - con alguna línea (mano de obra o repuesto) en `borrador` o `pendiente` -> `'authorize'`
 *    - si nada de eso -> null
 */
export function adminNextStep(
  order: AdminNextStepOrder | null | undefined,
  options: AdminNextStepOptions = {}
): AdminNextStepResult {
  const status = order?.estatus;
  if (!status) return null;

  if (status === 'entregado') return null;

  if (status === 'finalizado') {
    if (order.lista_para_entregar_en) {
      return options.canDeliver === false ? null : 'deliver';
    }
    if (!order.retirada_sin_reparar) {
      return 'markReady';
    }
    return null;
  }

  const labor = order.labor_items ?? [];
  if (labor.length === 0) {
    return 'addWork';
  }

  if (!order.firma_ruta && options.canSign !== false) {
    return 'sign';
  }

  const parts = order.repuestos ?? [];
  const hasPendingAuth = [...labor, ...parts].some(
    (line) => line.estado === 'borrador' || line.estado === 'pendiente'
  );
  if (hasPendingAuth) {
    return 'authorize';
  }

  return null;
}
