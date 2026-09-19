/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthorizationReasonModal from './AuthorizationReasonModal';

vi.mock('../../context/language.context', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'es' }),
}));

afterEach(cleanup);

describe('AuthorizationReasonModal', () => {
  it('no guarda sin motivo, y lo dice dentro del diálogo', async () => {
    const onConfirm = vi.fn();
    render(<AuthorizationReasonModal saving={false} onCancel={vi.fn()} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByText('common.save'));

    expect(onConfirm).not.toHaveBeenCalled();
    // El modal tapa el recuadro de error de la página, así que el motivo se muestra aquí.
    expect(screen.getByRole('alert')).toHaveTextContent('workOrders.authorizationReasonRequired');
  });

  it('un motivo con solo espacios tampoco vale', async () => {
    const onConfirm = vi.fn();
    render(<AuthorizationReasonModal saving={false} onCancel={vi.fn()} onConfirm={onConfirm} />);

    await userEvent.type(screen.getByLabelText('workOrders.authorizationReason'), '   ');
    await userEvent.click(screen.getByText('common.save'));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('entrega el motivo sin los espacios de los extremos', async () => {
    const onConfirm = vi.fn();
    render(<AuthorizationReasonModal saving={false} onCancel={vi.fn()} onConfirm={onConfirm} />);

    await userEvent.type(screen.getByLabelText('workOrders.authorizationReason'), '  El radiador está picado  ');
    await userEvent.click(screen.getByText('common.save'));

    expect(onConfirm).toHaveBeenCalledWith('El radiador está picado');
  });

  it('cancelar no guarda nada', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<AuthorizationReasonModal saving={false} onCancel={onCancel} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByText('common.cancel'));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
