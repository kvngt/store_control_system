import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../../context/language.context';
import { useToast } from '../../../context/toast.context';
import { commissionsService } from '../../../services/commissions.service';
import { workOrdersService } from '../../../services/workOrders.service';
import { queryKeys } from '../../../lib/queryClient';
import { getErrorMessage } from '../../../lib/errors';
import type { Specialty } from '../../../types/database';
import { isApproved } from '../lineState';
import type { OrderDetailSharedContext } from './detailTypes';

export function useOrderMoney({
  openOrderId,
  order,
  isAdmin,
  isAssignedToMe,
  refresh,
  setBusy,
  fail,
}: Pick<OrderDetailSharedContext, 'openOrderId' | 'order' | 'isAdmin' | 'isAssignedToMe' | 'refresh' | 'setBusy' | 'fail'>) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Entregar abre el diálogo de cobro (método, cheque, comprobante) en vez de un `confirm`.
  const [delivering, setDelivering] = useState(false);
  // "Retirada sin reparar": el diálogo que cierra la orden sin hacer el trabajo.
  const [withdrawing, setWithdrawing] = useState(false);
  // Un anticipo: el cliente paga una parte antes de llevarse el vehículo.
  const [advancing, setAdvancing] = useState(false);

  // Lo que el técnico ve de dinero, y la razón por la que lo ve: su parte de la mano de
  // obra. Desde 20261009000000 la cuenta es por especialidad y con el porcentaje de cada
  // quien, así que ya no se hace aquí: la base la devuelve (`comisiones_estimadas`, la misma
  // que devenga al entregar). Administración recibe el reparto entero para avisar de una
  // bolsa que nadie cobra.
  const estimateQuery = useQuery({
    queryKey: queryKeys.commissionEstimate(openOrderId ?? ''),
    queryFn: () => commissionsService.getEstimate(openOrderId ?? ''),
    enabled: !!openOrderId && (isAdmin || isAssignedToMe),
  });
  const commissionEstimate = estimateQuery.data ?? null;

  // Las tareas con la comisión ya pagada: la base no deja cambiarles el técnico ni el tipo (ni a
  // una línea heredada aprobada cuya bolsa se pagó), así que la fila lo muestra bloqueado en vez
  // de dejar intentarlo. Solo administración lee `comisiones`.
  const paidQuery = useQuery({
    queryKey: queryKeys.paidCommissions(openOrderId ?? ''),
    queryFn: () => workOrdersService.getPaidCommissionKeys(openOrderId ?? ''),
    enabled: !!openOrderId && isAdmin,
  });
  const paidKeys = paidQuery.data ?? [];
  const paidTasks = new Set(paidKeys.flatMap((c) => (c.labor_id ? [c.labor_id] : [])));
  // Las bolsas heredadas ya pagadas: una línea no puede entrar a ellas (la base lo rechaza), y
  // tampoco se cambia quién las reparte.
  const paidPools: ReadonlySet<Specialty> = new Set(paidKeys.flatMap((c) => (c.labor_id ? [] : [c.especialidad])));
  const lockedLaborIds: ReadonlySet<string> = new Set(
    (order?.labor_items || [])
      .filter((l) =>
        paidTasks.has(l.id)
        || (!l.asignado_a && l.reparto_heredado !== false && isApproved(l) && paidPools.has(l.especialidad ?? 'mecanica'))
      )
      .map((l) => l.id)
  );

  const finishDelivery = async () => {
    setDelivering(false);
    if (order) void queryClient.invalidateQueries({ queryKey: queryKeys.orderBalance(order.id) });
    await refresh();
  };

  const finishWithdrawal = async () => {
    setWithdrawing(false);
    if (order) void queryClient.invalidateQueries({ queryKey: queryKeys.orderBalance(order.id) });
    await refresh();
  };

  const finishAdvance = async () => {
    setAdvancing(false);
    if (order) void queryClient.invalidateQueries({ queryKey: queryKeys.orderBalance(order.id) });
    await refresh();
  };

  // ----- descuento -------------------------------------------------------------
  // Lo absorbe el taller (decisión del 05/10/2026): la base baja el total y no toca la mano de
  // obra ni las comisiones. Un error se muestra en un aviso: la tarjeta queda abierta para corregir.
  const applyDiscount = async (value: { monto?: number; porcentaje?: number }, motivo: string | null) => {
    if (!order) return;
    try {
      await workOrdersService.applyDiscount(order.id, value, motivo);
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderBalance(order.id) });
      await refresh();
      showToast('success', (value.porcentaje ?? value.monto ?? 0) > 0 ? t('discount.applied') : t('discount.removed'));
    } catch (err) {
      showToast('error', t('discount.error'), getErrorMessage(err, language));
      throw err;
    }
  };

  const approveCommission = async (comisionId: string, montoNuevo?: number, porcentajeNuevo?: number): Promise<boolean> => {
    if (!isAdmin) return false;
    setBusy(true);
    try {
      await workOrdersService.approveCommission(comisionId, montoNuevo, porcentajeNuevo);
      await refresh(false);
      showToast('success', t('commission.approvedSuccess'));
      return true;
    } catch (err) {
      fail(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    commissionEstimate,
    lockedLaborIds,
    paidPools,
    approveCommission,
    delivering,
    startDelivery: () => setDelivering(true),
    closeDelivery: () => setDelivering(false),
    finishDelivery,
    withdrawing,
    startWithdrawal: () => setWithdrawing(true),
    cancelWithdrawal: () => setWithdrawing(false),
    finishWithdrawal,
    advancing,
    startAdvance: () => setAdvancing(true),
    cancelAdvance: () => setAdvancing(false),
    finishAdvance,
    applyDiscount,
  };
}
