/**
 * Utilidades para procesamiento y validación de VINs obtenidos mediante escaneo de código de barras.
 */

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Normaliza y valida el texto leído de un código de barras de VIN:
 * 1. Pasa el texto a mayúsculas y quita todo lo que no sea letra o número.
 * 2. Si queda de 18 caracteres y empieza con «I», quita esa «I» (marca de importación de algunas etiquetas).
 * 3. Es válido solo si son 17 caracteres de `^[A-HJ-NPR-Z0-9]{17}$`. Si no, `null`.
 */
export function vinFromBarcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Pasa a mayúsculas y quita todo lo que no sea letra o número (espacios, guiones, asteriscos, etc.)
  let text = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Si queda de 18 caracteres y empieza con «I», quita esa «I»
  if (text.length === 18 && text.startsWith('I')) {
    text = text.slice(1);
  }

  // Válido solo si son 17 caracteres sin I, O ni Q
  if (VIN_REGEX.test(text)) {
    return text;
  }

  return null;
}
