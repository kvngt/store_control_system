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
