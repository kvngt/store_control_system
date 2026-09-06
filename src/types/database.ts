// ===================================================
// RESTORIFY — TypeScript Database Types
// Mirrors the Supabase PostgreSQL schema.
//
// The definitions live in `types/domain/*`, one module per bounded context,
// so a change to (say) the finance model doesn't put every screen's types in
// the same diff. This file stays as the single public entry point: every
// consumer keeps importing from `types/database`, so splitting the model up
// cost the rest of the codebase nothing.
// ===================================================

export type {
  UserRole,
  WorkType,
  OrderStatus,
  TaskStatus,
  PhotoType,
  TransactionType,
  TransactionCategory,
} from './domain/enums';

export type { Sede, UserProfile } from './domain/auth.types';
export type { Customer, CustomerInput } from './domain/customer.types';
export type { Vehicle, VehicleInput } from './domain/vehicle.types';
export type {
  WorkOrder,
  OrderProgressUpdate,
  LaborItem,
  OrderAssignment,
  InspectionPhoto,
  WorkOrderPart,
  WorkOrderInput,
} from './domain/workOrder.types';
export type {
  FinancialTransaction,
  BankStatementImport,
  CategorizationRule,
  ParsedStatementTransaction,
  ReviewableTransaction,
} from './domain/finance.types';
export type { Commission, CommissionPayment, CommissionBalance } from './domain/payroll.types';
export type { DashboardStats } from './domain/dashboard.types';
