import { describe, expect, it } from 'vitest';
import { assignmentStatus } from './assignmentStatus';
import type { LaborItem } from '../../types/domain/workOrder.types';

const line = (over: Partial<LaborItem>): LaborItem => ({ id: 'l', orden_id: 'o', descripcion: 'x', costo: 100, estado: 'aprobado', ...over });

describe('assignmentStatus', () => {
  it('a finished or delivered order is done for everyone assigned', () => {
    expect(assignmentStatus('finalizado', [], 'u1')).toBe('completada');
    expect(assignmentStatus('entregado', [line({ asignado_a: 'u1' })], 'u1')).toBe('completada');
  });

  it('follows the person’s own approved tasks', () => {
    const labor = [line({ id: 'a', asignado_a: 'u1', completado_en: '2026-10-20T10:00:00Z' }), line({ id: 'b', asignado_a: 'u1' })];
    expect(assignmentStatus('recepcion', labor, 'u1')).toBe('en_curso');
    expect(assignmentStatus('en_proceso', [line({ asignado_a: 'u1', completado_en: '2026-10-20T10:00:00Z' })], 'u1')).toBe('completada');
    expect(assignmentStatus('recepcion', [line({ asignado_a: 'u1' })], 'u1')).toBe('pendiente');
    expect(assignmentStatus('en_proceso', [line({ asignado_a: 'u1' })], 'u1')).toBe('en_curso');
  });

  it('ignores other people’s tasks and lines that are not approved', () => {
    const labor = [line({ asignado_a: 'u2', completado_en: '2026-10-20T10:00:00Z' }), line({ asignado_a: 'u1', estado: 'borrador' })];
    expect(assignmentStatus('recepcion', labor, 'u1')).toBe('pendiente');
    expect(assignmentStatus('espera_autorizacion', labor, 'u1')).toBe('en_curso');
  });

  it('without tasks of their own, follows the order', () => {
    expect(assignmentStatus('recepcion', [], 'u1')).toBe('pendiente');
    expect(assignmentStatus('en_proceso', [], 'u1')).toBe('en_curso');
  });
});
