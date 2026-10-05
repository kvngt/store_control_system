// @vitest-environment jsdom
//
// Las piezas de pantalla de las decisiones del taller del 05/10/2026
// (docs/analisis-del-proceso-2026-10.md): los totales con descuento, el costo y el pedido de
// un repuesto, y la retirada sin reparar. El dinero lo calcula la base; aquí se comprueba que
// la pantalla muestra sus cifras y manda lo que la base espera.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { WorkOrderPart } from '../../types/database';

const mocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
  getWithdrawalBalance: vi.fn(),
  withdrawWithoutRepair: vi.fn(),
  registerAdvance: vi.fn(),
  getPendingWork: vi.fn(),
  uploadReceipt: vi.fn(),
  removeDeliveryReceipt: vi.fn(),
}));

vi.mock('../../services/supabaseService', () => ({
  workOrdersService: {
    getBalance: mocks.getBalance,
    getWithdrawalBalance: mocks.getWithdrawalBalance,
    withdrawWithoutRepair: mocks.withdrawWithoutRepair,
    registerAdvance: mocks.registerAdvance,
    getPendingWork: mocks.getPendingWork,
    uploadReceipt: mocks.uploadReceipt,
    removeDeliveryReceipt: mocks.removeDeliveryReceipt,
  },
}));

const { default: OrderTotalsCard } = await import('./OrderTotalsCard');
const { default: PartsTable } = await import('./PartsTable');
const { default: WithdrawalModal } = await import('./WithdrawalModal');
const { default: AdvancePaymentModal } = await import('./AdvancePaymentModal');
const { default: PendingWorkNotice } = await import('./PendingWorkNotice');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('OrderTotalsCard', () => {
  const ORDER = { id: 'o1', total_labor: 450, estatus: 'en_proceso' as const, retirada_sin_reparar: false };

  it('muestra las cifras de la base: descuento, total, lo recibido y el saldo', async () => {
    mocks.getBalance.mockResolvedValue({ total: 750, cobrado: 100, saldo: 650 });
    renderWithProviders(
      <OrderTotalsCard
        order={ORDER}
        amounts={{ total_repuestos: 345, total_general: 750, deposito_inicial: 100, descuento: 45, descuento_motivo: 'Cliente frecuente' }}
        canDiscount
        onApplyDiscount={vi.fn()}
      />
    );
    expect(screen.getByText('−$45.00')).toBeInTheDocument();
    expect(screen.getByText('Cliente frecuente')).toBeInTheDocument();
    expect(screen.getByText('$750.00')).toBeInTheDocument();
    expect(await screen.findByText('$650.00')).toBeInTheDocument();
    expect(screen.getByText('Saldo pendiente')).toBeInTheDocument();
  });

  it('un saldo negativo es a favor del cliente', async () => {
    mocks.getBalance.mockResolvedValue({ total: 50, cobrado: 200, saldo: -150 });
    renderWithProviders(
      <OrderTotalsCard
        order={ORDER}
        amounts={{ total_repuestos: 0, total_general: 50, deposito_inicial: 200 }}
        canDiscount={false}
        onApplyDiscount={vi.fn()}
      />
    );
    expect(await screen.findByText('Saldo a favor del cliente')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
  });

  it('aplica el descuento con su motivo', async () => {
    mocks.getBalance.mockResolvedValue({ total: 795, cobrado: 100, saldo: 695 });
    const onApplyDiscount = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <OrderTotalsCard
        order={ORDER}
        amounts={{ total_repuestos: 345, total_general: 795, deposito_inicial: 100 }}
        canDiscount
        onApplyDiscount={onApplyDiscount}
      />
    );
    await user.click(screen.getByRole('button', { name: /Aplicar descuento/ }));
    await user.type(screen.getByLabelText('Descuento ($)'), '45');
    await user.type(screen.getByLabelText('Motivo'), 'Cortesía');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApplyDiscount).toHaveBeenCalledWith({ monto: 45 }, 'Cortesía');
  });

  it('el descuento también va en porcentaje: lo convierte la base', async () => {
    mocks.getBalance.mockResolvedValue({ total: 795, cobrado: 100, saldo: 695 });
    const onApplyDiscount = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <OrderTotalsCard
        order={ORDER}
        amounts={{ total_repuestos: 345, total_general: 795, deposito_inicial: 100 }}
        canDiscount
        onApplyDiscount={onApplyDiscount}
      />
    );
    await user.click(screen.getByRole('button', { name: /Aplicar descuento/ }));
    await user.click(screen.getByRole('radio', { name: 'En porcentaje' }));
    await user.type(screen.getByLabelText('Descuento (%)'), '10');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApplyDiscount).toHaveBeenCalledWith({ porcentaje: 10 }, null);
  });

  it('ofrece registrar un anticipo', async () => {
    mocks.getBalance.mockResolvedValue({ total: 795, cobrado: 100, saldo: 695 });
    const onRegisterAdvance = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <OrderTotalsCard
        order={ORDER}
        amounts={{ total_repuestos: 345, total_general: 795, deposito_inicial: 100 }}
        canDiscount
        onApplyDiscount={vi.fn()}
        onRegisterAdvance={onRegisterAdvance}
      />
    );
    expect(screen.getByText('Depósito y anticipos')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Registrar anticipo/ }));
    expect(onRegisterAdvance).toHaveBeenCalled();
  });
});

describe('PartsTable: costo y pedido', () => {
  const PARTS: WorkOrderPart[] = [
    { id: 'p1', orden_id: 'o1', descripcion: 'Filtro', cantidad: 1, costo_unitario: 20, precio_venta_unitario: 20, subtotal: 20, estado: 'aprobado' },
    { id: 'p2', orden_id: 'o1', descripcion: 'Amortiguador', cantidad: 2, costo_unitario: 90, precio_venta_unitario: 150, subtotal: 300, estado: 'aprobado', estado_pedido: 'pedido' },
  ];

  it('agrega un repuesto con su costo, y sin costo si se deja vacío', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <PartsTable items={[]} canEdit busy={false} onAdd={onAdd} onUpdate={vi.fn()} onRemove={vi.fn()} onSetOrderState={vi.fn()} />
    );
    await user.type(screen.getByPlaceholderText('Descripción'), 'Bujía');
    await user.type(screen.getByPlaceholderText('Precio'), '12');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(onAdd).toHaveBeenLastCalledWith({ descripcion: 'Bujía', cantidad: 1, precio_venta_unitario: 12, costo_unitario: null });

    await user.type(screen.getByPlaceholderText('Descripción'), 'Bujía');
    await user.type(screen.getByPlaceholderText('Precio'), '12');
    await user.type(screen.getByPlaceholderText('Costo (opcional)'), '7');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(onAdd).toHaveBeenLastCalledWith({ descripcion: 'Bujía', cantidad: 1, precio_venta_unitario: 12, costo_unitario: 7 });
  });

  it('marca una pieza como llegada', async () => {
    const onSetOrderState = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <PartsTable items={PARTS} canEdit busy={false} onAdd={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} onSetOrderState={onSetOrderState} />
    );
    const row = screen.getByText('Amortiguador').closest('tr') as HTMLElement;
    await user.selectOptions(within(row).getByLabelText('Pedido de la pieza'), 'recibido');
    expect(onSetOrderState).toHaveBeenCalledWith('p2', 'recibido');
  });
});

describe('WithdrawalModal', () => {
  const ORDER = { id: 'o1', numero_orden: 'ORD-2026-009', sede_id: 's1' };
  const LINES = [
    { id: 'l1', tipo: 'mano_obra' as const, descripcion: 'Reparar motor', monto: 1000 },
    { id: 'l2', tipo: 'mano_obra' as const, descripcion: 'Frenos', monto: 200 },
    { id: 'p1', tipo: 'repuesto' as const, descripcion: 'Pastillas', monto: 80 },
  ];
  const AMOUNTS: Record<string, number> = { l1: 1000, l2: 200, p1: 80 };

  beforeEach(() => {
    // La base: lo recibido es $200; se cobra lo conservado más la revisión.
    mocks.getWithdrawalBalance.mockImplementation(async (_id: string, cobro: number, conservar: string[] = []) => {
      const trabajos = conservar.reduce((sum, id) => sum + AMOUNTS[id], 0);
      return { cobrado: 200, trabajos, revision: cobro, cobro: trabajos + cobro, saldo: trabajos + cobro - 200 };
    });
    mocks.withdrawWithoutRepair.mockResolvedValue({ saldo: -200, tipo: 'egreso', movimiento_id: 'm1' });
  });

  it('se canceló todo: no se cobra nada y se devuelve lo que dejó', async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalModal order={ORDER} lines={LINES} onCancel={vi.fn()} onDone={onDone} />);

    // Lo recibido y lo que se devuelve: $200 los dos.
    expect((await screen.findAllByText('$200.00')).length).toBe(2);
    expect(mocks.getWithdrawalBalance).toHaveBeenLastCalledWith('o1', 0, []);
    await user.selectOptions(screen.getByLabelText('Cómo se le devuelve'), 'efectivo');
    await user.click(screen.getByRole('button', { name: /devolver/i }));

    await waitFor(() =>
      expect(mocks.withdrawWithoutRepair).toHaveBeenCalledWith({
        orderId: 'o1', cobro: 0, concepto: null, metodo: 'efectivo', numeroCheque: null, comprobanteRuta: null, conservar: [],
      })
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('solo la revisión: se cobra la revisión y se devuelve el resto', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalModal order={ORDER} lines={LINES} onCancel={vi.fn()} onDone={vi.fn()} />);

    await user.click(screen.getByRole('radio', { name: /Solo se cobra la revisión/ }));
    await user.type(screen.getByLabelText('Se cobra ($)'), '50');
    await waitFor(() => expect(mocks.getWithdrawalBalance).toHaveBeenLastCalledWith('o1', 50, []));
    expect(await screen.findByText('$150.00')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Cómo se le devuelve'), 'zelle');
    await user.click(screen.getByRole('button', { name: /devolver/i }));
    await waitFor(() =>
      expect(mocks.withdrawWithoutRepair).toHaveBeenCalledWith(
        expect.objectContaining({ cobro: 50, concepto: 'Revisión del vehículo', metodo: 'zelle', conservar: [] })
      )
    );
  });

  it('algunos trabajos: se cobran los que se hicieron, y si falta, se cobra la diferencia', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalModal order={ORDER} lines={LINES} onCancel={vi.fn()} onDone={vi.fn()} />);

    await user.click(screen.getByRole('radio', { name: /Se hicieron algunos trabajos/ }));
    await user.click(screen.getByRole('checkbox', { name: /Frenos/ }));
    await user.click(screen.getByRole('checkbox', { name: /Pastillas/ }));
    await waitFor(() => expect(mocks.getWithdrawalBalance).toHaveBeenLastCalledWith('o1', 0, ['l2', 'p1']));
    // $280 de trabajos − $200 recibidos: se cobran $80.
    expect(await screen.findByRole('button', { name: /cobrar \$80\.00/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Cómo pagó el cliente'), 'tarjeta');
    await user.click(screen.getByRole('button', { name: /cobrar/i }));
    await waitFor(() =>
      expect(mocks.withdrawWithoutRepair).toHaveBeenCalledWith(
        expect.objectContaining({ cobro: 0, metodo: 'tarjeta', conservar: ['l2', 'p1'] })
      )
    );
  });

  it('sin trabajos marcados, "algunos trabajos" no cierra', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalModal order={ORDER} lines={LINES} onCancel={vi.fn()} onDone={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /Se hicieron algunos trabajos/ }));
    await waitFor(() => expect(mocks.getWithdrawalBalance).toHaveBeenLastCalledWith('o1', 0, []));
    await screen.findByText('Hay que devolver al cliente');
    await user.selectOptions(screen.getByLabelText('Cómo se le devuelve'), 'efectivo');
    await user.click(screen.getByRole('button', { name: /devolver/i }));
    expect(await screen.findByText('Marca los trabajos que sí se hicieron.')).toBeInTheDocument();
    expect(mocks.withdrawWithoutRepair).not.toHaveBeenCalled();
  });
});

describe('AdvancePaymentModal', () => {
  it('registra el anticipo con su método', async () => {
    mocks.registerAdvance.mockResolvedValue({ anticipos: 300, saldo: 500 });
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <AdvancePaymentModal order={{ id: 'o1', numero_orden: 'ORD-2026-009', sede_id: 's1' }} onCancel={vi.fn()} onDone={onDone} />
    );
    await user.type(screen.getByLabelText('Monto ($)'), '200');
    await user.selectOptions(screen.getByLabelText('Cómo pagó el cliente'), 'zelle');
    await user.click(screen.getByRole('button', { name: /Registrar \$200\.00/ }));
    await waitFor(() =>
      expect(mocks.registerAdvance).toHaveBeenCalledWith({
        orderId: 'o1', monto: 200, metodo: 'zelle', numeroCheque: null, comprobanteRuta: null,
      })
    );
    expect(onDone).toHaveBeenCalled();
  });
});

describe('PendingWorkNotice', () => {
  it('muestra lo que el cliente dejó pendiente en otras visitas', async () => {
    mocks.getPendingWork.mockResolvedValue([
      { tipo: 'mano_obra', descripcion: 'Amortiguadores', monto: 400, orden_id: 'o0', numero_orden: 'ORD-2026-001', fecha: '2026-09-10T15:00:00Z', retirada: false },
    ]);
    renderWithProviders(<PendingWorkNotice vehicleId="v1" excludeOrderId="o1" />);
    expect(await screen.findByText('Pendiente de visitas anteriores')).toBeInTheDocument();
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument();
    expect(mocks.getPendingWork).toHaveBeenCalledWith('v1', 'o1');
  });

  it('sin pendientes no muestra nada', async () => {
    mocks.getPendingWork.mockResolvedValue([]);
    const { container } = renderWithProviders(<PendingWorkNotice vehicleId="v1" />);
    await waitFor(() => expect(mocks.getPendingWork).toHaveBeenCalled());
    expect(container.querySelector('.pending-work')).toBeNull();
  });
});
