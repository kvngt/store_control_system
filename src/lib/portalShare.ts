import { getTranslation } from '../i18n/translations';
import { isValidEmail } from './email';

export interface ShareOrderContext {
  numero_orden: string;
  cliente?: {
    nombre?: string | null;
    email?: string | null;
    idioma?: string | null;
    acepta_correos?: boolean;
  } | null;
}

/** Agrega `?vista=taller` al enlace del portal para que la vista del taller no cambie el idioma de correos. */
export function staffPortalUrl(url: string): string {
  if (!url) return '';
  if (url.includes('vista=taller')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}vista=taller`;
}

/** Indica si el cliente tiene correo válido y acepta recibir correos del taller. */
export function customerCanReceiveEmail(customer: ShareOrderContext['cliente']): boolean {
  return Boolean(customer && isValidEmail(customer.email) && customer.acepta_correos !== false);
}

/** Construye el mensaje de WhatsApp/SMS en el idioma del cliente para compartir su enlace del portal. */
export function buildCustomerShareMessage(
  order: ShareOrderContext,
  url: string,
  translationKey = 'customerLink.whatsappMessage'
): string {
  if (!url) return '';
  const clientLang = order.cliente?.idioma === 'es' ? 'es' : 'en';
  const firstName = order.cliente?.nombre?.split(' ')[0] || '';
  return getTranslation(clientLang, translationKey)
    .replace('{nombre}', firstName)
    .replace('{numero}', order.numero_orden)
    .replace('{url}', url)
    .replace(/\s+,/, ',');
}
