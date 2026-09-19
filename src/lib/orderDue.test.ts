import { describe, expect, it } from 'vitest';
import { daysFromTodayLocal, todayLocal } from './dates';
import { orderDueState } from './orderDue';
import type { OrderStatus } from '../types/domain/enums';

const orden = (fecha: string | null, estatus: OrderStatus = 'en_proceso') => ({
  estatus,
  fecha_estimada_entrega: fecha,
});

describe('orderDueState', () => {
  it('ayer está vencida', () => {
    expect(orderDueState(orden(daysFromTodayLocal(-1)))).toBe('vencida');
  });

  it('hoy es hoy', () => {
    expect(orderDueState(orden(todayLocal()))).toBe('hoy');
  });

  it('mañana y en dos días aprietan', () => {
    expect(orderDueState(orden(daysFromTodayLocal(1)))).toBe('proxima');
    expect(orderDueState(orden(daysFromTodayLocal(2)))).toBe('proxima');
  });

  it('más allá de dos días no se señala', () => {
    expect(orderDueState(orden(daysFromTodayLocal(3)))).toBeNull();
    expect(orderDueState(orden(daysFromTodayLocal(30)))).toBeNull();
  });

  // El trabajo se acabó: pintarla en rojo solo enseñaría al taller a ignorar el color.
  it('una orden cerrada nunca está vencida, aunque la fecha pasó', () => {
    const ayer = daysFromTodayLocal(-10);
    expect(orderDueState(orden(ayer, 'finalizado'))).toBeNull();
    expect(orderDueState(orden(ayer, 'entregado'))).toBeNull();
  });

  it('sin fecha o con una fecha que no es una fecha, no se señala', () => {
    expect(orderDueState(orden(null))).toBeNull();
    expect(orderDueState(orden(''))).toBeNull();
    expect(orderDueState(orden('mañana'))).toBeNull();
    expect(orderDueState(orden('2026-09-01T00:00:00Z'))).toBeNull();
  });
});
