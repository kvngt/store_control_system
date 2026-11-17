// @vitest-environment jsdom
//
// Un avance ahora puede ser solo una nota de voz o solo un video: explicar una
// falla grabándola es más rápido que escribirla con los guantes puestos.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { useUnsavedChanges } from '../../context/unsavedChanges.context';
import type { PreparedMedia } from '../../types/database';

const VOICE_NOTE: PreparedMedia = {
  tipo: 'audio',
  blob: new Blob(['voz'], { type: 'audio/mp4' }),
  mime: 'audio/mp4',
  thumb: null,
  duracionSeg: 14,
  ancho: null,
  alto: null,
};

// La barra de captura abre la cámara y el micrófono, que jsdom no tiene. Se
// reemplaza por un botón que entrega una nota de voz ya grabada.
vi.mock('../media/MediaCaptureBar', () => ({
  default: ({ onAdd }: { onAdd: (items: PreparedMedia[]) => void }) => (
    <button type="button" onClick={() => onAdd([VOICE_NOTE])}>
      grabar-nota-fake
    </button>
  ),
}));
vi.mock('../media/useSignedUrls', () => ({ useSignedUrls: () => ({ urls: {}, loading: false }) }));

const { default: ProgressLog } = await import('./ProgressLog');

function renderLog(overrides: Partial<Parameters<typeof ProgressLog>[0]> = {}) {
  const props = {
    entries: [],
    media: [],
    pending: [],
    canEdit: true,
    busy: false,
    isAdmin: false,
    userId: 'user-mecanico',
    onAdd: vi.fn(async () => true),
    onRemove: vi.fn(async () => {}),
    onToggleEntryVisibility: vi.fn(),
    onToggleVisibility: vi.fn(),
    onDeleteMedia: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<ProgressLog {...props} />);
  return props;
}

describe('ProgressLog', () => {
  it('no deja enviar un avance vacío', () => {
    renderLog();
    expect(screen.getByRole('button', { name: /Agregar Avance/i })).toBeDisabled();
  });

  it('acepta un avance que es solo una nota de voz, sin texto', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const props = renderLog();
    const user = userEvent.setup();

    await user.click(screen.getByText('grabar-nota-fake'));
    const submit = screen.getByRole('button', { name: /Agregar Avance/i });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(props.onAdd).toHaveBeenCalledWith('', [VOICE_NOTE], undefined, undefined);
  });

  // 06/10/2026: un avance registrado desde una tarea no decía de cuál era.
  it('asocia el avance a la tarea elegida y marca de qué tarea es cada uno', async () => {
    const props = renderLog({
      tasks: [{ id: 'lab-1', descripcion: 'Cambio de frenos' }],
      taskNames: { 'lab-1': 'Cambio de frenos' },
      entries: [{ id: 'av-1', orden_id: 'o-1', usuario_id: 'user-mecanico', descripcion: 'Pastillas puestas', creado_en: '2026-10-06T15:00:00Z', labor_id: 'lab-1' }],
    });
    const user = userEvent.setup();

    expect(screen.getByText('Tarea: Cambio de frenos')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/.+/), 'Discos rectificados');
    await user.selectOptions(screen.getByLabelText('Tarea'), 'lab-1');
    await user.click(screen.getByRole('button', { name: /Agregar Avance/i }));
    expect(props.onAdd).toHaveBeenCalledWith('Discos rectificados', [], undefined, 'lab-1');
  });

  // El aviso cambió con los avances publicables: ya no es administración quien decide,
  // sino el técnico con el interruptor del ojo.
  it('explica que el avance nace interno y cómo mostrarlo al cliente', () => {
    renderLog();
    expect(screen.getByText(/nace interno/i)).toBeInTheDocument();
    expect(screen.getByText(/lo muestras al cliente/i)).toBeInTheDocument();
  });

  it('no muestra el formulario a quien no puede editar la orden', () => {
    renderLog({ canEdit: false });
    expect(screen.queryByRole('button', { name: /Agregar Avance/i })).not.toBeInTheDocument();
  });
});

describe('ProgressLog y el botón «atrás» (04/11/2026)', () => {
  it('con una nota escrita, «atrás» pregunta en vez de salir de la orden; sin nada, no hay trampa', async () => {
    const { act } = await import('@testing-library/react');
    const { resetBackButtonTrapsForTests } = await import('../../lib/backButtonTrap');
    resetBackButtonTrapsForTests();
    window.history.replaceState({ idx: 0, key: 'base' }, '', '/');
    const user = userEvent.setup();
    renderLog();

    // Sin nada escrito no se deja ninguna entrada de reserva: «atrás» sale como siempre.
    expect((window.history.state as { restorifyTrap?: number }).restorifyTrap).toBeUndefined();

    await user.type(screen.getByPlaceholderText(/Describe el trabajo realizado/), 'Se cambió el empaque');
    expect(window.history.state).toMatchObject({ restorifyTrap: 1 });

    act(() => { window.history.back(); });
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('¿Descartar este avance?');
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByDisplayValue('Se cambió el empaque')).toBeInTheDocument();

    // La trampa se volvió a armar: el siguiente «atrás» pregunta otra vez, y «Descartar» vacía el avance.
    act(() => { window.history.back(); });
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByDisplayValue('Se cambió el empaque')).not.toBeInTheDocument();
  });

  it('deshabilita el botón de eliminar avance mientras busy está activo', () => {
    renderLog({
      busy: true,
      isAdmin: true,
      entries: [{ id: 'av-1', orden_id: 'o-1', usuario_id: 'user-admin', descripcion: 'Avance de prueba', creado_en: '2026-10-06T15:00:00Z' }],
    });

    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
  });

  it('con un avance a medias, navegar por el menú abre ChoiceDialog; «Seguir editando» se queda y «Descartar» limpia y navega', async () => {
    const user = userEvent.setup();
    const proceed = vi.fn();
    function NavTrigger() {
      const { requestNavigation } = useUnsavedChanges();
      return (
        <button type="button" onClick={() => requestNavigation(proceed)}>
          Navegar por menú
        </button>
      );
    }

    const baseProps = {
      entries: [],
      media: [],
      pending: [],
      canEdit: true,
      busy: false,
      isAdmin: false,
      userId: 'user-mecanico',
      onAdd: vi.fn(async () => true),
      onRemove: vi.fn(async () => {}),
      onToggleEntryVisibility: vi.fn(),
      onToggleVisibility: vi.fn(),
      onDeleteMedia: vi.fn(),
    };

    const { rerender } = renderWithProviders(
      <>
        <NavTrigger />
        <ProgressLog {...baseProps} />
      </>
    );

    // Sin nada escrito navega directo sin preguntar.
    await user.click(screen.getByRole('button', { name: 'Navegar por menú' }));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Con texto escrito abre ChoiceDialog y detiene la navegación.
    await user.type(screen.getByPlaceholderText(/Describe el trabajo realizado/), 'Falta revisar manguera');
    await user.click(screen.getByRole('button', { name: 'Navegar por menú' }));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('¿Descartar este avance?');

    // «Seguir editando» conserva la nota y no navega.
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Falta revisar manguera')).toBeInTheDocument();
    expect(proceed).toHaveBeenCalledTimes(1);

    // Mientras guarda (busy: true), el guardia devuelve false sin abrir diálogo ni navegar.
    rerender(
      <>
        <NavTrigger />
        <ProgressLog {...baseProps} busy={true} />
      </>
    );
    await user.click(screen.getByRole('button', { name: 'Navegar por menú' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(proceed).toHaveBeenCalledTimes(1);

    // Al volver a busy: false y elegir «Descartar», limpia la nota y navega.
    rerender(
      <>
        <NavTrigger />
        <ProgressLog {...baseProps} busy={false} />
      </>
    );
    await user.click(screen.getByRole('button', { name: 'Navegar por menú' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('¿Descartar este avance?');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByDisplayValue('Falta revisar manguera')).not.toBeInTheDocument();
    expect(proceed).toHaveBeenCalledTimes(2);
  });
});
