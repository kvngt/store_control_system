import type { OrderStatus, Sede, UserProfile, WorkOrder } from '../../../types/database';

export interface OrderDetailSharedContext {
  openOrderId: string | null;
  order: WorkOrder | null;
  isAdmin: boolean;
  isAssignedToMe: boolean;
  orderSede: Sede | null;
  user: UserProfile | null;
  patchOrder: (patch: Partial<WorkOrder>) => void;
  refresh: (alsoBoard?: boolean) => Promise<void>;
  setBusy: (busy: boolean) => void;
  fail: (err: unknown) => void;
}

export interface PartInput {
  descripcion: string;
  cantidad: number;
  precio_venta_unitario: number;
  costo_unitario?: number | null;
}

export interface LaborPrefill {
  text: string;
  nonce: number;
  technicianId?: string | null;
}

export interface StickerModalState {
  open: boolean;
  initialData?: {
    fecha?: string | null;
    millas?: number | null;
    nota?: string | null;
    idioma?: 'es' | 'en' | null;
  } | null;
}

export interface ShareReportState {
  link: string;
  message: string;
}

export interface SectionStateProps {
  sectionId: string;
  open: boolean;
  onToggle: () => void;
}

export function hasErrorCode(err: unknown, code: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if (!('code' in err)) return false;
  return err.code === code;
}

export function toOrderStatus(value: string): OrderStatus | null {
  switch (value) {
    case 'recepcion':
    case 'en_proceso':
    case 'espera_autorizacion':
    case 'finalizado':
    case 'entregado':
      return value;
    default:
      return null;
  }
}
