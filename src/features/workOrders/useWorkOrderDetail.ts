import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/auth.context';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { commissionsService, usersService, workOrdersService } from '../../services/supabaseService';
import { mediaService } from '../../services/media.service';
import { useMediaUploads } from '../media/mediaUploads.context';
// Statically imported, unlike the PDF renderer below: ShareReportModal already
// pulls it into this chunk, so a dynamic import here only defeats itself.
import { reportsService } from '../../services/reports.service';
import { customerPortalService } from '../../services/customerPortal.service';
import { reportAssetPaths } from '../../lib/reportMedia';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import type { LaborItem, OrderAssignment, OrderMedia, OrderProgressUpdate, OrderStatus, PartOrderState, PreparedMedia, Specialty, UserProfile, WorkOrder } from '../../types/database';
import { isApproved } from './lineState';
import type { TaskDraft, Technician } from './tasks';

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
  const { user, currentSede, allSedes } = useAuth();
  const { showToast } = useToast();
  const mediaUploads = useMediaUploads();

  const queryClient = useQueryClient();

  // Which order the screen has open. The detail itself is a query keyed on it,
  // so reopening an order the user just looked at is served from cache while
  // the fresh copy is fetched behind it.
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [savingSignature, setSavingSignature] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [preparingShare, setPreparingShare] = useState(false);
  // The signed link + message for the report the user just generated. Non-null
  // is what opens the share dialog.
  const [share, setShare] = useState<{ link: string; message: string } | null>(null);
  const [progressDraft, setProgressDraft] = useState('0');
  // Se incrementa cuando un cambio de estatus se descarta sin llegar al
  // servidor. La pantalla lo usa como `key` del <select>, que es lo único que
  // vuelve a montarlo: al cancelar el confirm no cambia ningún estado, así que
  // React no re-renderiza y el DOM se queda mostrando la opción que el usuario
  // eligió — "Entregado" en una orden que no se entregó. Y esa lista es
  // justamente la ruta táctil, porque en un teléfono no hay arrastre.
  const [statusEpoch, setStatusEpoch] = useState(0);
  // Entregar abre el diálogo de cobro (método, cheque, comprobante) en vez de un `confirm`.
  const [delivering, setDelivering] = useState(false);
  // "Retirada sin reparar": el diálogo que cierra la orden sin hacer el trabajo.
  const [withdrawing, setWithdrawing] = useState(false);
  // Un anticipo: el cliente paga una parte antes de llevarse el vehículo.
  const [advancing, setAdvancing] = useState(false);
  // El avance que está por publicarse. El diálogo muestra su texto como lo verá el cliente.
  const [publishingProgress, setPublishingProgress] = useState<OrderProgressUpdate | null>(null);

  const isAdmin = user?.rol === 'admin';

  const detailKey = queryKeys.workOrderDetail(openOrderId ?? '');
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => workOrdersService.getWorkOrderDetail(openOrderId as string),
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
  const notFound = !!openOrderId && (detailQuery.error as { code?: string } | null)?.code === 'PGRST116';

  const fail = useCallback(
    (err: unknown) => setMutationError(getErrorMessage(err, language)),
    [language]
  );

  // La pestaña con la que se pidió abrir la orden (un aviso que lleva a "Trabajos", por
  // ejemplo). La pantalla la usa al cambiar de orden; null es la pestaña de siempre.
  const [requestedTab, setRequestedTab] = useState<string | null>(null);

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
      await queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(openOrderId) });
      // Un cambio de estatus programa un correo al cliente y entregar fija el
      // vencimiento del enlace: la tarjeta del enlace (solo admin) se entera aquí.
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerLink(openOrderId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerEmails(openOrderId) });
      // La mano de obra, su especialidad y el equipo mueven el reparto de la comisión.
      void queryClient.invalidateQueries({ queryKey: queryKeys.commissionEstimate(openOrderId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.paidCommissions(openOrderId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderFinancialBalance(openOrderId) });
      // Todo lo que cambia una orden deja una fila en su historial (20261010000004).
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderHistory(openOrderId) });
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
  // Admins can always edit. La entrada es que un administrador los asigne: desde
  // 20261004000000 `orden_asignaciones_insert` es `is_admin()`, así que nadie se pone a sí
  // mismo en una orden — asignar reparte la comisión de la mano de obra.
  const isAssignedToMe = (order?.asignaciones || []).some((a) => a.usuario_id === user?.id);
  const isDelivered = order?.estatus === 'entregado';
  const isComplete = order?.estatus === 'finalizado' || isDelivered;

  // Una orden entregada está cerrada para el taller. Sus líneas mueven dinero ya
  // asentado — los totales disparan un ajuste en Finanzas y las asignaciones
  // re-reparten la bolsa de comisión — así que editarla es corregir la
  // contabilidad, y eso es trabajo de administración. La base lo impone con
  // `trg_guard_delivered_order_children`; esto es para que el técnico vea los
  // controles deshabilitados en vez de un error al apretarlos.
  const canEdit = isAdmin || (isAssignedToMe && !isDelivered);

  // Volver a firmar es distinto de firmar. La firma es el respaldo de cómo el cliente
  // entregó el vehículo (desde 20261010000022 ya no autoriza lo cotizado); sustituirla más
  // tarde rehace ese respaldo, así que no es trabajo del taller y solo tiene sentido mientras
  // la orden sigue en recepción. Un técnico asignado veía el botón y podía borrar la
  // firma de un toque.
  const canResign = isAdmin && order?.estatus === 'recepcion';

  // Tomar la firma también es de administración (acordado con el taller, sept. 2026): hasta
  // 20261010000022 la primera firma aprobaba lo cotizado, y el técnico podía capturarla en
  // cualquier estado.
  // La base lo impone en `trg_guard_order_technician`; el técnico ve la tarjeta sin el pad.
  const canSign = isAdmin;

  // Antes exigía `en_proceso`, lo que dejaba trabada una orden reabierta desde
  // `finalizado`: llegaba con el avance en 100 y el control bloqueado en todo
  // estatus que no fuera `en_proceso`, así que nadie podía bajarlo.
  const canEditProgress = canEdit && !isComplete;

  // Tachar un trabajo hecho es del técnico asignado además del admin: es lo único que
  // escribe sobre una línea de dinero, y solo para decir que ya se hizo.
  const canCompleteLabor = canEdit;
  // Desde la comisión por tarea (20261010000006) una tarea con técnico la marca ese técnico o
  // administración; una sin técnico, cualquiera asignado a la orden. La base lo impone en
  // `marcar_labor_completada`; aquí es para no ofrecer el botón a quien no le toca.
  const canCompleteLaborItem = (item: LaborItem) =>
    canCompleteLabor && (isAdmin || !item.asignado_a || item.asignado_a === user?.id);

  // Entregar asienta el ingreso del trabajo y devenga las comisiones. Es una
  // decisión de administración, no un paso del taller: un técnico asignado podía
  // mover la orden a "entregado" y con eso acreditarse su propia comisión.
  const canDeliver = isAdmin;

  // Archivar saca una entregada del tablero sin esperar los 90 días. Solo lo entregado
  // (CHECK en la base) y solo administración (un técnico no toca una orden entregada).
  const canArchive = isAdmin && isDelivered;
  const isArchived = !!order?.archivada_en;

  // Cotizar es de administración: mano de obra y repuestos solo los agrega o
  // cambia un admin. La base lo impone (RLS de `orden_labor` / `orden_repuestos`);
  // esto solo decide qué controles se dibujan.
  const canEditLines = isAdmin;

  // El reporte lleva precios, totales y depósito, y el cliente pidió que solo
  // administración lo mande. El bucket `reportes` también es solo admin.
  const canSendReport = isAdmin;

  // Lo que el técnico ve de dinero, y la razón por la que lo ve: su parte de la mano de
  // obra. Desde 20261009000000 la cuenta es por especialidad y con el porcentaje de cada
  // quien, así que ya no se hace aquí: la base la devuelve (`comisiones_estimadas`, la misma
  // que devenga al entregar). Administración recibe el reparto entero para avisar de una
  // bolsa que nadie cobra.
  const estimateQuery = useQuery({
    queryKey: queryKeys.commissionEstimate(order?.id ?? ''),
    queryFn: () => commissionsService.getEstimate(order!.id),
    enabled: !!order && (isAdmin || isAssignedToMe),
  });
  const commissionEstimate = estimateQuery.data ?? null;

  // Quienes pueden recibir una tarea: los mecánicos y pintores de la sede DE ESTA ORDEN, no de la
  // elegida arriba (una orden abierta desde un aviso puede ser de otra). La base rechaza a
  // cualquier otro. El filtro por sede se repite aquí por si la lista llega sin filtrar.
  const operatorsQuery = useQuery({
    queryKey: queryKeys.operators(order?.sede_id),
    queryFn: () => usersService.getOperators(order!.sede_id),
    enabled: !!order && isAdmin,
  });
  const orderOperators: UserProfile[] = (operatorsQuery.data ?? []).filter(
    (op) => op.sede_id === order?.sede_id && (op.rol === 'mecanico' || op.rol === 'pintor')
  );
  const technicians: Technician[] = orderOperators.map(({ id, nombre_completo, rol }) => ({ id, nombre_completo, rol }));

  // Las tareas con la comisión ya pagada: la base no deja cambiarles el técnico ni el tipo (ni a
  // una línea heredada aprobada cuya bolsa se pagó), así que la fila lo muestra bloqueado en vez
  // de dejar intentarlo. Solo administración lee `comisiones`.
  const paidQuery = useQuery({
    queryKey: queryKeys.paidCommissions(order?.id ?? ''),
    queryFn: () => workOrdersService.getPaidCommissionKeys(order!.id),
    enabled: !!order && isAdmin,
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

  // ----- status & progress ---------------------------------------------------

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
      setDelivering(true);
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

  // Cancelar deja el <select> mostrando el estado real.
  const cancelDelivery = () => {
    setDelivering(false);
    setStatusEpoch((n) => n + 1);
  };

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

  // Administración revisa lo que terminó el técnico y confirma que está listo: ahí se le avisa al
  // cliente. Antes, finalizar avisaba solo (y el técnico podía hacerlo sin que nadie lo revisara).
  const markReadyForPickup = async () => {
    if (!order || !isAdmin) return;
    setBusy(true);
    try {
      await workOrdersService.markReadyForPickup(order.id);
      await refresh();
      showToast('success', t('workOrders.markReadyDone'));
    } catch (err) {
      showToast('error', t('workOrders.markReadyError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
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

  const toggleLaborComplete = async (item: LaborItem) => {
    if (!order) return;
    setBusy(true);
    try {
      await workOrdersService.setLaborCompleted(item.id, !item.completado_en);
      // Sin recargar el tablero: no cambian totales ni estado de la orden.
      await refresh(false);
    } catch (err) {
      fail(err);
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

  // ----- labor ---------------------------------------------------------------

  /** Una tarea nueva con su tipo y su técnico. `false` si no entró, para que el editor no se vacíe. */
  const addLabor = async (task: TaskDraft): Promise<boolean> => {
    if (!order) return false;
    setBusy(true);
    try {
      await workOrdersService.addLaborItem(order.id, task);
      // Que se vea que entró (reunión del 03/10/2026). Lo nuevo nace sin autorizar: no se cobra
      // ni paga comisión hasta que el cliente lo autorice (así se quedó sin comisión la pintora
      // con su mano de obra extra). Desde 20261010000022 tampoco lo autoriza la firma.
      showToast('success', t('workOrders.laborAdded'), t('workOrders.needsAuthorization'));
      await refresh();
      return true;
    } catch (err) {
      // Dentro del aviso y no en el recuadro de arriba: el editor está a media pestaña.
      showToast('error', t('workOrders.laborAddError'), getErrorMessage(err, language));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * El técnico de una tarea: quién cobra su comisión. La base rechaza con una frase para el
   * taller si la comisión ya se pagó o si la persona no es de la sede; se muestra tal cual.
   */
  const assignLaborTechnician = async (item: LaborItem, asignadoA: string | null) => {
    if (!order || !isAdmin) return;
    setBusy(true);
    try {
      await workOrdersService.setLaborTechnician(item.id, asignadoA);
      // Sin el tablero: un técnico no cambia totales ni estado. Sí cambian la comisión, los
      // asignados de la orden (entra quien recibe la tarea) y el historial.
      await refresh(false);
      showToast('success', t('tasks.technicianChanged'));
    } catch (err) {
      showToast('error', t('tasks.technicianError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  /** A qué bolsa va una tarea. No cambia lo cotizado ni el estado de la línea. */
  const changeLaborSpecialty = async (item: LaborItem, especialidad: Specialty) => {
    if (!order || !isAdmin || especialidad === item.especialidad) return;
    setBusy(true);
    try {
      await workOrdersService.setLaborSpecialty(item.id, especialidad);
      await refresh(false);
      showToast('success', t('tasks.typeChanged'));
    } catch (err) {
      showToast('error', t('tasks.typeError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  // Los errores de la mano de obra van en un aviso y no en el recuadro de arriba de la página:
  // la tabla está a media pestaña y el recuadro queda fuera de la vista ("La comisión de este
  // trabajo ya se pagó…" parecía un botón que no hacía nada).
  const updateLabor = async (id: string, item: { descripcion: string; costo: number }) => {
    if (!order) return;
    setBusy(true);
    try {
      await workOrdersService.updateLaborItem(id, item);
      await refresh();
    } catch (err) {
      showToast('error', t('workOrders.laborUpdateError'), getErrorMessage(err, language));
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
      showToast('error', t('workOrders.laborRemoveError'), getErrorMessage(err, language));
    }
  };

  // ----- parts ---------------------------------------------------------------

  type PartInput = {
    descripcion: string;
    cantidad: number;
    precio_venta_unitario: number;
    costo_unitario?: number | null;
  };

  /** `false` si no entró, para que la tabla no vacíe lo escrito. */
  const addPart = async (item: PartInput): Promise<boolean> => {
    if (!order) return false;
    setBusy(true);
    try {
      await workOrdersService.addPart(order.id, item);
      showToast('success', t('workOrders.partAdded'), t('workOrders.needsAuthorization'));
      await refresh();
      return true;
    } catch (err) {
      showToast('error', t('workOrders.partAddError'), getErrorMessage(err, language));
      fail(err);
      return false;
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

  // Pedido → llegó. Al llegar, la base avisa a los técnicos de la orden.
  const setPartOrderState = async (id: string, estado: PartOrderState | null) => {
    if (!order) return;
    try {
      await workOrdersService.setPartOrderState(id, estado);
      await refresh();
      if (estado) showToast('success', estado === 'pedido' ? t('parts.markedOrdered') : t('parts.markedReceived'));
    } catch (err) {
      showToast('error', t('parts.orderStateError'), getErrorMessage(err, language));
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
    const tipo = operator.rol === 'pintor' ? 'pintura' : 'mecanica';
    // Quien ya está en la orden por una tarea (origen 'tarea') con ese mismo tipo no se duplica:
    // agregarlo a mano es meterlo al reparto heredado, y eso es cambiar el origen de su fila.
    const byTask = (order.asignaciones || []).find(
      (a) => a.usuario_id === operator.id && a.tipo_tarea === tipo && a.origen === 'tarea'
    );
    try {
      if (byTask) await workOrdersService.setAssignmentOrigin(byTask.id, 'manual');
      else await workOrdersService.addAssignment(order.id, operator.id, tipo);
      // Assignments don't change any figure the board shows.
      await refresh(false);
    } catch (err) {
      showToast('error', t('workOrders.addAssignmentError'), getErrorMessage(err, language));
    }
  };

  /**
   * Meter o sacar a alguien del reparto heredado por especialidad sin quitarlo de la orden
   * (20261010000006). Así se saca a quien tiene tareas, que no se puede quitar de la orden.
   */
  const setAssignmentInSplit = async (assignment: OrderAssignment, inSplit: boolean) => {
    if (!order || !isAdmin) return;
    setBusy(true);
    try {
      await workOrdersService.setAssignmentOrigin(assignment.id, inSplit ? 'manual' : 'tarea');
      await refresh(false);
      showToast('success', t(inSplit ? 'tasks.joinedSplit' : 'tasks.leftSplit'));
    } catch (err) {
      showToast('error', t('tasks.splitError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  // Aquí vivía `joinOrder`: un técnico se metía a sí mismo en `orden_asignaciones`. Era la
  // única escritura del navegador que lo hacía, y asignarse no es una etiqueta —
  // `trg_assignment_commissions` llama a `sync_order_commissions`, que reparte la mano de
  // obra entre los asignados. Unirse era concederse una comisión y bajarle la suya a quien
  // estaba haciendo el trabajo. Desde 20261004000000 la base lo rechaza
  // (`orden_asignaciones_insert` es `is_admin()`) y asignar se hace desde el selector de
  // administración, unas líneas más arriba en `WorkOrderDetail`.
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

  const removeAssignment = async (id: string, nombre: string) => {
    if (!order) return;
    if (!confirm(`${t('common.delete')}: ${nombre}?`)) return;
    try {
      await workOrdersService.removeAssignment(id);
      await refresh();
    } catch (err) {
      // "Ana tiene 2 tarea(s) en esta orden. Asígnalas a otra persona…" (20261010000006): con
      // el aviso se lee donde está la tarjeta, no en el recuadro de arriba de la página.
      showToast('error', t('workOrders.removeAssignmentError'), getErrorMessage(err, language));
    }
  };

  // ----- media ---------------------------------------------------------------

  /** Mete archivos ya procesados en la cola de subida, atados a esta orden. */
  const enqueueMedia = (
    items: PreparedMedia[],
    target: { origen: 'recepcion' | 'avance'; avanceId?: string | null; zona?: string | null }
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
    if (!order) return;
    if (!confirm(t('common.delete') + '?')) return;
    try {
      const attached = (order.media || []).filter((m) => m.avance_id === id);
      await workOrdersService.removeProgressUpdate(id, attached);
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


  // ----- PDF -----------------------------------------------------------------

  /**
   * URLs firmadas para lo que el PDF incrusta: las fotos visibles para el cliente
   * (en miniatura; ni videos ni audio, que un PDF no reproduce) y la firma. Todo
   * vive en un bucket privado, así que el generador no puede leerlo por URL pública.
   */
  const signPdfAssets = async (target: WorkOrder) => mediaService.signUrls(reportAssetPaths(target), 10 * 60);

  // En español o en inglés, lo elige administración al descargarlo (decisión del 05/10/2026).
  const generatePdf = async (pdfLanguage: 'es' | 'en' = 'es') => {
    if (!order || !canSendReport) return;
    setGeneratingPdf(true);
    try {
      // ~400 kB of jsPDF, fetched only when someone prints.
      const [{ generateWorkOrderPdf }, urls, link, balance, translations] = await Promise.all([
        import('../../lib/workOrderPdf'),
        signPdfAssets(order),
        // Si la orden ya tiene enlace, el PDF lo lleva: la versión con videos.
        customerPortalService.getActiveLink(order.id).catch(() => null),
        // Lo recibido y el saldo, como los cuenta la base. Si falla, el PDF usa lo de antes.
        workOrdersService.getBalance(order.id).catch(() => null),
        // En inglés, lo que el taller escribió sale con su traducción si ya la hay.
        pdfLanguage === 'en'
          ? workOrdersService.getOrderTranslations(order.id).catch(() => ({}) as Record<string, string>)
          : Promise.resolve({} as Record<string, string>),
      ]);
      await generateWorkOrderPdf(order, orderSede, urls, {
        portalUrl: link ? customerPortalService.portalUrl(link.token) : undefined,
        language: pdfLanguage,
        translations,
        balance: balance ? { cobrado: balance.cobrado, saldo: balance.saldo } : null,
      });
    } catch (err) {
      showToast('error', t('workOrders.pdfError'), getErrorMessage(err, language));
    } finally {
      setGeneratingPdf(false);
    }
  };

  /**
   * Abre "Enviar reporte" con el enlace web del cliente (fase 6).
   *
   * Ya no genera ni sube un PDF: el reporte es la página del cliente, que muestra
   * los videos y se mantiene al día sola. Si la orden no tenía enlace (sin firma
   * todavía), se crea aquí.
   */
  const shareReport = async () => {
    if (!order || !canSendReport) return;
    setPreparingShare(true);
    try {
      const link = await customerPortalService.createLink(order.id);
      const url = customerPortalService.portalUrl(link.token);
      setShare({ link: url, message: reportsService.buildMessage(order, url, orderSede?.nombre) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerLink(order.id) });
    } catch (err) {
      showToast('error', t('workOrders.shareReportError'), getErrorMessage(err, language));
    } finally {
      setPreparingShare(false);
    }
  };

  const closeShare = useCallback(() => setShare(null), []);

  const approveCommission = async (comisionId: string, montoNuevo?: number, porcentajeNuevo?: number) => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await workOrdersService.approveCommission(comisionId, montoNuevo, porcentajeNuevo);
      await refresh(false);
      showToast('success', t('commission.approvedSuccess'));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return {
    order,
    loading,
    loadError,
    notFound,
    busy,
    error,
    canEdit,
    canCompleteLabor,
    canCompleteLaborItem,
    approveCommission,
    canResign,
    canSign,
    canEditProgress,
    canDeliver,
    canArchive,
    isArchived,
    toggleArchived,
    canEditLines,
    canSendReport,
    commissionEstimate,
    isComplete,
    isDelivered,
    statusEpoch,
    delivering,
    cancelDelivery,
    finishDelivery,
    withdrawing,
    canWithdraw: isAdmin && !isDelivered,
    markReadyForPickup,
    canMarkReady: isAdmin && order?.estatus === 'finalizado' && !order?.lista_para_entregar_en,
    isReadyForPickup: order?.estatus === 'finalizado' && !!order?.lista_para_entregar_en,
    advancing,
    canRegisterAdvance: isAdmin && !isDelivered,
    startAdvance: () => setAdvancing(true),
    cancelAdvance: () => setAdvancing(false),
    finishAdvance,
    startWithdrawal: () => setWithdrawing(true),
    cancelWithdrawal: () => setWithdrawing(false),
    finishWithdrawal,
    applyDiscount,
    publishingProgress,
    toggleProgressVisibility,
    confirmPublishProgress,
    cancelPublishProgress: () => setPublishingProgress(null),
    progressDraft,
    setProgressDraft,
    savingSignature,
    generatingPdf,
    preparingShare,
    open,
    close,
    requestedTab,
    changeStatus,
    reportFinding,
    quoteFinding,
    discardFinding,
    toggleLaborComplete,
    commitProgress,
    addLabor,
    updateLabor,
    removeLabor,
    assignLaborTechnician,
    changeLaborSpecialty,
    technicians,
    orderOperators,
    lockedLaborIds,
    paidPools,
    addPart,
    updatePart,
    removePart,
    setPartOrderState,
    addAssignment,
    setAssignmentInSplit,
    removeAssignment,
    addProgressUpdate,
    removeProgressUpdate,
    addReceptionMedia,
    toggleMediaVisibility,
    deleteMedia,
    pendingUploads: mediaUploads.items.filter((item) => item.ordenId === order?.id && item.estado !== 'listo'),
    isAdmin,
    userId: user?.id,
    saveSignature,
    generatePdf,
    share,
    shareReport,
    closeShare,
  };
}

export type WorkOrderDetailApi = ReturnType<typeof useWorkOrderDetail>;
