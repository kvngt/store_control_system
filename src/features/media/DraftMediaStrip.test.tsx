// @vitest-environment jsdom
//
// Reunión con el taller: al grabar un video, antes de guardar el avance, la miniatura
// salía negra y el ícono de reproducir no reproducía nada. El técnico no tenía cómo
// confirmar la toma. Ahora el video del borrador se abre y se reproduce.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import DraftMediaStrip from './DraftMediaStrip';
import type { PreparedMedia } from '../../types/database';

const video: PreparedMedia = {
  tipo: 'video',
  blob: new Blob(['video'], { type: 'video/mp4' }),
  mime: 'video/mp4',
  thumb: null,
  duracionSeg: 12,
  ancho: 1280,
  alto: 720,
};
const audio: PreparedMedia = { ...video, tipo: 'audio', blob: new Blob(['audio'], { type: 'audio/mp4' }), mime: 'audio/mp4' };

describe('DraftMediaStrip', () => {
  it('un video del borrador se abre y se reproduce', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/borrador');
    renderWithProviders(<DraftMediaStrip items={[video]} onRemove={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Video' }));

    const player = document.querySelector('.lightbox-content video') as HTMLVideoElement;
    expect(player).not.toBeNull();
    expect(player.getAttribute('src')).toBe('blob:mock/borrador');
    expect(player.controls).toBe(true);
  });

  it('sin miniatura muestra el ícono de video, no un cuadro negro', () => {
    renderWithProviders(<DraftMediaStrip items={[video]} onRemove={vi.fn()} />);
    expect(document.querySelector('.draft-media img')).toBeNull();
    expect(document.querySelector('.draft-media svg.lucide-video')).not.toBeNull();
  });

  it('cerrar el visor vuelve al borrador sin quitar nada', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/borrador');
    const onRemove = vi.fn();
    renderWithProviders(<DraftMediaStrip items={[video]} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Video' }));
    await userEvent.keyboard('{Escape}');

    expect(document.querySelector('.lightbox-overlay')).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('una nota de voz no abre visor', () => {
    renderWithProviders(<DraftMediaStrip items={[audio]} onRemove={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Nota de voz' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1); // solo quitar
  });
});
