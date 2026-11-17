import type { LaborItem, OrderStatus, UserProfile } from '../../../types/database';

export interface PermissionsOrderInput {
  estatus: OrderStatus;
  asignaciones?: ReadonlyArray<{ usuario_id: string }>;
  archivada_en?: string | null;
  lista_para_entregar_en?: string | null;
  labor_items?: ReadonlyArray<{ estado?: string | null }>;
  repuestos?: ReadonlyArray<{ estado?: string | null }>;
  repuestos_resumen?: ReadonlyArray<{ estado?: string | null }>;
}

export interface PermissionsUserInput {
  id: string;
  rol: UserProfile['rol'];
}

export interface OrderPermissions {
  isAdmin: boolean;
  isAssignedToMe: boolean;
  isDelivered: boolean;
  isComplete: boolean;
  canEdit: boolean;
  canResign: boolean;
  canSign: boolean;
  canEditProgress: boolean;
  canCompleteLabor: boolean;
  canCompleteLaborItem: (item: Pick<LaborItem, 'asignado_a'>) => boolean;
  canDeliver: boolean;
  canArchive: boolean;
  isArchived: boolean;
  canEditLines: boolean;
  canSendReport: boolean;
  canProgramNextService: boolean;
  canSuggestNextService: boolean;
  canWithdraw: boolean;
  canMarkReady: boolean;
  isReadyForPickup: boolean;
  canRegisterAdvance: boolean;
}

/**
 * Derives UI action and button visibility flags for an open work order.
 * Actual security enforcement lives in Supabase RLS and database triggers.
 */
export function computeOrderPermissions(
  order: PermissionsOrderInput | null,
  user: PermissionsUserInput | null
): OrderPermissions {
  const isAdmin = user?.rol === 'admin';
  const isAssignedToMe = (order?.asignaciones || []).some((a) => a.usuario_id === user?.id);
  const isDelivered = order?.estatus === 'entregado';
  const isComplete = order?.estatus === 'finalizado' || isDelivered;
  const canEdit = isAdmin || (isAssignedToMe && !isDelivered);
  const canResign = isAdmin && order?.estatus === 'recepcion';
  const canSign = isAdmin;
  // B-02 (20261010000047): sin ninguna línea autorizada, la base rechaza que el técnico mueva porcentaje_avance.
  const hasAuthorizedWork = [
    ...(order?.labor_items ?? []),
    ...(order?.repuestos ?? []),
    ...(order?.repuestos_resumen ?? []),
  ].some((l) => l.estado === 'aprobado');
  const canEditProgress = canEdit && !isComplete && (isAdmin || hasAuthorizedWork);
  const canCompleteLabor = canEdit;
  const canCompleteLaborItem = (item: Pick<LaborItem, 'asignado_a'>) =>
    canCompleteLabor && (isAdmin || !item.asignado_a || item.asignado_a === user?.id);
  const canDeliver = isAdmin;
  const canArchive = isAdmin && isDelivered;
  const isArchived = !!order?.archivada_en;
  const canEditLines = isAdmin;
  const canSendReport = isAdmin;
  const canProgramNextService = isAdmin;
  const canSuggestNextService = !isAdmin && isAssignedToMe && !isDelivered;
  const canWithdraw = isAdmin && !isDelivered;
  const canMarkReady = isAdmin && order?.estatus === 'finalizado' && !order?.lista_para_entregar_en;
  const isReadyForPickup = order?.estatus === 'finalizado' && !!order?.lista_para_entregar_en;
  const canRegisterAdvance = isAdmin && !isDelivered;

  return {
    isAdmin,
    isAssignedToMe,
    isDelivered,
    isComplete,
    canEdit,
    canResign,
    canSign,
    canEditProgress,
    canCompleteLabor,
    canCompleteLaborItem,
    canDeliver,
    canArchive,
    isArchived,
    canEditLines,
    canSendReport,
    canProgramNextService,
    canSuggestNextService,
    canWithdraw,
    canMarkReady,
    isReadyForPickup,
    canRegisterAdvance,
  };
}
