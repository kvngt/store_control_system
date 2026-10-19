// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import TechnicianTaskList from './TechnicianTaskList';
import type { LaborItem, WorkOrder } from '../../types/database';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';
import type { LaborTimeEntry } from '../../types/domain/timeTracking.types';

const mockDetail = (orderOverrides: Partial<WorkOrder> = {}): WorkOrderDetailApi =>
  ({
    order: {
      id: 'o1',
      numero_orden: 'ORD-001',
      estatus: 'en_proceso',
      tipo_trabajo: 'mecanica',
      marcas_danos: [],
      labor_items: [],
      repuestos: [],
      asignaciones: [],
      avances: [],
      media: [],
      montos: { total_general: 0, total_repuestos: 0, deposito_inicial: 0 },
      ...orderOverrides,
    } as unknown as WorkOrder,
    busy: false,
    changeStatus: vi.fn(),
    toggleLaborComplete: vi.fn(),
    addProgressUpdate: vi.fn(),
    reportFinding: vi.fn(),
    canEdit: true,
  } as unknown as WorkOrderDetailApi);

const makeTask = (id: string, asignadoA: string): LaborItem =>
  ({
    id,
    orden_id: 'o1',
    descripcion: 'Cambio de pastillas',
    costo: 150,
    especialidad: 'mecanica',
    asignado_a: asignadoA,
    estado: 'aprobado',
    completado_en: null,
    actualizado_en: '2026-10-01T10:00:00Z',
  } as unknown as LaborItem);

describe('TechnicianTaskList - Reloj por tarea (M2)', () => {
  it('muestra «▶ Iniciar» cuando no hay reloj corriendo y llama a onStartClock al hacer clic', async () => {
    const user = userEvent.setup();
    const task = makeTask('t1', 'tech-1');
    const onStartClock = vi.fn().mockResolvedValue(undefined);
    const onStopClock = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(
      <TechnicianTaskList
        items={[task]}
        currentUserId="tech-1"
        detail={{ ...mockDetail(), laborTimes: [], startClock: onStartClock, stopClock: onStopClock }}
      />
    );

    const startBtn = screen.getByRole('button', { name: /Iniciar reloj|Iniciar/i });
    expect(startBtn).toBeInTheDocument();
    expect(startBtn).toHaveTextContent(/Iniciar/);

    await user.click(startBtn);
    expect(onStartClock).toHaveBeenCalledWith('t1');
    expect(onStopClock).not.toHaveBeenCalled();
  });

  it('muestra «⏸ Pausar» cuando el reloj está corriendo y llama a onStopClock al hacer clic', async () => {
    const user = userEvent.setup();
    const task = makeTask('t1', 'tech-1');
    const onStartClock = vi.fn().mockResolvedValue(undefined);
    const onStopClock = vi.fn().mockResolvedValue(undefined);

    const runningEntry: LaborTimeEntry = {
      id: 'time-1',
      labor_id: 't1',
      orden_id: 'o1',
      usuario_id: 'tech-1',
      inicio: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
      fin: null,
    };

    renderWithProviders(
      <TechnicianTaskList
        items={[task]}
        currentUserId="tech-1"
        detail={{ ...mockDetail(), laborTimes: [runningEntry], startClock: onStartClock, stopClock: onStopClock }}
      />
    );

    const pauseBtn = screen.getByRole('button', { name: /Pausar reloj|Pausar/i });
    expect(pauseBtn).toBeInTheDocument();
    expect(pauseBtn).toHaveTextContent(/Pausar/);

    await user.click(pauseBtn);
    expect(onStopClock).toHaveBeenCalledWith('t1');
    expect(onStartClock).not.toHaveBeenCalled();
  });
});
