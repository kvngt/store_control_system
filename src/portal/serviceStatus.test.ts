import { describe, it, expect } from 'vitest';
import { computeServiceStatus } from './serviceStatus';

describe('computeServiceStatus', () => {
  const hoy = '2026-10-14';

  it('devuelve solo_millas cuando fecha es null o undefined', () => {
    expect(computeServiceStatus(null, hoy)).toEqual({
      estado: 'solo_millas',
      diasRestantes: null,
    });
    expect(computeServiceStatus(undefined, hoy)).toEqual({
      estado: 'solo_millas',
      diasRestantes: null,
    });
  });

  it('devuelve vencido cuando la fecha ya pasó', () => {
    const res = computeServiceStatus('2026-10-13', hoy);
    expect(res.estado).toBe('vencido');
    expect(res.diasRestantes).toBe(-1);
  });

  it('devuelve vencido para fechas varios meses atrás', () => {
    const res = computeServiceStatus('2026-08-14', hoy);
    expect(res.estado).toBe('vencido');
    expect(res.diasRestantes).toBeLessThan(0);
  });

  it('devuelve pronto cuando la fecha es hoy (0 días)', () => {
    const res = computeServiceStatus('2026-10-14', hoy);
    expect(res.estado).toBe('pronto');
    expect(res.diasRestantes).toBe(0);
  });

  it('devuelve pronto cuando faltan exactamente 14 días', () => {
    const res = computeServiceStatus('2026-10-28', hoy);
    expect(res.estado).toBe('pronto');
    expect(res.diasRestantes).toBe(14);
  });

  it('devuelve pronto cuando faltan menos de 14 días (ej. 7 días)', () => {
    const res = computeServiceStatus('2026-10-21', hoy);
    expect(res.estado).toBe('pronto');
    expect(res.diasRestantes).toBe(7);
  });

  it('devuelve al_dia cuando faltan más de 14 días (ej. 15 días)', () => {
    const res = computeServiceStatus('2026-10-29', hoy);
    expect(res.estado).toBe('al_dia');
    expect(res.diasRestantes).toBe(15);
  });

  it('devuelve al_dia cuando faltan 6 meses', () => {
    const res = computeServiceStatus('2027-04-14', hoy);
    expect(res.estado).toBe('al_dia');
    expect(res.diasRestantes).toBeGreaterThan(14);
  });
});
