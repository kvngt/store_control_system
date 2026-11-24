import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/auth.context';
import { useLanguage } from '../../context/language.context';
import { workOrdersService } from '../../services/workOrders.service';
import { invalidateOrderEffects, queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import type { WorkOrder } from '../../types/database';
import { hasErrorCode, type OrderDetailSharedContext } from './detail/detailTypes';
import { computeOrderPermissions } from './detail/permissions';
import { useOrderTransitions } from './detail/useOrderTransitions';
import { useOrderMoney } from './detail/useOrderMoney';
import { useOrderLines } from './detail/useOrderLines';
import { useOrderMediaProgress } from './detail/useOrderMediaProgress';
import { useOrderFollowUp } from './detail/useOrderFollowUp';

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
 * Composes focused domain subhooks under `./detail/` while exposing the stable
 * `WorkOrderDetailApi` contract. Every mutation re-reads the order from the
 * server rather than patching the local copy cleanly alone, because the database
 * recomputes totals and commissions by trigger.
 */
export function useWorkOrderDetail({ onBoardChanged }: UseWorkOrderDetailOptions) {
  const { language } = useLanguage();
  const { user, currentSede, allSedes } = useAuth();
  const queryClient = useQueryClient();

  // Which order the screen has open. The detail itself is a query keyed on it,
  // so reopening an order the user just looked at is served from cache while
  // the fresh copy is fetched behind it.
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  // La pestaña con la que se pidió abrir la orden (un aviso que lleva a "Trabajos", por
  // ejemplo). La pantalla la usa al cambiar de orden; null es la pestaña de siempre.
  const [requestedTab, setRequestedTab] = useState<string | null>(null);

  const detailKey = queryKeys.workOrderDetail(openOrderId ?? '');
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => workOrdersService.getWorkOrderDetail(openOrderId ?? ''),
    enabled: !!openOrderId,
  });

  const order = detailQuery.data ?? null;

  // La sede de ESTA orden, no la que el admin tiene elegida arriba: un aviso o un
  // enlace puede abrir una orden de otra sede, y entonces el PDF salía con el logo
  // de otro taller, el WhatsApp nombraba otro taller y la comisión estimada usaba
  // otro porcentaje.
  const orderSede = (order && allSedes.find((s) => s.id === order.sede_id)) || currentSede;
  const loading = !!openOrderId && detailQuery.isPending;
  const loadError = detailQuery.error ? getErrorMessage(detailQuery.error, language) : '';
  const error = mutationError || loadError;
  // La orden pedida no llegó: borrada, o — para un técnico — de otra persona. La RLS contesta
  // lo mismo en los dos casos (PGRST116), y la lista lo explica según quién mira.
  const notFound = !!openOrderId && hasErrorCode(detailQuery.error, 'PGRST116');

  const fail = useCallback(
    (err: unknown) => setMutationError(getErrorMessage(err, language)),
    [language]
  );

  const open = useCallback(async (orderId: string, tab?: string | null) => {
    setMutationError('');
    setRequestedTab(tab ?? null);
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
      // Lo que la orden mueve fuera de ella (panel, pendientes de la oficina, indicadores, comisiones,
      // el total y la comisión estimada de esta orden) va por `invalidateOrderEffects`: antes, editar
      // una línea dejaba el panel y los pendientes con el total viejo hasta recargar. Solo se vuelve a
      // pedir lo que está en pantalla; lo demás queda marcado como viejo.
      await invalidateOrderEffects(queryClient, { orderId: openOrderId });
      // Un cambio de estatus programa un correo al cliente y entregar fija el
      // vencimiento del enlace: la tarjeta del enlace (solo admin) se entera aquí.
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerLink(openOrderId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerEmails(openOrderId) });
      // Todo lo que cambia una orden deja una fila en su historial (20261010000004).
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderHistory(openOrderId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderLaborTimes(openOrderId) });
      if (alsoBoard) onBoardChanged();
    },
    [onBoardChanged, openOrderId, queryClient]
  );

  const permissions = computeOrderPermissions(order, user);
  const { isAssignedToMe, ...exposedPermissions } = permissions;

  const shared: OrderDetailSharedContext = {
    openOrderId,
    order,
    isAdmin: permissions.isAdmin,
    isAssignedToMe,
    orderSede,
    user,
    patchOrder,
    refresh,
    setBusy,
    fail,
  };

  const money = useOrderMoney(shared);

  const transitions = useOrderTransitions({
    ...shared,
    canDeliver: permissions.canDeliver,
    canEditProgress: permissions.canEditProgress,
    canArchive: permissions.canArchive,
    isArchived: permissions.isArchived,
    onBoardChanged,
    onStartDelivery: money.startDelivery,
  });

  const lines = useOrderLines(shared);
  const mediaProgress = useOrderMediaProgress({ ...shared, busy });
  const followUp = useOrderFollowUp({
    order,
    orderSede,
    canSendReport: permissions.canSendReport,
  });

  const cancelDelivery = () => {
    money.closeDelivery();
    transitions.bumpStatusEpoch();
  };

  return {
    order,
    orderSede,
    loading,
    loadError,
    notFound,
    busy,
    error,
    ...exposedPermissions,
    refresh,
    statusEpoch: transitions.statusEpoch,
    progressDraft: transitions.progressDraft,
    setProgressDraft: transitions.setProgressDraft,
    commitProgress: transitions.commitProgress,
    changeStatus: transitions.changeStatus,
    finishConfirmCount: transitions.finishConfirmCount,
    cancelFinishConfirm: transitions.cancelFinishConfirm,
    confirmFinish: transitions.confirmFinish,
    markReadyForPickup: transitions.markReadyForPickup,
    readyNotifyOpen: transitions.readyNotifyOpen,
    closeReadyNotify: transitions.closeReadyNotify,
    toggleArchived: transitions.toggleArchived,
    updateInsurance: transitions.updateInsurance,
    savingDamageMarks: transitions.savingDamageMarks,
    updateDamageMarks: transitions.updateDamageMarks,
    savingSignature: transitions.savingSignature,
    saveSignature: transitions.saveSignature,
    commissionEstimate: money.commissionEstimate,
    lockedLaborIds: money.lockedLaborIds,
    paidPools: money.paidPools,
    approveCommission: money.approveCommission,
    delivering: money.delivering,
    startDelivery: money.startDelivery,
    cancelDelivery,
    finishDelivery: money.finishDelivery,
    withdrawing: money.withdrawing,
    startWithdrawal: money.startWithdrawal,
    cancelWithdrawal: money.cancelWithdrawal,
    finishWithdrawal: money.finishWithdrawal,
    advancing: money.advancing,
    startAdvance: money.startAdvance,
    cancelAdvance: money.cancelAdvance,
    finishAdvance: money.finishAdvance,
    applyDiscount: money.applyDiscount,
    open,
    close,
    requestedTab,
    userId: user?.id,
    ...lines,
    ...mediaProgress,
    ...followUp,
  };
}

export type WorkOrderDetailApi = ReturnType<typeof useWorkOrderDetail>;
