/**
 * Texto que la tipografía estándar de un PDF sí sabe dibujar.
 *
 * jsPDF usa Helvetica, que solo conoce Latin-1 y unos pocos signos de Windows-1252 (comillas
 * curvas, guion largo, …, €). Con UN carácter fuera de ese conjunto (un guion que no se corta, una
 * palomita, un emoji, una letra cirílica), jsPDF codifica **toda la cadena** de otra manera y la
 * línea entera sale ilegible en el papel (QA 19/10/2026). El texto de una nota o de una descripción
 * lo escribe cualquiera —o lo traduce un modelo de lenguaje—, así que se limpia antes de pintarlo.
 */

/** Lo de Windows-1252 que está fuera del rango 0xA0–0xFF. */
const CP1252_EXTRA = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);

/** Equivalentes sencillos de lo que no está en el conjunto. */
const EQUIVALENTES: Record<string, string> = {
  '‐': '-', // guion
  '‑': '-', // guion que no se corta
  '‒': '-',
  '―': '-',
  '−': '-', // signo menos
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '​': '',
  '‌': '',
  '‍': '',
  '﻿': '',
  '′': "'",
  '″': '"',
  '⁄': '/',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ı: 'i',
};

function dibujable(c: string): boolean {
  const cp = c.codePointAt(0) ?? 0;
  return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || CP1252_EXTRA.has(c);
}

/** El texto sin lo que Helvetica no dibuja (el salto de línea se conserva). */
export function pdfSafe(text: string): string {
  let salida = '';
  for (const c of String(text ?? '').normalize('NFC')) {
    if (c === '\n') {
      salida += c;
    } else if (dibujable(c)) {
      salida += c;
    } else if (c in EQUIVALENTES) {
      salida += EQUIVALENTES[c];
    } else {
      // Una letra con acento que Helvetica no tiene (ź, ş…): se queda su letra base.
      const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (base && [...base].every(dibujable)) salida += base;
      // Lo demás (emoji, palomitas, otros alfabetos) no tiene dibujo: se omite.
    }
  }
  return salida;
}

type Escribe = (texto: string | string[], ...resto: unknown[]) => unknown;

/** Envuelve los métodos de texto de un documento jsPDF para que todo pase por `pdfSafe`. */
export function withSafeText<T extends object>(doc: T): T {
  const d = doc as unknown as Record<string, Escribe>;
  for (const metodo of ['text', 'textWithLink', 'splitTextToSize']) {
    const original = d[metodo];
    if (typeof original !== 'function') continue;
    d[metodo] = (texto, ...resto) =>
      original.call(d, Array.isArray(texto) ? texto.map(pdfSafe) : pdfSafe(texto), ...resto);
  }
  return doc;
}
