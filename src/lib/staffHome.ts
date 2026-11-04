/**
 * El panel del personal. No vive en la raíz: en el navegador, `restorifyauto.net/` es siempre la
 * página del taller para los clientes (landing/entry.ts), también para quien ya tiene sesión. Al
 * panel se llega con «Acceso del taller» (/login, que manda aquí si ya hay sesión), con un marcador a
 * esta dirección o desde la app instalada, que abre aquí (`start_url` del manifiesto).
 *
 * public/sw.js repite esta dirección (no puede importar módulos): si cambia, cámbiala allá también.
 */
export const STAFF_HOME = '/panel';

/**
 * A dónde volver después de iniciar sesión: la dirección que la persona quería abrir (un correo o un
 * aviso con /work-orders?open=…) si ProtectedRoute la mandó al login, o el panel. Solo rutas de la
 * propia app: nada que empiece con // (otro sitio) ni el login otra vez.
 */
export function afterLoginPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/login')) {
    return STAFF_HOME;
  }
  return from;
}
