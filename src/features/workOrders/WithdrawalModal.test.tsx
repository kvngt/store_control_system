// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { getTranslation } from '../../i18n/translations';
import type { WithdrawalBalance } from '../../types/database';

const mocks = vi.hoisted(() => ({
  getWithdrawalBalance: vi.fn<(orderId: string, cobro: number, conservar?: string[]) => Promise<WithdrawalBalance>>(),
  withdrawWithoutRepair: vi.fn<() => Promise<{ saldo: number; tipo: 'ingreso' | 'egreso' | null; movimiento_id: string | null }>>(),
}));

vi.mock('../../services/workOrders.service', () => ({
  workOrdersService: {
    getWithdrawalBalance: mocks.getWithdrawalBalance,
    withdrawWithoutRepair: mocks.withdrawWithoutRepair,
    uploadReceipt: vi.fn(),
    removeDeliveryReceipt: vi.fn(),
  },
}));

vi.mock('../../lib/errors', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const { default: WithdrawalModal } = await import('./WithdrawalModal');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWithdrawalBalance.mockResolvedValue({
    cobrado: 0,
    trabajos: 0,
    revision: 0,
    cobro: 0,
    saldo: 0,
  });
  mocks.withdrawWithoutRepair.mockResolvedValue({ saldo: 0, tipo: null, movimiento_id: null });
});

describe('WithdrawalModal', () => {
  it('retira la orden directamente desde el diálogo sin pedir window.confirm()', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDone = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <WithdrawalModal
        order={{ id: 'ord-1', numero_orden: 'OT-001', sede_id: 'sede-1' }}
        lines={[]}
        onCancel={vi.fn()}
        onDone={onDone}
      />
    );

    const submitBtn = await screen.findByRole('button', { name: getTranslation('es', 'withdrawal.submit') });
    await waitFor(() => expect(submitBtn).toBeEnabled());

    await user.click(submitBtn);

    await waitFor(() => expect(mocks.withdrawWithoutRepair).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('si no hace falta método, un cheque elegido antes no bloquea el cierre', async () => {
    mocks.getWithdrawalBalance.mockImplementation(async (_id, cobro) => ({
      cobrado: 0,
      trabajos: 0,
      revision: cobro,
      cobro,
      saldo: cobro,
    }));
    const onDone = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <WithdrawalModal
        order={{ id: 'ord-1', numero_orden: 'OT-001', sede_id: 'sede-1' }}
        lines={[]}
        onCancel={vi.fn()}
        onDone={onDone}
      />
    );

    await user.click(screen.getByRole('radio', { name: /Solo se cobra la revisión/ }));
    await user.type(screen.getByLabelText('Se cobra ($)'), '50');
    await user.selectOptions(await screen.findByLabelText('Cómo pagó el cliente'), 'cheque');

    await user.click(screen.getByRole('radio', { name: /Se canceló todo/ }));
    const submitBtn = await screen.findByRole('button', { name: getTranslation('es', 'withdrawal.submit') });
    await waitFor(() => expect(submitBtn).toBeEnabled());

    await user.click(submitBtn);

    await waitFor(() =>
      expect(mocks.withdrawWithoutRepair).toHaveBeenCalledWith({
        orderId: 'ord-1',
        cobro: 0,
        concepto: null,
        metodo: null,
        numeroCheque: null,
        comprobanteRuta: null,
        conservar: [],
      })
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
