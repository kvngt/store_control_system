// En el teléfono, el tipo y el técnico de cada línea de mano de obra caben en su tarjeta.
//
// Es CSS, pero el fallo no lo ve ninguna otra prueba: en tarjeta (`cards-on-mobile`) cada celda
// es una fila flex sin salto, y la de la descripción lleva además los dos selectores de la
// comisión por tarea (20261010000006). Quedaban a la derecha, fuera de la tarjeta, con scroll
// horizontal de toda la página (medido a 375 px: el documento medía 656 px), y la descripción
// en una columna de una palabra por renglón. Asignar técnico desde el teléfono es justo lo que
// pidió el taller.

import { describe, it, expect } from 'vitest';

// Se lee igual que en `cardHover.test.ts` (ver ahí por qué no con `?raw` ni un import estático).
type Fs = { readFileSync(path: URL, encoding: 'utf8'): string };
const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as Fs;
const css = fs.readFileSync(new URL('./components.css', import.meta.url), 'utf8');

/** El contenido de cada bloque `@media (max-width: 768px)`, con llaves balanceadas. */
function bloquesDeTelefono(texto: string): string[] {
  const bloques: string[] = [];
  const marca = /@media\s*\(max-width:\s*768px\)\s*\{/g;
  for (let m = marca.exec(texto); m; m = marca.exec(texto)) {
    let nivel = 1;
    let j = m.index + m[0].length;
    while (j < texto.length && nivel > 0) {
      if (texto[j] === '{') nivel++;
      else if (texto[j] === '}') nivel--;
      j++;
    }
    bloques.push(texto.slice(m.index + m[0].length, j - 1));
  }
  return bloques;
}

/** Las declaraciones de una regla con ese selector exacto dentro de un texto CSS. */
function regla(texto: string, selector: string): string | null {
  const i = texto.indexOf(`${selector} {`);
  if (i < 0) return null;
  const inicio = i + selector.length + 2;
  return texto.slice(inicio, texto.indexOf('}', inicio));
}

describe('mano de obra en el teléfono', () => {
  const telefono = bloquesDeTelefono(css).join('\n');

  it('lee la hoja de estilos de verdad', () => {
    expect(css.length).toBeGreaterThan(10_000);
    expect(telefono).toContain('.cards-on-mobile');
  });

  it('la celda de la descripción salta de renglón', () => {
    expect(regla(telefono, '.table-container.cards-on-mobile td.labor-desc-cell')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('tipo y técnico bajan a un renglón propio, a lo ancho de la tarjeta', () => {
    const meta = regla(telefono, '.labor-desc-cell .labor-meta');
    expect(meta).toMatch(/flex:\s*1 1 100%/);
    expect(meta).toMatch(/min-width:\s*0/);
  });
});
