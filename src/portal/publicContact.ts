import { SHOP, type LineId } from '../landing/business';
import type { PortalPhoneContact } from './portal.types';

const LINE_LABELS: Record<LineId, string> = {
  en: 'English',
  es: 'Español',
  office: '',
};

export const publicShopName = SHOP.name;

/**
 * Teléfonos públicos del negocio para enlaces inválidos que llegan sin datos del taller.
 * Omite nombres de personas.
 */
export function publicShopPhones(): PortalPhoneContact[] {
  return SHOP.lines.map((line) => ({
    label: LINE_LABELS[line.id],
    numero: line.display,
    tipo: line.id === 'office' ? 'oficina' : 'celular',
    whatsapp: line.whatsapp,
  }));
}
