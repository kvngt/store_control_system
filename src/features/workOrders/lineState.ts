import type { LineState } from '../../types/database';

/** Ausente en datos anteriores a los presupuestos = autorizada. Solo lo autorizado se cobra. */
export function isApproved(line: { estado?: LineState }): boolean {
  return (line.estado ?? 'aprobado') === 'aprobado';
}
