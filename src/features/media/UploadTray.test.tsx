/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { UploadItem } from '../../lib/media/uploadQueue';

const mocks = vi.hoisted(() => ({ items: [] as UploadItem[] }));

vi.mock('../../context/language.context', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'es' }),
}));

vi.mock('./mediaUploads.context', () => ({
  useMediaUploads: () => ({ items: mocks.items, online: true, retry: vi.fn(), discard: vi.fn() }),
}));

const { default: UploadTray } = await import('./UploadTray');

const item = (id: string): UploadItem =>
  ({ id, kind: 'video', estado: 'subiendo', progreso: 0.5, intentos: 0 }) as unknown as UploadItem;

afterEach(() => {
  cleanup();
  mocks.items = [];
  document.body.className = '';
});

describe('UploadTray: sitio reservado en el teléfono', () => {
  it('no marca el body cuando no hay nada subiendo', () => {
    render(<UploadTray />);
    expect(document.body.classList.contains('uploads-open')).toBe(false);
  });

  // La bandeja flota encima de la barra inferior; sin la clase, tapaba el botón
  // de guardar del formulario de avance justo al terminar de grabar un video.
  it('marca el body mientras hay algo en cola', () => {
    mocks.items = [item('a')];
    render(<UploadTray />);
    expect(document.body.classList.contains('uploads-open')).toBe(true);
  });

  it('lo quita al desmontar', () => {
    mocks.items = [item('a')];
    const { unmount } = render(<UploadTray />);
    unmount();
    expect(document.body.classList.contains('uploads-open')).toBe(false);
  });
});

describe('UploadTray: el motivo de un error, para el taller', () => {
  const fallida = (error: string): UploadItem =>
    ({ id: 'x', tipo: 'foto', estado: 'error', progreso: 0, intentos: 1, numeroOrden: 'OT-1', error }) as unknown as UploadItem;

  async function abrir() {
    const { fireEvent, screen } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    return screen;
  }

  // Una subida que termina después de entregar la orden choca con los permisos: antes se veía el
  // mensaje crudo de la base y nadie sabía qué hacer.
  it('un permiso negado dice qué pasó, y el crudo queda en el title', async () => {
    const crudo = 'new row violates row-level security policy for table "orden_media"';
    mocks.items = [fallida(crudo)];
    render(<UploadTray />);
    const screen = await abrir();
    const motivo = screen.getByText('media.uploadDenied');
    expect(motivo).toHaveAttribute('title', crudo);
  });

  it('la foto de una inspección publicada tiene su propio motivo', async () => {
    mocks.items = [fallida('La inspección ya está publicada para el cliente. Sus fotos solo las cambia administración.')];
    render(<UploadTray />);
    const screen = await abrir();
    expect(screen.getByText('media.uploadInspectionPublished')).toBeInTheDocument();
  });

  it('un error de red se sigue mostrando tal cual', async () => {
    mocks.items = [fallida('Failed to fetch')];
    render(<UploadTray />);
    const screen = await abrir();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });
});
