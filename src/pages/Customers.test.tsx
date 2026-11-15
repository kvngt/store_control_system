// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { UnsavedChangesProvider } from '../context/UnsavedChangesContext';
import { authValue, ADMIN_USER, SEDE_CENTRO } from '../test/renderWithProviders';
import { queryKeys } from '../lib/queryClient';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

vi.mock('../services/customers.service', () => ({
  customersService: {
    getCustomers: mocks.getCustomers,
    getCustomerDetail: vi.fn(),
    createCustomer: mocks.createCustomer,
    updateCustomer: mocks.updateCustomer,
    deleteCustomer: vi.fn(),
  },
}));

const { default: Customers } = await import('./Customers');

function renderCustomers() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ThemeProvider>
          <LanguageProvider>
            <ToastProvider>
              <UnsavedChangesProvider>
                <Customers />
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
  mocks.getCustomers.mockResolvedValue([]);
  mocks.createCustomer.mockResolvedValue({ id: 'cli-new' });
});

describe('Customers', () => {
  it('muestra error y marca aria-invalid cuando faltan nombre o teléfono al guardar', async () => {
    const user = userEvent.setup();
    renderCustomers();

    await user.click(await screen.findByRole('button', { name: /Nuevo Cliente/i }));
    const modal = screen.getByText('Nuevo Cliente', { selector: '.modal-title' }).closest('.modal') as HTMLElement;

    await user.click(within(modal).getByRole('button', { name: 'Crear' }));
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(within(modal).getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect((await within(modal).findByRole('alert')).textContent).toMatch(/nombre/i);

    await user.type(within(modal).getByLabelText('Nombre'), 'Marta Ruiz');
    await user.click(within(modal).getByRole('button', { name: 'Crear' }));
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(within(modal).getByLabelText('Teléfono')).toHaveAttribute('aria-invalid', 'true');
    expect((await within(modal).findByRole('alert')).textContent).toMatch(/teléfono/i);
  });

  it('invalida el detalle del cliente y las órdenes al guardar sin invalidar finanzas ni comisiones', async () => {
    const user = userEvent.setup();
    const qc = renderCustomers();
    qc.setQueryData(queryKeys.customerDetail('cli-new'), { ok: true });
    qc.setQueryData(queryKeys.workOrders(SEDE_CENTRO.id), []);
    qc.setQueryData(queryKeys.vehicles(SEDE_CENTRO.id), []);
    qc.setQueryData(queryKeys.transactions(SEDE_CENTRO.id), []);
    qc.setQueryData(queryKeys.commissions(SEDE_CENTRO.id), []);

    await user.click(await screen.findByRole('button', { name: /Nuevo Cliente/i }));
    const modal = screen.getByText('Nuevo Cliente', { selector: '.modal-title' }).closest('.modal') as HTMLElement;

    await user.type(within(modal).getByLabelText('Nombre'), 'Marta Ruiz');
    await user.type(within(modal).getByLabelText('Teléfono'), '5551234567');
    await user.click(within(modal).getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(mocks.createCustomer).toHaveBeenCalledTimes(1));
    // Se mira lo que no está en pantalla (el detalle y las órdenes): las listas montadas se
    // vuelven a cargar solas al invalidarse y dejan de estar marcadas. La invalidación llega
    // después de que el guardado resuelve, por eso se espera.
    await waitFor(() => expect(qc.getQueryState(queryKeys.customerDetail('cli-new'))?.isInvalidated).toBe(true));
    expect(qc.getQueryState(queryKeys.workOrders(SEDE_CENTRO.id))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKeys.transactions(SEDE_CENTRO.id))?.isInvalidated).toBe(false);
    expect(qc.getQueryState(queryKeys.commissions(SEDE_CENTRO.id))?.isInvalidated).toBe(false);
  });
});
