import { describe, it, expect, vi } from 'vitest';
import type { LaborItem, WorkOrder } from '../../types/database';
import { techNextStep, buildTechActions } from './techNextStep';

const makeLabor = (
  id: string,
  asignadoA: string,
  estado: 'aprobado' | 'borrador' | 'rechazado' = 'aprobado',
  completadoEn: string | null = null,
  descripcion = 'Frenos'
): LaborItem =>
  ({
    id,
    orden_id: 'o1',
    descripcion,
    costo: 100,
    especialidad: 'mecanica',
    asignado_a: asignadoA,
    estado,
    completado_en: completadoEn,
  }) as unknown as LaborItem;

describe('techNextStep', () => {
  it('retorna null si order es nulo o no tiene estatus', () => {
    expect(techNextStep(null, [], 'tech-1')).toBeNull();
    expect(techNextStep(undefined, [], 'tech-1')).toBeNull();
    expect(techNextStep({}, [], 'tech-1')).toBeNull();
  });

  it('retorna "start" en recepción si el técnico tiene al menos una tarea aprobada', () => {
    const order = { estatus: 'recepcion' };
    const items = [makeLabor('l1', 'tech-1', 'aprobado')];
    expect(techNextStep(order, items, 'tech-1')).toBe('start');
  });

  it('retorna null en recepción si el técnico solo tiene tareas borrador o de otro', () => {
    const order = { estatus: 'recepcion' };
    const items = [
      makeLabor('l1', 'tech-1', 'borrador'),
      makeLabor('l2', 'tech-2', 'aprobado'),
    ];
    expect(techNextStep(order, items, 'tech-1')).toBeNull();
  });

  it('retorna "finish" en proceso si TODAS las tareas aprobadas están completadas', () => {
    const order = { estatus: 'en_proceso' };
    const items = [
      makeLabor('l1', 'tech-1', 'aprobado', '2026-10-16T12:00:00Z'),
      makeLabor('l2', 'tech-2', 'aprobado', '2026-10-16T12:30:00Z'),
      makeLabor('l3', 'tech-2', 'rechazado', null), // rechazada no impide finish
    ];
    expect(techNextStep(order, items, 'tech-1')).toBe('finish');
  });

  it('retorna "partDone" en proceso si las tareas del técnico están hechas pero falta de otro', () => {
    const order = { estatus: 'en_proceso' };
    const items = [
      makeLabor('l1', 'tech-1', 'aprobado', '2026-10-16T12:00:00Z'),
      makeLabor('l2', 'tech-2', 'aprobado', null),
    ];
    expect(techNextStep(order, items, 'tech-1')).toBe('partDone');
  });

  it('retorna null en proceso si las tareas del propio técnico siguen incompletas', () => {
    const order = { estatus: 'en_proceso' };
    const items = [
      makeLabor('l1', 'tech-1', 'aprobado', null),
      makeLabor('l2', 'tech-2', 'aprobado', null),
    ];
    expect(techNextStep(order, items, 'tech-1')).toBeNull();
  });

  it('retorna null en cualquier otro estado de la orden', () => {
    const items = [makeLabor('l1', 'tech-1', 'aprobado')];
    expect(techNextStep({ estatus: 'finalizado' }, items, 'tech-1')).toBeNull();
    expect(techNextStep({ estatus: 'entregado' }, items, 'tech-1')).toBeNull();
    expect(techNextStep({ estatus: 'cancelado' }, items, 'tech-1')).toBeNull();
  });
});

describe('buildTechActions', () => {
  it('retorna vacío si canEdit es false', () => {
    const actions = buildTechActions({
      order: { estatus: 'recepcion' } as WorkOrder,
      laborList: [],
      userId: 'tech-1',
      canEdit: false,
      changeStatus: vi.fn(),
      goTo: vi.fn(),
      onReportFinding: vi.fn(),
      onSuggestService: vi.fn(),
    });
    expect(actions).toEqual([]);
  });

  it('en recepción con tarea propia aprobada, startWork es la primera acción con primary: true y myTasks tiene primary: false', () => {
    const changeStatus = vi.fn();
    const actions = buildTechActions({
      order: { estatus: 'recepcion' } as WorkOrder,
      laborList: [makeLabor('l1', 'tech-1', 'aprobado')],
      userId: 'tech-1',
      canEdit: true,
      changeStatus,
      goTo: vi.fn(),
      onReportFinding: vi.fn(),
      onSuggestService: vi.fn(),
    });

    expect(actions[0].key).toBe('startWork');
    expect(actions[0].primary).toBe(true);

    const tasksAction = actions.find((a) => a.key === 'tasks');
    expect(tasksAction?.primary).toBe(false);

    actions[0].onClick();
    expect(changeStatus).toHaveBeenCalledWith('en_proceso');
  });

  it('en proceso con todas las tareas hechas, finishOrder es la primera acción con primary: true y myTasks tiene primary: false', () => {
    const changeStatus = vi.fn();
    const actions = buildTechActions({
      order: { estatus: 'en_proceso' } as WorkOrder,
      laborList: [makeLabor('l1', 'tech-1', 'aprobado', '2026-10-16T12:00:00Z')],
      userId: 'tech-1',
      canEdit: true,
      changeStatus,
      goTo: vi.fn(),
      onReportFinding: vi.fn(),
      onSuggestService: vi.fn(),
    });

    expect(actions[0].key).toBe('finishOrder');
    expect(actions[0].primary).toBe(true);

    const tasksAction = actions.find((a) => a.key === 'tasks');
    expect(tasksAction?.primary).toBe(false);

    actions[0].onClick();
    expect(changeStatus).toHaveBeenCalledWith('finalizado');
  });

  it('cuando no hay startWork ni finishOrder, myTasks es primary: true', () => {
    const actions = buildTechActions({
      order: { estatus: 'en_proceso' } as WorkOrder,
      laborList: [makeLabor('l1', 'tech-1', 'aprobado', null)], // en proceso pero aún incompleto
      userId: 'tech-1',
      canEdit: true,
      changeStatus: vi.fn(),
      goTo: vi.fn(),
      onReportFinding: vi.fn(),
      onSuggestService: vi.fn(),
    });

    expect(actions.find((a) => a.key === 'startWork')).toBeUndefined();
    expect(actions.find((a) => a.key === 'finishOrder')).toBeUndefined();

    const tasksAction = actions.find((a) => a.key === 'tasks');
    expect(tasksAction?.primary).toBe(true);
  });
});
