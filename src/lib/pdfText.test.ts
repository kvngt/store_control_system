import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { pdfSafe, withSafeText } from './pdfText';

describe('pdfSafe', () => {
  it('deja intactos el español y el inglés de siempre', () => {
    expect(pdfSafe('Cambio de aceite — niño, año, ¿qué? “5W-30” 100 €')).toBe('Cambio de aceite — niño, año, ¿qué? “5W-30” 100 €');
  });

  it('cambia el guion que no se corta y el signo menos por un guion', () => {
    expect(pdfSafe('Aceite 5W‑30 y 10−2')).toBe('Aceite 5W-30 y 10-2');
  });

  it('quita lo que no tiene dibujo: emoji, palomitas, otros alfabetos', () => {
    expect(pdfSafe('Filtro ✓ listo 😀')).toBe('Filtro  listo ');
    expect(pdfSafe('Ёжик 日本語')).toBe(' ');
  });

  it('deja la letra base de lo que Helvetica no tiene', () => {
    expect(pdfSafe('Łódź Şahin')).toBe('Lódz Sahin'); // la ó sí está en Latin-1
  });

  it('conserva el salto de línea', () => {
    expect(pdfSafe('a\nb')).toBe('a\nb');
  });
});

// Con jsPDF de verdad: un solo carácter raro volvía ilegible TODA la línea (se codificaba como UTF-16).
describe('withSafeText con jsPDF', () => {
  const cadenasDelPdf = (doc: jsPDF) => [...doc.output().matchAll(/\((.*?)\) Tj/g)].map((m) => m[1]);

  it('sin limpiar, un guion que no se corta deja la línea codificada de otra manera', () => {
    const doc = new jsPDF({ unit: 'mm', format: [62, 50] });
    doc.text('Aceite 5W‑30', 3, 10);
    // Prueba de que el problema existe: la cadena trae bytes nulos.
    expect(cadenasDelPdf(doc).join('')).toContain('\u0000');
  });

  it('con la limpieza la línea sale como texto normal', () => {
    const doc = withSafeText(new jsPDF({ unit: 'mm', format: [62, 50] }));
    doc.text('Aceite 5W‑30 ✓', 3, 10);
    const cadenas = cadenasDelPdf(doc);
    expect(cadenas.join('')).not.toContain('\u0000');
    expect(cadenas.join('')).toContain('Aceite 5W-30');
  });

  it('también limpia lo que se parte en renglones', () => {
    const doc = withSafeText(new jsPDF({ unit: 'mm', format: [62, 50] }));
    expect(doc.splitTextToSize('Frenos 😀 traseros', 30).join(' ')).toBe('Frenos  traseros');
  });
});
