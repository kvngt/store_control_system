import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/auth.context';
import { queryKeys } from '../../lib/queryClient';
import { MediaUploadQueue } from '../../lib/media/uploadQueue';
import { createQueueStore } from '../../lib/media/queueStore';
import { mediaService } from '../../services/media.service';
import { MediaUploadsContext, type MediaUploadsApi } from './mediaUploads.context';

/**
 * Una cola de subida por sesión, montada en el layout y no en una pantalla: un
 * técnico que graba un video y navega al Kanban no debe cortar la subida.
 */
export default function MediaUploadsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);

  const queue = useMemo(
    () =>
      new MediaUploadQueue({
        uploader: mediaService.createUploader(),
        store: createQueueStore(),
        // Cada archivo terminado aparece en la orden sin recargar: el detalle se
        // vuelve a leer y la tarjeta "subiendo" se reemplaza por la real.
        onItemDone: (item) => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(item.ordenId) });
        },
      }),
    [queryClient]
  );

  useEffect(() => () => queue.dispose(), [queue]);

  useEffect(() => {
    void queue.setUser(user?.id ?? null);
  }, [queue, user?.id]);

  // Al volver la red, lo que falló por la caída se reintenta solo.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      queue.retryFailed();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [queue]);

  const items = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);

  // Cerrar la pestaña a mitad de una subida no la pierde (se retoma al volver),
  // pero sí la pausa hasta entonces. Vale la pregunta del navegador.
  const hasActive = items.some((i) => i.estado === 'pendiente' || i.estado === 'subiendo' || i.estado === 'guardando');
  useEffect(() => {
    if (!hasActive) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasActive]);

  const api = useMemo<MediaUploadsApi>(
    () => ({
      items,
      online,
      enqueue: (uploads) => (user ? queue.enqueue(uploads.map((u) => ({ ...u, userId: user.id }))) : []),
      retry: (id) => queue.retry(id),
      discard: (id) => queue.discard(id),
    }),
    [items, online, queue, user]
  );

  return <MediaUploadsContext.Provider value={api}>{children}</MediaUploadsContext.Provider>;
}
