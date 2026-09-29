// @vitest-environment jsdom
//
// Entregar una orden (reunión con el taller, sept. 2026): el diálogo muestra lo que falta
// cobrar o devolver según la base, pide cómo pagó el cliente, el número del cheque y la foto
// del comprobante, y entrega por la RPC. Antes era un `confirm` y el pago quedaba sin método.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
  deliver: vi.fn(),
  uploadDeliveryReceipt: vi.fn(),
  removeDeliveryReceipt: vi.fn(),
}));

vi.mock('../../services/supabaseService', () => ({ workOrdersService: mocks }));

const { default: DeliveryModal } = await import('./DeliveryModal');

const ORDER = { id: 'ord-1', numero_orden: 'ORD-2026-007', sede_id: 'sede-centro' };

function renderModal(overrides: { onDelivered?: () => void; onCancel?: () => void } = {}) {
  const onDelivered = overrides.onDelivered ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  renderWithProviders(<DeliveryModal order={ORDER} onDelivered={onDelivered} onCancel={onCancel} />);
  return { onDelivered, onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deliver.mockResolvedValue({ saldo: 0, tipo: null, movimiento_id: null });
  mocks.removeDeliveryReceipt.mockResolvedValue(undefined);
});

describe('DeliveryModal', () => {
  it('muestra lo que falta cobrar según la base', async () => {
    mocks.getBalance.mockResolvedValue({ total: 500, cobrado: 100, saldo: 400 });
    renderModal();

    expect(await screen.findByText('Falta cobrar')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entregar y cobrar $400.00' })).toBeInTheDocument();
    expect(mocks.getBalance).toHaveBeenCalledWith('ord-1');
  });

  it('sin método no entrega: lo pide dentro del diálogo', async () => {
    mocks.getBalance.mockResolvedValue({ total: 500, cobrado: 100, saldo: 400 });
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByRole('button', { name: /Entregar y cobrar/ }));

    expect(screen.getByText('Elige cómo pagó el cliente.')).toBeInTheDocument();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it('un cheque pide su número o su foto, y el número viaja limpio', async () => {
    mocks.getBalance.mockResolvedValue({ total: 500, cobrado: 100, saldo: 400 });
    const user = userEvent.setup();
    const { onDelivered } = renderModal();

    await user.selectOptions(await screen.findByLabelText('Cómo pagó el cliente'), 'cheque');
    await user.click(screen.getByRole('button', { name: /Entregar y cobrar/ }));
    expect(screen.getByText('Anota el número del cheque o sube su foto.')).toBeInTheDocument();
    expect(mocks.deliver).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Número de cheque'), ' 1042 ');
    await user.click(screen.getByRole('button', { name: /Entregar y cobrar/ }));

    await waitFor(() =>
      expect(mocks.deliver).toHaveBeenCalledWith({ orderId: 'ord-1', metodo: 'cheque', numeroCheque: '1042', comprobanteRuta: null })
    );
    expect(onDelivered).toHaveBeenCalled();
  });

  it('sube el comprobante a la carpeta de la sede y lo manda con la entrega', async () => {
    mocks.getBalance.mockResolvedValue({ total: 500, cobrado: 100, saldo: 400 });
    mocks.uploadDeliveryReceipt.mockResolvedValue('sede-centro/entrega-ORD-2026-007-1.jpg');
    const user = userEvent.setup();
    renderModal();

    const foto = new File(['jpg'], 'transferencia.jpg', { type: 'image/jpeg' });
    await user.selectOptions(await screen.findByLabelText('Cómo pagó el cliente'), 'transferencia');
    await user.upload(screen.getByLabelText('Foto del comprobante (opcional)'), foto);
    await user.click(screen.getByRole('button', { name: /Entregar y cobrar/ }));

    await waitFor(() => expect(mocks.deliver).toHaveBeenCalled());
    expect(mocks.uploadDeliveryReceipt).toHaveBeenCalledWith('sede-centro', 'ORD-2026-007', foto);
    expect(mocks.deliver).toHaveBeenCalledWith({
      orderId: 'ord-1',
      metodo: 'transferencia',
      numeroCheque: null,
      comprobanteRuta: 'sede-centro/entrega-ORD-2026-007-1.jpg',
    });
  });

  it('si la entrega falla, borra el comprobante que subió y lo dice dentro del diálogo', async () => {
    mocks.getBalance.mockResolvedValue({ total: 500, cobrado: 100, saldo: 400 });
    mocks.uploadDeliveryReceipt.mockResolvedValue('sede-centro/entrega-ORD-2026-007-1.jpg');
    mocks.deliver.mockRejectedValue({ code: '42501', message: 'La orden ya fue entregada.' });
    const user = userEvent.setup();
    const { onDelivered } = renderModal();

    await user.selectOptions(await screen.findByLabelText('Cómo pagó el cliente'), 'efectivo');
    await user.upload(screen.getByLabelText('Foto del comprobante (opcional)'), new File(['x'], 'r.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: /Entregar y cobrar/ }));

    expect(await screen.findByText('La orden ya fue entregada.')).toBeInTheDocument();
    expect(mocks.removeDeliveryReceipt).toHaveBeenCalledWith('sede-centro/entrega-ORD-2026-007-1.jpg');
    expect(onDelivered).not.toHaveBeenCalled();
  });

  it('si el depósito supera el total, ofrece devolver la diferencia', async () => {
    mocks.getBalance.mockResolvedValue({ total: 500, cobrado: 800, saldo: -300 });
    const user = userEvent.setup();
    renderModal();

    expect(await screen.findByText('Hay que devolver al cliente')).toBeInTheDocument();
    expect(screen.getByText('$300.00')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Cómo se le devuelve'), 'efectivo');
    await user.click(screen.getByRole('button', { name: 'Entregar y devolver $300.00' }));

    await waitFor(() =>
      expect(mocks.deliver).toHaveBeenCalledWith({ orderId: 'ord-1', metodo: 'efectivo', numeroCheque: null, comprobanteRuta: null })
    );
  });

  it('sin nada pendiente no pide método', async () => {
    mocks.getBalance.mockResolvedValue({ total: 500, cobrado: 500, saldo: 0 });
    const user = userEvent.setup();
    renderModal();

    expect(await screen.findByText('No hay nada pendiente de cobro.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cómo pagó el cliente')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entregar' }));

    await waitFor(() =>
      expect(mocks.deliver).toHaveBeenCalledWith({ orderId: 'ord-1', metodo: null, numeroCheque: null, comprobanteRuta: null })
    );
  });

  it('si no pudo calcular el saldo, no deja entregar a ciegas', async () => {
    mocks.getBalance.mockRejectedValue(new Error('network'));
    renderModal();

    expect(await screen.findByText(/No se pudo calcular lo que falta cobrar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entregar' })).toBeDisabled();
  });
});
