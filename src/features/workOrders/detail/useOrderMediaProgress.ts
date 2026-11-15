import { useState } from 'react';
import { useLanguage } from '../../../context/language.context';
import { useToast } from '../../../context/toast.context';
import { mediaService } from '../../../services/media.service';
import { workOrdersService } from '../../../services/workOrders.service';
import { useMediaUploads } from '../../media/mediaUploads.context';
import { getErrorMessage } from '../../../lib/errors';
import type { OrderMedia, OrderProgressUpdate, PreparedMedia } from '../../../types/database';
import type { OrderDetailSharedContext } from './detailTypes';

interface UseOrderMediaProgressOptions
  extends Pick<
    OrderDetailSharedContext,
    'order' | 'isAdmin' | 'user' | 'patchOrder' | 'refresh' | 'setBusy' | 'fail'
  > {
  busy: boolean;
}

export function useOrderMediaProgress({
  order,
  isAdmin,
  user,
  busy,
  patchOrder,
  refresh,
  setBusy,
  fail,
}: UseOrderMediaProgressOptions) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const mediaUploads = useMediaUploads();

  // El avance que está por publicarse. El diálogo muestra su texto como lo verá el cliente.
  const [publishingProgress, setPublishingProgress] = useState<OrderProgressUpdate | null>(null);

  // ----- media ---------------------------------------------------------------

  /** Mete archivos ya procesados en la cola de subida, atados a esta orden. */
  const enqueueMedia = (
    items: PreparedMedia[],
    target: {
      origen: 'recepcion' | 'avance' | 'inspeccion';
      avanceId?: string | null;
      zona?: string | null;
      inspeccionPuntoId?: string | null;
    }
  ) => {
    if (!order || !items.length) return;
    mediaUploads.enqueue(
      items.map((media) => ({
        ...media,
        ordenId: order.id,
        sedeId: order.sede_id,
        numeroOrden: order.numero_orden,
        origen: target.origen,
        avanceId: target.avanceId ?? null,
        zona: target.zona ?? null,
        inspeccionPuntoId: target.inspeccionPuntoId ?? null,
      }))
    );
  };

  /** Más fotos, un video de recorrido o una nota de voz sobre la recepción. */
  const addReceptionMedia = (items: PreparedMedia[]) => enqueueMedia(items, { origen: 'recepcion' });

  const toggleMediaVisibility = async (media: OrderMedia) => {
    if (!order || !isAdmin) return;
    const next = !media.visible_cliente;
    // Se refleja al instante; si el servidor lo rechaza, la relectura lo corrige.
    patchOrder({
      media: (order.media || []).map((m) => (m.id === media.id ? { ...m, visible_cliente: next } : m)),
    });
    try {
      await mediaService.setVisibility(media.id, next);
    } catch (err) {
      showToast('error', t('media.visibilityError'), getErrorMessage(err, language));
      await refresh(false);
    }
  };

  const deleteMedia = async (media: OrderMedia) => {
    if (!order) return;
    if (!confirm(t('media.deleteConfirm'))) return;
    try {
      await mediaService.deleteMedia(media);
      await refresh(false);
    } catch (err) {
      showToast('error', t('media.deleteError'), getErrorMessage(err, language));
    }
  };

  // ----- progress log --------------------------------------------------------

  /**
   * Un avance: la nota se guarda y sus archivos entran a la cola con el id del
   * avance recién creado. El técnico ve el avance de inmediato, con sus videos
   * "subiendo", en vez de esperar a que terminen.
   */
  const addProgressUpdate = async (note: string, media: PreparedMedia[], isVisible?: boolean, laborId?: string) => {
    if (!order || !user || (!note.trim() && media.length === 0)) return false;
    setBusy(true);
    try {
      const avance = await workOrdersService.addProgressUpdate(order.id, user.id, note.trim(), isVisible, laborId);
      enqueueMedia(media, { origen: 'avance', avanceId: avance.id });
      await refresh(false);
      showToast('success', t('workOrders.progressAdded'));
      return true;
    } catch (err) {
      showToast('error', t('workOrders.progressAddError'), getErrorMessage(err, language));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const removeProgressUpdate = async (id: string) => {
    if (!order || busy) return;
    if (!confirm(t('common.delete') + '?')) return;
    setBusy(true);
    try {
      const attached = (order.media || []).filter((m) => m.avance_id === id);
      await workOrdersService.removeProgressUpdate(id, attached);
      await refresh(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  // Publicar pasa por el diálogo; dejar de publicar es inmediato, porque quitar algo de la
  // vista del cliente nunca es el movimiento peligroso.
  const toggleProgressVisibility = async (entry: OrderProgressUpdate) => {
    if (!entry.visible_cliente) {
      setPublishingProgress(entry);
      return;
    }
    setBusy(true);
    try {
      await workOrdersService.setProgressVisibility(entry.id, false);
      await refresh(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const confirmPublishProgress = async (descripcion: string) => {
    if (!publishingProgress) return;
    setBusy(true);
    try {
      await workOrdersService.setProgressVisibility(publishingProgress.id, true, descripcion);
      setPublishingProgress(null);
      showToast('success', t('workOrders.progressPublished'));
      await refresh(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  // ----- hallazgos (F6) --------------------------------------------------------
  // Los errores van en toast: los tres corren desde un diálogo o una tarjeta, y el recuadro
  // de error de la página queda tapado por el modal.

  /** El técnico reporta trabajo adicional; las fotos suben al avance interno que crea la base. */
  const reportFinding = async (descripcion: string, media: PreparedMedia[] = []) => {
    if (!order) return false;
    setBusy(true);
    try {
      const { avance_id } = await workOrdersService.reportFinding(order.id, descripcion.trim());
      // Sin avance (base anterior a 20261010000011) las fotos irían sueltas: mejor en un avance
      // propio del técnico, interno como todo avance nuevo.
      const avanceId = avance_id ?? (media.length && user
        ? (await workOrdersService.addProgressUpdate(order.id, user.id, descripcion.trim(), false)).id
        : null);
      enqueueMedia(media, { origen: 'avance', avanceId });
      await refresh();
      showToast('success', t('findings.reported'));
      return true;
    } catch (err) {
      showToast('error', t('findings.reportError'), getErrorMessage(err, language));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Devuelve el texto para precargar la tarea, o null si no se pudo. */
  const quoteFinding = async (findingId: string) => {
    if (!order) return null;
    setBusy(true);
    try {
      const text = (await workOrdersService.quoteFinding(findingId))
        ?? order.hallazgos?.find((h) => h.id === findingId)?.descripcion
        ?? '';
      await refresh();
      showToast('success', t('findings.quoted'));
      return text;
    } catch (err) {
      showToast('error', t('findings.actionError'), getErrorMessage(err, language));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const discardFinding = async (findingId: string, enReporte: boolean, texto: string) => {
    if (!order) return false;
    setBusy(true);
    try {
      await workOrdersService.discardFinding(findingId, enReporte, texto);
      await refresh();
      showToast('success', t('findings.discarded'));
      return true;
    } catch (err) {
      showToast('error', t('findings.actionError'), getErrorMessage(err, language));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    publishingProgress,
    toggleProgressVisibility,
    confirmPublishProgress,
    cancelPublishProgress: () => setPublishingProgress(null),
    addProgressUpdate,
    removeProgressUpdate,
    enqueueMedia,
    addReceptionMedia,
    toggleMediaVisibility,
    deleteMedia,
    pendingUploads: mediaUploads.items.filter((item) => item.ordenId === order?.id && item.estado !== 'listo'),
    reportFinding,
    quoteFinding,
    discardFinding,
  };
}
