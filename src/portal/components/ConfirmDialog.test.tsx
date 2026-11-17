// @vitest-environment jsdom

import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

function DialogHarness({ initialBusy = false }: { initialBusy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir confirmación
      </button>
      {open && (
        <ConfirmDialog
          title="Confirmar autorización"
          message="¿Aprueba 2 trabajos por $300.00?"
          confirmLabel="Aprobar"
          cancelLabel="Volver"
          busy={initialBusy}
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

describe('ConfirmDialog', () => {
  it('enfoca inicialmente el botón "Volver" y atrapa Tab dentro del diálogo', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="Confirmar autorización"
        message="¿Aprueba 1 trabajo por $200.00?"
        confirmLabel="Aprobar"
        cancelLabel="Volver"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');

    const backBtn = screen.getByRole('button', { name: 'Volver' });
    const approveBtn = screen.getByRole('button', { name: 'Aprobar' });
    expect(backBtn).toHaveFocus();

    await user.tab();
    expect(approveBtn).toHaveFocus();

    await user.tab();
    expect(backBtn).toHaveFocus();

    await user.tab({ shift: true });
    expect(approveBtn).toHaveFocus();
  });

  it('Escape y clic en el fondo llaman a onCancel y devuelven el foco al botón que lo abrió', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    const opener = screen.getByRole('button', { name: 'Abrir confirmación' });
    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await user.click(opener);
    const overlay = document.querySelector('.portal-confirm-overlay') as HTMLElement;
    expect(overlay).not.toBeNull();
    await user.click(overlay);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('hacer clic dentro de la tarjeta no cierra el diálogo', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Confirmar autorización"
        message="Mensaje del diálogo"
        confirmLabel="Aprobar"
        cancelLabel="Volver"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByText('Mensaje del diálogo'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cuando busy es true apaga los dos botones y bloquea Escape y el fondo', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Confirmar autorización"
        message="Enviando…"
        confirmLabel="Aprobar"
        cancelLabel="Volver"
        busy={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole('button', { name: 'Volver' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled();

    await user.keyboard('{Escape}');
    const overlay = document.querySelector('.portal-confirm-overlay') as HTMLElement;
    await user.click(overlay);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
