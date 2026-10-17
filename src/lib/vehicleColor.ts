/**
 * Normalización y traducción de colores automotrices comunes entre español e inglés.
 * Función pura y sin imports.
 */

interface ColorEntry {
  es: string;
  en: string;
}

const COLOR_MAP: Record<string, ColorEntry> = {
  // blanco / White
  blanco: { es: 'Blanco', en: 'White' },
  white: { es: 'Blanco', en: 'White' },

  // negro / Black
  negro: { es: 'Negro', en: 'Black' },
  black: { es: 'Negro', en: 'Black' },

  // gris / Gray (o «Grey»)
  gris: { es: 'Gris', en: 'Gray' },
  gray: { es: 'Gris', en: 'Gray' },
  grey: { es: 'Gris', en: 'Gray' },

  // plata, plateado / Silver
  plata: { es: 'Plata', en: 'Silver' },
  plateado: { es: 'Plata', en: 'Silver' },
  silver: { es: 'Plata', en: 'Silver' },

  // rojo / Red
  rojo: { es: 'Rojo', en: 'Red' },
  red: { es: 'Rojo', en: 'Red' },

  // azul / Blue
  azul: { es: 'Azul', en: 'Blue' },
  blue: { es: 'Azul', en: 'Blue' },

  // azul marino / Navy
  'azul marino': { es: 'Azul marino', en: 'Navy' },
  navy: { es: 'Azul marino', en: 'Navy' },

  // verde / Green
  verde: { es: 'Verde', en: 'Green' },
  green: { es: 'Verde', en: 'Green' },

  // amarillo / Yellow
  amarillo: { es: 'Amarillo', en: 'Yellow' },
  yellow: { es: 'Amarillo', en: 'Yellow' },

  // naranja, anaranjado / Orange
  naranja: { es: 'Naranja', en: 'Orange' },
  anaranjado: { es: 'Naranja', en: 'Orange' },
  orange: { es: 'Naranja', en: 'Orange' },

  // café, marrón / Brown
  cafe: { es: 'Café', en: 'Brown' },
  marron: { es: 'Café', en: 'Brown' },
  brown: { es: 'Café', en: 'Brown' },

  // beige / Beige
  beige: { es: 'Beige', en: 'Beige' },

  // dorado / Gold
  dorado: { es: 'Dorado', en: 'Gold' },
  oro: { es: 'Dorado', en: 'Gold' },
  gold: { es: 'Dorado', en: 'Gold' },

  // morado, púrpura / Purple
  morado: { es: 'Morado', en: 'Purple' },
  purpura: { es: 'Morado', en: 'Purple' },
  purple: { es: 'Morado', en: 'Purple' },

  // vino, guinda / Maroon
  vino: { es: 'Vino', en: 'Maroon' },
  guinda: { es: 'Vino', en: 'Maroon' },
  maroon: { es: 'Vino', en: 'Maroon' },
  burgundy: { es: 'Vino', en: 'Maroon' },

  // champán / Champagne
  champan: { es: 'Champán', en: 'Champagne' },
  champagne: { es: 'Champán', en: 'Champagne' },

  // bronce / Bronze
  bronce: { es: 'Bronce', en: 'Bronze' },
  bronze: { es: 'Bronce', en: 'Bronze' },
};

function normalizeColor(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Traduce el color de un vehículo entre español e inglés.
 * - Compara sin espacios sobrantes, sin mayúsculas y sin acentos, contra el texto completo.
 * - Devuelve la palabra con la primera letra en mayúscula; lo que no conoce, tal cual.
 */
export function translateVehicleColor(
  color: string | null | undefined,
  idioma: 'es' | 'en' = 'es'
): string {
  if (!color || !color.trim()) return '';
  const key = normalizeColor(color);
  const entry = COLOR_MAP[key];
  if (entry) {
    return entry[idioma];
  }
  return color.trim();
}
