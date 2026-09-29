import { describe, expect, it } from 'vitest';
import { isBlackFrame, thumbTimes } from './videoFrame';

/** `n` pixeles RGBA del mismo color. */
const pixels = (n: number, [r, g, b]: [number, number, number]) =>
  Array.from({ length: n }, () => [r, g, b, 255]).flat();

describe('isBlackFrame', () => {
  it('un cuadro negro es negro', () => {
    expect(isBlackFrame(pixels(1024, [0, 0, 0]))).toBe(true);
  });

  it('el ruido de un sensor tapado también', () => {
    expect(isBlackFrame(pixels(1024, [8, 10, 9]))).toBe(true);
  });

  // Un taller con poca luz: casi todo oscuro, pero con algo iluminado. Esa miniatura sirve.
  it('un cuadro oscuro con una zona iluminada no es negro', () => {
    const frame = [...pixels(990, [5, 5, 5]), ...pixels(34, [180, 170, 160])];
    expect(isBlackFrame(frame)).toBe(false);
  });

  it('un cuadro normal no es negro', () => {
    expect(isBlackFrame(pixels(1024, [120, 110, 100]))).toBe(false);
  });

  it('sin pixeles no hay imagen', () => {
    expect(isBlackFrame([])).toBe(true);
  });
});

describe('thumbTimes', () => {
  it('prueba 0.5 s, 1.5 s y la mitad', () => {
    expect(thumbTimes(10)).toEqual([0.5, 1.5, 5]);
  });

  it('no pasa de la mitad de un video corto ni repite', () => {
    expect(thumbTimes(1)).toEqual([0.5]);
    expect(thumbTimes(2)).toEqual([0.5, 1]);
  });

  it('sin duración, solo el medio segundo de siempre', () => {
    expect(thumbTimes(null)).toEqual([0.5]);
  });
});
