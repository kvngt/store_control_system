// El levantón de `.card` al pasar el ratón no puede aplicarse en una pantalla táctil.
//
// Es CSS, pero el fallo que evita no se ve en ninguna otra prueba: en el teléfono el `:hover`
// se queda pegado después de tocar la tarjeta, y su `transform` la convierte en la caja de
// cualquier `position: fixed` que lleve dentro. Así el grabador de video quedaba encerrado en
// la tarjeta de Avances, bajo la barra inferior, con sus botones fuera de la pantalla — y
// antes, en escritorio, los diálogos quedaban igual (de ahí `.card:has(.modal-overlay)`).

import { describe, it, expect } from 'vitest';

// Cómo se lee el archivo, y por qué así:
// - No con `import ... from './components.css?raw'`: dentro de vitest un CSS importado así
//   llega como cadena vacía, y esta guarda pasó una vez sin revisar nada por eso.
// - No con un `import` estático de `node:fs`: la app compila sin los tipos de Node
//   (`types: ["vite/client"]`), y dárselos a este archivo se los daría a toda la app.
// Una importación dinámica con especificador no literal no pide tipos, y la prueba corre en
// el entorno `node` de vitest, donde `node:fs` existe.
type Fs = { readFileSync(path: URL, encoding: 'utf8'): string };
const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as Fs;
const css = fs.readFileSync(new URL('./components.css', import.meta.url), 'utf8');

/** El CSS sin el contenido de los bloques `@media (hover: hover)`, con llaves balanceadas. */
function sinBloquesDeHover(texto: string): string {
  let salida = '';
  let i = 0;
  const marca = /@media\s*\(hover:\s*hover\)\s*\{/g;
  for (let m = marca.exec(texto); m; m = marca.exec(texto)) {
    salida += texto.slice(i, m.index);
    let nivel = 1;
    let j = m.index + m[0].length;
    while (j < texto.length && nivel > 0) {
      if (texto[j] === '{') nivel++;
      else if (texto[j] === '}') nivel--;
      j++;
    }
    i = j;
    marca.lastIndex = j;
  }
  return salida + texto.slice(i);
}

describe('.card:hover', () => {
  // Sin esto, un CSS que llegara vacío haría pasar las dos pruebas de abajo sin revisar nada.
  it('lee la hoja de estilos de verdad', () => {
    expect(css.length).toBeGreaterThan(10_000);
    expect(css).toContain('.card {');
  });

  it('solo mueve la tarjeta dentro de @media (hover: hover)', () => {
    const fuera = sinBloquesDeHover(css);
    // Reglas que apuntan a `.card:hover` (sola o en una lista de selectores) fuera de ese bloque.
    const reglas = [...fuera.matchAll(/([^{}]*\.card:hover[^{}]*)\{([^}]*)\}/g)];
    const conTransform = reglas
      .filter(([, , cuerpo]) => /transform\s*:/.test(cuerpo) && !/transform\s*:\s*none/.test(cuerpo))
      .map(([, selector]) => selector.trim());

    expect(conTransform).toEqual([]);
  });

  it('y el levantón sigue existiendo para quien usa ratón', () => {
    expect(css).toMatch(/@media\s*\(hover:\s*hover\)\s*\{\s*\.card:hover\s*\{\s*transform:\s*translateY\(-2px\)/);
  });
});
