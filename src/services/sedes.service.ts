// Sedes (workshops): the tenant boundary every other domain is scoped to.
import { supabase } from '../lib/supabase';
import type { Sede } from '../types/database';
import { assertDeleted } from './support';

/** Row counts that a sede deletion would take with it. */
export interface SedeDeleteImpact {
  ordenes: number;
  clientes: number;
  vehiculos: number;
  movimientos: number;
  empleados: number;
  otras_sedes: number;
}

export const sedesService = {
  getSedes: async () => {
    const { data, error } = await supabase.from('sedes').select('*').order('nombre');
    if (error) throw error;
    return data as Sede[];
  },

  createSede: async (input: Omit<Sede, 'id' | 'fecha_creacion'>) => {
    const { data, error } = await supabase.from('sedes').insert(input).select().single();
    if (error) throw error;
    return data as Sede;
  },

  updateSede: async (
    id: string,
    input: Partial<
      Pick<
        Sede,
        'nombre' | 'direccion' | 'telefono' | 'capacidad' | 'color_tema' | 'logo_url' | 'comision_porcentaje'
      >
    >
  ) => {
    const { data, error } = await supabase.from('sedes').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as Sede;
  },

  // Admin-only, enforced by the `sedes_write` RLS policy. Without the
  // `assertDeleted` guard a non-admin's DELETE comes back as a success that
  // removed nothing, and Settings would report the sede gone and then redraw
  // it — the same silent no-op already guarded on customers, vehicles and
  // orders.
  deleteSede: async (id: string) => {
    const { data, error } = await supabase.from('sedes').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'la sede');
  },

  /**
   * What deleting this sede would destroy, so the confirmation can say so
   * rather than making the admin guess.
   */
  getDeleteImpact: async (id: string) => {
    const { data, error } = await supabase.rpc('sede_delete_impact', { p_sede_id: id });
    if (error) throw error;
    return (data || {}) as SedeDeleteImpact;
  },

  /**
   * Deletes a sede together with its customers, vehicles, orders, finance
   * movements and commissions.
   *
   * Every domain table references `sedes` with ON DELETE RESTRICT, so the plain
   * delete above only ever succeeds on a workshop that was never used — which
   * is why the shop kept hitting "this record is linked to other data" with no
   * way to act on it. This is the deliberate way through: the caller sees the
   * impact first and then asks for it explicitly. Employees are moved to
   * another sede rather than deleted; see the migration for why.
   */
  deleteSedeCascade: async (id: string) => {
    const { data, error } = await supabase.rpc('delete_sede_cascade', { p_sede_id: id });
    if (error) throw error;
    return (data || {}) as SedeDeleteImpact;
  },

  /** Uploads a sede logo and returns its public URL (bucket: sede_logos). */
  uploadSedeLogo: async (sedeId: string, file: File) => {
    const path = `${sedeId}/logo-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from('sede_logos')
      .upload(path, file, { cacheControl: '3600', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('sede_logos').getPublicUrl(path);
    return data.publicUrl;
  },

  /** Uploads a profile photo into the user's own folder (bucket: avatares). */
};
