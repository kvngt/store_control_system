import type { UserProfile } from './auth.types';

/**
 * A technician's share of one delivered order.
 *
 * Written by database trigger when the order reaches `entregado`, never by the
 * app. `base_ganancia`, `porcentaje` and `tecnicos` are the arithmetic that
 * produced `monto`, stored alongside it so the screen can show the person how
 * their number was arrived at — and so a later change to the shop's rate does
 * not silently rewrite what somebody was already paid.
 */
export interface Commission {
  id: string;
  orden_id: string;
  usuario_id: string;
  sede_id: string;
  /** total_general − total_repuestos: the shop's own margin on the job. */
  base_ganancia: number;
  /** The sede's commission rate at the time this was computed. */
  porcentaje: number;
  /** How many technicians shared the pool. */
  tecnicos: number;
  monto: number;
  /** Null while the commission is still owed. */
  pago_id?: string | null;
  creado_en: string;
  // Virtual, from joins
  usuario?: UserProfile;
  orden?: {
    id: string;
    numero_orden: string;
    fecha_finalizacion?: string | null;
    total_general: number;
    total_repuestos: number;
  };
}

/** A cheque (or cash payment) that clears one or more commissions. */
export interface CommissionPayment {
  id: string;
  sede_id: string;
  usuario_id: string;
  monto: number;
  fecha_pago: string;
  metodo: string;
  numero_cheque?: string | null;
  /** Storage path in the private `comprobantes` bucket, not a public URL. */
  comprobante_url?: string | null;
  notas?: string | null;
  pagado_por?: string | null;
  creado_en: string;
  // Virtual
  usuario?: UserProfile;
}

/** One technician's outstanding balance, and the accruals that make it up. */
export interface CommissionBalance {
  usuario_id: string;
  usuario?: UserProfile;
  total: number;
  items: Commission[];
}
