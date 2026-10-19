import { supabase } from '../lib/supabase';
import type { CatalogJob, CatalogJobLine } from '../types/database';

export interface SaveCatalogJobInput {
  id?: string | null;
  sede_id: string;
  nombre: string;
  activo?: boolean;
  lineas: CatalogJobLine[];
}

export const catalogService = {
  /**
   * Obtiene el catálogo de trabajos frecuentes de una sede (solo administración).
   */
  list: async (sedeId: string, incluirInactivos = false): Promise<CatalogJob[]> => {
    const { data, error } = await supabase.rpc('catalogo_de_trabajos', {
      p_sede_id: sedeId,
      p_incluir_inactivos: incluirInactivos,
    });
    if (error) throw error;
    return (data ?? []) as CatalogJob[];
  },

  /**
   * Crea o actualiza un trabajo en el catálogo frecuente con sus líneas (solo administración).
   */
  save: async (input: SaveCatalogJobInput): Promise<string> => {
    const { data, error } = await supabase.rpc('guardar_trabajo_catalogo', {
      p_id: input.id ?? null,
      p_sede_id: input.sede_id,
      p_nombre: input.nombre.trim(),
      p_activo: input.activo ?? true,
      p_lineas: input.lineas.map((l, idx) => ({
        ...l,
        posicion: l.posicion ?? idx,
      })),
    });
    if (error) throw error;
    return data as string;
  },

  /**
   * Elimina un trabajo del catálogo frecuente (solo administración).
   */
  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('borrar_trabajo_catalogo', {
      p_id: id,
    });
    if (error) throw error;
  },
};
