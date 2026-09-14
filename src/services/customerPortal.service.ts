// El enlace personal del cliente a su reporte y los correos que se le mandan.
// Todo esto es de administración: las tablas y funciones lo exigen en la base.
import { supabase } from '../lib/supabase';
import { getPublicSiteUrl } from '../lib/siteUrl';
import { CUSTOMER_PORTAL_PREFIX } from '../portal/path';
import type { CustomerEmail, CustomerLink } from '../types/database';

export const customerPortalService = {
  /** reinventa.shop/r/<token> */
  portalUrl: (token: string) => `${getPublicSiteUrl()}${CUSTOMER_PORTAL_PREFIX}${token}`,

  /** El enlace activo de la orden, o null si todavía no tiene. */
  getActiveLink: async (orderId: string) => {
    const { data, error } = await supabase
      .from('orden_enlaces')
      .select('*')
      .eq('orden_id', orderId)
      .is('revocado_en', null)
      .maybeSingle();
    if (error) throw error;
    return data as CustomerLink | null;
  },

  createLink: async (orderId: string) => {
    const { data, error } = await supabase.rpc('crear_enlace_cliente', { p_orden_id: orderId });
    if (error) throw error;
    return data as CustomerLink;
  },

  /** El anterior deja de abrir. Para cuando el enlace llegó a quien no debía. */
  regenerateLink: async (orderId: string) => {
    const { data, error } = await supabase.rpc('regenerar_enlace_cliente', { p_orden_id: orderId });
    if (error) throw error;
    return data as CustomerLink;
  },

  revokeLink: async (orderId: string) => {
    const { error } = await supabase.rpc('revocar_enlace_cliente', { p_orden_id: orderId });
    if (error) throw error;
  },

  /**
   * "Avisar al cliente": encola un correo de novedades. `sin_correo` si el cliente
   * no tiene un correo válido o pidió no recibir correos.
   */
  notifyProgress: async (orderId: string) => {
    const { data, error } = await supabase.rpc('notificar_cliente_avance', { p_orden_id: orderId });
    if (error) throw error;
    return data as 'encolado' | 'sin_correo';
  },

  /**
   * "Enviar por correo" del reporte: sale desde el sistema (Resend) con el enlace
   * personal. Crea el enlace si la orden no tenía. `sin_correo` si el cliente no
   * tiene un correo válido o pidió no recibir correos.
   */
  sendReportEmail: async (orderId: string) => {
    const { data, error } = await supabase.rpc('enviar_reporte_cliente', { p_orden_id: orderId });
    if (error) throw error;
    return data as { correo: 'encolado' | 'sin_correo'; token: string };
  },

  /** Los últimos correos al cliente de esta orden, del más nuevo al más viejo. */
  listEmails: async (orderId: string) => {
    const { data, error } = await supabase
      .from('cola_envios')
      .select('id, plantilla, estado, destinatario, datos, intentos, ultimo_error, enviar_despues_de, creado_en, enviado_en')
      .eq('orden_id', orderId)
      .eq('canal', 'email')
      .order('creado_en', { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data || []) as CustomerEmail[];
  },
};
