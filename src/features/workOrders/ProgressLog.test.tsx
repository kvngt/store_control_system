// @vitest-environment jsdom
//
// Un avance ahora puede ser solo una nota de voz o solo un video: explicar una
// falla grabándola es más rápido que escribirla con los guantes puestos.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
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
    expect(props.onAdd).toHaveBeenCalledWith('', [VOICE_NOTE]);
  });

  it('avisa que lo subido es interno hasta que administración lo publique', () => {
    renderLog();
    expect(screen.getByText(/interno hasta que administración lo publique/i)).toBeInTheDocument();
  });

  it('no muestra el formulario a quien no puede editar la orden', () => {
    renderLog({ canEdit: false });
    expect(screen.queryByRole('button', { name: /Agregar Avance/i })).not.toBeInTheDocument();
  });
});
