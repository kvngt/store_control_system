import { describe, it, expect } from 'vitest';
import { sumMoney, money, moneySigned } from './money';

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

describe('sumMoney', () => {
  it('suma en centavos: 0,1 + 0,2 es 0,30 y no 0,30000000000000004', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array.from({ length: 10 }, () => 0.1))).toBe(1);
  });

  it('acepta cadenas de la API, null y lo que no es número', () => {
    expect(sumMoney(['10.50', null, undefined, '4.25', 'abc'])).toBe(14.75);
  });

  it('una lista vacía es cero', () => {
    expect(sumMoney([])).toBe(0);
  });
});
