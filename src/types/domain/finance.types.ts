import type { TransactionCategory, TransactionType } from './enums';

/**
 * Cómo pagó el cliente (o cómo se le devolvió). CHECK en la base. Tarjeta y Zelle desde
 * 20261010000017: el taller cobra con tarjeta por Clover.
 */
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'zelle' | 'transferencia' | 'cheque';
export const PAYMENT_METHODS: PaymentMethod[] = ['efectivo', 'tarjeta', 'zelle', 'transferencia', 'cheque'];

export interface FinancialTransaction {
  id: string;
  sede_id: string;
  /** Set automatically for money the order lifecycle books, and settable by
   *  hand from Finanzas so a manual movement can be traced to its order. */
  referencia_orden_id?: string | null;
  /** Vino de un estado de cuenta: contabilidad aparte, no cuenta en los totales de la app. */
  importacion_id?: string | null;
  tipo: TransactionType;
  categoria: TransactionCategory;
  monto: number;
  descripcion: string;
  fecha: string;
  numero_cheque?: string | null;
  /** Solo en el pago final o la devolución al entregar (20261008000000). */
  metodo_pago?: PaymentMethod | null;
  /** Foto del cheque o de la transferencia, en el bucket privado `comprobantes`. */
  comprobante_ruta?: string | null;
  registrado_por?: string;
  creado_en: string;
}

/**
 * Lo que devuelve `balance_orden` (20261010000000): cuánto dejó una orden. El margen resta
 * las comisiones devengadas y el costo automático de las líneas; lo demás vinculado a la
 * orden va en `otros`, sin restarse, para no contar dos veces una misma pieza.
 */
export interface OrderFinancialBalance {
  total_orden: number;
  cobrado: number;
  costo_repuestos: number;
  comisiones: number;
  comisiones_pagadas: number;
  margen: number;
  otros: {
    id: string;
    fecha: string;
    tipo: TransactionType;
    categoria: TransactionCategory;
    descripcion: string;
    monto: number;
    importado: boolean;
  }[];
}

/** Una página de `margen_ordenes`, con las sumas de todo el periodo. */
export interface OrderMarginPage {
  total_filas: number;
  sumas: { cobrado: number; costo_repuestos: number; comisiones: number; margen: number };
  filas: {
    id: string;
    numero_orden: string;
    cliente: string | null;
    fecha_finalizacion: string;
    total_orden: number;
    cobrado: number;
    costo_repuestos: number;
    comisiones: number;
    margen: number;
  }[];
}

/** Lo que devuelve `saldo_orden`: la base hace la cuenta. `saldo` < 0 es una devolución. */
export interface OrderBalance {
  total: number;
  cobrado: number;
  saldo: number;
}

/**
 * `saldo_retiro`: lo recibido, lo que se cobraría (los trabajos que sí se hicieron más la
 * revisión) y la diferencia (< 0 es lo que se le devuelve) al retirar sin reparar.
 */
export interface WithdrawalBalance {
  cobrado: number;
  trabajos: number;
  revision: number;
  cobro: number;
  saldo: number;
}

/** Una línea no autorizada (o no hecha) de una visita anterior (`trabajos_pendientes_vehiculo`). */
export interface PendingWorkItem {
  tipo: 'mano_obra' | 'repuesto';
  descripcion: string;
  monto: number;
  orden_id: string;
  numero_orden: string;
  fecha: string;
  /** Vino de una orden retirada sin reparar: se canceló, no se rechazó. */
  retirada: boolean;
}

/** `resumen_importaciones`: lo importado de cada estado de cuenta. Las sumas son de la base. */
export interface StatementSummary {
  importacion_id: string;
  desde: string | null;
  hasta: string | null;
  movimientos: number;
  ingresos: number;
  egresos: number;
}

// ===== Bank statement import =====
export interface BankStatementImport {
  id: string;
  sede_id: string;
  nombre_archivo: string;
  ruta_archivo: string;
  /** SHA-256 of the imported PDF; null on batches predating the column. */
  hash_archivo?: string | null;
  fecha_importacion: string;
  importado_por?: string;
  total_transacciones: number;
  creado_en: string;
}

export interface CategorizationRule {
  id: string;
  patron: string;
  categoria: TransactionCategory;
  activo: boolean;
  /** Higher wins when several patterns match; ties go to the longer one. */
  prioridad?: number;
}

// A transaction line as reconstructed from the PDF, before it's reviewed and
// possibly inserted into finanzas_movimientos.
export interface ParsedStatementTransaction {
  fecha: string; // ISO yyyy-mm-dd
  numero_cheque?: string;
  descripcion: string;
  monto: number;
  tipo: TransactionType;
}

// A parsed transaction augmented with the reviewer's decisions, tracked in the
// import review table.
export interface ReviewableTransaction extends ParsedStatementTransaction {
  rowId: string;
  categoria: TransactionCategory | '';
  incluir: boolean;
  posibleDuplicado: boolean;
  duplicadoDescripcion?: string;
}
