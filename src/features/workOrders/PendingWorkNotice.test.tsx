// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { PendingWorkItem } from '../../types/database';

const mocks = vi.hoisted(() => ({
  getPendingWork: vi.fn(),
}));

vi.mock('../../services/supabaseService', () => ({
  workOrdersService: {
    getPendingWork: mocks.getPendingWork,
  },
}));

const { default: PendingWorkNotice } = await import('./PendingWorkNotice');

const sampleItems: PendingWorkItem[] = [
  {
    tipo: 'mano_obra',
    descripcion: 'Cambio de amortiguadores',
    monto: 150,
    orden_id: 'ord-old-1',
    numero_orden: 'ORD-2026-005',
    fecha: '2026-09-01T10:00:00Z',
    retirada: false,
  },
  {
    tipo: 'inspeccion',
    descripcion: 'Pastillas delanteras',
    monto: null,
    orden_id: 'ord-old-2',
    numero_orden: 'ORD-2026-008',
    fecha: '2026-09-15T14:00:00Z',
    retirada: false,
  },
];

describe('PendingWorkNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there are no pending items', async () => {
    mocks.getPendingWork.mockResolvedValueOnce([]);

    renderWithProviders(
      <PendingWorkNotice vehicleId="veh-1" excludeOrderId="ord-current" />
    );

    // El proveedor pinta su propia pila de avisos: se comprueba que el aviso no sale.
    await vi.waitFor(() => expect(mocks.getPendingWork).toHaveBeenCalled());
    expect(screen.queryByText('Pendiente de visitas anteriores')).not.toBeInTheDocument();
  });

  it('renders both declined work and inspection finding with inspection prefix and without amount', async () => {
    mocks.getPendingWork.mockResolvedValueOnce(sampleItems);

    renderWithProviders(
      <PendingWorkNotice vehicleId="veh-1" excludeOrderId="ord-current" />
    );

    expect(await screen.findByText('Pendiente de visitas anteriores')).toBeInTheDocument();

    // Standard declined job line
    expect(screen.getByText(/Cambio de amortiguadores/i)).toBeInTheDocument();
    expect(screen.getByText(/ORD-2026-005/i)).toBeInTheDocument();
    expect(screen.getByText(/\$150\.00/i)).toBeInTheDocument();

    // Inspection finding row with "Inspección:" prefix
    expect(screen.getByText(/Inspección: Pastillas delanteras/i)).toBeInTheDocument();
    expect(screen.getByText(/ORD-2026-008/i)).toBeInTheDocument();
  });
});
