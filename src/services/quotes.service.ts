// Presupuestos: lo que el cliente autoriza antes de que se haga y se cobre.
// Todo lo que cambia el estado de una línea pasa por funciones de la base que
// dejan evidencia (quién, cómo, cuándo); nada se aprueba con un UPDATE directo.
import { supabase } from '../lib/supabase';
import type { AdminAuthorizationVia, Quote, QuoteResolution, SendQuoteResult } from '../types/database';

export const quotesService = {
  /** Los presupuestos de una orden, del más nuevo al más viejo. Solo admin. */
  listQuotes: async (orderId: string) => {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('orden_id', orderId)
      .order('numero', { ascending: false });
    if (error) throw error;
    return (data || []) as Quote[];
  },

  /**
   * Junta los borradores en un presupuesto (o los suma al abierto) y, si `notify`,
   * le manda al cliente el correo con su enlace.
   */
  sendQuote: async (orderId: string, notify = true) => {
    const { data, error } = await supabase.rpc('enviar_presupuesto', { p_orden_id: orderId, p_notificar: notify });
    if (error) throw error;
    return data as SendQuoteResult;
  },

  /** Las líneas pendientes vuelven a borrador. */
  cancelQuote: async (quoteId: string) => {
    const { error } = await supabase.rpc('cancelar_presupuesto', { p_presupuesto_id: quoteId });
    if (error) throw error;
  },

  /**
   * "Trabajos autorizados por el cliente". `shownIds` son todas las líneas que el
   * admin tenía a la vista: si la orden cambió, la base rechaza en vez de decidir
   * por líneas que no vio.
   */
  registerAuthorization: async (input: {
    orderId: string;
    approvedIds: string[];
    shownIds: string[];
    via: AdminAuthorizationVia;
    name?: string;
    note?: string;
  }) => {
    const { data, error } = await supabase.rpc('registrar_autorizacion', {
      p_orden_id: input.orderId,
      p_aprobadas: input.approvedIds,
      p_lineas: input.shownIds,
      p_via: input.via,
      p_nombre: input.name?.trim() || null,
      p_nota: input.note?.trim() || null,
    });
    if (error) throw error;
    return data as QuoteResolution;
  },

  /** Órdenes con un presupuesto esperando al cliente (visible también para técnicos). */
  waitingOrderIds: async () => {
    const { data, error } = await supabase.rpc('ordenes_esperando_autorizacion');
    if (error) throw error;
    return new Set(((data as string[] | null) ?? []).map(String));
  },
};
