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

/**
 * Lo que devuelve `comisiones_estimadas` (20261010000006): la comisión de cada tarea, el reparto
 * heredado de las líneas de antes y cuánto le toca a cada quien. Todas las cifras las calcula la
 * base; la pantalla solo las muestra.
 */
export interface CommissionEstimate {
  /**
   * Solo el reparto heredado: líneas aprobadas sin técnico de antes de la comisión por tarea.
   * `tecnicos` = asignados a mano con esa especialidad; 0 = nadie cobra esa bolsa.
   */
  bolsas: { especialidad: Specialty; base: number | null; tecnicos: number }[];
  /** Por persona y especialidad: su parte heredada más sus tareas. */
  reparto: {
    usuario_id: string;
    especialidad: Specialty;
    esquema: PayKind;
    porcentaje: number | null;
    /** El equipo del reparto heredado si `heredado`; si no, 1. */
    tecnicos: number;
    monto: number | null;
    /** Si incluye parte del reparto heredado. */
    heredado: boolean;
    /** Cuántas tareas suyas suma. */
    tareas: number;
    comision_id?: string;
    estado?: 'sugerida' | 'aceptada';
  }[];
  /** Lo que le toca a quien pregunta, sumado por la base. */
  mi_total: number;
  /** Cada tarea aprobada con técnico y su comisión. Un técnico recibe solo las suyas. */
  tareas: {
    labor_id: string;
    descripcion: string;
    especialidad: Specialty;
    usuario_id: string;
    esquema: PayKind;
    base: number | null;
    porcentaje: number | null;
    monto: number | null;
    comision_id?: string;
    estado?: 'sugerida' | 'aceptada';
  }[];
  /** Tareas sin técnico (no heredadas, no rechazadas): nadie cobrará su comisión. */
  sin_asignar: {
    labor_id: string;
    descripcion: string;
    especialidad: Specialty;
    costo: number;
    estado: 'borrador' | 'pendiente' | 'aprobado';
  }[];
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
  /**
   * La tarea (`orden_labor`) que paga esta fila (20261010000006). Nulo = reparto heredado por
   * especialidad. Una persona puede tener varias filas por orden: una por tarea.
   */
  labor_id?: string | null;
  /** Null while the commission is still owed. */
  pago_id?: string | null;
  creado_en: string;
  // Virtual, from joins
  usuario?: UserProfile;
  /** La descripción de la tarea, si la fila es de una. */
  labor?: { descripcion: string } | null;
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
