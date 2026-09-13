// Avisos del equipo del taller (la campana) y los teléfonos suscritos a push.
//
// Los avisos no se crean desde aquí: los generan triggers en la base (ver
// 20260920000000_notifications_and_push.sql). Este módulo los lee, los marca y
// escucha los nuevos en tiempo real.
import { supabase } from '../lib/supabase';
import type { AppNotification } from '../types/database';

export const notificationsService = {
  list: async (limit = 30) => {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as AppNotification[];
  },

  /** Conteo exacto sin descargar filas: la campana puede tener más de las 30 que lista. */
  unreadCount: async () => {
    const { count, error } = await supabase
      .from('notificaciones')
      .select('id', { count: 'exact', head: true })
      .is('leida_en', null);
    if (error) throw error;
    return count ?? 0;
  },

  markRead: async (id: string) => {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leida_en: new Date().toISOString() })
      .eq('id', id)
      .is('leida_en', null);
    if (error) throw error;
  },

  markAllRead: async () => {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leida_en: new Date().toISOString() })
      .is('leida_en', null);
    if (error) throw error;
  },

  /**
   * Avisos nuevos en tiempo real. Realtime aplica RLS, así que aunque el filtro
   * se manipulara, cada quien recibiría solo los suyos. Devuelve la función que
   * cancela la suscripción.
   */
  subscribe: (userId: string, onInsert: (notification: AppNotification) => void) => {
    const channel = supabase
      .channel(`notificaciones:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` },
        (payload) => onInsert(payload.new as AppNotification)
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  // ===== Push =====

  /** Asocia el teléfono a la persona que inició sesión (lo quita de quien lo tuviera). */
  registerDevice: async (subscription: { endpoint: string; p256dh: string; auth: string }) => {
    const { error } = await supabase.rpc('registrar_push', {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.p256dh,
      p_auth: subscription.auth,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
    if (error) throw error;
  },

  unregisterDevice: async (endpoint: string) => {
    const { error } = await supabase.rpc('eliminar_push', { p_endpoint: endpoint });
    if (error) throw error;
  },

  /** Encola un push de prueba para quien lo pide. False si no tiene dispositivos. */
  sendTestPush: async () => {
    const { data, error } = await supabase.rpc('probar_push');
    if (error) throw error;
    return data as boolean;
  },

  /** Admin: quién tiene push activo y en cuántos dispositivos. */
  usersWithPush: async () => {
    const { data, error } = await supabase.rpc('usuarios_con_push');
    if (error) throw error;
    const map: Record<string, number> = {};
    for (const row of (data || []) as { usuario_id: string; dispositivos: number }[]) {
      map[row.usuario_id] = row.dispositivos;
    }
    return map;
  },
};
