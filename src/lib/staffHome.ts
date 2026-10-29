/**
 * El panel del personal. No vive en la raíz: en el navegador, `restorifyauto.net/` es siempre la
 * página del taller para los clientes (landing/entry.ts), también para quien ya tiene sesión. Al
 * panel se llega con «Acceso del taller» (/login, que manda aquí si ya hay sesión), con un marcador a
 * esta dirección o desde la app instalada, que abre aquí (`start_url` del manifiesto).
 *
 * public/sw.js repite esta dirección (no puede importar módulos): si cambia, cámbiala allá también.
 */
export const STAFF_HOME = '/panel';
