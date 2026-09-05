// Supabase Storage uploads shared across domains.
import { supabase } from '../lib/supabase';

export const storageService = {
  uploadPhoto: async (file: File, path: string) => {
    const { error } = await supabase.storage
      .from('vehiculos_fotos')
      .upload(path, file, { cacheControl: '3600', upsert: true });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from('vehiculos_fotos')
      .getPublicUrl(path);

    return publicUrlData.publicUrl;
  },
};
