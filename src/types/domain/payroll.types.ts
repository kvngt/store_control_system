import type { UserProfile } from './auth.types';

/** A qué bolsa de comisión va un trabajo (20261009000000). */
export type Specialty = 'mecanica' | 'pintura';
export const SPECIALTIES: Specialty[] = ['mecanica', 'pintura'];

/** Cómo se le paga a un empleado. Sin fila en `perfiles_pago` = comisión al % de la sede. */
export type PayKind = 'comision' | 'salario';
export type SalaryPeriod = 'semanal' | 'quincenal' | 'mensual';

export interface PayScheme {
  usuario_id: string;
  esquema: PayKind;
  /** Nulo = el porcentaje de la sede. */
  comision_porcentaje: number | null;
  salario_monto: number | null;
  salario_periodo: SalaryPeriod | null;
  actualizado_en?: string;
}

/** Lo que devuelve `comisiones_estimadas`: las bolsas de la orden y cuánto le toca a cada quien. */
export interface CommissionEstimate {
  bolsas: { especialidad: Specialty; base: number; tecnicos: number }[];
  reparto: {
    usuario_id: string;
    especialidad: Specialty;
    esquema: PayKind;
    porcentaje: number;
    tecnicos: number;
    monto: number;
  }[];
  /** Lo que le toca a quien pregunta, sumando sus bolsas. */
  mi_total: number;
}

/** Lo que devuelve `resumen_empleado`. Las sumas las hace la base. */
export interface EmployeeSummary {
  comisiones_pendientes: number;
  comisiones_pagadas: number;
  ultimo_pago: string | null;
  ordenes_activas: number;
  ordenes_entregadas: number;
}

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
  /** La bolsa de la que sale: la mano de obra autorizada de esa especialidad. */
  especialidad: Specialty;
  /** La bolsa de esa especialidad (mano de obra autorizada). */
  base_ganancia: number;
  /** El porcentaje de esa persona (el suyo o el de la sede) cuando se calculó. */
  porcentaje: number;
  /** Cuántos compartieron esa bolsa. */
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
    total_labor: number;
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
