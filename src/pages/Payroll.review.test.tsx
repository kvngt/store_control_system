// @vitest-environment jsdom
//
// Comisiones: administración las revisa y las acepta en bloque, y solo se paga lo aceptado
// (decisión del taller, 05/10/2026; la base lo impone en `pay_commissions`, 20261010000018).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, authValue, ADMIN_USER } from '../test/renderWithProviders';
import type { Commission } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getCommissions: vi.fn(),
  getPayments: vi.fn(),
  approveMany: vi.fn(),
  payCommissions: vi.fn(),
  approveCommission: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({
  useAuth: () => mocks.auth.current,
}));

vi.mock('../services/supabaseService', async () => {
  const actual = await vi.importActual<typeof import('../services/commissions.service')>('../services/commissions.service');
  const commissions = {
    getCommissions: mocks.getCommissions,
    getPayments: mocks.getPayments,
    approveMany: mocks.approveMany,
    payCommissions: mocks.payCommissions,
    buildBalances: actual.commissionsService.buildBalances,
    uploadComprobante: vi.fn(),
    deletePayment: vi.fn(),
    signComprobante: vi.fn(),
  };
  const workOrders = { approveCommission: mocks.approveCommission };
  return {
    commissionsService: commissions,
    workOrdersService: workOrders,
    sedesService: { updateSede: vi.fn() },
  };
});

const { default: Payroll } = await import('./Payroll');

const MARIO = { id: 'u-mario', nombre_completo: 'Mario Mecánico', rol: 'mecanico' };

function commission(id: string, monto: number, estado: 'sugerida' | 'aceptada', numero: string): Commission {
  return {
    id,
    orden_id: `o-${id}`,
    usuario_id: MARIO.id,
    sede_id: 'sede-1',
    especialidad: 'mecanica',
    base_ganancia: monto * 2,
    porcentaje: 50,
    tecnicos: 1,
    monto,
    estado,
    pago_id: null,
    creado_en: '2026-10-05T12:00:00Z',
    usuario: MARIO as Commission['usuario'],
    orden: { id: `o-${id}`, numero_orden: numero, total_labor: monto * 2 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getPayments.mockResolvedValue([]);
  mocks.approveMany.mockResolvedValue(1);
  mocks.payCommissions.mockResolvedValue({});
});

describe('Payroll — revisar y pagar', () => {
  it('acepta en bloque lo que sigue sugerido', async () => {
    mocks.getCommissions.mockResolvedValue([
      commission('c-1', 52.5, 'sugerida', 'ORD-2026-001'),
      commission('c-2', 100, 'aceptada', 'ORD-2026-002'),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Payroll />);

    expect(await screen.findByText('1 por revisar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Aceptar todas \(1\)/ }));
    expect(mocks.approveMany).toHaveBeenCalledWith(['c-1']);
  });

  it('paga solo lo aceptado', async () => {
    mocks.getCommissions.mockResolvedValue([
      commission('c-1', 52.5, 'sugerida', 'ORD-2026-001'),
      commission('c-2', 100, 'aceptada', 'ORD-2026-002'),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Payroll />);

    await user.click(await screen.findByRole('button', { name: /Pagar lo aceptado/ }));
    const dialog = (await screen.findByRole('heading', { name: 'Pagar saldo' })).closest('.modal') as HTMLElement;
    expect(within(dialog).getByText('$100.00')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Número de cheque/i), '1042');
    await user.click(within(dialog).getByRole('button', { name: /Registrar pago/i }));

    expect(mocks.payCommissions).toHaveBeenCalledWith(
      expect.objectContaining({ usuario_id: MARIO.id, comision_ids: ['c-2'] })
    );
  });

  it('sin nada aceptado, no deja pagar', async () => {
    mocks.getCommissions.mockResolvedValue([commission('c-1', 52.5, 'sugerida', 'ORD-2026-001')]);
    renderWithProviders(<Payroll />);

    expect(await screen.findByRole('button', { name: /Pagar lo aceptado/ })).toBeDisabled();
  });
});
