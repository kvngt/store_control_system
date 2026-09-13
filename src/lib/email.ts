/**
 * La misma regla que `es_correo_valido` y los CHECK de clientes y sedes en la base:
 * algo@algo.algo, sin espacios. No pretende validar que el buzón exista, solo
 * atrapar el error de dedo antes de que la base lo rechace.
 */
export function isValidEmail(value: string | null | undefined): boolean {
  return !!value && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

/** Vacío es válido (el correo es opcional); si hay algo, tiene que tener forma de correo. */
export function isOptionalEmailValid(value: string | null | undefined): boolean {
  return !value || !value.trim() || isValidEmail(value);
}
