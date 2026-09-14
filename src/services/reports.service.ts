// Compartir el reporte de una orden con su cliente.
//
// Desde la fase 6 el reporte es el enlace web del cliente (reinventa.shop/r/<token>):
// estado, fotos y videos publicados, presupuesto y cuenta, sin crear cuenta. Ya no
// se sube un PDF: el PDF se genera en el navegador solo para imprimir o archivar
// (`lib/workOrderPdf.ts`). El enlace se manda por correo desde el sistema
// (`customerPortalService.sendReportEmail`) o por WhatsApp desde este mensaje.
import type { Customer, WorkOrder } from '../types/database';
import { whatsAppUrl } from '../lib/phone';

// Movido a lib/phone para que el portal del cliente lo use sin el cliente de
// Supabase. Se reexporta aquí porque es parte de lo que este servicio ofrece.
export { toWhatsAppNumber } from '../lib/phone';

export const reportsService = {
  /** El mensaje que acompaña al enlace por WhatsApp. */
  buildMessage: (order: WorkOrder, url: string, sedeName?: string) => {
    const vehicle = [order.vehiculo?.anio, order.vehiculo?.marca, order.vehiculo?.modelo]
      .filter(Boolean)
      .join(' ');
    const firstName = order.cliente?.nombre?.trim().split(/\s+/)[0];
    const greeting = firstName ? `Hola ${firstName},` : 'Hola,';
    return [
      greeting,
      '',
      `Aquí puede ver el reporte de su orden ${order.numero_orden}${vehicle ? ` (${vehicle})` : ''}: el estado, las fotos y videos del trabajo y su cuenta.`,
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
