import { describe, it, expect } from 'vitest';
import { money, moneySigned } from './money';

describe('money', () => {
  // El fallo que lo motivó: `toLocaleString()` escribía "1,650.5" por 1650.50.
  it('siempre lleva los dos centavos', () => {
    expect(money(1650.5)).toBe('$1,650.50');
    expect(money(1200)).toBe('$1,200.00');
    expect(money(0)).toBe('$0.00');
  });

  it('separa los miles', () => {
    expect(money(1234567.89)).toBe('$1,234,567.89');
  });

  it('redondea a centavos en vez de arrastrar tres decimales', () => {
    expect(money(1650.256)).toBe('$1,650.26');
  });

  it('el signo del negativo va antes del símbolo', () => {
    expect(money(-200)).toBe('-$200.00');
  });

  // `numeric` llega como cadena desde PostgREST, y un embed que la RLS bloquea llega null.
  it('acepta cadenas, null y undefined', () => {
    expect(money('1650.5')).toBe('$1,650.50');
    expect(money(null)).toBe('$0.00');
    expect(money(undefined)).toBe('$0.00');
  });

  it('nunca pinta "$NaN"', () => {
    expect(money('no es un número')).toBe('$0.00');
    expect(money(Number.POSITIVE_INFINITY)).toBe('$0.00');
  });

  it('el signo explícito de finanzas va delante', () => {
    expect(moneySigned(200, true)).toBe('+$200.00');
    expect(moneySigned(200, false)).toBe('-$200.00');
    // Un monto negativo por error no produce "+-$200.00".
    expect(moneySigned(-200, true)).toBe('+$200.00');
  });
});
