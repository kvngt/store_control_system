import type { LineState } from '../../types/database';

/** Ausente en datos anteriores a los presupuestos = autorizada. Solo lo autorizado se cobra. */
export function isApproved(line: { estado?: LineState }): boolean {
  return (line.estado ?? 'aprobado') === 'aprobado';
}

/** Indica si hay al menos una línea de mano de obra o repuesto autorizada (`aprobado`). */
export function hasApprovedLines(
  labor: ReadonlyArray<{ estado?: LineState }> = [],
  parts: ReadonlyArray<{ estado?: LineState }> = []
): boolean {
  return labor.some(isApproved) || parts.some(isApproved);
}
