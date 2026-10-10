import { telUrl } from '../../lib/phone';
import type { SedeTelefono } from '../../types/database';

export const EMPTY_PHONE: SedeTelefono = { label: '', numero: '' };

/** Por qué no se puede guardar la lista, como clave de traducción. */
export type SedePhonesError = 'settings.phoneMissingNumber' | 'settings.phoneInvalid';

/**
 * Recorta las filas, descarta las vacías y revisa que el resto se pueda marcar. El cliente las
 * toca en el enlace (`tel:`) y las lee en el PDF y en los correos: una descripción sin número,
 * o un número muy corto para llamar, sería una fila muerta frente a él.
 */
export function cleanSedePhones(
  list: SedeTelefono[]
): { phones: SedeTelefono[]; error?: undefined } | { error: SedePhonesError } {
  const phones = list
    .map((p) => ({ label: p.label.trim(), numero: p.numero.trim() }))
    .filter((p) => p.label || p.numero);
  if (phones.some((p) => !p.numero)) return { error: 'settings.phoneMissingNumber' };
  if (phones.some((p) => !telUrl(p.numero))) return { error: 'settings.phoneInvalid' };
  return { phones };
}
