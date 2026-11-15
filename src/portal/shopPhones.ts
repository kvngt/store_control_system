import type { PortalPhoneContact, PortalShop } from './portal.types';

/** Solo la lista que arma la base; cualquier otra cosa cae al `telefono` de siempre. */
export function shopPhones(shop?: PortalShop): PortalPhoneContact[] {
  return Array.isArray(shop?.telefonos) ? shop.telefonos : [];
}
