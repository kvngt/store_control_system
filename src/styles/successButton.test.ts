// El botón verde (agregar tarea o repuesto, "Realizado") tiene que leerse.
//
// Lo pidió el taller el 03/10/2026: el "+" gris no se entendía como "aquí se agrega". El verde de
// los avisos (`--color-success`, #10B981) con texto blanco queda en 2.5:1, por debajo del 4.5:1
// que pide un texto normal. Esta prueba fija que el relleno del botón y su texto pasen.

import { describe, it, expect } from 'vitest';
import { contrast, parseHex } from '../lib/brandColor';

// Igual que `cardHover.test.ts`: `node:fs` por importación dinámica, para no dar los tipos de
// Node a toda la app.
type Fs = { readFileSync(path: URL, encoding: 'utf8'): string };
const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as Fs;
const tokens = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const components = fs.readFileSync(new URL('./components.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = tokens.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`No está el token ${name}`);
  return match[1];
}

function rgb(hex: string) {
  const parsed = parseHex(hex);
  if (!parsed) throw new Error(`Color inválido ${hex}`);
  return parsed;
}

describe('.btn-success', () => {
  it('el texto se lee sobre el relleno y sobre el relleno al pasar el ratón', () => {
    const texto = rgb(token('--color-on-success'));
    expect(contrast(texto, rgb(token('--color-success-fill')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(texto, rgb(token('--color-success-fill-hover')))).toBeGreaterThanOrEqual(4.5);
  });

  it('usa los tokens, no colores sueltos', () => {
    const bloque = components.match(/\.btn-success \{[^}]*\}/)?.[0] ?? '';
    expect(bloque).toContain('var(--color-success-fill)');
    expect(bloque).toContain('var(--color-on-success)');
    expect(bloque).not.toMatch(/#[0-9A-Fa-f]{3,6}/);
  });
});
