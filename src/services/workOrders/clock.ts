import { supabase } from '../../lib/supabase';
import type { LaborTimeEntry } from '../../types/database';

export const orderClock = {
  /** Inicia el reloj del técnico actual en una tarea aprobada. */
  startClock: async (laborId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('iniciar_reloj', {
      p_labor_id: laborId,
    });
    if (error) throw error;
    return data as string;
  },

  /** Detiene el reloj del técnico actual en la tarea indicada. */
  stopClock: async (laborId: string): Promise<void> => {
    const { error } = await supabase.rpc('detener_reloj', {
      p_labor_id: laborId,
    });
    if (error) throw error;
  },

  /** Corrige el intervalo de tiempo registrado para una tarea (solo administración). */
  correctTime: async (tiempoId: string, inicio: string, fin: string | null): Promise<void> => {
    const { error } = await supabase.rpc('corregir_tiempo', {
      p_tiempo_id: tiempoId,
      p_inicio: inicio,
      p_fin: fin ?? null,
    });
    if (error) throw error;
  },

  /** Elimina un registro de tiempo de una tarea (solo administración). */
  deleteTime: async (tiempoId: string): Promise<void> => {
    const { error } = await supabase.rpc('borrar_tiempo', {
      p_tiempo_id: tiempoId,
    });
    if (error) throw error;
  },

  /** Obtiene todos los tiempos registrados para las tareas de una orden. */
  getOrderLaborTimes: async (orderId: string): Promise<LaborTimeEntry[]> => {
    const { data, error } = await supabase
      .from('orden_labor_tiempos')
      .select('id, labor_id, orden_id, usuario_id, inicio, fin, usuario:perfiles(id, nombre_completo, rol)')
      .eq('orden_id', orderId)
      .order('inicio', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as LaborTimeEntry[];
  },
};
