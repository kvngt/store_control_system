import type { TransactionCategory, TransactionType } from './enums';

export interface FinancialTransaction {
  id: string;
  sede_id: string;
  /** Set automatically for money the order lifecycle books, and settable by
   *  hand from Finanzas so a manual movement can be traced to its order. */
  referencia_orden_id?: string | null;
  importacion_id?: string;
  tipo: TransactionType;
  categoria: TransactionCategory;
  monto: number;
  descripcion: string;
  fecha: string;
  numero_cheque?: string | null;
  registrado_por?: string;
  creado_en: string;
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
