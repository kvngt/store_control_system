import { getPublicSiteUrl } from '../../lib/siteUrl';

/**
 * Un preset de servicio para selección rápida con un solo toque.
 */
export interface ServicePreset {
  id: 'synthetic' | 'conventional' | 'general' | 'paint_warranty';
  labelKey: string;
  fecha: string;
  millas: number | null;
  nota: string;
}

/**
 * Errores de validación mapeados a claves de i18n.
 */
export interface ServiceValidationErrors {
  fecha?: string;
  millas?: string;
  nota?: string;
  general?: string;
}

/**
 * Suma `months` meses a una fecha en formato 'YYYY-MM-DD' sin conversiones UTC.
 * Ajusta los días finales de mes (p. ej. 31 de enero + 1 mes = 28 o 29 de febrero).
 */
export function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0];
  const month = parts[1]; // 1..12
  const day = parts[2];

  const totalMonths = month - 1 + months;
  const newYear = year + Math.floor(totalMonths / 12);
  const newMonth = ((totalMonths % 12) + 12) % 12 + 1;

  const isLeap = (newYear % 4 === 0 && newYear % 100 !== 0) || newYear % 400 === 0;
  const daysInMonth = [
    31,
    isLeap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  const maxDay = daysInMonth[newMonth - 1];
  const newDay = Math.min(day, maxDay);

  const mm = String(newMonth).padStart(2, '0');
  const dd = String(newDay).padStart(2, '0');
  return `${newYear}-${mm}-${dd}`;
}

/**
 * Suma `days` días a una fecha 'YYYY-MM-DD'.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** La nota de cada preset, en el idioma del sticker (va impresa tal cual). */
const PRESET_NOTES: Record<'es' | 'en', Record<ServicePreset['id'], string>> = {
  es: {
    synthetic: 'Aceite sintético',
    conventional: 'Aceite convencional',
    general: 'Revisión general',
    paint_warranty: 'Revisión de pintura / garantía',
  },
  en: {
    synthetic: 'Synthetic oil change',
    conventional: 'Conventional oil change',
    general: 'General inspection',
    paint_warranty: 'Paint / warranty check',
  },
};

/**
 * Genera los 4 presets de próximo servicio a partir de las millas de ingreso y la fecha base del taller:
 * 1. Aceite sintético: +5,000 mi y +6 meses
 * 2. Aceite convencional: +3,000 mi y +3 meses
 * 3. Revisión general: +5,000 mi y +6 meses
 * 4. Revisión de pintura / garantía: +30 días, sin millas
 */
export function presetsFor(
  millasIngreso: number | null,
  hoy: string,
  idioma: 'es' | 'en' = 'es'
): ServicePreset[] {
  const notas = PRESET_NOTES[idioma];
  return [
    {
      id: 'synthetic',
      labelKey: 'nextService.presets.synthetic',
      fecha: addMonths(hoy, 6),
      millas: millasIngreso !== null ? millasIngreso + 5000 : null,
      nota: notas.synthetic,
    },
    {
      id: 'conventional',
      labelKey: 'nextService.presets.conventional',
      fecha: addMonths(hoy, 3),
      millas: millasIngreso !== null ? millasIngreso + 3000 : null,
      nota: notas.conventional,
    },
    {
      id: 'general',
      labelKey: 'nextService.presets.general',
      fecha: addMonths(hoy, 6),
      millas: millasIngreso !== null ? millasIngreso + 5000 : null,
      nota: notas.general,
    },
    {
      id: 'paint_warranty',
      labelKey: 'nextService.presets.paint_warranty',
      fecha: addDays(hoy, 30),
      millas: null,
      nota: notas.paint_warranty,
    },
  ];
}

/** Más que esto no es un odómetro: la base guarda un INTEGER y un número gigante volvía un error técnico. */
export const MAX_NEXT_SERVICE_MILES = 1_000_000;

/**
 * Valida fecha, millas y nota para programar o sugerir un próximo servicio.
 * Devuelve claves de traducción para los errores detectados.
 */
export function validateNextService(
  input: { fecha: string | null; millas: number | null; nota: string | null },
  hoy: string,
  millasIngreso: number | null
): ServiceValidationErrors {
  const errors: ServiceValidationErrors = {};

  const fechaTrim = input.fecha ? input.fecha.trim() : null;
  const hasFecha = Boolean(fechaTrim);
  const hasMillas = input.millas !== null && !isNaN(input.millas);

  if (!hasFecha && !hasMillas) {
    errors.general = 'nextService.errors.requireDateOrMiles';
  }

  if (hasFecha && fechaTrim! < hoy) {
    errors.fecha = 'nextService.errors.datePast';
  }

  if (hasMillas) {
    if (input.millas! < 0) {
      errors.millas = 'nextService.errors.milesNegative';
    } else if (input.millas! > MAX_NEXT_SERVICE_MILES) {
      // Un número más grande que un INTEGER de la base daba un error técnico al guardar.
      errors.millas = 'nextService.errors.milesTooHigh';
    } else if (millasIngreso !== null && input.millas! < millasIngreso) {
      errors.millas = 'nextService.errors.milesLessThanIntake';
    }
  }

  if (input.nota && input.nota.trim().length > 120) {
    errors.nota = 'nextService.errors.noteTooLong';
  }

  return errors;
}

/**
 * Retorna la URL pública del sticker para el código dado (/s/<token>).
 */
export function serviceStickerUrl(token: string): string {
  return `${getPublicSiteUrl()}/s/${token}`;
}

/**
 * Abre la ventana del sticker. Se llama **dentro del clic**, antes de cualquier `await`: si se
 * abre después (al terminar de guardar), Safari en el iPhone la bloquea. Devuelve `null` si el
 * navegador no la abrió; entonces el PDF se descarga. Vive aquí y no junto al PDF para no cargar
 * jsPDF con la orden.
 */
export function openStickerWindow(): Window | null {
  try {
    return window.open('', '_blank');
  } catch {
    return null;
  }
}

/**
 * Devuelve si un próximo servicio está programado o sugerido (pedido del 16/10/2026).
 */
export function hasNextService(data: {
  token?: string | null;
  fecha?: string | null;
  millas?: number | null;
  sugerido_en?: string | null;
  sugerido_fecha?: string | null;
  sugerido_millas?: number | null;
} | null | undefined): boolean {
  if (!data) return false;
  const isProgrammed = !!data.token && (!!data.fecha || (data.millas !== null && data.millas !== undefined));
  const hasSuggestion = !!data.sugerido_en && (!!data.sugerido_fecha || (data.sugerido_millas !== null && data.sugerido_millas !== undefined));
  return isProgrammed || hasSuggestion;
}

