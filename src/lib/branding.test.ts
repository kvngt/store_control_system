// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applySedeBranding, brandPalette, clearSedeBranding } from './branding';
import { contrast, contrastOnWhite, parseHex } from './brandColor';

const rgb = (hex: string) => parseHex(hex)!;

describe('branding', () => {
  afterEach(() => clearSedeBranding());

  it('sin color válido deja la paleta de la app', () => {
    expect(brandPalette(null, 'dark')).toBeNull();
    expect(brandPalette('rojo', 'light')).toBeNull();
  });

  it('en tema oscuro usa el color tal cual, con texto oscuro sobre un amarillo', () => {
    const p = brandPalette('#EBC334', 'dark')!;
    expect(p['--color-primary']).toBe('#ebc334');
    expect(p['--color-text-inverse']).toBe('#0a0a0a');
    expect(contrast(rgb(p['--color-text-inverse']), rgb(p['--color-primary']))).toBeGreaterThanOrEqual(4.5);
  });

  // Antes el texto sobre el botón era fijo: oscuro sobre un azul marino no se leía.
  it('sobre un color oscuro el texto del botón va en blanco', () => {
    expect(brandPalette('#1a3a6b', 'dark')!['--color-text-inverse']).toBe('#ffffff');
    expect(brandPalette('#1a3a6b', 'light')!['--color-text-inverse']).toBe('#ffffff');
  });

  // El color real de la sede principal: un amarillo que sobre blanco casi no se ve.
  it('en tema claro oscurece un color pálido lo justo para bordes y texto', () => {
    const p = brandPalette('#e4db2f', 'light')!;
    const fill = rgb(p['--color-primary']);
    expect(contrastOnWhite(rgb('#e4db2f'))).toBeLessThan(3);
    expect(contrastOnWhite(fill)).toBeGreaterThanOrEqual(3);
    expect(contrastOnWhite(rgb(p['--color-primary-light']))).toBeGreaterThanOrEqual(4.5);
    // Sigue siendo amarillo: rojo y verde por encima del azul.
    expect(fill[0]).toBeGreaterThan(fill[2]);
    expect(fill[1]).toBeGreaterThan(fill[2]);
    // El relleno del botón es el color tal cual; el texto encima se lee en los dos rellenos.
    expect(p['--gradient-primary']).toBe('#e4db2f');
    const texto = rgb(p['--color-text-inverse']);
    expect(contrast(texto, rgb('#e4db2f'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(texto, fill)).toBeGreaterThanOrEqual(4.5);
  });

  // Cualquier color que elija una sede: el texto del botón siempre se lee (el peor caso, un
  // tono medio, da 4.2:1) y en claro los bordes siempre se ven sobre blanco.
  it('con cualquier color el botón se lee y los bordes se ven', () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
          for (const theme of ['dark', 'light'] as const) {
            const p = brandPalette(hex, theme)!;
            const texto = rgb(p['--color-text-inverse']);
            const relleno = rgb(theme === 'light' ? p['--gradient-primary'] : p['--color-primary']);
            expect(contrast(texto, relleno), `${hex} ${theme}`).toBeGreaterThanOrEqual(4.2);
            if (theme === 'light') {
              expect(contrastOnWhite(rgb(p['--color-primary'])), hex).toBeGreaterThanOrEqual(3);
              expect(contrastOnWhite(rgb(p['--color-primary-light'])), hex).toBeGreaterThanOrEqual(4.5);
            }
          }
        }
      }
    }
  });

  it('un color que ya se ve sobre blanco no se toca', () => {
    expect(brandPalette('#1a3a6b', 'light')!['--color-primary']).toBe('#1a3a6b');
  });

  it('aplica las variables en <html> y las quita al limpiar', () => {
    const root = document.documentElement;
    applySedeBranding('#1a3a6b', 'dark');
    expect(root.style.getPropertyValue('--color-primary')).toBe('#1a3a6b');
    expect(root.style.getPropertyValue('--color-text-inverse')).toBe('#ffffff');

    applySedeBranding(null, 'dark');
    expect(root.style.getPropertyValue('--color-primary')).toBe('');
    expect(root.style.getPropertyValue('--color-text-inverse')).toBe('');
  });
});
