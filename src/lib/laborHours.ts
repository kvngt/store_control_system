/**
 * Tope de las horas facturadas de una tarea. La columna es NUMERIC(6,2) (hasta 9999,99): un valor
 * mayor llegaba a la base y volvía como un error de desborde que nadie entendía (QA 18/10/2026).
 * Ninguna tarea de taller pasa de 999 horas.
 */
export const MAX_LABOR_HOURS = 999;

/** Lo escrito en un campo de horas, como número entre 0 y el tope (texto vacío o no numérico = 0). */
export function clampLaborHours(value: string | number): number {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_LABOR_HOURS, Math.max(0, n));
}
