import type { Theme } from '../context/theme.context';
import { contrast, parseHex, readableOnWhite, type Rgb } from './brandColor';

// The brand custom properties every surface in the app resolves against.
// Overwriting them on <html> re-themes the whole UI without touching a single
// component.
const BRAND_VARS = [
  '--color-primary',
  '--color-primary-light',
  '--color-primary-dark',
  '--color-primary-glow',
  '--color-primary-subtle',
  '--gradient-primary',
  '--gradient-primary-hover',
  '--color-text-inverse',
] as const;

type BrandVar = (typeof BRAND_VARS)[number];

/** Texto oscuro de cada tema (el mismo `--color-text-inverse` de index.css). */
const DARK_TEXT: Record<Theme, Rgb> = { dark: [10, 10, 10], light: [23, 23, 23] };
const WHITE: Rgb = [255, 255, 255];

function toHex([r, g, b]: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`;
}

/** amount 0..1 — mixes the colour towards white. */
function lighten(rgb: Rgb, amount: number): Rgb {
  return rgb.map((v) => v + (255 - v) * amount) as Rgb;
}

/** amount 0..1 — mixes the colour towards black. */
function darken(rgb: Rgb, amount: number): Rgb {
  return rgb.map((v) => v * (1 - amount)) as Rgb;
}

/** Oscuro o blanco: el que más se lea sobre el relleno. */
function textOn(fill: Rgb, theme: Theme): Rgb {
  const dark = DARK_TEXT[theme];
  return contrast(dark, fill) >= contrast(WHITE, fill) ? dark : WHITE;
}

const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;

/**
 * The brand variables for a sede's accent colour, or `null` to keep the default palette.
 *
 * The variants are theme-aware on purpose:
 * - `--color-primary-light` is used as *accent text*, so on a light theme it gets darker
 *   until it reads on white (4.5:1), while on a dark theme it gets lighter.
 * - On a light theme `--color-primary` is a border and an indicator (focus ring, active
 *   tab), so a pale colour — a yellow like the logo's — is darkened just enough to show on
 *   white (3:1). The hue stays: it still looks like the sede's colour. The button fill
 *   (`--gradient-primary`) keeps the colour as chosen: with dark text on top it reads fine,
 *   and the darkened `--color-primary` is its border. Same split as the default palette.
 * - `--color-text-inverse` goes on top of the fill (buttons, avatars): dark on a light
 *   colour, white on a dark one. A fixed value made either a navy or a yellow sede
 *   unreadable.
 */
export function brandPalette(color: string | null | undefined, theme: Theme): Record<BrandVar, string> | null {
  const base = parseHex(color);
  if (!base) return null;

  if (theme === 'light') {
    const line = readableOnWhite(base, 3);
    return {
      '--color-primary': toHex(line),
      '--color-primary-light': toHex(readableOnWhite(base, 4.5)),
      '--color-primary-dark': toHex(darken(line, 0.08)),
      '--color-primary-glow': rgba(line, 0.18),
      '--color-primary-subtle': rgba(line, 0.1),
      // Solid on light, gradient on dark — same rule as the default palette.
      '--gradient-primary': toHex(base),
      '--gradient-primary-hover': toHex(darken(base, 0.06)),
      '--color-text-inverse': toHex(textOn(base, theme)),
    };
  }

  const accentText = lighten(base, 0.25);
  const fillDark = darken(base, 0.18);
  return {
    '--color-primary': toHex(base),
    '--color-primary-light': toHex(accentText),
    '--color-primary-dark': toHex(fillDark),
    '--color-primary-glow': rgba(base, 0.25),
    '--color-primary-subtle': rgba(base, 0.08),
    '--gradient-primary': `linear-gradient(135deg, ${toHex(base)}, ${toHex(fillDark)})`,
    '--gradient-primary-hover': `linear-gradient(135deg, ${toHex(accentText)}, ${toHex(base)})`,
    '--color-text-inverse': toHex(textOn(base, theme)),
  };
}

/** Applies a sede's accent colour to the document (see `brandPalette`). */
export function applySedeBranding(color: string | null | undefined, theme: Theme) {
  const palette = brandPalette(color, theme);
  if (!palette) {
    clearSedeBranding();
    return;
  }
  const root = document.documentElement;
  for (const name of BRAND_VARS) root.style.setProperty(name, palette[name]);
}

/** Falls back to the default Restorify palette defined in index.css. */
export function clearSedeBranding() {
  const root = document.documentElement;
  BRAND_VARS.forEach((v) => root.style.removeProperty(v));
}
