// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, authValue, ADMIN_USER } from '../test/renderWithProviders';
import type { DashboardStats } from '../types/database';

const EMPTY_STATS: DashboardStats = {
  ordenes_activas: 0,
  ordenes_finalizadas_mes: 0,
  ingresos_mes: 0,
  egresos_mes: 0,
  ingresos_total: 0,
  egresos_total: 0,
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

const mocks = vi.hoisted(() => ({
  getTransactions: vi.fn(async () => []),
  getImportBatches: vi.fn(async () => []),
  getStatementSummaries: vi.fn(async () => []),
  getDashboardStats: vi.fn(),
  getWorkOrders: vi.fn(async () => []),
}));

vi.mock('../context/auth.context', () => ({
  useAuth: () => authValue(ADMIN_USER),
}));

vi.mock('../services/finance.service', () => ({
  financeService: {
    getTransactions: mocks.getTransactions,
    getImportBatches: mocks.getImportBatches,
    getStatementSummaries: mocks.getStatementSummaries,
    createTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    deleteImportBatch: vi.fn(),
  },
}));

vi.mock('../services/dashboard.service', () => ({
  dashboardService: {
    getDashboardStats: mocks.getDashboardStats,
  },
  shopTimeZone: () => 'America/New_York',
}));

vi.mock('../services/workOrders.service', () => ({
  workOrdersService: {
    getWorkOrders: mocks.getWorkOrders,
  },
}));

vi.mock('../services/commissions.service', () => ({
  commissionsService: {
    signComprobante: vi.fn(async () => ''),
  },
}));

vi.mock('../features/finance/OrderMarginCard', () => ({
  default: () => <div data-testid="order-margin-card" />,
}));

vi.mock('../features/finance/WorkshopMetricsTab', () => ({
  default: () => <div data-testid="workshop-metrics-tab" />,
}));

const { default: Finance } = await import('./Finance');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDashboardStats.mockResolvedValue(EMPTY_STATS);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Finance — módulos estados_de_cuenta e indicadores', () => {
  it('muestra las tres vistas cuando ambos módulos están encendidos', async () => {
    renderWithProviders(<Finance />);

    expect(await screen.findByRole('tab', { name: 'Movimientos del taller' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Estados de cuenta (contabilidad)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Indicadores' })).toBeInTheDocument();
    expect(mocks.getImportBatches).toHaveBeenCalled();
  });

  it('oculta Estados de cuenta y no consulta importaciones cuando estados_de_cuenta está apagado', async () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'estados_de_cuenta');
    renderWithProviders(<Finance />);

    expect(await screen.findByRole('tab', { name: 'Movimientos del taller' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Estados de cuenta (contabilidad)' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Indicadores' })).toBeInTheDocument();
    expect(mocks.getImportBatches).not.toHaveBeenCalled();
    expect(mocks.getStatementSummaries).not.toHaveBeenCalled();
  });

  it('oculta Indicadores cuando indicadores está apagado', async () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'indicadores');
    renderWithProviders(<Finance />);

    expect(await screen.findByRole('tab', { name: 'Movimientos del taller' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Estados de cuenta (contabilidad)' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Indicadores' })).not.toBeInTheDocument();
  });

  it('oculta el selector de vistas cuando solo queda Movimientos del taller', async () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'estados_de_cuenta,indicadores');
    renderWithProviders(<Finance />);

    expect(await screen.findByRole('heading', { name: 'Control Financiero' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva Transacción' })).toBeInTheDocument();
  });
});
