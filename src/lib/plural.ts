/** Devuelve la clave singular (`*One`) para 1 y plural (`*Many`) para cualquier otro número (incluido 0). */
export function pluralKey<B extends string>(base: B, n: number): `${B}One` | `${B}Many` {
  return `${base}${n === 1 ? 'One' : 'Many'}`;
}
