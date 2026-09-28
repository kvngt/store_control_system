import { describe, it, expect } from 'vitest';
import { brandColors, contrastOnWhite, DEFAULT_BRAND, parseHex, readableOnWhite } from './brandColor';

describe('brandColor', () => {
  it('lee un color de seis dígitos, con o sin #', () => {
    expect(parseHex('#e8c64a')).toEqual([232, 198, 74]);
    expect(parseHex('E8C64A')).toEqual([232, 198, 74]);
  });

  it('rechaza lo que no es un color de seis dígitos', () => {
    expect(parseHex(null)).toBeNull();
    expect(parseHex('')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
    expect(parseHex('rojo')).toBeNull();
  });

  // El color real de la sede principal: un amarillo que sobre blanco no se lee.
  it('oscurece un color claro hasta que el texto se lea', () => {
    const amarillo = parseHex('#e8c64a')!;
    expect(contrastOnWhite(amarillo)).toBeLessThan(4.5);

    const legible = readableOnWhite(amarillo);
    expect(contrastOnWhite(legible)).toBeGreaterThanOrEqual(4.5);
    // Sigue siendo el mismo tono, más oscuro: rojo > verde > azul, como el original.
    expect(legible[0]).toBeGreaterThan(legible[1]);
    expect(legible[1]).toBeGreaterThan(legible[2]);
  });

  it('no toca un color que ya se lee', () => {
    const azulOscuro = parseHex('#1a3a6b')!;
    expect(readableOnWhite(azulOscuro)).toEqual(azulOscuro);
  });

  it('las rayas llevan el color tal cual y el texto la versión legible', () => {
    const { accent, text } = brandColors('#e8c64a');
    expect(accent).toEqual([232, 198, 74]);
    expect(contrastOnWhite(text)).toBeGreaterThanOrEqual(4.5);
  });

  // "PRUEBA Sede Norte" no tiene color: su reporte sale con el de la app, no en negro.
  it('una sede sin color usa el de la app', () => {
    expect(brandColors(null).accent).toEqual(DEFAULT_BRAND);
    expect(brandColors('no es un color').accent).toEqual(DEFAULT_BRAND);
  });
});
