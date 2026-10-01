// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isStaleChunkError, reloadForStaleChunk } from './staleChunk';

describe('isStaleChunkError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://restorifyauto.net/assets/WorkOrders-abc12345.js',
    'Importing a module script failed.',
    'error loading dynamically imported module',
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\". 'text/html' is not a valid JavaScript MIME type.",
    'Unable to preload CSS for /assets/Finance-abc12345.css',
  ])('reconoce "%s"', (message) => {
    expect(isStaleChunkError(new Error(message))).toBe(true);
  });

  it('no confunde un error de la app con una versión vieja', () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'nombre')"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe('reloadForStaleChunk', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  });

  afterEach(() => sessionStorage.clear());

  it('recarga una vez y no entra en ciclo si el archivo sigue sin bajar', () => {
    expect(reloadForStaleChunk(1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // La página recargada vuelve a fallar enseguida: el problema es otro.
    expect(reloadForStaleChunk(1_003_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('vuelve a recargar en una publicación posterior', () => {
    reloadForStaleChunk(1_000_000);
    expect(reloadForStaleChunk(1_000_000 + 60_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
