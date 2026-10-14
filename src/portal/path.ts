/** Prefijo del enlace personal del cliente: restorifyauto.net/r/<token>. */
export const CUSTOMER_PORTAL_PREFIX = '/r/';

export function isCustomerPortalPath(pathname: string): boolean {
  return pathname.startsWith(CUSTOMER_PORTAL_PREFIX);
}

/** El token de la ruta, o null si no tiene la forma de uno. */
export function tokenFromPath(pathname: string): string | null {
  if (!isCustomerPortalPath(pathname)) return null;
  const token = pathname.slice(CUSTOMER_PORTAL_PREFIX.length).split('/')[0];
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

/** Prefijo del sticker de próximo servicio: restorifyauto.net/s/<token>. */
export const SERVICE_PATH_PREFIX = '/s/';

export function isServicePath(pathname: string): boolean {
  return pathname.startsWith(SERVICE_PATH_PREFIX);
}

export function serviceTokenFromPath(pathname: string): string | null {
  if (!isServicePath(pathname)) return null;
  const token = pathname.slice(SERVICE_PATH_PREFIX.length).split('/')[0];
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}
