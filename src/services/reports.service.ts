// Sharing a work-order report with the customer who owns it.
//
// No email or WhatsApp provider is wired into this project, and adding one
// means a paid account, API keys and a server that holds them. What the shop
// asked for — "let me send the report to the customer" — does not actually need
// any of that: the PDF is uploaded once, and the admin is handed a WhatsApp or
// mail draft addressed to the customer with the link already in it. They press
// send themselves, from their own number and their own address, which is also
// what the customer expects to receive it from.
import { supabase } from '../lib/supabase';
import type { Customer, WorkOrder } from '../types/database';
import { whatsAppUrl } from '../lib/phone';

const BUCKET = 'reportes';

/** How long a shared report link stays valid. */
export const REPORT_LINK_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Movido a lib/phone para que el portal del cliente lo use sin el cliente de
// Supabase. Se reexporta aquí porque es parte de lo que este servicio ofrece.
export { toWhatsAppNumber } from '../lib/phone';

export const reportsService = {
  /**
   * Uploads a rendered report and returns a link to it.
   *
   * The bucket is private and the link is signed, so the report is reachable by
   * anyone the customer forwards it to but is not sitting on a guessable public
   * URL — it carries the customer's name, their vehicle and its VIN.
   */
  uploadReport: async (order: WorkOrder, pdf: Blob) => {
    const path = `${order.sede_id}/${order.numero_orden}-${Date.now()}.pdf`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;

    const { data, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, REPORT_LINK_TTL_SECONDS);
    if (signError) throw signError;

    return { path, url: data.signedUrl };
  },

  /**
   * The message that goes with the link. Kept here rather than in the dialog
   * so WhatsApp and email say the same thing.
   */
  buildMessage: (order: WorkOrder, url: string, sedeName?: string) => {
    const vehicle = [order.vehiculo?.anio, order.vehiculo?.marca, order.vehiculo?.modelo]
      .filter(Boolean)
      .join(' ');
    const greeting = order.cliente?.nombre ? `Hola ${order.cliente.nombre},` : 'Hola,';
    return [
      greeting,
      '',
      `Le compartimos el reporte de su orden de trabajo ${order.numero_orden}${vehicle ? ` (${vehicle})` : ''}.`,
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

  mailtoLink: (customer: Customer | undefined, subject: string, message: string) =>
    `mailto:${encodeURIComponent(customer?.email || '')}` +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
};
