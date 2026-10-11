import { telUrl } from '../../lib/phone';
import type { SedeTelefono } from '../../types/database';

export const EMPTY_PHONE: SedeTelefono = {
  label: '',
  numero: '',
  tipo: 'celular',
  whatsapp: false,
};

/** Por qué no se puede guardar la lista, como clave de traducción. */
export type SedePhonesError =
  | 'settings.phoneMissingNumber'
  | 'settings.phoneInvalid'
  | 'settings.phoneWhatsappInvalid';

/**
 * Normaliza un teléfono leído de la base (o parcial), asegurando defaults:
 * tipo 'oficina' si no viene explícitamente 'celular', y whatsapp false si no es true.
 */
export function normalizeSedePhone(p: Partial<SedeTelefono>): SedeTelefono {
  return {
    label: p.label ?? '',
    numero: p.numero ?? '',
    tipo: p.tipo === 'celular' ? 'celular' : 'oficina',
    whatsapp: p.whatsapp === true,
  };
}

/**
 * Para marcar WhatsApp, el número necesita código de área:
 * 10 dígitos o más, o empezar con '+' y tener 8 dígitos o más.
 */
function isWhatsAppNumberValid(numero: string): boolean {
  const digits = numero.replace(/\D/g, '');
  if (numero.trim().startsWith('+')) {
    return digits.length >= 8;
  }
  return digits.length >= 10;
}

/**
 * Recorta las filas, descarta las vacías y revisa que el resto se pueda marcar.
 * Si tiene WhatsApp activado, valida que tenga código de área o país.
 */
export function cleanSedePhones(
  list: SedeTelefono[]
): { phones: SedeTelefono[]; error?: undefined } | { error: SedePhonesError } {
  const phones = list
    .map((p) => ({
      label: p.label.trim(),
      numero: p.numero.trim(),
      tipo: p.tipo === 'celular' ? ('celular' as const) : ('oficina' as const),
      whatsapp: Boolean(p.whatsapp),
    }))
    .filter((p) => p.label || p.numero);

  if (phones.some((p) => !p.numero)) return { error: 'settings.phoneMissingNumber' };
  if (phones.some((p) => !telUrl(p.numero))) return { error: 'settings.phoneInvalid' };
  if (phones.some((p) => p.whatsapp && !isWhatsAppNumberValid(p.numero))) {
    return { error: 'settings.phoneWhatsappInvalid' };
  }

  return { phones };
}
