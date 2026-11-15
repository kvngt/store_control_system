// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { UnsavedChangesProvider } from '../context/UnsavedChangesContext';
import { render } from '@testing-library/react';
import { authValue, ADMIN_USER, SEDE_CENTRO } from '../test/renderWithProviders';
import { queryKeys } from '../lib/queryClient';
import type { Commission, CommissionBalance, CommissionPayment, UserProfile } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getCommissions: vi.fn(),
  getPayments: vi.fn(),
  buildBalances: vi.fn(),
  uploadComprobante: vi.fn(),
  payCommissions: vi.fn(),
  deletePayment: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

vi.mock('../services/commissions.service', () => ({
  commissionsService: {
    getCommissions: mocks.getCommissions,
    getPayments: mocks.getPayments,
    buildBalances: mocks.buildBalances,
    uploadComprobante: mocks.uploadComprobante,
    payCommissions: mocks.payCommissions,
    deletePayment: mocks.deletePayment,
    signComprobante: vi.fn(),
  },
}));
vi.mock('../services/sedes.service', () => ({
  sedesService: { updateCommissionRate: vi.fn(), updateSede: vi.fn() },
}));
vi.mock('../services/workOrders.service', () => ({
  workOrdersService: { approveCommission: vi.fn() },
}));

const { default: Payroll } = await import('./Payroll');

const TECH_USER: UserProfile = {
  id: 'tech-1',
  nombre_completo: 'Carlos Pérez',
  rol: 'mecanico',
  sede_id: SEDE_CENTRO.id,
  telefono: '555-0200',
  email: 'carlos@restorify.test',
  creado_en: '2026-01-01T00:00:00Z',
};

const COMMISSION: Commission = {
  id: 'com-1',
  orden_id: 'ord-1',
  sede_id: SEDE_CENTRO.id,
  usuario_id: 'tech-1',
  especialidad: 'mecanica',
  base_ganancia: 1000,
  porcentaje: 35,
  tecnicos: 1,
  monto: 350,
  estado: 'aceptada',
  pago_id: null,
  creado_en: '2026-10-01T00:00:00Z',
};

const BALANCE: CommissionBalance = {
  usuario_id: 'tech-1',
  usuario: TECH_USER,
  items: [COMMISSION],
  total: 350,
  aceptado: 350,
  porRevisar: 0,
};

const PAYMENT: CommissionPayment = {
  id: 'pay-1',
  sede_id: SEDE_CENTRO.id,
  usuario_id: 'tech-1',
  usuario: TECH_USER,
  monto: 350,
  fecha_pago: '2026-10-05',
  metodo: 'cheque',
  numero_cheque: '1042',
  comprobante_url: null,
  notas: null,
  creado_en: '2026-10-05T00:00:00Z',
};

function renderPayroll() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ThemeProvider>
          <LanguageProvider>
            <ToastProvider>
              <UnsavedChangesProvider>
                <Payroll />
              </UnsavedChangesProvider>
            </ToastProvider>
          </LanguageProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return qc;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getCommissions.mockResolvedValue([COMMISSION]);
  mocks.getPayments.mockResolvedValue([PAYMENT]);
  mocks.buildBalances.mockReturnValue([BALANCE]);
  mocks.uploadComprobante.mockResolvedValue('path/comprobante.jpg');
  mocks.payCommissions.mockResolvedValue({ id: 'pay-2' });
  mocks.deletePayment.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Payroll', () => {
  it('valida la fecha de pago antes de subir comprobante o enviar y bloquea cerrar mientras guarda', async () => {
    const user = userEvent.setup();
    let resolvePay!: () => void;
    mocks.payCommissions.mockImplementation(
      () => new Promise<void>((res) => { resolvePay = res; })
    );

    const qc = renderPayroll();
    qc.setQueryData(queryKeys.transactions(SEDE_CENTRO.id), []);
    qc.setQueryData(queryKeys.attention(SEDE_CENTRO.id), {});

    await user.click(await screen.findByRole('button', { name: /Pagar lo aceptado/i }));
    const dialog = screen.getByText('Pagar saldo', { selector: '.modal-title' }).closest('.modal') as HTMLElement;

    const dateInput = within(dialog).getByLabelText('Fecha de Pago');
    await user.clear(dateInput);
    const file = new File(['img'], 'cheque.png', { type: 'image/png' });
    await user.upload(within(dialog).getByLabelText('Foto del cheque'), file);
    await user.click(within(dialog).getByRole('button', { name: /Registrar pago/i }));

    expect(mocks.uploadComprobante).not.toHaveBeenCalled();
    expect(mocks.payCommissions).not.toHaveBeenCalled();
    expect(dateInput).toHaveAttribute('aria-invalid', 'true');
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/fecha/i);

    await user.type(dateInput, '2026-10-10');
    await user.click(within(dialog).getByRole('button', { name: /Registrar pago/i }));

    await waitFor(() => expect(mocks.payCommissions).toHaveBeenCalledTimes(1));
    // Mientras guarda, cancelar / cerrar / overlay no cierran el diálogo.
    const cancelBtn = within(dialog).getByRole('button', { name: 'Cancelar' });
    expect(cancelBtn).toBeDisabled();
    await user.click(cancelBtn);
    await user.click(dialog.closest('.modal-overlay') as HTMLElement);
    expect(screen.getByText('Pagar saldo', { selector: '.modal-title' })).toBeInTheDocument();

    resolvePay();
    await waitFor(() =>
      expect(screen.queryByText('Pagar saldo', { selector: '.modal-title' })).not.toBeInTheDocument()
    );
    expect(qc.getQueryState(queryKeys.transactions(SEDE_CENTRO.id))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKeys.attention(SEDE_CENTRO.id))?.isInvalidated).toBe(true);
  });

  it('deshabilita Deshacer pago mientras corre para evitar doble envío', async () => {
    const user = userEvent.setup();
    let resolveDelete!: () => void;
    mocks.deletePayment.mockImplementation(
      () => new Promise<void>((res) => { resolveDelete = res; })
    );

    renderPayroll();

    await user.click(await screen.findByRole('button', { name: 'Pagos realizados (1)' }));
    const undoBtn = await screen.findByRole('button', { name: 'Deshacer pago' });
    await user.click(undoBtn);

    expect(undoBtn).toBeDisabled();
    await user.click(undoBtn);
    expect(mocks.deletePayment).toHaveBeenCalledTimes(1);

    resolveDelete();
    await waitFor(() => expect(undoBtn).toBeEnabled());
  });
});
