// @vitest-environment jsdom
//
// "Requiere atención" del panel del admin (F7): cada grupo con su número, las órdenes que
// nombra llevan a la pestaña donde se resuelve, y una RPC que todavía no existe (la app
// publicada antes que su migración) no pinta un error que el taller no puede arreglar.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { AttentionSummary } from '../../types/database';

const mocks = vi.hoisted(() => ({ getAttention: vi.fn() }));
vi.mock('../../services/dashboard.service', () => ({ dashboardService: { getAttention: mocks.getAttention } }));

const { default: AttentionCard } = await import('./AttentionCard');

const EMPTY = { total: 0, ordenes: [] };
const SUMMARY: AttentionSummary = {
  hallazgos: {
    total: 5,
    ordenes: [
      { id: 'o1', numero_orden: 'OT-1' },
      { id: 'o2', numero_orden: 'OT-2' },
      { id: 'o3', numero_orden: 'OT-3' },
      { id: 'o4', numero_orden: 'OT-4' },
    ],
  },
  presupuestos: EMPTY,
  sin_tecnico: { total: 2, ordenes: [{ id: 'o9', numero_orden: 'OT-9' }] },
  vencidas: EMPTY,
  correos: { total: 3 },
};

/** Dónde quedó el router después de un clic. */
function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function renderCard() {
  return renderWithProviders(
    <Routes>
      <Route path="*" element={<><AttentionCard sedeId="sede-1" /><Where /></>} />
    </Routes>
  );
}

beforeEach(() => {
  mocks.getAttention.mockReset();
});

describe('AttentionCard', () => {
  it('muestra solo los grupos con algo, con su número', async () => {
    mocks.getAttention.mockResolvedValue(SUMMARY);
    renderCard();

    const card = await screen.findByRole('region', { name: 'Requiere atención' });
    expect(mocks.getAttention).toHaveBeenCalledWith('sede-1');
    expect(within(card).getByText(/Trabajo adicional por revisar/)).toHaveTextContent('5');
    expect(within(card).getByText(/Tareas sin técnico/)).toHaveTextContent('2');
    expect(within(card).getByText(/Correos al cliente con error/)).toHaveTextContent('3');
    expect(within(card).queryByText(/Presupuestos sin respuesta/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/entrega vencida/)).not.toBeInTheDocument();
  });

  it('nombra tres órdenes y cuenta el resto', async () => {
    mocks.getAttention.mockResolvedValue(SUMMARY);
    renderCard();

    const card = await screen.findByRole('region', { name: 'Requiere atención' });
    expect(within(card).getByRole('button', { name: 'OT-3' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'OT-4' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '+2 más' })).toBeInTheDocument();
  });

  it('cada orden abre la pestaña donde se resuelve; los correos, Configuración', async () => {
    mocks.getAttention.mockResolvedValue(SUMMARY);
    const user = userEvent.setup();
    renderCard();
    const card = await screen.findByRole('region', { name: 'Requiere atención' });

    await user.click(within(card).getByRole('button', { name: 'OT-1' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/work-orders?open=o1&tab=resumen');

    await user.click(within(card).getByRole('button', { name: 'OT-9' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/work-orders?open=o9&tab=trabajos');

    await user.click(within(card).getByRole('button', { name: /Revisar/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/settings');
  });

  it('sin nada pendiente lo dice', async () => {
    mocks.getAttention.mockResolvedValue({
      hallazgos: EMPTY,
      presupuestos: EMPTY,
      sin_tecnico: EMPTY,
      vencidas: EMPTY,
      correos: { total: 0 },
    });
    renderCard();
    expect(await screen.findByText(/Todo al día/)).toBeInTheDocument();
  });

  it('si la función todavía no existe en la base, no se muestra', async () => {
    mocks.getAttention.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function' });
    renderCard();
    await vi.waitFor(() => expect(mocks.getAttention).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('region', { name: 'Requiere atención' })).not.toBeInTheDocument();
  });

  it('otro error se dice dentro de la tarjeta', async () => {
    mocks.getAttention.mockRejectedValue({ code: '500', message: 'boom' });
    renderCard();
    expect(await screen.findByText(/No se pudo revisar qué requiere atención/)).toBeInTheDocument();
  });
});
