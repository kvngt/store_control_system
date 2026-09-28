/**
 * El color de cada taller, listo para imprimir sobre papel blanco.
 *
 * Cada sede elige su `color_tema` en Configuración, y el portal y los correos ya lo usan.
 * El PDF no: tenía el dorado de la app fijo, así que el reporte de cualquier taller salía
 * con el mismo color aunque el logo de arriba fuera de otro.
 *
 * El color se usa de dos formas, y no sirven igual. En una **raya** cualquier color se ve.
 * En **texto** no: un amarillo claro — el de la sede principal es `#e8c64a` — sobre blanco
 * no se lee. Por eso hay dos versiones: el color tal cual para las rayas, y uno oscurecido
 * lo justo para que el texto llegue al contraste 4.5:1 que pide WCAG para letra normal.
 */

export type Rgb = [number, number, number];

/** El dorado de la app (`--color-primary`), para la sede que no eligió color. */
export const DEFAULT_BRAND: Rgb = [212, 160, 23];

/** `#rrggbb` → `[r, g, b]`, o `null` si no es un color de seis dígitos. */
export function parseHex(color: string | null | undefined): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((color ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminancia relativa de WCAG 2.x. */
function luminance([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Contraste contra blanco, de 1 (blanco) a 21 (negro). */
export function contrastOnWhite(rgb: Rgb): number {
  return 1.05 / (luminance(rgb) + 0.05);
}

/**
 * El mismo tono, oscurecido lo justo para leerse sobre blanco.
 *
 * Se mezcla con negro en pasos pequeños en vez de cambiar a un gris fijo: así un amarillo
 * sigue siendo un dorado oscuro y el reporte sigue pareciendo de ese taller. Un color que
 * ya se lee se devuelve sin tocar.
 */
export function readableOnWhite(rgb: Rgb, minContrast = 4.5): Rgb {
  let actual = rgb;
  for (let paso = 0; paso < 20 && contrastOnWhite(actual) < minContrast; paso++) {
    actual = actual.map((v) => Math.round(v * 0.9)) as Rgb;
  }
  return actual;
}

/** El color de la sede para rayas y el de texto, con el dorado de la app si no hay uno válido. */
export function brandColors(color: string | null | undefined): { accent: Rgb; text: Rgb } {
  const accent = parseHex(color) ?? DEFAULT_BRAND;
  return { accent, text: readableOnWhite(accent) };
}
