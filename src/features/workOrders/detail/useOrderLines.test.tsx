// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '../../../context/LanguageContext';
import { ToastProvider } from '../../../context/ToastContext';
import { workOrdersService } from '../../../services/workOrders.service';
import type { LaborItem, WorkOrder } from '../../../types/database';
import { useOrderLines } from './useOrderLines';

vi.mock('../../../services/workOrders.service', () => ({
  workOrdersService: {
    setLaborCompleted: vi.fn().mockResolvedValue(undefined),
    getOrderLaborTimes: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../services/users.service', () => ({
  usersService: {
    getOperators: vi.fn().mockResolvedValue([]),
  },
}));

function makeLabor(completadoEn: string | null): LaborItem {
  return {
    id: 'l-1',
    orden_id: 'wo-b09',
    descripcion: 'Cambio de aceite',
    costo: 80,
    especialidad: 'mecanica',
    asignado_a: 'tech-1',
    estado: 'aprobado',
    completado_en: completadoEn,
  } as unknown as LaborItem;
}

function LinesHarness({ item }: { item: LaborItem }) {
  const lines = useOrderLines({
    openOrderId: 'wo-b09',
    order: { id: 'wo-b09', sede_id: 'sede-1', labor_items: [item] } as unknown as WorkOrder,
    isAdmin: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    setBusy: vi.fn(),
    fail: vi.fn(),
  });

  return (
    <button type="button" onClick={() => void lines.toggleLaborComplete(item)}>
      Toggle
    </button>
  );
}

describe('useOrderLines (B-09: aviso al marcar tarea hecha)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('muestra el toast "Tarea hecha" solo al marcar como completada y no al desmarcar', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <LinesHarness item={makeLabor(null)} />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Toggle' }));

    await waitFor(() => {
      expect(workOrdersService.setLaborCompleted).toHaveBeenCalledWith('l-1', true);
    });
    expect(await screen.findByText('Tarea hecha')).toBeInTheDocument();

    unmount();
    vi.clearAllMocks();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <LanguageProvider>
          <ToastProvider>
            <LinesHarness item={makeLabor('2026-11-24T10:00:00Z')} />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    await waitFor(() => {
      expect(workOrdersService.setLaborCompleted).toHaveBeenCalledWith('l-1', false);
    });
    expect(screen.queryByText('Tarea hecha')).not.toBeInTheDocument();
  });
});
