// @vitest-environment jsdom
//
// La galería es donde se decide qué ve el cliente final: solo un admin publica,
// y un técnico tiene que poder distinguir de un vistazo qué ya es público.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { OrderMedia } from '../../types/database';
import type { UploadItem } from '../../lib/media/uploadQueue';

vi.mock('./useSignedUrls', () => ({
  useSignedUrls: (paths: (string | null | undefined)[]) => ({
    urls: Object.fromEntries(paths.filter(Boolean).map((p) => [p, `https://signed.test/${p}`])),
    loading: false,
  }),
}));

const { default: MediaGallery } = await import('./MediaGallery');

function media(overrides: Partial<OrderMedia>): OrderMedia {
  return {
    id: 'm-1',
    orden_id: 'ord-1',
    sede_id: 'sede-1',
    avance_id: 'av-1',
    tipo: 'foto',
    origen: 'avance',
    zona: null,
    ruta: 'sede-1/ord-1/m-1.jpg',
    ruta_miniatura: 'sede-1/ord-1/m-1-thumb.jpg',
    mime: 'image/jpeg',
    bytes: 300000,
    duracion_seg: null,
    ancho: 1920,
    alto: 1440,
    visible_cliente: false,
    proveedor: 'supabase',
    subido_por: 'user-mecanico',
    creado_en: '2026-09-12T10:00:00Z',
    ...overrides,
  };
}

const PHOTO = media({});
const VIDEO = media({
  id: 'm-2',
  tipo: 'video',
  ruta: 'sede-1/ord-1/m-2.mp4',
  ruta_miniatura: 'sede-1/ord-1/m-2-thumb.jpg',
  mime: 'video/mp4',
  duracion_seg: 83,
  visible_cliente: true,
});
const VOICE = media({ id: 'm-3', tipo: 'audio', ruta: 'sede-1/ord-1/m-3.m4a', ruta_miniatura: null, mime: 'audio/mp4', duracion_seg: 12 });

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/pending');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

describe('MediaGallery', () => {
  it('muestra miniaturas firmadas, la duración del video y las notas de voz', () => {
    renderWithProviders(<MediaGallery media={[PHOTO, VIDEO, VOICE]} />);

    const images = document.querySelectorAll('.media-tile img');
    expect([...images].map((img) => img.getAttribute('src'))).toEqual([
      'https://signed.test/sede-1/ord-1/m-1-thumb.jpg',
      'https://signed.test/sede-1/ord-1/m-2-thumb.jpg',
    ]);
    expect(screen.getByText('1:23')).toBeInTheDocument();
    expect(screen.getByText(/Nota de voz · 0:12/)).toBeInTheDocument();
  });

  it('deja a un admin publicar un archivo al cliente', async () => {
    const onToggle = vi.fn();
    renderWithProviders(<MediaGallery media={[PHOTO]} canManage onToggleVisibility={onToggle} />);

    await userEvent.click(screen.getByRole('button', { name: /Mostrar en el reporte del cliente/i }));
    expect(onToggle).toHaveBeenCalledWith(PHOTO);
  });

  it('a un técnico solo le indica qué ya es público, sin dejarlo cambiarlo', () => {
    renderWithProviders(<MediaGallery media={[PHOTO, VIDEO]} currentUserId="user-mecanico" canDeleteOwn onDelete={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /reporte del cliente/i })).not.toBeInTheDocument();
    // El video está publicado; la foto no, y no dice nada.
    expect(screen.getAllByText('Visible al cliente')).toHaveLength(1);
    // Puede borrar lo suyo.
    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(2);
  });

  it('no deja borrar lo que subió otra persona', () => {
    renderWithProviders(
      <MediaGallery media={[media({ subido_por: 'otra-persona' })]} currentUserId="user-mecanico" canDeleteOwn onDelete={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('muestra el avance de lo que todavía está subiendo', () => {
    const pending = {
      id: 'up-1',
      tipo: 'video',
      estado: 'subiendo',
      progreso: 0.42,
      thumb: new Blob(['t'], { type: 'image/jpeg' }),
      blob: new Blob(['v'], { type: 'video/mp4' }),
      duracionSeg: 30,
    } as UploadItem;

    renderWithProviders(<MediaGallery media={[]} pending={[pending]} />);
    const tile = document.querySelector('.media-tile.is-pending') as HTMLElement;
    expect(within(tile).getByText('42%')).toBeInTheDocument();
  });

  it('abre el video completo en el visor al tocar su miniatura', async () => {
    renderWithProviders(<MediaGallery media={[VIDEO]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Video' }));
    const video = document.querySelector('.lightbox-content video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('https://signed.test/sede-1/ord-1/m-2.mp4');
    expect(video.getAttribute('poster')).toBe('https://signed.test/sede-1/ord-1/m-2-thumb.jpg');
  });
});
