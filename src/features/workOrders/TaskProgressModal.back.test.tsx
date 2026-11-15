/** @vitest-environment jsdom */
// El «atrás» de Android en el diálogo de avance de una tarea (pedido del taller, 04/11/2026): el
// técnico escribe con los guantes puestos, graba un video, y un «atrás» lo sacaba de la orden.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { resetBackButtonTrapsForTests } from '../../lib/backButtonTrap';
import type { LaborItem, WorkOrder } from '../../types/database';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';

// Sin cámara en jsdom: el grabador arranca con la cámara lista, sin nada grabado.
vi.mock('../media/useMediaRecorder', () => ({
  useMediaRecorder: () => ({
    openDevice: vi.fn(),
    stream: null,
    recording: null,
    state: 'ready',
    elapsed: 0,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  }),
}));

const { default: TechnicianTaskList } = await import('./TechnicianTaskList');

const atras = () => act(() => { window.history.back(); });
const asentar = () => new Promise((r) => setTimeout(r, 40));

beforeEach(() => {
  resetBackButtonTrapsForTests();
  window.history.replaceState({ idx: 0, key: 'base' }, '', '/');
});

afterEach(async () => {
  cleanup();
  await asentar();
});

const tarea = {
  id: 't1',
  orden_id: 'o1',
  descripcion: 'Frenos',
  costo: 100,
  especialidad: 'mecanica',
  asignado_a: 'tech-1',
  estado: 'aprobado',
  completado_en: null,
  creado_en: '2026-10-01T10:00:00Z',
  actualizado_en: '2026-10-01T10:00:00Z',
} as unknown as LaborItem;

function abrirLista() {
  const detail = {
    order: { id: 'o1', numero_orden: 'ORD-001', estatus: 'en_proceso', labor_items: [tarea], avances: [], media: [], asignaciones: [] } as unknown as WorkOrder,
    busy: false,
    canEdit: true,
    isDelivered: false,
    changeStatus: vi.fn(),
    toggleLaborComplete: vi.fn(),
    addProgressUpdate: vi.fn(async () => true),
    reportFinding: vi.fn(),
    laborTimes: [],
  } as unknown as WorkOrderDetailApi;
  renderWithProviders(<TechnicianTaskList items={[tarea]} currentUserId="tech-1" detail={detail} />);
  return detail;
}

describe('Diálogo de avance de una tarea y el botón «atrás»', () => {
  it('con la cámara abierta, «atrás» cierra solo la cámara y el avance conserva la nota', async () => {
    const user = userEvent.setup();
    const detail = abrirLista();

    await user.click(screen.getByRole('button', { name: /Agregar avance/ }));
    const nota = await screen.findByPlaceholderText(/Describe el trabajo realizado/);
    await user.type(nota, 'Pastillas cambiadas');
    await user.click(screen.getByRole('button', { name: 'Video' }));
    expect(screen.getByRole('dialog', { name: 'Video' })).toBeInTheDocument();

    atras();
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Video' })).not.toBeInTheDocument());
    expect(nota).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pastillas cambiadas')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // El siguiente «atrás» es del avance: con una nota escrita, pregunta.
    atras();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('¿Descartar este avance?');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    await vi.waitFor(() => expect(screen.queryByDisplayValue('Pastillas cambiadas')).not.toBeInTheDocument());
    expect(detail.addProgressUpdate).not.toHaveBeenCalled();
  });

  it('tocar fuera o «Cancelar» con una nota escrita pregunta antes de perderla', async () => {
    const user = userEvent.setup();
    abrirLista();

    await user.click(screen.getByRole('button', { name: /Agregar avance/ }));
    await user.type(await screen.findByPlaceholderText(/Describe el trabajo realizado/), 'Falta apretar');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('¿Descartar este avance?');
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));

    // La X («Cerrar») y el «Cancelar» del pie: los dos preguntan.
    for (const cancelar of [
      screen.getByRole('button', { name: 'Cerrar' }),
      screen.getByRole('button', { name: 'Cancelar' }),
    ]) {
      await user.click(cancelar);
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    }
    expect(screen.getByDisplayValue('Falta apretar')).toBeInTheDocument();
  });

  it('sin nada escrito, «atrás» cierra el avance sin preguntar', async () => {
    const user = userEvent.setup();
    abrirLista();

    await user.click(screen.getByRole('button', { name: /Agregar avance/ }));
    await screen.findByRole('button', { name: 'Guardar' });
    atras();
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
