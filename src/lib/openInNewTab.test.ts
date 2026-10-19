// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { openInNewTab } from './openInNewTab';

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeTab() {
  return { opener: {}, location: { href: '' }, close: vi.fn() } as unknown as Window;
}

describe('openInNewTab', () => {
  it('abre la pestaña antes de pedir la URL y la lleva a ella después', async () => {
    const orden: string[] = [];
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockImplementation(() => {
      orden.push('abrir');
      return tab;
    });

    await openInNewTab(async () => {
      orden.push('pedir');
      return 'https://x.test/firmada';
    });

    expect(orden).toEqual(['abrir', 'pedir']);
    expect(tab.location.href).toBe('https://x.test/firmada');
    expect(tab.opener).toBeNull();
  });

  it('si pedir la URL falla, cierra la pestaña en blanco y deja subir el error', async () => {
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockReturnValue(tab);

    await expect(
      openInNewTab(async () => {
        throw new Error('sin permiso');
      })
    ).rejects.toThrow('sin permiso');
    expect(tab.close).toHaveBeenCalled();
  });

  it('si el navegador no deja abrir la pestaña, navega en la misma', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });

    await openInNewTab(async () => 'https://x.test/firmada');

    expect(assign).toHaveBeenCalledWith('https://x.test/firmada');
  });
});
