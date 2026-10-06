import { describe, it, expect } from 'vitest';

type Fs = { readFileSync(path: URL, encoding: 'utf8'): string };
const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as Fs;
const css = fs.readFileSync(new URL('./components.css', import.meta.url), 'utf8');

describe('Avisos flotantes en móvil', () => {
  it('se muestran arriba para evitar que el teclado los tape', () => {
    // En móviles, el aviso no puede estar pegado abajo porque el teclado del sistema
    // o las barras inferiores tapan el texto cuando el usuario agrega tareas o repuestos.
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.toast-stack\s*\{[\s\S]*?top:\s*calc\(/);
    // Y no debe estar usando bottom: var(--space-4)
    expect(css).not.toMatch(/@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.toast-stack\s*\{[\s\S]*?bottom:/);
  });
});
