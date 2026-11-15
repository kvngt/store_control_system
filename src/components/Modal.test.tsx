// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import Modal from './Modal';
import ChoiceDialog from './ChoiceDialog';
import Combobox from './Combobox';

afterEach(() => {
  cleanup();
});

describe('Modal', () => {
  it('expone role="dialog", aria-modal, aria-labelledby apuntando al título y nombre accesible en la X', () => {
    renderWithProviders(
      <Modal title="Título del diálogo" onClose={vi.fn()}>
        <input aria-label="Nombre" />
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: 'Título del diálogo' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const heading = screen.getByRole('heading', { name: 'Título del diálogo' });
    expect(heading.id).not.toBe('');
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);

    const closeBtn = screen.getByRole('button', { name: 'Cerrar' });
    expect(closeBtn).toBeInTheDocument();
  });

  it('cierra con Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <Modal title="Con Escape" onClose={onClose}>
        <input aria-label="Campo" />
      </Modal>
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Un control que usa su Escape (el autocompletado de marca y modelo cierra su lista) no cierra
  // además el diálogo: con la escucha en captura, el diálogo se llevaba ese Escape.
  it('Escape en un autocompletado abierto cierra la lista, no el diálogo', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function WithCombobox() {
      const [value, setValue] = useState('');
      return (
        <Modal title="Vehículo" onClose={onClose}>
          <Combobox value={value} onChange={setValue} options={['Toyota', 'Tesla']} inputId="marca" />
        </Modal>
      );
    }
    renderWithProviders(<WithCombobox />);

    await user.type(screen.getByRole('combobox'), 'T');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('con closeDisabled=true no cierra con la X, el fondo ni Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <Modal title="Guardando" onClose={onClose} closeDisabled>
        <input aria-label="Campo" />
      </Modal>
    );

    const closeBtn = screen.getByRole('button', { name: 'Cerrar' });
    expect(closeBtn).toBeDisabled();

    fireEvent.click(closeBtn);
    fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('con dos Modal abiertos, Escape cierra solo el de arriba', async () => {
    const user = userEvent.setup();
    const onCloseFirst = vi.fn();
    const onCloseSecond = vi.fn();

    renderWithProviders(
      <>
        <Modal title="Primero" onClose={onCloseFirst}>
          <input aria-label="Campo primero" />
        </Modal>
        <Modal title="Segundo" onClose={onCloseSecond}>
          <input aria-label="Campo segundo" />
        </Modal>
      </>
    );

    await user.keyboard('{Escape}');
    expect(onCloseSecond).toHaveBeenCalledTimes(1);
    expect(onCloseFirst).not.toHaveBeenCalled();
  });

  it('con un ChoiceDialog abierto encima, Escape cierra solo la pregunta', async () => {
    const user = userEvent.setup();
    const onCloseModal = vi.fn();
    const onDismissChoice = vi.fn();

    renderWithProviders(
      <>
        <Modal title="Editor" onClose={onCloseModal}>
          <input aria-label="Nota" />
        </Modal>
        <ChoiceDialog
          title="¿Descartar?"
          body="Se perderán los cambios."
          actions={[{ label: 'Seguir', onClick: vi.fn(), variant: 'primary' }]}
          onDismiss={onDismissChoice}
        />
      </>
    );

    await user.keyboard('{Escape}');
    expect(onDismissChoice).toHaveBeenCalledTimes(1);
    expect(onCloseModal).not.toHaveBeenCalled();
  });

  it('lleva el foco al primer control del cuerpo al abrir y lo devuelve al botón que abrió al cerrar', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir diálogo
          </button>
          {open && (
            <Modal
              title="Con foco"
              onClose={() => setOpen(false)}
              footer={<button type="button">Guardar</button>}
            >
              <input aria-label="Primer campo" />
            </Modal>
          )}
        </>
      );
    }

    renderWithProviders(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Abrir diálogo' });
    await user.click(trigger);

    const firstInput = screen.getByLabelText('Primer campo');
    expect(document.activeElement).toBe(firstInput);
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Cerrar' }));

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('atrapa Tab desde el último control hacia el primero y Shift+Tab al revés', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Modal
        title="Trampa de foco"
        onClose={vi.fn()}
        footer={<button type="button">Guardar</button>}
      >
        <input aria-label="Campo" />
      </Modal>
    );

    const closeBtn = screen.getByRole('button', { name: 'Cerrar' });
    const saveBtn = screen.getByRole('button', { name: 'Guardar' });

    saveBtn.focus();
    expect(document.activeElement).toBe(saveBtn);

    await user.tab();
    expect(document.activeElement).toBe(closeBtn);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(saveBtn);
  });
});
