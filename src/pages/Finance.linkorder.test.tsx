// @vitest-environment jsdom
//
// A movement entered by hand in Finanzas can now be attached to a work order,
// so a payment or a parts purchase recorded outside the order lifecycle is
// still traceable to the job it belongs to.
//
// The same dialog also carried the silent-failure pattern that bit the shop
// twice already (Nuevo Empleado, Nuevo Pago): a `return` with no message, and
// errors written into the page-level box that the modal overlay covers.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, authValue, ADMIN_USER, SEDE_CENTRO } from '../test/renderWithProviders';
import type { WorkOrder } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getTransactions: vi.fn(),
  getDashboardStats: vi.fn(),
  getWorkOrders: vi.fn(),
  createTransaction: vi.fn(),
  getImportBatches: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth.current }));

vi.mock('../services/supabaseService', () => ({
  supabaseService: {
    getTransactions: mocks.getTransactions,
    getDashboardStats: mocks.getDashboardStats,
    getWorkOrders: mocks.getWorkOrders,
    getImportBatches: mocks.getImportBatches,
    createTransaction: mocks.createTransaction,
  },
}));

const { default: Finance } = await import('./Finance');

const ORDER = {
  id: 'ord-1',
  numero_orden: 'OT-2026-0042',
  cliente: { nombre: 'Marta Ruiz' },
} as unknown as WorkOrder;

const EMPTY_STATS = {
  ordenes_activas: 0,
  ordenes_finalizadas_mes: 0,
  ingresos_mes: 0,
  egresos_mes: 0,
  clientes_nuevos_mes: 0,
  tasa_ocupacion: 0,
  ordenes_por_estatus: {
    recepcion: 0, en_proceso: 0, espera_repuestos: 0, finalizado: 0, entregado: 0,
  },
  ingresos_por_mes: [],
};

async function openDialog() {
  const user = userEvent.setup();
  renderWithProviders(<Finance />);
  await user.click(await screen.findByRole('button', { name: /Nueva Transacción/i }));
  const title = await screen.findByText('Nueva Transacción', { selector: '.modal-title' });
  return { user, modal: title.closest('.modal') as HTMLElement };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getTransactions.mockResolvedValue([]);
  mocks.getDashboardStats.mockResolvedValue(EMPTY_STATS);
  mocks.getWorkOrders.mockResolvedValue([ORDER]);
  mocks.getImportBatches.mockResolvedValue([]);
  mocks.createTransaction.mockResolvedValue({ id: 'txn-1' });
});

describe('Linking a manual movement to a work order', () => {
  it('sends the selected order with the movement', async () => {
    const { user, modal } = await openDialog();

    await user.type(within(modal).getByPlaceholderText('0.00'), '250');
    await user.type(within(modal).getByRole('textbox', { name: '' }), 'Compra de faro delantero');
    await user.selectOptions(within(modal).getByLabelText(/Orden vinculada/i), ORDER.id);
    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalled());
    expect(mocks.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ monto: 250, referencia_orden_id: ORDER.id })
    );
  });

  it('sends null, not an empty string, when no order is chosen', async () => {
    // '' would fail the uuid column; null is what "not linked" has to mean.
    const { user, modal } = await openDialog();

    await user.type(within(modal).getByPlaceholderText('0.00'), '80');
    await user.type(within(modal).getByRole('textbox', { name: '' }), 'Café para la oficina');
    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalled());
    expect(mocks.createTransaction.mock.calls[0][0].referencia_orden_id).toBeNull();
  });

  it('shows the order number on a linked movement in the table', async () => {
    mocks.getTransactions.mockResolvedValue([
      {
        id: 'txn-1',
        sede_id: SEDE_CENTRO.id,
        referencia_orden_id: ORDER.id,
        tipo: 'egreso',
        categoria: 'compra_repuesto',
        monto: 250,
        descripcion: 'Compra de faro delantero',
        fecha: '2026-09-01',
        creado_en: '2026-09-01T00:00:00Z',
      },
    ]);

    renderWithProviders(<Finance />);

    expect(await screen.findByRole('button', { name: ORDER.numero_orden })).toBeVisible();
  });

  it('explains a blank amount instead of doing nothing', async () => {
    const { user, modal } = await openDialog();

    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    expect(mocks.createTransaction).not.toHaveBeenCalled();
    const alert = await within(modal).findByRole('alert');
    expect(alert).toBeVisible();
    expect(alert.textContent).toMatch(/monto/i);
  });

  it('explains a missing description instead of doing nothing', async () => {
    const { user, modal } = await openDialog();

    await user.type(within(modal).getByPlaceholderText('0.00'), '250');
    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    expect(mocks.createTransaction).not.toHaveBeenCalled();
    expect((await within(modal).findByRole('alert')).textContent).toMatch(/descripción/i);
  });
});
