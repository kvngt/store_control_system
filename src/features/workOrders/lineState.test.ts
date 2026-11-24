import { describe, expect, it } from 'vitest';
import { hasApprovedLines, isApproved } from './lineState';

describe('lineState (A-11)', () => {
  it('isApproved trata undefined como aprobado y solo acepta "aprobado"', () => {
    expect(isApproved({})).toBe(true);
    expect(isApproved({ estado: 'aprobado' })).toBe(true);
    expect(isApproved({ estado: 'borrador' })).toBe(false);
    expect(isApproved({ estado: 'pendiente' })).toBe(false);
    expect(isApproved({ estado: 'rechazado' })).toBe(false);
  });

  it('hasApprovedLines devuelve false cuando solo hay borradores, pendientes o rechazados', () => {
    expect(hasApprovedLines([], [])).toBe(false);
    expect(
      hasApprovedLines(
        [{ estado: 'borrador' }, { estado: 'pendiente' }],
        [{ estado: 'rechazado' }]
      )
    ).toBe(false);
  });

  it('hasApprovedLines devuelve true si alguna línea de mano de obra o repuesto está aprobada', () => {
    expect(hasApprovedLines([{ estado: 'aprobado' }], [{ estado: 'borrador' }])).toBe(true);
    expect(hasApprovedLines([{ estado: 'borrador' }], [{ estado: 'aprobado' }])).toBe(true);
  });
});
