import { supabase } from '../lib/supabase';
import type { WorkshopMetrics } from '../types/database';

export const metricsService = {
  /**
   * Obtiene los indicadores y métricas del taller por sede y período (solo administración).
   */
  getWorkshopMetrics: async (
    sedeId: string,
    desde: string,
    hasta: string
  ): Promise<WorkshopMetrics> => {
    const { data, error } = await supabase.rpc('indicadores_taller', {
      p_sede_id: sedeId,
      p_desde: desde,
      p_hasta: hasta,
    });
    if (error) throw error;
    return data as WorkshopMetrics;
  },
};
