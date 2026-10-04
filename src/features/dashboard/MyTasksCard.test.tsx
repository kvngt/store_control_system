// @vitest-environment jsdom
//
// "Mis tareas" del panel del técnico (F7): lo pendiente en todas sus órdenes, primero lo que
// ya se puede hacer, y cada tarea abre su orden en la pestaña Tareas.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { MyTask } from '../../types/database';

const mocks = vi.hoisted(() => ({ getMyTasks: vi.fn() }));
vi.mock('../../services/workOrders.service', () => ({ workOrdersService: { getMyTasks: mocks.getMyTasks } }));

const { default: MyTasksCard } = await import('./MyTasksCard');

const order = (id: string, numero: string, fecha: string): MyTask['orden'] => ({
  id,
  numero_orden: numero,
  estatus: 'en_proceso',
  fecha_estimada_entrega: fecha,
  vehiculo: { marca: 'Toyota', modelo: 'Camry', anio: 2019 },
});

const TASKS: MyTask[] = [
  { id: 't1', orden_id: 'o1', descripcion: 'Pintar puerta', especialidad: 'pintura', estado: 'pendiente', completado_en: null, orden: order('o1', 'OT-1', '2026-10-05') },
  { id: 't2', orden_id: 'o2', descripcion: 'Cambio de aceite', especialidad: 'mecanica', estado: 'aprobado', completado_en: null, orden: order('o2', 'OT-2', '2026-10-09') },
  { id: 't3', orden_id: 'o3', descripcion: 'Frenos', especialidad: 'mecanica', estado: 'aprobado', completado_en: null, orden: order('o3', 'OT-3', '2026-10-06') },
  { id: 't4', orden_id: 'o3', descripcion: 'Alineación', especialidad: 'mecanica', estado: 'aprobado', completado_en: '2026-10-04T10:00:00Z', orden: order('o3', 'OT-3', '2026-10-06') },
];

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function renderCard() {
  return renderWithProviders(
    <Routes>
      <Route path="*" element={<><MyTasksCard userId="user-1" /><Where /></>} />
    </Routes>
  );
}

beforeEach(() => {
  mocks.getMyTasks.mockReset();
});

describe('MyTasksCard', () => {
  it('lista lo pendiente: primero lo autorizado, la orden que vence antes primero; las hechas solo se cuentan', async () => {
    mocks.getMyTasks.mockResolvedValue(TASKS);
    renderCard();

    const card = await screen.findByRole('region', { name: 'Mis tareas' });
    expect(mocks.getMyTasks).toHaveBeenCalledWith('user-1');
    const items = within(card).getAllByRole('button').map((b) => b.querySelector('strong')?.textContent);
    expect(items).toEqual(['Frenos', 'Cambio de aceite', 'Pintar puerta']);
    expect(within(card).queryByText('Alineación')).not.toBeInTheDocument();
    expect(within(card).getByText(/1 hecha/)).toBeInTheDocument();
  });

  it('la que el cliente no ha autorizado lo dice', async () => {
    mocks.getMyTasks.mockResolvedValue(TASKS);
    renderCard();

    const pending = await screen.findByRole('button', { name: /Pintar puerta/ });
    expect(within(pending).getByText(/autoriza/i)).toBeInTheDocument();
  });

  it('cada tarea abre su orden en la pestaña Tareas', async () => {
    mocks.getMyTasks.mockResolvedValue(TASKS);
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Abrir Frenos en la orden OT-3' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/work-orders?open=o3&tab=tareas');
  });

  it('sin pendientes lo dice', async () => {
    mocks.getMyTasks.mockResolvedValue([TASKS[3]]);
    renderCard();
    expect(await screen.findByText('No tienes tareas pendientes.')).toBeInTheDocument();
  });
});
