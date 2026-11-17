// Teléfonos → enlaces de WhatsApp, SMS y de llamada.
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
// SMS desde el teléfono de quien envía
// ------------------------------------------------------------------------------------
// Mientras no haya SMS automático (Twilio), el admin manda el aviso desde su propio
// teléfono: el enlace `sms:` abre la app de Mensajes con el número y el texto listos y
// solo falta tocar Enviar. En una computadora no hay app de SMS confiable (Windows abre
// otra cosa o nada), así que ahí se queda WhatsApp.

type SmsNavigator = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>;

/** iPhone, iPod o iPad. El iPad con iPadOS 13+ dice ser una Mac; lo delata la pantalla táctil. */
export function isAppleMobile(nav: SmsNavigator | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/i.test(nav.userAgent)) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

/** ¿El dispositivo tiene una app de mensajes que abra un `sms:`? Teléfonos y tabletas, no computadoras. */
export function canOpenSms(nav: SmsNavigator | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  return isAppleMobile(nav) || /Android/i.test(nav.userAgent);
}

/**
 * `sms:+15125550100?body=…`. iOS separa el texto con `&` y Android con `?`; con el
 * separador del otro, iOS abre Mensajes sin el texto. Sin número abre Mensajes para elegir
 * contacto. El número va con su país (el mismo que usa WhatsApp) y el "+" delante.
 */
export function smsUrl(
  phone: string | null | undefined,
  message: string,
  ios: boolean = isAppleMobile(),
): string {
  const digits = toWhatsAppNumber(phone || '');
  const number = digits ? `+${digits}` : '';
  return `sms:${number}${ios ? '&' : '?'}body=${encodeURIComponent(message)}`;
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
  const raw = (national ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // Pegado con su país ("+1 202 607 6126" de un contacto o un correo): ese país manda, no el
  // del selector. Antes salía el "+1" dos veces y el número quedaba inservible.
  if (raw.startsWith('+')) return `+${digits}`;
  const dial = countryByIso(iso)?.dial ?? '1';
  // "1 202 607 6126" con +1 elegido: ese 1 es el de larga distancia, no parte del número.
  const nacional = dial === '1' && digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return `+${dial}${nacional}`;
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

/**
 * Un número de +1 tiene diez dígitos; con otra cantidad seguramente falta o sobra alguno. Once que
 * empiezan con 1, o uno pegado con su "+", están bien: toE164 los arregla.
 */
export function looksIncomplete(iso: string, national: string): boolean {
  if ((national ?? '').trim().startsWith('+')) return false;
  const digits = (national ?? '').replace(/\D/g, '');
  const completo = digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
  return countryByIso(iso)?.dial === '1' && digits.length > 0 && !completo;
}

/**
 * Largo esperado del número nacional (sin prefijo de país) según cada país de `PHONE_COUNTRIES`.
 * - NANP (+1: US, PR, DO), MX (+52), CO (+57), VE (+58): 10 dígitos.
 * - AR (+54): 10 dígitos (fijo/móvil sin 9) o 11 (móvil internacional con 9).
 * - CL (+56), ES (+34), PE (+51): 9 dígitos.
 * - EC (+593): 8–9 dígitos (fijo 8, móvil 9).
 * - PA (+507): 7–8 dígitos (fijo 7, móvil 8).
 * - CR (+506), CU (+53), SV (+503), GT (+502), HN (+504), NI (+505): 8 dígitos.
 */
const NATIONAL_DIGIT_BOUNDS: Record<string, [number, number]> = {
  US: [10, 10],
  MX: [10, 10],
  AR: [10, 11],
  CL: [9, 9],
  CO: [10, 10],
  CR: [8, 8],
  CU: [8, 8],
  EC: [8, 9],
  SV: [8, 8],
  ES: [9, 9],
  GT: [8, 8],
  HN: [8, 8],
  NI: [8, 8],
  PA: [7, 8],
  PE: [9, 9],
  PR: [10, 10],
  DO: [10, 10],
  VE: [10, 10],
};

/** Solo deja dígitos y signos de formato telefónico (+ al principio, espacios, paréntesis, guiones, puntos). */
export function sanitizePhoneInput(raw: string): string {
  let seenPlus = false;
  let out = '';
  for (const ch of raw) {
    if (ch === '+') {
      if (!seenPlus && out.trim() === '') {
        seenPlus = true;
        out += ch;
      }
      continue;
    }
    if (/[\d()\s.-]/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

/**
 * Valida un número completo (internacional `+...` o heredado sin `+`) contra las reglas de su país.
 * Rechaza letras, símbolos ajenos y teléfonos incompletos.
 */
export function isValidPhone(value: string | null | undefined): boolean {
  const raw = (value ?? '').trim();
  if (!raw) return false;
  if (!/^[+\d()\s.-]+$/.test(raw)) return false;
  // Un "+" en medio del texto no es un teléfono válido.
  if (raw.indexOf('+', 1) !== -1) return false;

  const digits = raw.replace(/\D/g, '');
  if (!digits) return false;

  if (raw.startsWith('+')) {
    const candidatos = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    const known = candidatos.find((c) => digits.startsWith(c.dial));
    if (!known) {
      // País fuera de la lista (p. ej. +44): exigir largo E.164 razonable (8 a 15 dígitos en total).
      return digits.length >= 8 && digits.length <= 15;
    }
    const { iso, national } = parsePhone(raw);
    const bounds = NATIONAL_DIGIT_BOUNDS[iso] ?? [7, 15];
    return national.length >= bounds[0] && national.length <= bounds[1];
  }

  // Teléfono viejo guardado sin "+" (se interpreta como EE. UU., 10 dígitos o 1 + 10 dígitos).
  const { iso, national } = parsePhone(raw);
  const bounds = NATIONAL_DIGIT_BOUNDS[iso] ?? [10, 10];
  return national.length >= bounds[0] && national.length <= bounds[1];
}

/**
 * Un teléfono de la sede en una línea, para el PDF y Configuración: "Spanish: 202-607-6126
 * (WhatsApp)". Sin descripción va `fallbackLabel` (el tipo, en el idioma de quien lo lee).
 */
export function sedePhoneLine(
  p: { label?: string | null; numero: string; whatsapp?: boolean },
  fallbackLabel: string
): string {
  const label = (p.label ?? '').trim() || fallbackLabel.trim();
  const num = (p.numero ?? '').trim();
  const wa = p.whatsapp ? ' (WhatsApp)' : '';
  return label ? `${label}: ${num}${wa}` : `${num}${wa}`;
}

