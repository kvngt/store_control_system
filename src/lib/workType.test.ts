import { describe, it, expect } from 'vitest';
import { ORDER_STATUSES, orderStatusKey, workTypeKey } from './workType';

describe('workTypeKey', () => {
  it('mapea cada tipo de trabajo a su clave', () => {
    expect(workTypeKey('mecanica')).toBe('workOrders.typeMecanica');
    expect(workTypeKey('pintura')).toBe('workOrders.typePintura');
    expect(workTypeKey('combinado')).toBe('workOrders.typeCombinado');
    expect(workTypeKey(undefined)).toBe('workOrders.typeMecanica');
  });
});

describe('orderStatusKey', () => {
  it('mapea todos los estados en ORDER_STATUSES a sus claves de traducción', () => {
    expect(ORDER_STATUSES).toEqual([
      'recepcion',
      'en_proceso',
      'espera_autorizacion',
      'finalizado',
      'entregado',
    ]);
    expect(orderStatusKey('recepcion')).toBe('workOrders.intake');
    expect(orderStatusKey('en_proceso')).toBe('workOrders.inProgress');
    expect(orderStatusKey('espera_autorizacion')).toBe('workOrders.waitingAuthorization');
    expect(orderStatusKey('finalizado')).toBe('workOrders.completed');
    expect(orderStatusKey('entregado')).toBe('workOrders.delivered');
    expect(orderStatusKey(null)).toBe('workOrders.intake');
  });
});
