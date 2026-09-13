/** Prefijo del enlace personal del cliente: reinventa.shop/r/<token>. */
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
