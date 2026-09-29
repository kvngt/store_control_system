// @vitest-environment jsdom
//
// El grabador de video es de pantalla completa, y tiene que serlo aunque lo abra algo que
// vive dentro de una tarjeta. En el teléfono la tarjeta de Avances se quedaba con el `:hover`
// pegado después de tocar "Video", su `transform` encerraba al grabador y los botones de
// detener y de "Usar video" quedaban fuera de la pantalla, bajo la barra inferior.

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
const miniaturaDelArchivo = new Blob(['jpg'], { type: 'image/jpeg' });
const inspectVideo = vi.fn(async (_blob: Blob) => ({ duration: 4, width: 1280, height: 720, thumb: miniaturaDelArchivo as Blob | null }));
vi.mock('../../lib/media/videoFrame', () => ({
  thumbFromVideoElement: vi.fn(async () => null),
  inspectVideo: (blob: Blob) => inspectVideo(blob),
}));

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
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'video', blob: grabacion.blob, duracionSeg: 4 }))
    );
  });

  // Reunión con el taller: el video se veía negro antes de guardarlo. La miniatura venía
  // solo de la cámara en vivo, que en varios teléfonos da un cuadro negro.
  it('la miniatura sale del archivo grabado, con sus dimensiones', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/video');
    const onDone = vi.fn();
    renderWithProviders(<VideoRecorderModal onDone={onDone} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Usar video/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(inspectVideo).toHaveBeenCalledWith(grabacion.blob);
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ thumb: miniaturaDelArchivo, ancho: 1280, alto: 720 }));
  });

  it('sin un cuadro que sirva, se entrega sin miniatura en vez de una negra', async () => {
    inspectVideo.mockResolvedValueOnce({ duration: 4, width: 1280, height: 720, thumb: null });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/video');
    const onDone = vi.fn();
    renderWithProviders(<VideoRecorderModal onDone={onDone} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Usar video/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ thumb: null })));
  });

  // Con sonido, el navegador bloquea el autoplay y el iPhone deja el cuadro en negro.
  it('la revisión muestra la toma con póster y no intenta reproducirse sola', async () => {
    const urls = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) =>
      b === miniaturaDelArchivo ? 'blob:mock/poster' : 'blob:mock/video'
    );
    renderWithProviders(<VideoRecorderModal onDone={vi.fn()} onClose={vi.fn()} />);

    const video = document.querySelector('.recorder-video') as HTMLVideoElement;
    expect(video.autoplay).toBe(false);
    expect(video.getAttribute('preload')).toBe('metadata');
    await waitFor(() => expect(video.getAttribute('poster')).toBe('blob:mock/poster'));
    urls.mockRestore();
  });
});
