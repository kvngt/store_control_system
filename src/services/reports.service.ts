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

const BUCKET = 'reportes';

/** How long a shared report link stays valid. */
export const REPORT_LINK_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Strips a phone number down to digits and puts it in the form wa.me expects:
 * country code first, no +, no spaces, no punctuation.
 *
 * Numbers in this shop's records are written every way a person can write one
 * ("(504) 9876-5432", "+504 9876 5432", "98765432"). A local number with no
 * country code is prefixed with `defaultCountryCode`, because wa.me silently
 * fails on one without.
 */
export function toWhatsAppNumber(phone: string, defaultCountryCode = '1'): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  // Already international: a leading 00 is the other way of writing '+'.
  if (digits.startsWith('00')) return digits.slice(2);
  // 10 digits is a bare North-American number; 7-9 is a local one elsewhere.
  // Either way it needs a country code in front of it.
  if (digits.length <= 10) return `${defaultCountryCode}${digits}`;
  return digits;
}

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

  whatsAppLink: (customer: Customer | undefined, message: string) => {
    const number = toWhatsAppNumber(customer?.telefono || '');
    const text = encodeURIComponent(message);
    // Without a number wa.me still opens, with a contact picker — better than
    // a dead button when the customer record has no phone on it.
    return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
  },

  mailtoLink: (customer: Customer | undefined, subject: string, message: string) =>
    `mailto:${encodeURIComponent(customer?.email || '')}` +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
};
