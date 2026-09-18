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
