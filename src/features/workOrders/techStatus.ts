// Lo que ve el técnico al abrir una orden (pedido del taller del 06/10/2026): en qué va la
// orden y cuáles de sus tareas puede hacer. Ninguna cuenta toca dinero.

import type { LaborItem, OrderFinding } from '../../types/database';

export interface TechTaskSummary {
  /** Autorizadas por el cliente (se pueden hacer), con cuántas ya están hechas. */
  authorized: number;
  done: number;
  /** Cotizadas o enviadas al cliente, sin respuesta todavía. */
  waiting: LaborItem[];
  /** El cliente no las autorizó: no se hacen. Cuentan como cerradas, sin ejecutarse. */
  rejected: LaborItem[];
}

export function summarizeTechTasks(items: LaborItem[]): TechTaskSummary {
  const summary: TechTaskSummary = { authorized: 0, done: 0, waiting: [], rejected: [] };
  for (const item of items) {
    const estado = item.estado ?? 'aprobado';
    if (estado === 'aprobado') {
      summary.authorized += 1;
      if (item.completado_en) summary.done += 1;
    } else if (estado === 'rechazado') {
      summary.rejected.push(item);
    } else {
      summary.waiting.push(item);
    }
  }
  return summary;
}

export type FindingOutcome = OrderFinding['estado'] | 'esperando' | 'autorizado' | 'rechazado';

/**
 * En qué quedó un trabajo adicional que reportó el técnico. Mientras está cotizado se mira el
 * presupuesto con el que salió: si el cliente ya respondió, sus líneas dicen si se autorizó.
 * Antes se quedaba en "Cotizado al cliente" aunque el cliente lo hubiera rechazado.
 */
export function findingOutcome(finding: OrderFinding, labor: LaborItem[]): FindingOutcome {
  if (finding.estado !== 'cotizado' || !finding.presupuesto_id) return finding.estado;
  const lines = labor.filter((l) => l.presupuesto_id === finding.presupuesto_id);
  if (lines.length === 0) return 'cotizado';
  if (lines.some((l) => l.estado === 'pendiente' || l.estado === 'borrador')) return 'esperando';
  if (lines.some((l) => (l.estado ?? 'aprobado') === 'aprobado')) return 'autorizado';
  return 'rechazado';
}
