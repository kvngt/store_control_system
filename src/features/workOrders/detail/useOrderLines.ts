import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../../context/language.context';
import { moduloActivo } from '../../../config/modulos';
import { useToast } from '../../../context/toast.context';
import { usersService } from '../../../services/users.service';
import { workOrdersService } from '../../../services/workOrders.service';
import { queryKeys } from '../../../lib/queryClient';
import { getErrorMessage } from '../../../lib/errors';
import type { LaborItem, OrderAssignment, PartOrderState, Specialty, UserProfile } from '../../../types/database';
import { isUnassignedTask, type TaskDraft, type Technician } from '../tasks';
import type { OrderDetailSharedContext, PartInput } from './detailTypes';

export function useOrderLines({
  openOrderId,
  order,
  isAdmin,
  refresh,
  setBusy,
  fail,
}: Pick<OrderDetailSharedContext, 'openOrderId' | 'order' | 'isAdmin' | 'refresh' | 'setBusy' | 'fail'>) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const orderSedeId = order?.sede_id ?? '';

  // Quienes pueden recibir una tarea: los mecánicos y pintores de la sede DE ESTA ORDEN, no de la
  // elegida arriba (una orden abierta desde un aviso puede ser de otra). La base rechaza a
  // cualquier otro. El filtro por sede se repite aquí por si la lista llega sin filtrar.
  const operatorsQuery = useQuery({
    queryKey: queryKeys.operators(order?.sede_id),
    queryFn: () => usersService.getOperators(orderSedeId),
    enabled: !!order && isAdmin,
  });
  const orderOperators: UserProfile[] = (operatorsQuery.data ?? []).filter(
    (op) => op.sede_id === order?.sede_id && (op.rol === 'mecanico' || op.rol === 'pintor')
  );
  const technicians: Technician[] = orderOperators.map(({ id, nombre_completo, rol }) => ({ id, nombre_completo, rol }));

  const laborTimesQuery = useQuery({
    queryKey: queryKeys.orderLaborTimes(openOrderId ?? ''),
    queryFn: () => workOrdersService.getOrderLaborTimes(openOrderId ?? ''),
    enabled: moduloActivo('reloj') && !!openOrderId,
  });
  const laborTimes = laborTimesQuery.data ?? [];

  // ----- labor ---------------------------------------------------------------

  const toggleLaborComplete = async (item: LaborItem) => {
    if (!order) return;
    setBusy(true);
    const markDone = !item.completado_en;
    try {
      await workOrdersService.setLaborCompleted(item.id, markDone);
      // Sin recargar el tablero: no cambian totales ni estado de la orden.
      await refresh(false);
      if (markDone) {
        showToast('success', t('tasks.markedDone'));
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

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
  const updateLabor = async (
    id: string,
    item: { descripcion: string; costo: number; horas?: number | null }
  ): Promise<boolean> => {
    if (!order) return false;
    setBusy(true);
    try {
      await workOrdersService.updateLaborItem(id, item);
      await refresh();
      return true;
    } catch (err) {
      showToast('error', t('workOrders.laborUpdateError'), getErrorMessage(err, language));
      return false;
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

  // ----- time tracking (M2) ---------------------------------------------------

  const startClock = async (laborId: string) => {
    if (!order) return;
    try {
      await workOrdersService.startClock(laborId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.orderLaborTimes(order.id) });
      showToast('success', t('tasks.clockStarted'));
    } catch (err) {
      showToast('error', t('tasks.clockError'), getErrorMessage(err, language));
    }
  };

  const stopClock = async (laborId: string) => {
    if (!order) return;
    try {
      await workOrdersService.stopClock(laborId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.orderLaborTimes(order.id) });
      showToast('success', t('tasks.clockStopped'));
    } catch (err) {
      showToast('error', t('tasks.clockError'), getErrorMessage(err, language));
    }
  };

  const correctTime = async (tiempoId: string, inicio: string, fin: string | null) => {
    if (!order || !isAdmin) return;
    try {
      await workOrdersService.correctTime(tiempoId, inicio, fin);
      await queryClient.invalidateQueries({ queryKey: queryKeys.orderLaborTimes(order.id) });
      showToast('success', t('tasks.timeCorrected'));
    } catch (err) {
      showToast('error', t('tasks.timeError'), getErrorMessage(err, language));
    }
  };

  const deleteTime = async (tiempoId: string) => {
    if (!order || !isAdmin) return;
    try {
      await workOrdersService.deleteTime(tiempoId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.orderLaborTimes(order.id) });
      showToast('success', t('tasks.timeDeleted'));
    } catch (err) {
      showToast('error', t('tasks.timeError'), getErrorMessage(err, language));
    }
  };

  // ----- parts ---------------------------------------------------------------

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
      // Como en la mano de obra: el aviso basta. Con `fail` además salía el recuadro de arriba y un
      // segundo aviso genérico por el mismo error.
      showToast('error', t('workOrders.partAddError'), getErrorMessage(err, language));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updatePart = async (id: string, item: PartInput): Promise<boolean> => {
    if (!order) return false;
    setBusy(true);
    try {
      await workOrdersService.updatePart(id, item);
      await refresh();
      return true;
    } catch (err) {
      fail(err);
      return false;
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
    const pendingTasksCount = !byTask && order.estatus !== 'entregado'
      ? (order.labor_items || []).filter(
          (l) => isUnassignedTask(l) && l.especialidad === tipo && l.estado !== 'rechazado'
        ).length
      : 0;

    try {
      if (byTask) await workOrdersService.setAssignmentOrigin(byTask.id, 'manual');
      else await workOrdersService.addAssignment(order.id, operator.id, tipo);
      // Assignments don't change any figure the board shows.
      await refresh(false);
      if (pendingTasksCount > 0) {
        const especialidadLabel = tipo === 'pintura' ? t('workOrders.painting').toLowerCase() : t('workOrders.mechanical').toLowerCase();
        showToast(
          'success',
          t('tasks.autoAssigned')
            .replace('{nombre}', operator.nombre_completo)
            .replace('{n}', String(pendingTasksCount))
            .replace('{especialidad}', especialidadLabel)
        );
      }
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

  return {
    technicians,
    orderOperators,
    laborTimes,
    toggleLaborComplete,
    addLabor,
    updateLabor,
    removeLabor,
    assignLaborTechnician,
    changeLaborSpecialty,
    startClock,
    stopClock,
    correctTime,
    deleteTime,
    addPart,
    updatePart,
    removePart,
    setPartOrderState,
    addAssignment,
    setAssignmentInSplit,
    removeAssignment,
  };
}
