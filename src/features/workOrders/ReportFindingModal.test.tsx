// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { resetBackButtonTrapsForTests } from '../../lib/backButtonTrap';
import ReportFindingModal from './ReportFindingModal';

/** El «atrás» de Android: gasta la entrada de arriba del historial. */
const atras = () => act(() => { window.history.back(); });
/** El `history.go` de una trampa al soltarse llega en otra tarea. */
const asentar = () => new Promise((r) => setTimeout(r, 40));

beforeEach(() => {
  resetBackButtonTrapsForTests();
  window.history.replaceState({ idx: 0, key: 'base' }, '', '/');
});

afterEach(async () => {
  cleanup();
  await asentar();
});

function abrir(saving = false) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn(async () => true);
  renderWithProviders(<ReportFindingModal saving={saving} onCancel={onCancel} onConfirm={onConfirm} />);
  return { onCancel, onConfirm };
}

describe('ReportFindingModal: no se pierde lo escrito (pedido del taller, 04/11/2026)', () => {
  it('sin nada escrito, «atrás» cierra el diálogo sin preguntar', async () => {
    const { onCancel } = abrir();
    atras();
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('con algo escrito, «atrás» pregunta, y «Seguir editando» deja todo como estaba', async () => {
    const user = userEvent.setup();
    const { onCancel } = abrir();
    await user.type(screen.getByLabelText('Qué encontraste'), 'Fuga en el radiador');

    atras();
    const pregunta = await screen.findByRole('alertdialog');
    expect(pregunta).toHaveTextContent('¿Descartar el trabajo adicional?');
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Fuga en el radiador')).toBeInTheDocument();

    // La trampa se volvió a armar: el siguiente «atrás» vuelve a preguntar.
    atras();
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('con la pregunta abierta, «atrás» la cierra y se sigue editando', async () => {
    const user = userEvent.setup();
    const { onCancel } = abrir();
    await user.type(screen.getByLabelText('Qué encontraste'), 'Ruido');

    atras();
    await screen.findByRole('alertdialog');
    atras();
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Ruido')).toBeInTheDocument();

    // La trampa se volvió a armar: un tercer «atrás» pregunta otra vez, no sale de la orden.
    expect(window.history.state).toMatchObject({ restorifyTrap: expect.any(Number) });
    atras();
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('«Descartar» cierra sin guardar', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = abrir();
    await user.type(screen.getByLabelText('Qué encontraste'), 'Ruido');

    atras();
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // Antes un toque fuera del diálogo lo borraba todo sin preguntar.
  it('tocar fuera del diálogo o «Cancelar», con algo escrito, también pregunta', async () => {
    const user = userEvent.setup();
    const { onCancel } = abrir();
    await user.type(screen.getByLabelText('Qué encontraste'), 'Ruido');

    fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('mientras guarda, «atrás» no cierra nada, y el siguiente tampoco', async () => {
    const { onCancel } = abrir(true);
    atras();
    await asentar();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Se volvió a armar: el guardado en el aire no se pierde con otro «atrás».
    expect(window.history.state).toMatchObject({ restorifyTrap: expect.any(Number) });
    atras();
    await asentar();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('B-08: el botón no se apaga vacío y al tocarlo avisa qué falta y enfoca', async () => {
    const user = userEvent.setup();
    const { onConfirm } = abrir();
    const submit = screen.getByRole('button', { name: 'Reportar y pausar la orden' });
    const textarea = screen.getByLabelText('Qué encontraste');

    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Describe lo que encontraste antes de reportarlo.');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveFocus();

    await user.type(textarea, 'Balero dañado');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute('aria-invalid');
  });
});
