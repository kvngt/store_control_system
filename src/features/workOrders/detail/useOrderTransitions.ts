import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../../context/language.context';
import { useToast } from '../../../context/toast.context';
import { workOrdersService } from '../../../services/workOrders.service';
import { queryKeys } from '../../../lib/queryClient';
import { getErrorMessage } from '../../../lib/errors';
import { isValidEmail } from '../../../lib/email';
import type { OrderStatus } from '../../../types/database';
import type { DamageMark } from '../../../lib/vehicleDiagram';
import type { OrderDetailSharedContext } from './detailTypes';

interface UseOrderTransitionsOptions extends OrderDetailSharedContext {
  canDeliver: boolean;
  canEditProgress: boolean;
  canArchive: boolean;
  isArchived: boolean;
  onBoardChanged: () => void;
  onStartDelivery: () => void;
}

export function useOrderTransitions({
  order,
  isAdmin,
  patchOrder,
  refresh,
  setBusy,
  fail,
  canDeliver,
  canEditProgress,
  canArchive,
  isArchived,
  onBoardChanged,
  onStartDelivery,
}: UseOrderTransitionsOptions) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [savingSignature, setSavingSignature] = useState(false);
  const [savingDamageMarks, setSavingDamageMarks] = useState(false);
  const [progressDraft, setProgressDraft] = useState('0');
  // Se incrementa cuando un cambio de estatus se descarta sin llegar al
  // servidor. La pantalla lo usa como `key` del <select>, que es lo único que
  // vuelve a montarlo: al cancelar el confirm no cambia ningún estado, así que
  // React no re-renderiza y el DOM se queda mostrando la opción que el usuario
  // eligió — "Entregado" en una orden que no se entregó. Y esa lista es
  // justamente la ruta táctil, porque en un teléfono no hay arrastre.
  const [statusEpoch, setStatusEpoch] = useState(0);
  // Modal para avisar al cliente por WhatsApp/SMS cuando se marca lista y no tiene correo.
  const [readyNotifyOpen, setReadyNotifyOpen] = useState(false);
  const closeReadyNotify = useCallback(() => setReadyNotifyOpen(false), []);
  const bumpStatusEpoch = useCallback(() => setStatusEpoch((n) => n + 1), []);

  // Keep the manual progress input in sync with whichever order is open.
  // Deliberately keyed on the two fields rather than on `order`: the object is
  // replaced wholesale by every re-read, and depending on it would stomp on
  // what the user is typing after any unrelated save.
  useEffect(() => {
    if (order) setProgressDraft(String(order.porcentaje_avance));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.porcentaje_avance]);

  const changeStatus = async (status: OrderStatus) => {
    if (!order || status === order.estatus) return;

    // Cada salida temprana tiene que reponer el <select>, o queda mostrando un
    // estatus que la orden no tiene.
    const discard = () => setStatusEpoch((n) => n + 1);

    if (status === 'entregado' && !canDeliver) {
      discard();
      showToast('error', t('workOrders.deliverAdminOnly'));
      return;
    }
    // Entregar asienta dinero: pasa por el diálogo y por `entregar_orden`, que cobra con su
    // método (o devuelve) y marca la orden en una sola transacción.
    if (status === 'entregado') {
      onStartDelivery();
      return;
    }
    // Sacar una orden de "entregado" revierte en Finanzas el pago final y el
    // costo de repuestos, y borra las comisiones que aún no se han pagado. Vale
    // decirlo antes y no después.
    if (order.estatus === 'entregado' && !confirm(t('workOrders.confirmUndeliver'))) {
      discard();
      return;
    }
    // Una orden finalizada solo la reabre administración (pedido del taller, 05/10/2026).
    if (order.estatus === 'finalizado' && !isAdmin) {
      discard();
      showToast('error', t('workOrders.onlyAdminReopens'));
      return;
    }
    // F6: la pausa la pone la oficina. El técnico la provoca reportando trabajo adicional.
    if (status === 'espera_autorizacion' && !isAdmin) {
      discard();
      showToast('error', t('findings.pauseFromOrder'));
      return;
    }
    if (order.estatus === 'espera_autorizacion' && !isAdmin) {
      discard();
      showToast('error', t('findings.pausedByOffice'));
      return;
    }

    try {
      await workOrdersService.updateWorkOrderStatus(order.id, status);
      await refresh();
    } catch (err) {
      discard();
      fail(err);
    }
  };

  // Administración revisa lo que terminó el técnico y confirma que está listo: ahí se le avisa al
  // cliente. Antes, finalizar avisaba solo (y el técnico podía hacerlo sin que nadie lo revisara).
  const markReadyForPickup = async () => {
    if (!order || !isAdmin) return;
    setBusy(true);
    try {
      await workOrdersService.markReadyForPickup(order.id);
      await refresh();
      const hasEmail = isValidEmail(order.cliente?.email);
      showToast('success', hasEmail ? t('workOrders.markReadyDone') : t('workOrders.markReadyDoneNoEmail'));
      if (!hasEmail) {
        setReadyNotifyOpen(true);
      }
    } catch (err) {
      showToast('error', t('workOrders.markReadyError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Manda la orden al archivo o la devuelve al tablero. Desde el archivo es la única forma de
   * traerla de vuelta sin reabrirla, por eso el mismo botón hace las dos cosas.
   */
  const toggleArchived = async () => {
    if (!order || !canArchive) return;
    const archivar = !isArchived;
    if (archivar && !confirm(t('workOrders.archiveConfirm'))) return;
    setBusy(true);
    try {
      await workOrdersService.setArchived(order.id, archivar);
      // El tablero y el archivo son dos listas distintas: la orden sale de una y entra a la otra.
      void queryClient.invalidateQueries({ queryKey: ['work-orders-archived'] });
      await refresh();
      showToast('success', t(archivar ? 'workOrders.archivedToast' : 'workOrders.unarchivedToast'));
    } catch (err) {
      showToast('error', t('workOrders.archiveError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  // El avance se guarda una vez por gesto (al soltar el control o al salir de la casilla) y
  // en fila. Antes el control deslizante mandaba un UPDATE por cada paso de 5 mientras se
  // arrastraba, sin esperar a ninguno: llegaban a la base en cualquier orden, ganaba el
  // último en llegar aunque fuera un valor intermedio, y uno que llegara después de
  // "Finalizado" dejó una orden cerrada en 80 % y otra en 0 % (octubre 2026). La base ya
  // no deja una orden cerrada por debajo de 100 (20261010000001); esto es para no mandar la
  // ráfaga y no pintar un número que la base no guardó.
  const progressQueue = useRef<Promise<void>>(Promise.resolve());
  const progressSeq = useRef(0);

  const commitProgress = () => {
    if (!order || !canEditProgress) return;
    const value = parseInt(progressDraft, 10);
    // Una casilla vacía no es 0 %: quien la borró iba a escribir otro número.
    if (Number.isNaN(value)) {
      setProgressDraft(String(order.porcentaje_avance));
      return;
    }
    const clamped = Math.min(100, Math.max(0, value));
    setProgressDraft(String(clamped));
    if (clamped === order.porcentaje_avance) return;

    const orderId = order.id;
    const seq = ++progressSeq.current;
    progressQueue.current = progressQueue.current.then(async () => {
      try {
        await workOrdersService.updateWorkOrderProgress(orderId, clamped);
      } catch (err) {
        if (seq === progressSeq.current) setProgressDraft(String(order.porcentaje_avance));
        fail(err);
      }
      // Se relee en vez de pintar el número pedido: si la orden se cerró mientras tanto,
      // la base lo dejó en 100. Relee solo la última, para que el control no salte entre
      // valores que ya se reemplazaron.
      if (seq === progressSeq.current) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(orderId) });
        onBoardChanged();
      }
      // Una fila rechazada se saltaría todas las escrituras de después.
    }).catch(fail);
  };

  const updateInsurance = async (insurance: { con_seguro: boolean; aseguradora?: string | null; numero_reclamo?: string | null }) => {
    if (!order) return;
    setBusy(true);
    try {
      await workOrdersService.updateInsurance(order.id, insurance);
      await refresh();
      showToast('success', t('workOrders.insuranceUpdated'));
    } catch (err) {
      showToast('error', t('common.error'), getErrorMessage(err, language));
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const updateDamageMarks = async (marks: DamageMark[]) => {
    if (!order || !isAdmin || order.firma_ruta) return;
    setSavingDamageMarks(true);
    try {
      await workOrdersService.updateDamageMarks(order.id, marks);
      await refresh();
      showToast('success', t('damage.saved'));
    } catch (err) {
      showToast('error', t('damage.saveError'), getErrorMessage(err, language));
      throw err;
    } finally {
      setSavingDamageMarks(false);
    }
  };

  const saveSignature = async (dataUrl: string) => {
    if (!order) return;
    setSavingSignature(true);
    try {
      const { ruta, fecha } = await workOrdersService.uploadSignature(order, dataUrl);
      patchOrder({ firma_ruta: ruta, firma_fecha: fecha });
      showToast('success', t('workOrders.signatureSaved'));
      // La primera firma autoriza lo cotizado: cambian el estado de las líneas, los
      // totales y la tarjeta de presupuesto, y se crean el enlace y el correo de
      // recepción. Nada de eso lo sabe esta pantalla sin volver a leer la orden.
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes(order.id) });
      await refresh();
    } catch (err) {
      showToast('error', t('workOrders.signatureError'), getErrorMessage(err, language));
    } finally {
      setSavingSignature(false);
    }
  };

  return {
    progressDraft,
    setProgressDraft,
    commitProgress,
    statusEpoch,
    bumpStatusEpoch,
    changeStatus,
    markReadyForPickup,
    readyNotifyOpen,
    closeReadyNotify,
    toggleArchived,
    updateInsurance,
    savingDamageMarks,
    updateDamageMarks,
    savingSignature,
    saveSignature,
  };
}
