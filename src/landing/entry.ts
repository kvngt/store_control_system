import { isCustomerPortalPath, isServicePath } from '../portal/path';

// Qué paquete arranca en cada dirección (lo usa main.tsx antes de descargar nada).
//
// Este archivo va en el paquete inicial de las tres aplicaciones: no importes aquí nada más que
// `portal/path`.

export type Entry = 'portal' | 'landing' | 'app';

/** La página del taller siempre, también dentro de la app instalada. */
export const LANDING_ALIAS = '/home';

export interface EntryContext {
  /** Corre como la app instalada (PWA), no en una pestaña del navegador. */
  installed: boolean;
  /** `location.search` y `location.hash`, para reconocer el regreso de un enlace de acceso. */
  search?: string;
  hash?: string;
}

/**
 * Un enlace de Supabase que vuelve al sitio con la sesión en la URL. El de recuperar la contraseña
 * apunta a /reset-password, pero si esa dirección no está en la lista de Redirect URLs, Supabase la
 * descarta sin avisar y manda a la raíz (lib/siteUrl.ts): ahí tiene que arrancar la app, que es la
 * que lee la sesión, y no la página del taller.
 */
export function isAuthCallback(search = '', hash = ''): boolean {
  return (
    /(^#|&)(access_token|refresh_token|error_description|error_code)=/.test(hash) ||
    /[?&](code|token_hash|error_description)=/.test(search)
  );
}

export function chooseEntry(pathname: string, ctx: EntryContext): Entry {
  if (isCustomerPortalPath(pathname) || isServicePath(pathname)) return 'portal';
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === LANDING_ALIAS) return 'landing';
  const isRoot = path === '/' || path === '/index.html';
  // En el navegador la raíz es siempre la página del taller, también para quien tiene sesión del
  // personal: al panel se entra con «Acceso del taller» (/login) o en /panel (lib/staffHome.ts). La
  // app instalada (la usa el personal) sigue abriendo la app, que la manda al login o al panel.
  if (isRoot && !ctx.installed && !isAuthCallback(ctx.search, ctx.hash)) return 'landing';
  return 'app';
}

export function isInstalledApp(): boolean {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    // Safari en iPhone no conoce display-mode para lo agregado a la pantalla de inicio.
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
