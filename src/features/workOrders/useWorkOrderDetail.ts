import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/auth.context';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { workOrdersService } from '../../services/supabaseService';
// Statically imported, unlike the PDF renderer below: ShareReportModal already
// pulls it into this chunk, so a dynamic import here only defeats itself.
import { reportsService } from '../../services/reports.service';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import type { OrderStatus, UserProfile, WorkOrder } from '../../types/database';

interface UseWorkOrderDetailOptions {
  /**
   * Called after a change that the order list also shows (status, progress,
   * totals), so the board behind the detail view doesn't go stale.
   */
  onBoardChanged: () => void;
}

/**
 * Everything the order detail screen does to a single order: reading it,
 * moving its status, and editing its labor, parts, assignments, progress log
 * and customer signature.
 *
 * Splitting this out of the page leaves the detail view presentational, and
 * puts one rule in one place — every mutation re-reads the order from the
 * server rather than patching the local copy, because the database recomputes
 * `total_labor` / `total_repuestos` / `total_general` by trigger and the
 * client has no way to know the new totals.
 */
export function useWorkOrderDetail({ onBoardChanged }: UseWorkOrderDetailOptions) {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const { showToast } = useToast();

  const queryClient = useQueryClient();

  // Which order the screen has open. The detail itself is a query keyed on it,
  // so reopening an order the user just looked at is served from cache while
  // the fresh copy is fetched behind it.
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [savingSignature, setSavingSignature] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  // The signed link + message for the report the user just generated. Non-null
  // is what opens the share dialog.
  const [share, setShare] = useState<{ link: string; message: string } | null>(null);
  const [progressDraft, setProgressDraft] = useState('0');

  const isAdmin = user?.rol === 'admin';

  const detailKey = queryKeys.workOrderDetail(openOrderId ?? '');
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => workOrdersService.getWorkOrderDetail(openOrderId as string),
    enabled: !!openOrderId,
  });

  const order = detailQuery.data ?? null;
  const loading = !!openOrderId && detailQuery.isPending;
  const error =
    mutationError || (detailQuery.error ? getErrorMessage(detailQuery.error, language) : '');

  const fail = useCallback(
    (err: unknown) => setMutationError(getErrorMessage(err, language)),
    [language]
  );

  const open = useCallback(async (orderId: string) => {
    setMutationError('');
    setOpenOrderId(orderId);
  }, []);

  const close = useCallback(() => setOpenOrderId(null), []);

  /** Patch the cached copy of the open order in place. */
  const patchOrder = useCallback(
    (patch: Partial<WorkOrder>) => {
      queryClient.setQueryData<WorkOrder>(detailKey, (prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [detailKey, queryClient]
  );

  /** Re-read the open order, and refresh the board if the change shows there. */
  const refresh = useCallback(
    async (alsoBoard = true) => {
      if (!openOrderId) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(openOrderId) });
      if (alsoBoard) onBoardChanged();
    },
    [onBoardChanged, openOrderId, queryClient]
  );

  // Keep the manual progress input in sync with whichever order is open.
  // Deliberately keyed on the two fields rather than on `order`: the object is
  // replaced wholesale by every re-read, and depending on it would stomp on
  // what the user is typing after any unrelated save.
  useEffect(() => {
    if (order) setProgressDraft(String(order.porcentaje_avance));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.porcentaje_avance]);

  // A technician may only touch an order they are actually assigned to.
  // Admins can always edit. Joining an order is the way in.
  const isAssignedToMe = (order?.asignaciones || []).some((a) => a.usuario_id === user?.id);
  const canEdit = isAdmin || isAssignedToMe;
  const canEditProgress = canEdit && order?.estatus === 'en_proceso';
  const isComplete = order?.estatus === 'finalizado' || order?.estatus === 'entregado';

  // ----- status & progress ---------------------------------------------------

  const changeStatus = async (status: OrderStatus) => {
    if (!order) return;
    if (status === 'entregado' && order.estatus !== 'entregado' && !confirm(t('workOrders.confirmDeliver'))) {
      return;
    }
    try {
      await workOrdersService.updateWorkOrderStatus(order.id, status);
      await refresh();
    } catch (err) {
      fail(err);
    }
  };

  const changeProgress = async (value: number) => {
    if (!order || !canEditProgress) return;
    const clamped = Math.min(100, Math.max(0, value));
    setProgressDraft(String(clamped));
    try {
      await workOrdersService.updateWorkOrderProgress(order.id, clamped);
      patchOrder({ porcentaje_avance: clamped });
      onBoardChanged();
    } catch (err) {
      fail(err);
    }
  };

  // ----- labor ---------------------------------------------------------------

  const addLabor = async (item: { descripcion: string; costo: number }) => {
    if (!order) return;
    setBusy(true);
    try {
      await workOrdersService.addLaborItem(order.id, item);
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const updateLabor = async (id: string, item: { descripcion: string; costo: number }) => {
    if (!order) return;
    setBusy(true);
    try {
      await workOrdersService.updateLaborItem(id, item);
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const removeLabor = async (id: string, descripcion: string) => {
    if (!order) return;
    if (!confirm(`${t('common.delete')}: ${descripcion}?`)) return;
    try {
      await workOrdersService.removeLaborItem(id);
      await refresh();
    } catch (err) {
      fail(err);
    }
  };

  // ----- parts ---------------------------------------------------------------

  type PartInput = {
    descripcion: string;
    cantidad: number;
    precio_venta_unitario: number;
  };

  const addPart = async (item: PartInput) => {
    if (!order) return;
    setBusy(true);
    try {
      await workOrdersService.addPart(order.id, item);
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const updatePart = async (id: string, item: PartInput) => {
    if (!order) return;
    setBusy(true);
    try {
      await workOrdersService.updatePart(id, item);
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const removePart = async (id: string, descripcion: string) => {
    if (!order) return;
    if (!confirm(`${t('common.delete')}: ${descripcion}?`)) return;
    try {
      await workOrdersService.removePart(id);
      await refresh();
    } catch (err) {
      fail(err);
    }
  };

  // ----- assignments ---------------------------------------------------------

  const addAssignment = async (operator: UserProfile) => {
    if (!order) return;
    try {
      await workOrdersService.addAssignment(
        order.id,
        operator.id,
        operator.rol === 'pintor' ? 'pintura' : 'mecanica'
      );
      // Assignments don't change any figure the board shows.
      await refresh(false);
    } catch (err) {
      fail(err);
    }
  };

  /** A technician adds themselves to an order they didn't create. */
  const joinOrder = async () => {
    if (!order || !user) return;
    setBusy(true);
    try {
      await workOrdersService.addAssignment(
        order.id,
        user.id,
        user.rol === 'pintor' ? 'pintura' : 'mecanica'
      );
      // The board splits "my orders" from the rest by assignment, so joining
      // one does move it between sections.
      await refresh();
      showToast('success', t('workOrders.joinedOrder'));
    } catch (err) {
      showToast('error', t('workOrders.joinError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  const removeAssignment = async (id: string, nombre: string) => {
    if (!order) return;
    if (!confirm(`${t('common.delete')}: ${nombre}?`)) return;
    try {
      await workOrdersService.removeAssignment(id);
      await refresh();
    } catch (err) {
      fail(err);
    }
  };

  // ----- progress log --------------------------------------------------------

  const addProgressUpdate = async (note: string, files: File[]) => {
    if (!order || !user || !note.trim()) return false;
    setBusy(true);
    try {
      await workOrdersService.addProgressUpdate(order.id, user.id, note, files);
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
    if (!order) return;
    if (!confirm(t('common.delete') + '?')) return;
    try {
      await workOrdersService.removeProgressUpdate(id);
      await refresh(false);
    } catch (err) {
      fail(err);
    }
  };

  // ----- signature -----------------------------------------------------------

  const saveSignature = async (dataUrl: string) => {
    if (!order) return;
    setSavingSignature(true);
    try {
      const { url, fecha } = await workOrdersService.uploadSignature(order.id, dataUrl);
      patchOrder({ firma_cliente_url: url, firma_fecha: fecha });
      showToast('success', t('workOrders.signatureSaved'));
    } catch (err) {
      showToast('error', t('workOrders.signatureError'), getErrorMessage(err, language));
    } finally {
      setSavingSignature(false);
    }
  };

  const clearSignature = async () => {
    if (!order) return;
    setSavingSignature(true);
    try {
      await workOrdersService.clearSignature(order.id);
      patchOrder({ firma_cliente_url: null, firma_fecha: null });
    } catch (err) {
      showToast('error', t('workOrders.signatureError'), getErrorMessage(err, language));
    } finally {
      setSavingSignature(false);
    }
  };

  // ----- PDF -----------------------------------------------------------------

  const generatePdf = async () => {
    if (!order) return;
    setGeneratingPdf(true);
    try {
      // ~400 kB of jsPDF, fetched only when someone prints.
      const { generateWorkOrderPdf } = await import('../../lib/workOrderPdf');
      await generateWorkOrderPdf(order, currentSede);
    } catch (err) {
      showToast('error', t('workOrders.pdfError'), getErrorMessage(err, language));
    } finally {
      setGeneratingPdf(false);
    }
  };

  /**
   * Renders the report, uploads it, and opens the share dialog.
   *
   * One render for both: the PDF embeds every intake photo, so building it
   * twice — once to download and once to send — would mean fetching and
   * re-encoding all of them again.
   */
  const shareReport = async () => {
    if (!order) return;
    setGeneratingPdf(true);
    try {
      const { renderWorkOrderPdfBlob } = await import('../../lib/workOrderPdf');
      const blob = await renderWorkOrderPdfBlob(order, currentSede);
      const { url } = await reportsService.uploadReport(order, blob);
      setShare({ link: url, message: reportsService.buildMessage(order, url, currentSede?.nombre) });
    } catch (err) {
      showToast('error', t('workOrders.shareReportError'), getErrorMessage(err, language));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const closeShare = useCallback(() => setShare(null), []);

  return {
    order,
    loading,
    busy,
    error,
    canEdit,
    canEditProgress,
    isComplete,
    progressDraft,
    setProgressDraft,
    savingSignature,
    generatingPdf,
    open,
    close,
    changeStatus,
    changeProgress,
    addLabor,
    updateLabor,
    removeLabor,
    addPart,
    updatePart,
    removePart,
    addAssignment,
    joinOrder,
    removeAssignment,
    addProgressUpdate,
    removeProgressUpdate,
    saveSignature,
    clearSignature,
    generatePdf,
    share,
    shareReport,
    closeShare,
  };
}

export type WorkOrderDetailApi = ReturnType<typeof useWorkOrderDetail>;
