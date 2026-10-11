// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import OrderInsuranceModal from './OrderInsuranceModal';

describe('OrderInsuranceModal', () => {
  const defaultOrder = {
    id: 'ord-123',
    numero_orden: 'ORD-2026-001',
    con_seguro: false,
    aseguradora: null,
    numero_reclamo: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permite marcar seguro, llenar aseguradora y reclamo, y guardar', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <OrderInsuranceModal order={defaultOrder} onSave={onSave} onClose={onClose} />
    );

    const checkbox = screen.getByLabelText(/trabajo con seguro/i);
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByLabelText(/aseguradora/i)).not.toBeInTheDocument();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    const insurerInput = screen.getByLabelText(/aseguradora/i);
    const claimInput = screen.getByLabelText(/número de reclamo/i);

    await user.type(insurerInput, 'State Farm');
    await user.type(claimInput, 'CLM-998877');

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onSave).toHaveBeenCalledWith({
      con_seguro: true,
      aseguradora: 'State Farm',
      numero_reclamo: 'CLM-998877',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('si desmarca seguro, envía con_seguro false y aseguradora/reclamo null', async () => {
    const insuredOrder = {
      id: 'ord-456',
      numero_orden: 'ORD-2026-002',
      con_seguro: true,
      aseguradora: 'Geico',
      numero_reclamo: 'REC-123',
    };
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <OrderInsuranceModal order={insuredOrder} onSave={onSave} onClose={onClose} />
    );

    const checkbox = screen.getByLabelText(/trabajo con seguro/i);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onSave).toHaveBeenCalledWith({
      con_seguro: false,
      aseguradora: null,
      numero_reclamo: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('muestra error si onSave falla y no cierra el modal', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Fallo al actualizar seguro'));
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <OrderInsuranceModal order={defaultOrder} onSave={onSave} onClose={onClose} />
    );

    await user.click(screen.getByLabelText(/trabajo con seguro/i));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByText('Fallo al actualizar seguro')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cierra el modal al presionar Cancelar o la X', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <OrderInsuranceModal order={defaultOrder} onSave={onSave} onClose={onClose} />
    );

    await user.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText(/cerrar/i));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });
});
