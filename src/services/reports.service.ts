// Compartir el reporte de una orden con su cliente.
//
// Desde la fase 6 el reporte es el enlace web del cliente (restorifyauto.net/r/<token>):
// estado, fotos y videos publicados, presupuesto y cuenta, sin crear cuenta. Ya no
// se sube un PDF: el PDF se genera en el navegador solo para imprimir o archivar
// (`lib/workOrderPdf.ts`). El enlace se manda por correo desde el sistema
// (`customerPortalService.sendReportEmail`) o por WhatsApp desde este mensaje.
import type { Customer, WorkOrder } from '../types/database';
import { whatsAppUrl } from '../lib/phone';
import { getTranslation } from '../i18n/translations';

// Movido a lib/phone para que el portal del cliente lo use sin el cliente de
// Supabase. Se reexporta aquí porque es parte de lo que este servicio ofrece.
export { toWhatsAppNumber } from '../lib/phone';

export const reportsService = {
  /** El mensaje que acompaña al enlace por WhatsApp. */
  buildMessage: (order: WorkOrder, url: string, sedeName?: string) => {
    const lang = order.cliente?.idioma === 'es' ? 'es' : 'en';
    const vehicle = [order.vehiculo?.anio, order.vehiculo?.marca, order.vehiculo?.modelo]
      .filter(Boolean)
      .join(' ');
    const vehicleStr = vehicle ? ` (${vehicle})` : '';
    const firstName = order.cliente?.nombre?.trim().split(/\s+/)[0];
    const greeting = firstName
      ? getTranslation(lang, 'customerLink.reportGreeting').replace('{nombre}', firstName)
      : getTranslation(lang, 'customerLink.reportGreetingNoName');
    const body = getTranslation(lang, 'customerLink.reportBody')
      .replace('{numero}', order.numero_orden)
      .replace('{vehiculo}', vehicleStr);
    return [
      greeting,
      '',
      body,
      '',
      url,
      '',
      sedeName || '',
    ]
      .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
      .join('\n')
      .trim();
  },

  // Without a number wa.me still opens, with a contact picker — better than a
  // dead button when the customer record has no phone on it.
  whatsAppLink: (customer: Customer | undefined, message: string) => whatsAppUrl(customer?.telefono, message),
};
