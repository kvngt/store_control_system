import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { noteForSticker } from './stickerNote';
import * as translationService from '../../services/translation.service';

describe('noteForSticker (E8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin nota devuelve { nota: null, fallo: false } sin llamar a translateText', async () => {
    const spy = vi.spyOn(translationService, 'translateText');

    expect(await noteForSticker(null, 'en')).toEqual({ nota: null, fallo: false });
    expect(await noteForSticker(undefined, 'en')).toEqual({ nota: null, fallo: false });
    expect(await noteForSticker('', 'en')).toEqual({ nota: null, fallo: false });
    expect(await noteForSticker('   ', 'en')).toEqual({ nota: null, fallo: false });

    expect(spy).not.toHaveBeenCalled();
  });

  it('con nota traduce correctamente', async () => {
    vi.spyOn(translationService, 'translateText').mockResolvedValue('Synthetic oil');

    const result = await noteForSticker('Aceite sintético', 'en');
    expect(result).toEqual({ nota: 'Synthetic oil', fallo: false });
  });

  it('si translateText falla devuelve la nota original con fallo: true', async () => {
    vi.spyOn(translationService, 'translateText').mockRejectedValue(new Error('Network error'));

    const result = await noteForSticker('Aceite sintético', 'en');
    expect(result).toEqual({ nota: 'Aceite sintético', fallo: true });
  });

  it('si translateText tarda más de 10s devuelve la nota original con fallo: true', async () => {
    vi.useFakeTimers();
    vi.spyOn(translationService, 'translateText').mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve('Delayed translation'), 15000);
    }));

    const promise = noteForSticker('Aceite sintético', 'en');
    vi.advanceTimersByTime(10001);
    const result = await promise;

    expect(result).toEqual({ nota: 'Aceite sintético', fallo: true });
  });
});
