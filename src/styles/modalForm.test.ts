// Un diálogo con su cuerpo y su pie dentro de un <form> (sticker de próximo servicio, seguro,
// plantilla de inspección) tiene que seguir desplazándose.
//
// `.modal` es una columna con `overflow: hidden` y `.modal-body` es la que se desplaza, pero el
// <form> queda en medio: sin que sea también una columna con `min-height: 0`, crece a su contenido,
// `.modal` lo recorta y lo de abajo (el idioma del sticker, el botón de guardar) no se alcanzaba.
// Es CSS puro: ninguna otra prueba lo ve, porque jsdom no calcula el alto de nada.

import { describe, it, expect } from 'vitest';

// Se lee el archivo igual que en cardHover.test.ts (ver ahí por qué no se importa con `?raw`).
type Fs = { readFileSync(path: URL, encoding: 'utf8'): string };
const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as Fs;
const css = fs.readFileSync(new URL('./components.css', import.meta.url), 'utf8');

describe('.modal > form', () => {
  it('lee la hoja de estilos de verdad', () => {
    expect(css).toContain('.modal-body {');
  });

  it('reparte el alto del diálogo: columna que puede encogerse', () => {
    const regla = css.match(/\.modal\s*>\s*form\s*\{([^}]*)\}/);
    expect(regla, 'falta la regla `.modal > form`').not.toBeNull();
    const cuerpo = regla![1];
    expect(cuerpo).toMatch(/display:\s*flex/);
    expect(cuerpo).toMatch(/flex-direction:\s*column/);
    expect(cuerpo).toMatch(/flex:\s*1/);
    expect(cuerpo).toMatch(/min-height:\s*0/);
  });
});
