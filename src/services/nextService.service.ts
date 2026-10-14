import { supabase } from '../lib/supabase';
import type { NextServiceInput, OrderNextService } from '../types/database';

export const nextServiceService = {
  /**
   * Obtiene el próximo servicio programado o sugerido de una orden de trabajo.
   */
  getNextService: async (ordenId: string): Promise<OrderNextService | null> => {
    const { data, error } = await supabase
      .from('orden_proximo_servicio')
      .select('*')
      .eq('orden_id', ordenId)
      .maybeSingle();

    if (error) throw error;
    return data as OrderNextService | null;
  },

  /**
   * Sugiere fecha y/o millaje para el próximo servicio (técnico asignado).
   */
  suggest: async (ordenId: string, input: NextServiceInput): Promise<void> => {
    const { error } = await supabase.rpc('sugerir_proximo_servicio', {
      p_orden_id: ordenId,
      p_fecha: input.fecha,
      p_millas: input.millas,
      p_nota: input.nota,
    });
    if (error) throw error;
  },

  /**
   * Programa el próximo servicio y genera/conserva el código para el sticker (solo admin).
   */
  program: async (ordenId: string, input: NextServiceInput): Promise<OrderNextService> => {
    const { data, error } = await supabase.rpc('programar_proximo_servicio', {
      p_orden_id: ordenId,
      p_fecha: input.fecha,
      p_millas: input.millas,
      p_nota: input.nota,
    });
    if (error) throw error;
    return data as OrderNextService;
  },

  /**
   * Quita el próximo servicio programado y borra el código público (solo admin).
   */
  remove: async (ordenId: string): Promise<void> => {
    const { error } = await supabase.rpc('quitar_proximo_servicio', {
      p_orden_id: ordenId,
    });
    if (error) throw error;
  },

  /**
   * Descarta la sugerencia enviada por el técnico sin alterar lo programado (solo admin).
   */
  discardSuggestion: async (ordenId: string): Promise<void> => {
    const { error } = await supabase.rpc('descartar_sugerencia_proximo_servicio', {
      p_orden_id: ordenId,
    });
    if (error) throw error;
  },
};
