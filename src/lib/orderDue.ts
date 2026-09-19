import { daysFromTodayLocal, todayLocal } from './dates';
import type { OrderStatus } from '../types/domain/enums';

/** Cuántos días antes de la fecha estimada se considera que una orden ya aprieta. */
const SOON_DAYS = 2;

export type DueState = 'vencida' | 'hoy' | 'proxima';

interface DueInput {
  estatus: OrderStatus;
  fecha_estimada_entrega?: string | null;
}

/**
 * Si la fecha estimada de entrega de una orden ya aprieta, y cuánto.
 *
 * Deriva, no se guarda: la fecha ya está en la orden y guardar un estado aparte sería una
 * segunda verdad que hay que mantener al día. `null` significa que no hay nada que señalar.
 *
 * Una orden finalizada o entregada nunca está vencida: el trabajo se acabó, y pintarla en
 * rojo solo enseñaría al taller a ignorar el color.
 *
 * Se compara como texto `YYYY-MM-DD` contra `todayLocal()`, nunca con `new Date(fecha)`:
 * una cadena de solo fecha se parsea como medianoche UTC, y al oeste de UTC eso es el día
 * anterior — una orden que vence hoy se vería vencida desde ayer (ver `dates.ts`).
 */
export function orderDueState(order: DueInput): DueState | null {
  if (order.estatus === 'finalizado' || order.estatus === 'entregado') return null;

  const fecha = (order.fecha_estimada_entrega || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;

  const hoy = todayLocal();
  if (fecha < hoy) return 'vencida';
  if (fecha === hoy) return 'hoy';
  if (fecha <= daysFromTodayLocal(SOON_DAYS)) return 'proxima';
  return null;
}
