import { describe, it, expect } from 'vitest';
import { baseMime, extensionFor, fitWithin, formatDuration, mediaPath, pickRecorderMime } from './mime';

describe('pickRecorderMime', () => {
  it('prefiere MP4, que reproduce el iPhone del cliente', () => {
    const chrome126 = (t: string) => t.startsWith('video/mp4') || t.startsWith('video/webm');
    expect(pickRecorderMime('video', chrome126)).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  });

  it('cae a WebM cuando el navegador no graba MP4', () => {
    const firefox = (t: string) => t.startsWith('video/webm') || t.startsWith('audio/webm') || t.startsWith('audio/ogg');
    expect(pickRecorderMime('video', firefox)).toBe('video/webm;codecs=vp9,opus');
    expect(pickRecorderMime('audio', firefox)).toBe('audio/webm;codecs=opus');
  });

  it('devuelve null si el navegador no puede grabar', () => {
    expect(pickRecorderMime('audio', () => false)).toBeNull();
  });
});

describe('baseMime / extensionFor', () => {
  it('quita los códecs, porque Storage compara el Content-Type tal cual', () => {
    expect(baseMime('video/webm;codecs=vp9,opus')).toBe('video/webm');
    expect(baseMime('Audio/MP4; codecs=mp4a.40.2')).toBe('audio/mp4');
  });

  it('da la extensión de un audio MP4 como m4a', () => {
    expect(extensionFor('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(extensionFor('video/mp4')).toBe('mp4');
    expect(extensionFor('application/x-unknown')).toBe('bin');
  });
});

describe('mediaPath', () => {
  it('arma la ruta que exigen las políticas del bucket', () => {
    expect(mediaPath('sede', 'orden', 'x.jpg')).toBe('sede/orden/x.jpg');
  });
});

describe('fitWithin', () => {
  it('reduce el lado largo al máximo conservando la proporción', () => {
    expect(fitWithin(4032, 3024, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin(1080, 1920, 1280, true)).toEqual({ width: 720, height: 1280 });
  });

  it('nunca agranda una imagen chica', () => {
    expect(fitWithin(640, 480, 1920)).toEqual({ width: 640, height: 480 });
  });

  it('redondea a pares para H.264', () => {
    const { width, height } = fitWithin(1001, 563, 1280, true);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });
});

describe('formatDuration', () => {
  it('muestra minutos y segundos', () => {
    expect(formatDuration(83)).toBe('1:23');
    expect(formatDuration(120)).toBe('2:00');
    expect(formatDuration(null)).toBe('0:00');
    expect(formatDuration(Infinity)).toBe('0:00');
  });
});
