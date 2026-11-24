// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_USER, SEDE_CENTRO, authValue, renderWithProviders } from '../test/renderWithProviders';
import { getTranslation } from '../i18n/translations';
import type { BankStatementImport, DashboardStats, FinancialTransaction, StatementSummary, WorkOrder } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getTransactions: vi.fn<() => Promise<FinancialTransaction[]>>(),
  getDashboardStats: vi.fn<() => Promise<DashboardStats>>(),
  getWorkOrders: vi.fn<() => Promise<WorkOrder[]>>(),
  getImportBatches: vi.fn<() => Promise<BankStatementImport[]>>(),
  getStatementSummaries: vi.fn<() => Promise<StatementSummary[]>>(),
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  deleteImportBatch: vi.fn(),
  signComprobante: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

vi.mock('../lib/errors', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

vi.mock('../services/commissions.service', () => ({
  commissionsService: { signComprobante: mocks.signComprobante },
}));
vi.mock('../services/dashboard.service', () => ({
  dashboardService: { getDashboardStats: mocks.getDashboardStats },
}));
vi.mock('../services/workOrders.service', () => ({
  workOrdersService: { getWorkOrders: mocks.getWorkOrders },
}));
vi.mock('../services/finance.service', () => ({
  financeService: {
    getTransactions: mocks.getTransactions,
    getImportBatches: mocks.getImportBatches,
    getStatementSummaries: mocks.getStatementSummaries,
    createTransaction: mocks.createTransaction,
    deleteTransaction: mocks.deleteTransaction,
    deleteImportBatch: mocks.deleteImportBatch,
  },
}));

vi.mock('../features/finance/OrderMarginCard', () => ({ default: () => null }));
vi.mock('../features/finance/WorkshopMetricsTab', () => ({ default: () => null }));

const { default: Finance } = await import('./Finance');

const STATS_BASE: DashboardStats = {
  ordenes_activas: 0,
  ordenes_finalizadas_mes: 0,
  ingresos_mes: 1200,
  egresos_mes: 300,
  ingresos_total: 1200,
  egresos_total: 300,
  clientes_nuevos_mes: 0,
  tasa_ocupacion: 0,
  ordenes_por_estatus: {
    recepcion: 0,
    en_proceso: 0,
    espera_autorizacion: 0,
    finalizado: 0,
    entregado: 0,
  },
  ingresos_por_mes: [],
};

const IMPORT_BATCH: BankStatementImport = {
  id: 'imp-1',
  sede_id: SEDE_CENTRO.id,
  nombre_archivo: 'estado-febrero.pdf',
  ruta_archivo: 'sede/feb.pdf',
  fecha_importacion: '2026-03-01T10:00:00Z',
  total_transacciones: 3,
  creado_en: '2026-03-01T10:00:00Z',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getTransactions.mockResolvedValue([]);
  mocks.getDashboardStats.mockResolvedValue(STATS_BASE);
  mocks.getWorkOrders.mockResolvedValue([]);
  mocks.getImportBatches.mockResolvedValue([]);
  mocks.getStatementSummaries.mockResolvedValue([]);
});

describe('Finance', () => {
  it('muestra el error si falla summariesQuery y no pinta sumas en cero en estados de cuenta', async () => {
    mocks.getImportBatches.mockResolvedValue([IMPORT_BATCH]);
    mocks.getStatementSummaries.mockRejectedValue(new Error('No se pudieron calcular las sumas'));
    const user = userEvent.setup();

    renderWithProviders(<Finance />);

    await screen.findByText('No se pudieron calcular las sumas');
    await user.click(screen.getByRole('tab', { name: getTranslation('es', 'finance.viewStatements') }));

    expect(screen.getByText('estado-febrero.pdf')).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it('muestra el error y guiones (no ceros) si falla statsQuery', async () => {
    mocks.getDashboardStats.mockRejectedValue(new Error('Resumen no disponible'));

    renderWithProviders(<Finance />);

    await screen.findByText('Resumen no disponible');
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it('impide cerrar el modal de nuevo movimiento mientras está guardando', async () => {
    let resolveCreate: (() => void) | undefined;
    mocks.createTransaction.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveCreate = resolve;
      })
    );
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Finance />);

    await screen.findByRole('button', { name: getTranslation('es', 'finance.newTransaction') });
    await user.click(screen.getByRole('button', { name: getTranslation('es', 'finance.newTransaction') }));

    await user.type(screen.getByLabelText(getTranslation('es', 'common.amount')), '150');
    await user.type(screen.getByLabelText(getTranslation('es', 'common.description')), 'Compra filtro');
    await user.click(screen.getByRole('button', { name: getTranslation('es', 'common.create') }));

    await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalledTimes(1));

    const cancelBtn = screen.getByRole('button', { name: getTranslation('es', 'common.cancel') });
    const closeBtn = screen.getByRole('button', { name: getTranslation('es', 'common.close') });
    expect(cancelBtn).toBeDisabled();
    expect(closeBtn).toBeDisabled();

    const overlay = container.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
    if (overlay) {
      await user.click(overlay);
    }
    expect(screen.getByLabelText(getTranslation('es', 'common.description'))).toBeInTheDocument();

    resolveCreate?.();
    await waitFor(() => {
      expect(screen.queryByLabelText(getTranslation('es', 'common.description'))).not.toBeInTheDocument();
    });
  });

  it('con comisiones apagado muestra "Pagos al personal" para planilla y "Comisiones" cuando está activo', async () => {
    mocks.getTransactions.mockResolvedValue([
      {
        id: 't-planilla',
        sede_id: SEDE_CENTRO.id,
        tipo: 'egreso',
        categoria: 'planilla',
        monto: 300,
        descripcion: 'Pago semanal',
        fecha: '2026-06-05',
        registrado_por: ADMIN_USER.id,
        creado_en: '2026-06-05T12:00:00Z',
      } as FinancialTransaction,
    ]);

    vi.stubEnv('VITE_MODULOS_APAGADOS', 'comisiones');
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<Finance />);

    expect(await screen.findByText('Pagos al personal')).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Comisiones' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getTranslation('es', 'finance.newTransaction') }));
    await user.selectOptions(screen.getByLabelText(getTranslation('es', 'common.type')), 'egreso');
    const categorySelect = screen.getByLabelText(getTranslation('es', 'common.category'));
    expect(categorySelect).toHaveTextContent('Pagos al personal');
    unmount();

    vi.unstubAllEnvs();
    renderWithProviders(<Finance />);
    expect(await screen.findByText('Comisiones')).toBeInTheDocument();
  });
});
