// ===================================================
// RESTORIFY — Shared enumerations
// Mirrors the PostgreSQL enum-ish TEXT columns.
// ===================================================

export type UserRole = 'admin' | 'mecanico' | 'pintor';

export type WorkType = 'mecanica' | 'pintura' | 'combinado';

export type OrderStatus =
  | 'recepcion'
  | 'en_proceso'
  | 'espera_repuestos'
  | 'finalizado'
  | 'entregado';

export type TaskStatus = 'pendiente' | 'en_curso' | 'completada';

export type PhotoType = 'exterior_360' | 'interior' | 'combustible' | 'dano_previo';

export type TransactionType = 'ingreso' | 'egreso';

export type TransactionCategory =
  | 'pago_cliente'
  | 'compra_repuesto'
  | 'planilla'
  | 'gasto_operativo';
