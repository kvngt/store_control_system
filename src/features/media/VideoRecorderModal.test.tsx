// @vitest-environment jsdom
//
// El grabador de video es de pantalla completa, y tiene que serlo aunque lo abra algo que
// vive dentro de una tarjeta. En el teléfono la tarjeta de Avances se quedaba con el `:hover`
// pegado después de tocar "Video", su `transform` encerraba al grabador y los botones de
// detener y de "Usar video" quedaban fuera de la pantalla, bajo la barra inferior.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';

const grabacion = { blob: new Blob(['v'], { type: 'video/webm' }), mime: 'video/webm', duration: 4 };

// Sin cámara en jsdom: el hook se sustituye por uno que ya grabó.
vi.mock('./useMediaRecorder', () => ({
  useMediaRecorder: () => ({
    openDevice: vi.fn(),
    stream: null,
    recording: grabacion,
    state: 'recorded',
    elapsed: 4,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock('../../lib/media/videoFrame', () => ({ thumbFromVideoElement: vi.fn(async () => null) }));

const { default: VideoRecorderModal } = await import('./VideoRecorderModal');

describe('VideoRecorderModal', () => {
  it('se dibuja en <body>, fuera de la tarjeta que lo abre', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/video');
    renderWithProviders(
      <div className="card" data-testid="tarjeta">
        <VideoRecorderModal onDone={vi.fn()} onClose={vi.fn()} />
      </div>
    );

    const overlay = document.querySelector('.recorder-overlay') as HTMLElement;
    expect(overlay.parentElement).toBe(document.body);
    // La tarjeta puede tener el `transform` que quiera: el grabador ya no está dentro.
    expect(screen.getByTestId('tarjeta').contains(overlay)).toBe(false);
  });

  it('"Usar video" entrega la grabación', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/video');
    const onDone = vi.fn();
    renderWithProviders(
      <div className="card">
        <VideoRecorderModal onDone={onDone} onClose={vi.fn()} />
      </div>
    );

    await userEvent.click(screen.getByRole('button', { name: /Usar video/ }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'video', blob: grabacion.blob, duracionSeg: 4 }));
  });
});
