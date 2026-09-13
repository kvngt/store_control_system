import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/auth.context';
import { notificationsService } from '../../services/notifications.service';
import type { AppNotification } from '../../types/database';

const LIST_LIMIT = 30;

/**
 * Los avisos de la persona que inició sesión, al día sin recargar.
 *
 * Reemplaza a la campana anterior, que volvía a descargar todas las órdenes cada
 * 60 segundos por pestaña para deducir alertas. Ahora son dos consultas al abrir
 * (la lista y el conteo) y después Realtime empuja cada aviso nuevo. El conteo se
 * vuelve a pedir cada 5 minutos solo como respaldo, por si una red corporativa o
 * un proxy corta el websocket de Realtime.
 */
export function useNotifications(options: { onArrive?: (notification: AppNotification) => void } = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  const listKey = ['notifications', userId] as const;
  const countKey = ['notifications-unread', userId] as const;

  const list = useQuery({
    queryKey: listKey,
    queryFn: () => notificationsService.list(LIST_LIMIT),
    enabled: !!userId,
  });

  const unread = useQuery({
    queryKey: countKey,
    queryFn: notificationsService.unreadCount,
    enabled: !!userId,
    refetchInterval: 5 * 60 * 1000,
  });

  // En una ref: quien usa el hook suele pasar una función nueva en cada render, y
  // eso no debe cerrar y volver a abrir el canal de Realtime.
  const onArriveRef = useRef(options.onArrive);
  onArriveRef.current = options.onArrive;

  useEffect(() => {
    if (!userId) return;
    return notificationsService.subscribe(userId, (notification) => {
      queryClient.setQueryData<AppNotification[]>(['notifications', userId], (prev) =>
        [notification, ...(prev ?? []).filter((n) => n.id !== notification.id)].slice(0, LIST_LIMIT)
      );
      queryClient.setQueryData<number>(['notifications-unread', userId], (count) => (count ?? 0) + 1);
      onArriveRef.current?.(notification);
    });
  }, [queryClient, userId]);

  const markRead = useCallback(
    async (id: string) => {
      const stamp = new Date().toISOString();
      let changed = false;
      queryClient.setQueryData<AppNotification[]>(['notifications', userId], (prev) =>
        (prev ?? []).map((n) => {
          if (n.id !== id || n.leida_en) return n;
          changed = true;
          return { ...n, leida_en: stamp };
        })
      );
      if (changed) queryClient.setQueryData<number>(['notifications-unread', userId], (c) => Math.max(0, (c ?? 1) - 1));
      try {
        await notificationsService.markRead(id);
      } catch {
        void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
        void queryClient.invalidateQueries({ queryKey: ['notifications-unread', userId] });
      }
    },
    [queryClient, userId]
  );

  const markAllRead = useCallback(async () => {
    const stamp = new Date().toISOString();
    queryClient.setQueryData<AppNotification[]>(['notifications', userId], (prev) =>
      (prev ?? []).map((n) => (n.leida_en ? n : { ...n, leida_en: stamp }))
    );
    queryClient.setQueryData<number>(['notifications-unread', userId], 0);
    try {
      await notificationsService.markAllRead();
    } catch {
      void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread', userId] });
    }
  }, [queryClient, userId]);

  return {
    items: list.data ?? [],
    unreadCount: unread.data ?? 0,
    loading: list.isPending && !!userId,
    markRead,
    markAllRead,
  };
}
