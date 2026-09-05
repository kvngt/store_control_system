import type { Theme } from '../context/theme.context';

// The five brand custom properties every surface in the app resolves against.
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
] as const;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`;
}

/** amount 0..1 — mixes the colour towards white. */
function lighten(rgb: Rgb, amount: number): Rgb {
  return {
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount,
  };
}

/** amount 0..1 — mixes the colour towards black. */
function darken(rgb: Rgb, amount: number): Rgb {
  return { r: rgb.r * (1 - amount), g: rgb.g * (1 - amount), b: rgb.b * (1 - amount) };
}

/**
 * Applies a sede's accent colour to the document.
 *
 * The light/dark variants are theme-aware on purpose: `--color-primary-light`
 * is used as *accent text*, so on a light theme it has to get darker (contrast
 * against white), while on a dark theme it gets lighter. Getting this backwards
 * is what makes custom-branded UIs unreadable.
 */
export function applySedeBranding(color: string | null | undefined, theme: Theme) {
  const root = document.documentElement;

  if (!color) {
    clearSedeBranding();
    return;
  }

  const base = hexToRgb(color);
  if (!base) {
    clearSedeBranding();
    return;
  }

  const isLight = theme === 'light';
  const accentText = isLight ? darken(base, 0.3) : lighten(base, 0.25);
  const fillDark = isLight ? darken(base, 0.15) : darken(base, 0.18);

  root.style.setProperty('--color-primary', toHex(base));
  root.style.setProperty('--color-primary-light', toHex(accentText));
  root.style.setProperty('--color-primary-dark', toHex(fillDark));
  root.style.setProperty('--color-primary-glow', `rgba(${base.r}, ${base.g}, ${base.b}, ${isLight ? 0.18 : 0.25})`);
  root.style.setProperty('--color-primary-subtle', `rgba(${base.r}, ${base.g}, ${base.b}, ${isLight ? 0.1 : 0.08})`);

  // Solid on light, gradient on dark — same rule as the default palette.
  root.style.setProperty('--gradient-primary', isLight ? toHex(base) : `linear-gradient(135deg, ${toHex(base)}, ${toHex(fillDark)})`);
  root.style.setProperty(
    '--gradient-primary-hover',
    isLight ? toHex(fillDark) : `linear-gradient(135deg, ${toHex(accentText)}, ${toHex(base)})`
  );
}

/** Falls back to the default Restorify gold defined in index.css. */
export function clearSedeBranding() {
  const root = document.documentElement;
  BRAND_VARS.forEach((v) => root.style.removeProperty(v));
}
