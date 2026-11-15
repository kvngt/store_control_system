// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as queryClientLib from '../../lib/queryClient';

const mocks = vi.hoisted(() => ({
  getOrderJobs: vi.fn(),
  renameJob: vi.fn(),
  removeJob: vi.fn(),
}));

vi.mock('../../services/workOrders.service', () => ({ workOrdersService: mocks }));

const { default: OrderJobsList } = await import('./OrderJobsList');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrderJobs.mockResolvedValue([
    { id: 'job-1', orden_id: 'ord-1', titulo: 'Servicio 60k', lineas: 2, total: 300 },
  ]);
  mocks.removeJob.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('OrderJobsList', () => {
  it('invalida las cachés derivadas al quitar un trabajo agrupado', async () => {
    const spy = vi.spyOn(queryClientLib, 'invalidateOrderEffects');
    const user = userEvent.setup();
    renderWithProviders(<OrderJobsList orderId="ord-1" />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(mocks.removeJob).toHaveBeenCalledWith('job-1'));
    expect(spy).toHaveBeenCalledWith(expect.anything(), { orderId: 'ord-1' });
  });
});
