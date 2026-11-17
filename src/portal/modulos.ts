/**
 * Lectura independiente de `VITE_MODULOS_APAGADOS` para el portal del cliente.
 *
 * El portal no importa módulos de la app principal, por eso lee la variable de
 * entorno directamente aquí.
 */
export function portalModuloActivo(modulo: 'inspeccion'): boolean {
  const raw = import.meta.env.VITE_MODULOS_APAGADOS;
  if (typeof raw !== 'string' || !raw.trim()) return true;
  for (const parte of raw.split(',')) {
    if (parte.trim() === modulo) return false;
  }
  return true;
}
