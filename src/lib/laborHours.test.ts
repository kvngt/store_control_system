import { describe, it, expect } from 'vitest';
import { MAX_LABOR_HOURS, clampLaborHours } from './laborHours';

describe('clampLaborHours', () => {
  it('deja pasar lo normal, con decimales', () => {
    expect(clampLaborHours('1.5')).toBe(1.5);
    expect(clampLaborHours(0.25)).toBe(0.25);
  });

  it('lo negativo, vacío o no numérico es 0', () => {
    expect(clampLaborHours('-3')).toBe(0);
    expect(clampLaborHours('')).toBe(0);
    expect(clampLaborHours('abc')).toBe(0);
    expect(clampLaborHours(Number.NaN)).toBe(0);
  });

  it('lo que pasa del tope queda en el tope, no llega a la base', () => {
    expect(clampLaborHours('99999999')).toBe(MAX_LABOR_HOURS);
  });
});
