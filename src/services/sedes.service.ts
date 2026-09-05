// Sedes (workshops): the tenant boundary every other domain is scoped to.
import { supabase } from '../lib/supabase';
import type { Sede } from '../types/database';
import { assertDeleted } from './support';

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
    input: Partial<Pick<Sede, 'nombre' | 'direccion' | 'telefono' | 'capacidad' | 'color_tema' | 'logo_url'>>
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
