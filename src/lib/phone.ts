// Teléfonos → enlaces de WhatsApp y de llamada.
//
// Vive aparte de reports.service para que el portal del cliente lo use sin
// arrastrar el cliente de Supabase a su paquete.

/**
 * Strips a phone number down to digits and puts it in the form wa.me expects:
 * country code first, no +, no spaces, no punctuation.
 *
 * Numbers in this shop's records are written every way a person can write one
 * ("(504) 9876-5432", "+504 9876 5432", "98765432"). A local number with no
 * country code is prefixed with `defaultCountryCode`, because wa.me silently
 * fails on one without.
 */
export function toWhatsAppNumber(phone: string, defaultCountryCode = '1'): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  // Con "+" delante el número ya dice su país, y no hay que adivinar nada. Antes se contaban
  // los dígitos también en ese caso, así que un número internacional corto recibía el prefijo
  // de EE. UU. encima: Cuba es +53 más ocho dígitos, diez en total, y "+53 5123 4567" abría
  // WhatsApp con el 1-535-123-4567.
  if ((phone || '').trim().startsWith('+')) return digits;
  // Already international: a leading 00 is the other way of writing '+'.
  if (digits.startsWith('00')) return digits.slice(2);
  // 10 digits is a bare North-American number; 7-9 is a local one elsewhere.
  // Either way it needs a country code in front of it.
  if (digits.length <= 10) return `${defaultCountryCode}${digits}`;
  return digits;
}

/** `https://wa.me/<número>?text=…`, o el selector de contactos si no hay número. */
export function whatsAppUrl(phone: string | null | undefined, message: string): string {
  const number = toWhatsAppNumber(phone || '');
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** `tel:` con solo dígitos y el + inicial, que es lo que marcan todos los teléfonos. */
export function telUrl(phone: string | null | undefined): string | null {
  const cleaned = (phone || '').replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 7 ? `tel:${cleaned}` : null;
}

// ------------------------------------------------------------------------------------
// País del número
// ------------------------------------------------------------------------------------
// El teléfono del cliente se guarda en formato internacional (E.164: "+15551234567") en la
// misma columna `clientes.telefono`. Así el número dice de qué país es, y la llamada y
// WhatsApp marcan bien sin adivinar. Los que ya estaban guardados sin "+" siguen sirviendo:
// se leen como de EE. UU., que es lo que ya se asumía al abrir WhatsApp.

export interface PhoneCountry {
  /** ISO 3166-1 alfa-2; también la clave de su nombre en i18n (`phone.countries.<iso>`). */
  iso: string;
  /** Prefijo internacional, sin "+". */
  dial: string;
  flag: string;
}

/**
 * Estados Unidos primero (el taller está allá) y México después; el resto, los orígenes más
 * comunes de la clientela hispana en EE. UU., en orden alfabético por su nombre en español.
 *
 * Puerto Rico y República Dominicana marcan con +1 igual que EE. UU.; se distinguen por el
 * código de área (ver `areaCodesOf`). Canadá también usa +1 y no se lista aparte: el número
 * guardado sería idéntico.
 */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'US', dial: '1', flag: '🇺🇸' },
  { iso: 'MX', dial: '52', flag: '🇲🇽' },
  { iso: 'AR', dial: '54', flag: '🇦🇷' },
  { iso: 'CL', dial: '56', flag: '🇨🇱' },
  { iso: 'CO', dial: '57', flag: '🇨🇴' },
  { iso: 'CR', dial: '506', flag: '🇨🇷' },
  { iso: 'CU', dial: '53', flag: '🇨🇺' },
  { iso: 'EC', dial: '593', flag: '🇪🇨' },
  { iso: 'SV', dial: '503', flag: '🇸🇻' },
  { iso: 'ES', dial: '34', flag: '🇪🇸' },
  { iso: 'GT', dial: '502', flag: '🇬🇹' },
  { iso: 'HN', dial: '504', flag: '🇭🇳' },
  { iso: 'NI', dial: '505', flag: '🇳🇮' },
  { iso: 'PA', dial: '507', flag: '🇵🇦' },
  { iso: 'PE', dial: '51', flag: '🇵🇪' },
  { iso: 'PR', dial: '1', flag: '🇵🇷' },
  { iso: 'DO', dial: '1', flag: '🇩🇴' },
  { iso: 'VE', dial: '58', flag: '🇻🇪' },
];

export const DEFAULT_PHONE_COUNTRY = 'US';

/** Códigos de área de los países que comparten el +1 con EE. UU. */
const areaCodesOf: Record<string, string[]> = {
  PR: ['787', '939'],
  DO: ['809', '829', '849'],
};

const countryByIso = (iso: string) => PHONE_COUNTRIES.find((c) => c.iso === iso);

/**
 * `"+525512345678"` → `{ iso: 'MX', national: '5512345678' }`.
 *
 * Un valor sin "+" es uno guardado antes del selector de país: se lee como de EE. UU. sin
 * reescribirlo, y un 1 inicial de once dígitos se toma por el prefijo. Nada de esto cambia
 * lo guardado hasta que alguien edita el teléfono.
 */
export function parsePhone(value: string | null | undefined): { iso: string; national: string } {
  const raw = (value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+')) {
    const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    return { iso: DEFAULT_PHONE_COUNTRY, national };
  }
  // El prefijo más largo que case: 502 antes que 5x, y ninguno es prefijo de otro de la lista.
  const candidatos = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  const pais = candidatos.find((c) => digits.startsWith(c.dial));
  if (!pais) return { iso: DEFAULT_PHONE_COUNTRY, national: digits };
  const national = digits.slice(pais.dial.length);
  if (pais.dial === '1') {
    const area = national.slice(0, 3);
    const territorio = Object.entries(areaCodesOf).find(([, areas]) => areas.includes(area));
    return { iso: territorio ? territorio[0] : DEFAULT_PHONE_COUNTRY, national };
  }
  return { iso: pais.iso, national };
}

/** `('MX', '55 1234 5678')` → `"+525512345678"`; sin número, cadena vacía. */
export function toE164(iso: string, national: string): string {
  const digits = (national ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const dial = countryByIso(iso)?.dial ?? '1';
  return `+${dial}${digits}`;
}

/**
 * Para leer en pantalla y en el PDF: `"+15551234567"` → `"+1 (555) 123-4567"`,
 * `"+525512345678"` → `"+52 55 1234 5678"`.
 *
 * Un valor viejo sin "+" se muestra tal cual. Formatearlo sería inventarle un país que nadie
 * escribió: "55550899" no es un número de EE. UU. aunque así lo lea WhatsApp.
 */
export function formatPhone(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw.startsWith('+')) return raw;
  const { iso, national } = parsePhone(raw);
  const dial = countryByIso(iso)?.dial ?? '';
  if (dial === '1' && national.length === 10) {
    return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  if (national.length === 10) return `+${dial} ${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`;
  if (national.length === 8) return `+${dial} ${national.slice(0, 4)} ${national.slice(4)}`;
  return `+${dial} ${national}`;
}

/** Un número de +1 tiene diez dígitos; con otra cantidad seguramente falta o sobra alguno. */
export function looksIncomplete(iso: string, national: string): boolean {
  const digits = (national ?? '').replace(/\D/g, '');
  return countryByIso(iso)?.dial === '1' && digits.length > 0 && digits.length !== 10;
}
