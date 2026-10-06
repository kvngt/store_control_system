import { describe, it, expect } from 'vitest';
import type { LaborItem, OrderFinding } from '../../types/database';
import { findingOutcome, summarizeTechTasks } from './techStatus';

const line = (id: string, estado: LaborItem['estado'], extra: Partial<LaborItem> = {}): LaborItem =>
  ({ id, orden_id: 'o-1', descripcion: id, costo: 100, estado, ...extra }) as LaborItem;

const finding = (extra: Partial<OrderFinding>): OrderFinding => ({
  id: 'h-1', orden_id: 'o-1', sede_id: 's-1', reportado_por: 'u-1', descripcion: 'Frenos traseros',
  estado: 'cotizado', en_reporte: false, texto_cliente: null, resuelto_por: null, resuelto_en: null,
  presupuesto_id: 'p-2', avance_id: null, creado_en: '2026-10-06T10:00:00Z', ...extra,
});

// Pedido del taller del 06/10/2026: un trabajo que el cliente rechazó seguía "esperando
// autorización" para el mecánico.
describe('summarizeTechTasks', () => {
  it('separa lo autorizado (y hecho), lo que espera al cliente y lo rechazado', () => {
    const summary = summarizeTechTasks([
      line('Aceite', 'aprobado', { completado_en: '2026-10-06T12:00:00Z' }),
      line('Filtro', 'aprobado'),
      line('Frenos', 'pendiente'),
      line('Pintura', 'borrador'),
      line('Llantas', 'rechazado'),
    ]);
    expect(summary.authorized).toBe(2);
    expect(summary.done).toBe(1);
    expect(summary.waiting.map((l) => l.descripcion)).toEqual(['Frenos', 'Pintura']);
    expect(summary.rejected.map((l) => l.descripcion)).toEqual(['Llantas']);
  });
});

describe('findingOutcome', () => {
  it('cotizado y rechazado por el cliente ya no dice "Cotizado"', () => {
    expect(findingOutcome(finding({}), [line('Frenos', 'rechazado', { presupuesto_id: 'p-2' })])).toBe('rechazado');
  });

  it('autorizado si el cliente aprobó algo de ese presupuesto', () => {
    expect(findingOutcome(finding({}), [
      line('Frenos', 'aprobado', { presupuesto_id: 'p-2' }),
      line('Discos', 'rechazado', { presupuesto_id: 'p-2' }),
    ])).toBe('autorizado');
  });

  it('esperando mientras el cliente no responde', () => {
    expect(findingOutcome(finding({}), [line('Frenos', 'pendiente', { presupuesto_id: 'p-2' })])).toBe('esperando');
  });

  it('sin presupuesto, o pendiente o descartado, queda su estado', () => {
    expect(findingOutcome(finding({ presupuesto_id: null }), [])).toBe('cotizado');
    expect(findingOutcome(finding({ estado: 'pendiente', presupuesto_id: null }), [])).toBe('pendiente');
    expect(findingOutcome(finding({ estado: 'descartado', presupuesto_id: null }), [])).toBe('descartado');
  });
});
