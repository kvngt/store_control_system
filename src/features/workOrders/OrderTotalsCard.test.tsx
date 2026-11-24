// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { OrderAmounts, WorkOrder } from '../../types/database';

const orderMocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
}));

vi.mock('../../services/workOrders.service', () => ({
  workOrdersService: {
    getBalance: orderMocks.getBalance,
  },
}));

const { default: OrderTotalsCard } = await import('./OrderTotalsCard');

const ORDER = {
  id: 'ord-1',
  total_labor: 500,
  estatus: 'en_proceso',
  retirada_sin_reparar: false,
} as Pick<WorkOrder, 'id' | 'total_labor' | 'estatus' | 'retirada_sin_reparar'>;

const AMOUNTS = {
  total_repuestos: 100,
  descuento: 0,
  descuento_motivo: null,
  total_general: 600,
  deposito_inicial: 200,
} as OrderAmounts;

describe('OrderTotalsCard (B-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderMocks.getBalance.mockResolvedValue({ cobrado: 200, saldo: 400 });
  });

  it('mantiene Aplicar habilitado sin descuento y al pulsarlo avisa qué falta y enfoca el monto', async () => {
    const user = userEvent.setup();
    const onApplyDiscount = vi.fn(async () => {});

    renderWithProviders(
      <OrderTotalsCard order={ORDER} amounts={AMOUNTS} canDiscount onApplyDiscount={onApplyDiscount} />
    );

    await user.click(screen.getByRole('button', { name: /Aplicar descuento/i }));

    const applyBtn = screen.getByRole('button', { name: /^Aplicar$/i });
    const amountInput = screen.getByLabelText('Descuento ($)');

    expect(applyBtn).toBeEnabled();
    await user.click(applyBtn);

    expect(onApplyDiscount).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un descuento válido.');
    expect(amountInput).toHaveAttribute('aria-invalid', 'true');
    expect(amountInput).toHaveFocus();

    await user.type(amountInput, '50');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(amountInput).not.toHaveAttribute('aria-invalid');
  });
});
