import type { LaborItem, OrderStatus, WorkOrder } from '../../types/database';
import type { QuickAction } from './QuickActions';
import { isApproved } from './lineState';
import { AlertTriangle, Car, CheckCircle2, ClipboardCheck, ListChecks, MessageSquarePlus, Play, Tag } from 'lucide-react';

export type TechNextStepResult = 'start' | 'finish' | 'partDone' | null;

/**
 * Determina el siguiente paso del técnico en una orden de trabajo (D1).
 * Función pura exportada compartida entre las acciones rápidas y la lista de tareas.
 *
 * - 'start': En estado 'recepcion', el técnico tiene al menos una tarea autorizada asignada.
 * - 'finish': En estado 'en_proceso', TODAS las tareas autorizadas de la orden están completadas.
 * - 'partDone': En estado 'en_proceso', las tareas del técnico están listas pero faltan de otro técnico.
 * - null: Cualquier otro estado o si no aplica acción de cambio de estado.
 */
export function techNextStep(
  order: { estatus?: string | null } | null | undefined,
  laborItems: LaborItem[],
  userId: string
): TechNextStepResult {
  const status = order?.estatus;
  if (!status) return null;

  if (status === 'recepcion') {
    const hasMyApproved = laborItems.some(
      (item) => item.asignado_a === userId && isApproved(item)
    );
    return hasMyApproved ? 'start' : null;
  }

  if (status === 'en_proceso') {
    const allApproved = laborItems.filter((item) => isApproved(item));
    const allApprovedDone =
      allApproved.length > 0 &&
      allApproved.every((item) => Boolean(item.completado_en));
    if (allApprovedDone) {
      return 'finish';
    }

    const myApproved = laborItems.filter(
      (item) => item.asignado_a === userId && isApproved(item)
    );
    const myApprovedDone =
      myApproved.length > 0 &&
      myApproved.every((item) => Boolean(item.completado_en));
    const otherPending = laborItems.filter(
      (item) =>
        item.asignado_a !== userId &&
        isApproved(item) &&
        !item.completado_en
    );

    if (myApprovedDone && otherPending.length > 0) {
      return 'partDone';
    }
  }

  return null;
}

export interface BuildTechActionsParams {
  order: WorkOrder;
  laborList: LaborItem[];
  userId: string;
  canEdit: boolean;
  busy?: boolean;
  canSuggestNextService?: boolean;
  changeStatus: (status: OrderStatus) => Promise<void> | void;
  goTo: (tabId: string, sectionId: string) => void;
  onReportFinding: () => void;
  onSuggestService: () => void;
}

/**
 * Construye la lista de acciones rápidas del técnico asegurando que solo haya un
 * botón principal (primary: true) a la vez (D1).
 */
export function buildTechActions({
  order,
  laborList,
  userId,
  canEdit,
  busy,
  canSuggestNextService,
  changeStatus,
  goTo,
  onReportFinding,
  onSuggestService,
}: BuildTechActionsParams): QuickAction[] {
  if (!canEdit) return [];

  const step = techNextStep(order, laborList, userId);
  const hasTechPrimary = step === 'start' || step === 'finish';

  return [
    ...(step === 'start'
      ? [
          {
            key: 'startWork',
            icon: Play,
            label: 'tasks.startWork',
            onClick: () => void changeStatus('en_proceso'),
            primary: true,
            disabled: busy,
          },
        ]
      : []),
    ...(step === 'finish'
      ? [
          {
            key: 'finishOrder',
            icon: CheckCircle2,
            label: 'tasks.finishOrder',
            onClick: () => void changeStatus('finalizado'),
            primary: true,
            disabled: busy,
          },
        ]
      : []),
    {
      key: 'tasks',
      icon: ListChecks,
      label: 'quickActions.myTasks',
      onClick: () => goTo('tareas', 'tareas'),
      primary: !hasTechPrimary,
    },
    {
      key: 'progress',
      icon: MessageSquarePlus,
      label: 'quickActions.progress',
      onClick: () => goTo('avances', 'avances'),
    },
    {
      key: 'inspection',
      icon: ClipboardCheck,
      label: 'quickActions.inspection',
      onClick: () => goTo('orden', 'inspeccion'),
    },
    ...(order.estatus !== 'finalizado'
      ? [
          {
            key: 'finding',
            icon: AlertTriangle,
            label: 'quickActions.reportFinding',
            onClick: onReportFinding,
          },
        ]
      : []),
    ...(canSuggestNextService
      ? [
          {
            key: 'suggestService',
            icon: Tag,
            label: 'quickActions.suggestService',
            onClick: onSuggestService,
          },
        ]
      : []),
    {
      key: 'vehicle',
      icon: Car,
      label: 'quickActions.vehicle',
      onClick: () => goTo('orden', 'vehiculo'),
    },
  ];
}
