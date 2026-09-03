// @vitest-environment jsdom
//
// Wiring test for the Import Statement button.
//
// LazyModal.test.tsx proves the wrapper behaves; this proves Finance actually
// uses it. The reported symptom — "pressed Importar Estado de Cuenta and
// nothing happened" — was possible because the modal was mounted under
// `<Suspense fallback={null}>`, so there is no substitute for asserting that
// *something* appears on the very first click.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, authValue, ADMIN_USER } from '../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getTransactions: vi.fn(),
  getDashboardStats: vi.fn(),
  getWorkOrders: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mocks.auth.current,
}));

vi.mock('../services/supabaseService', () => ({
  supabaseService: {
    getTransactions: mocks.getTransactions,
    getDashboardStats: mocks.getDashboardStats,
    getWorkOrders: mocks.getWorkOrders,
    createTransaction: vi.fn(),
  },
}));

// Stand in for the real ~440 KB chunk, and keep it pending so the test can
// observe what the user sees during the download.
vi.mock('./finance/ImportStatementModal', () => new Promise(() => {}));

const { default: Finance } = await import('./Finance');

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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getTransactions.mockResolvedValue([]);
  mocks.getDashboardStats.mockResolvedValue(EMPTY_STATS);
  mocks.getWorkOrders.mockResolvedValue([]);
});

describe('Finance — Importar Estado de Cuenta', () => {
  it('responds on the first click while the importer is still downloading', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Finance />);

    await user.click(await screen.findByRole('button', { name: /Importar Estado de Cuenta/i }));

    // Anything at all, as long as the admin can tell the click registered.
    expect(await screen.findByRole('status')).toBeVisible();
  });
});
