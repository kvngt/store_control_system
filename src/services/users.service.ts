// Profiles, staff administration and password recovery.
import { supabase } from '../lib/supabase';
import type { UserProfile, UserRole } from '../types/database';

export const usersService = {
  uploadAvatar: async (userId: string, file: File) => {
    const path = `${userId}/avatar-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from('avatares')
      .upload(path, file, { cacheControl: '3600', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('avatares').getPublicUrl(path);
    return data.publicUrl;
  },

  /** Updates the signed-in user's own profile row. */
  updateProfile: async (
    userId: string,
    input: Partial<Pick<UserProfile, 'nombre_completo' | 'email' | 'telefono' | 'avatar_url'>>
  ) => {
    const { data, error } = await supabase.from('perfiles').update(input).eq('id', userId).select().single();
    if (error) throw error;
    return data as UserProfile;
  },

  // perfiles.sede_id is NOT NULL, so a user always belongs to exactly one
  // workshop. An admin "leaving" a sede therefore means moving their membership
  // to another one — which is what removes them from the first sede's roster.
  moveUserToSede: async (userId: string, sedeId: string) => {
    const { data, error } = await supabase
      .from('perfiles')
      .update({ sede_id: sedeId })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data as UserProfile;
  },

  // ===== Password recovery =====
  // Sends the "reset your password" email. `redirectTo` must be listed in the
  // project's allowed redirect URLs, otherwise Supabase drops the link.
  requestPasswordReset: async (email: string, redirectTo: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  },

  /** Sets a new password for the session opened by the recovery link. */
  updatePassword: async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },

  /** True when another profile already uses this email (case-insensitive). */
  isEmailTaken: async (email: string, excludeUserId: string) => {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id')
      .ilike('email', email.trim())
      .neq('id', excludeUserId)
      .limit(1);
    if (error) throw error;
    return (data || []).length > 0;
  },

  // ===== Users / Profiles =====
  getUsers: async (sedeId?: string) => {
    let query = supabase.from('perfiles').select('*').order('nombre_completo');
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as UserProfile[];
  },

  createEmployee: async (input: {
    email: string;
    password: string;
    nombre_completo: string;
    rol: UserRole;
    sede_id: string;
    telefono?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke('create-employee', { body: input });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.profile as UserProfile;
  },

  deleteEmployee: async (usuarioId: string) => {
    const { data, error } = await supabase.functions.invoke('delete-employee', {
      body: { usuario_id: usuarioId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  },

  getOperators: async (sedeId?: string) => {
    let query = supabase.from('perfiles').select('*').in('rol', ['mecanico', 'pintor']);
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as UserProfile[];
  },
};
