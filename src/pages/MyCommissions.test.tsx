// @vitest-environment jsdom
//
// "Mis comisiones" del técnico (pedido del taller del 06/10/2026): lo aceptado por cobrar y el
// historial de pagos. Los totales son los de la base; la pantalla no suma dinero.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  getMyCommissions: vi.fn(),
  getMyPayments: vi.fn(),
  getMySummary: vi.fn(),
}));

vi.mock('../services/commissions.service', () => ({ commissionsService: mocks }));
vi.mock('../context/auth.context', () => ({
  useAuth: () => ({ user: { id: 'u-mario', rol: 'mecanico', nombre_completo: 'Mario' } }),
}));

const { default: MyCommissions } = await import('./MyCommissions');

const commission = (id: string, extra: Record<string, unknown>) => ({
  id, orden_id: 'o-1', usuario_id: 'u-mario', sede_id: 's-1', especialidad: 'mecanica', base_ganancia: 100,
  porcentaje: 40, tecnicos: 1, monto: 40, estado: 'aceptada', pago_id: null, creado_en: '2026-10-05T10:00:00Z',
  orden: { id: 'o-1', numero_orden: 'ORD-2026-010' }, labor: { descripcion: 'Cambio de aceite' }, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyCommissions.mockResolvedValue([
    commission('c1', {}),
    commission('c2', { pago_id: 'p1', monto: 75, labor: { descripcion: 'Frenos' }, orden: { id: 'o-2', numero_orden: 'ORD-2026-008' } }),
  ]);
  mocks.getMyPayments.mockResolvedValue([
    { id: 'p1', sede_id: 's-1', usuario_id: 'u-mario', monto: 75, fecha_pago: '2026-10-01', metodo: 'cheque', numero_cheque: '1001', creado_en: '2026-10-01T10:00:00Z' },
  ]);
  mocks.getMySummary.mockResolvedValue({ por_cobrar: 40, pagado_mes: 75, pagado_total: 75, pagos: 1 });
});

describe('MyCommissions', () => {
  it('muestra los totales de la base, lo que tiene por cobrar y sus pagos', async () => {
    renderWithProviders(<MyCommissions />);

    expect(await screen.findByRole('heading', { name: 'Mis comisiones' })).toBeInTheDocument();
    expect(screen.getByText('Por cobrar').closest('.stat-card')).toHaveTextContent('$40.00');
    expect(screen.getByText('Pagado en total').closest('.stat-card')).toHaveTextContent('$75.00');

    const pending = screen.getByRole('region', { name: 'Aceptadas, por cobrar' });
    expect(within(pending).getByText('Cambio de aceite')).toBeInTheDocument();
    expect(within(pending).queryByText('Frenos')).toBeNull();

    const history = screen.getByRole('region', { name: 'Historial de pagos' });
    expect(within(history).getByText(/Cheque/)).toHaveTextContent('1001');
    expect(within(history).getByText('ORD-2026-008 · Frenos')).toBeInTheDocument();
  });

  it('sin la función de totales en la base, muestra las listas igual', async () => {
    mocks.getMySummary.mockRejectedValue({ code: 'PGRST202' });
    renderWithProviders(<MyCommissions />);

    expect(await screen.findByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.queryByText('Pagado en total')).toBeNull();
  });
});
