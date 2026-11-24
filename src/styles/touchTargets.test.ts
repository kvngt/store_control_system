import { describe, it, expect } from 'vitest';

type Fs = { readFileSync(path: URL, encoding: 'utf8'): string };
const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as Fs;
const css = fs.readFileSync(new URL('./components.css', import.meta.url), 'utf8');

/** Extrae el bloque de una @media cuyo encabezado cumpla el patrón dado. */
function mediaBlock(headerRegex: RegExp): string {
  const regex = new RegExp(headerRegex.source, 'g');
  const out: string[] = [];
  for (let m = regex.exec(css); m; m = regex.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    out.push(css.slice(m.index + m[0].length, i - 1));
    regex.lastIndex = i;
  }
  return out.join('\n');
}

describe('objetivos táctiles, selectores y avisos (Tanda 3 Q2)', () => {
  const touchBlock = mediaBlock(/@media\s*\(pointer:\s*coarse\)\s*,\s*\(max-width:\s*768px\)\s*\{/);
  const phoneBlock = mediaBlock(/@media\s*\(max-width:\s*768px\)\s*\{/);

  it('amplía a 44 px el área táctil de controles, casillas y enlaces de órdenes en móvil y táctil', () => {
    expect(touchBlock).toContain('.progress-slider');
    expect(touchBlock).toMatch(/\.progress-slider\s*\{[^}]*height:\s*44px/);
    expect(touchBlock).toMatch(/\.checkbox-touch\s*\{[^}]*min-height:\s*44px/);
    expect(touchBlock).toMatch(/\.checkbox-touch\s+input\[type="checkbox"\]\s*\{[^}]*width:\s*22px[^}]*height:\s*22px/s);
    expect(touchBlock).toContain('.attention-order');
    expect(touchBlock).toContain('.table td .link-button');
    expect(touchBlock).toContain('.intake-step-button');
    expect(touchBlock).toContain('.tab,');
    expect(touchBlock).toContain('.view-switch-option');
    expect(touchBlock).toContain('.btn {');
    expect(touchBlock).toContain('.btn-sm');
    expect(touchBlock).toContain('.btn-icon');
    expect(touchBlock).toContain('.modal-close');
  });

  it('mantiene .modal-close de al menos 36 x 36 px en escritorio', () => {
    expect(css).toMatch(/\.modal-close\s*\{[^}]*min-width:\s*36px[^}]*min-height:\s*36px/s);
  });

  it('la regla de 44 px de .modal-close en el teléfono va DESPUÉS de la base de 36 px (si no, la base gana)', () => {
    const base = css.search(/\.modal-close\s*\{[^}]*min-width:\s*36px/s);
    const phone = css.search(/\(max-width: 768px\)\s*\{\s*\.modal-close\s*\{[^}]*min-width:\s*44px/s);
    expect(base).toBeGreaterThan(-1);
    expect(phone).toBeGreaterThan(base);
  });

  it('da ancho suficiente al selector de estado y al de técnico (B-10 y A-16)', () => {
    expect(css).toMatch(/\.order-status-select\s*\{[^}]*min-width:\s*220px/s);
    expect(phoneBlock).toMatch(/\.order-status-select\s*\{[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.task-editor-technician\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  });

  it('coloca los avisos abajo en teléfono sin tapar encabezado ni pasos y muestra Nuevo cliente bajo el buscador', () => {
    expect(phoneBlock).toMatch(/\.toast-stack\s*\{[^}]*top:\s*auto[^}]*bottom:\s*max\(/s);
    expect(phoneBlock).toMatch(/\.intake-picker-row\s+\.combo-menu\s*\{[^}]*position:\s*static/s);
  });
});
