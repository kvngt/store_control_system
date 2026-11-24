import type { Database, Json } from '../supabase.gen';
import type { Sede, UserProfile } from './auth.types';
import type { CatalogJob, CatalogJobLine, OrderJob } from './catalog.types';
import type { Customer } from './customer.types';
import type { CustomerEmail, CustomerLink } from './customerPortal.types';
import type {
  BankStatementImport,
  CategorizationRule,
  FinancialTransaction,
} from './finance.types';
import type {
  InspectionPoint,
  InspectionTemplate,
  InspectionTemplatePoint,
  OrderInspection,
} from './inspection.types';
import type { OrderMedia } from './media.types';
import type { OrderNextService } from './nextService.types';
import type { AppNotification } from './notification.types';
import type {
  OrderParking,
  ParkingConfig,
  ParkingProfile,
  ParkingTier,
} from './parking.types';
import type { Commission, CommissionPayment, PayScheme } from './payroll.types';
import type { Quote } from './quote.types';
import type { LaborTimeEntry } from './timeTracking.types';
import type { Vehicle } from './vehicle.types';
import type {
  LaborItem,
  OrderAmounts,
  OrderAssignment,
  OrderFinding,
  OrderHistoryEntry,
  OrderProgressUpdate,
  WorkOrder,
  WorkOrderPart,
} from './workOrder.types';

/**
 * Contrato en tiempo de compilación entre `src/types/domain/*` y `src/types/supabase.gen.ts`.
 * No genera JavaScript en ejecución (`tsc -b` lo valida al compilar).
 */
type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

/** Exige que cada campo exista en `Row<T>` y que `R[K]` sea asignable a `D[K]` (incluyendo `null`). */
type Mismatch<D, R> = {
  [K in keyof D]-?: K extends keyof R ? (R[K] extends D[K] ? never : K) : K;
}[keyof D];

/**
 * Para columnas TEXT con CHECK en SQL donde la app acota `string` a una unión literal:
 * verifica que los literales del dominio sean asignables a la columna y respeta si admite `null`.
 */
type NarrowMismatch<D, R> = {
  [K in keyof D]-?: K extends keyof R
    ? Exclude<D[K], undefined> extends R[K]
      ? null extends R[K]
        ? null extends D[K]
          ? never
          : K
        : never
      : K
    : K;
}[keyof D];

/** Para columnas JSONB tipadas en la app con interfaces/arrays propios (donde `supabase.gen` emite `Json`). */
type JsonMismatch<D, R> = {
  [K in keyof D]-?: K extends keyof R
    ? { [key: string]: Json | undefined } extends NonNullable<R[K]>
      ? null extends R[K]
        ? null extends D[K]
          ? never
          : K
        : null extends D[K]
          ? K
          : never
      : K
    : K;
}[keyof D];

type Expect<T extends never> = T;

// auth.types.ts
export type _Sede = Expect<
  | Mismatch<Omit<Sede, 'telefonos'>, Row<'sedes'>>
  // `telefonos` es JSONB estructurado (`SedeTelefono[]`).
  | JsonMismatch<Pick<Sede, 'telefonos'>, Row<'sedes'>>
>;

export type _UserProfile = Expect<Mismatch<UserProfile, Row<'perfiles'>>>;

// customer.types.ts
export type _Customer = Expect<
  | Mismatch<
      Omit<
        Customer,
        // `idioma` tiene CHECK ('es' | 'en') en SQL.
        | 'idioma'
        // Conteos calculados en `customersService`.
        | 'vehiculos_count'
        | 'ordenes_count'
      >,
      Row<'clientes'>
    >
  | NarrowMismatch<Pick<Customer, 'idioma'>, Row<'clientes'>>
>;

// vehicle.types.ts
export type _Vehicle = Expect<
  Mismatch<
    Omit<
      Vehicle,
      // Nombre del cliente embebido desde `clientes(nombre)` en `vehiclesService`.
      'cliente_nombre'
    >,
    Row<'vehiculos'>
  >
>;

// workOrder.types.ts
export type _WorkOrder = Expect<
  | Mismatch<
      Omit<
        WorkOrder,
        // `marcas_danos` es JSONB (`DamageMark[]`).
        | 'marcas_danos'
        // Relaciones embebidas y campos calculados por `workOrdersService` / RPCs.
        | 'montos'
        | 'cliente'
        | 'vehiculo'
        | 'asignaciones'
        | 'media'
        | 'repuestos'
        | 'repuestos_resumen'
        | 'labor_items'
        | 'avances'
        | 'esperando_autorizacion'
        | 'esperando_repuestos'
        | 'por_autorizar'
        | 'hallazgos'
        | 'trabajos'
      >,
      Row<'ordenes_trabajo'>
    >
  | JsonMismatch<Pick<WorkOrder, 'marcas_danos'>, Row<'ordenes_trabajo'>>
>;

export type _OrderFinding = Expect<
  | Mismatch<
      // `estado` tiene CHECK ('pendiente' | 'cotizado' | 'descartado') en SQL.
      Omit<OrderFinding, 'estado'>,
      Row<'orden_hallazgos'>
    >
  | NarrowMismatch<Pick<OrderFinding, 'estado'>, Row<'orden_hallazgos'>>
>;

export type _OrderAmounts = Expect<Mismatch<OrderAmounts, Row<'orden_montos'>>>;

export type _OrderProgressUpdate = Expect<
  Mismatch<
    Omit<
      OrderProgressUpdate,
      // Relación embebida `perfiles` en `workOrdersService`.
      'usuario'
    >,
    Row<'orden_avances'>
  >
>;

export type _LaborItem = Expect<
  | Mismatch<
      Omit<
        LaborItem,
        // Columnas TEXT con CHECK en `orden_labor`.
        | 'especialidad'
        | 'estado'
        // Relación embebida `perfiles!asignado_a` en `workOrdersService`.
        | 'tecnico'
      >,
      Row<'orden_labor'>
    >
  | NarrowMismatch<Pick<LaborItem, 'especialidad' | 'estado'>, Row<'orden_labor'>>
>;

export type _OrderAssignment = Expect<
  | Mismatch<
      Omit<
        OrderAssignment,
        // Columnas TEXT con CHECK en `orden_asignaciones`.
        | 'tipo_tarea'
        | 'origen'
        // Relación embebida `perfiles` en `workOrdersService`.
        | 'usuario'
      >,
      Row<'orden_asignaciones'>
    >
  | NarrowMismatch<Pick<OrderAssignment, 'tipo_tarea' | 'origen'>, Row<'orden_asignaciones'>>
>;

export type _WorkOrderPart = Expect<
  | Mismatch<
      // Columnas TEXT con CHECK en `orden_repuestos`.
      Omit<WorkOrderPart, 'estado' | 'estado_pedido'>,
      Row<'orden_repuestos'>
    >
  | NarrowMismatch<Pick<WorkOrderPart, 'estado' | 'estado_pedido'>, Row<'orden_repuestos'>>
>;

export type _OrderHistoryEntry = Expect<
  | Mismatch<
      Omit<
        OrderHistoryEntry,
        // Columnas TEXT con CHECK en `historial_orden`.
        | 'origen'
        | 'entidad'
        | 'accion'
        // `cambios` es JSONB (`Record<string, HistoryChange>`).
        | 'cambios'
      >,
      Row<'historial_orden'>
    >
  | NarrowMismatch<Pick<OrderHistoryEntry, 'origen' | 'entidad' | 'accion'>, Row<'historial_orden'>>
  | JsonMismatch<Pick<OrderHistoryEntry, 'cambios'>, Row<'historial_orden'>>
>;

// finance.types.ts
export type _FinancialTransaction = Expect<
  | Mismatch<
      Omit<
        FinancialTransaction,
        // Columnas TEXT con CHECK en `finanzas_movimientos`.
        | 'metodo_pago'
        | 'origen'
        // Relación embebida `ordenes_trabajo(numero_orden)` en `financeService`.
        | 'orden'
      >,
      Row<'finanzas_movimientos'>
    >
  | NarrowMismatch<Pick<FinancialTransaction, 'metodo_pago' | 'origen'>, Row<'finanzas_movimientos'>>
>;

export type _BankStatementImport = Expect<
  Mismatch<BankStatementImport, Row<'finanzas_importaciones'>>
>;

export type _CategorizationRule = Expect<
  Mismatch<CategorizationRule, Row<'finanzas_reglas_categorizacion'>>
>;

// payroll.types.ts
export type _PayScheme = Expect<
  | Mismatch<
      // Columnas TEXT con CHECK en `perfiles_pago`.
      Omit<PayScheme, 'esquema' | 'salario_periodo'>,
      Row<'perfiles_pago'>
    >
  | NarrowMismatch<Pick<PayScheme, 'esquema' | 'salario_periodo'>, Row<'perfiles_pago'>>
>;

export type _Commission = Expect<
  | Mismatch<
      Omit<
        Commission,
        // Columnas TEXT con CHECK en `comisiones`.
        | 'especialidad'
        | 'estado'
        // Relaciones embebidas en `payrollService`.
        | 'usuario'
        | 'labor'
        | 'orden'
      >,
      Row<'comisiones'>
    >
  | NarrowMismatch<Pick<Commission, 'especialidad' | 'estado'>, Row<'comisiones'>>
>;

export type _CommissionPayment = Expect<
  Mismatch<
    Omit<
      CommissionPayment,
      // Relación embebida `perfiles` en `payrollService`.
      'usuario'
    >,
    Row<'comision_pagos'>
  >
>;

// media.types.ts
export type _OrderMedia = Expect<
  | Mismatch<
      // Columnas TEXT con CHECK en `orden_media`.
      Omit<OrderMedia, 'tipo' | 'origen'>,
      Row<'orden_media'>
    >
  | NarrowMismatch<Pick<OrderMedia, 'tipo' | 'origen'>, Row<'orden_media'>>
>;

// notification.types.ts
export type _AppNotification = Expect<
  | Mismatch<
      // `datos` es JSONB (`Record<string, unknown>`).
      Omit<AppNotification, 'datos'>,
      Row<'notificaciones'>
    >
  | JsonMismatch<Pick<AppNotification, 'datos'>, Row<'notificaciones'>>
>;

// quote.types.ts
export type _Quote = Expect<
  | Mismatch<
      // Columnas TEXT con CHECK en `presupuestos`.
      Omit<Quote, 'estado' | 'respondido_via'>,
      Row<'presupuestos'>
    >
  | NarrowMismatch<Pick<Quote, 'estado' | 'respondido_via'>, Row<'presupuestos'>>
>;

// customerPortal.types.ts
export type _CustomerLink = Expect<Mismatch<CustomerLink, Row<'orden_enlaces'>>>;

export type _CustomerEmail = Expect<
  | Mismatch<
      Omit<
        CustomerEmail,
        // Columnas TEXT con CHECK y `datos` JSONB en `cola_envios`.
        'estado' | 'datos'
      >,
      Row<'cola_envios'>
    >
  | NarrowMismatch<Pick<CustomerEmail, 'estado'>, Row<'cola_envios'>>
  | JsonMismatch<Pick<CustomerEmail, 'datos'>, Row<'cola_envios'>>
>;

// nextService.types.ts
export type _OrderNextService = Expect<
  | Mismatch<
      // `idioma` tiene CHECK ('es' | 'en') en SQL.
      Omit<OrderNextService, 'idioma'>,
      Row<'orden_proximo_servicio'>
    >
  | NarrowMismatch<Pick<OrderNextService, 'idioma'>, Row<'orden_proximo_servicio'>>
>;

// catalog.types.ts
export type _CatalogJobLine = Expect<
  | Mismatch<
      // Columnas TEXT con CHECK en `catalogo_trabajo_lineas`.
      Omit<CatalogJobLine, 'tipo' | 'especialidad'>,
      Row<'catalogo_trabajo_lineas'>
    >
  | NarrowMismatch<Pick<CatalogJobLine, 'tipo' | 'especialidad'>, Row<'catalogo_trabajo_lineas'>>
>;

export type _CatalogJob = Expect<
  Mismatch<
    Omit<
      CatalogJob,
      // `total` se calcula en `catalogService` y `lineas` es relación embebida `catalogo_trabajo_lineas`.
      'total' | 'lineas'
    >,
    Row<'catalogo_trabajos'>
  >
>;

export type _OrderJob = Expect<
  Mismatch<
    Omit<
      OrderJob,
      // Totales y conteo agregados por `catalogService` / RPC sobre `orden_labor` y `orden_repuestos`.
      'total' | 'total_aprobado' | 'lineas'
    >,
    Row<'orden_trabajos'>
  >
>;

// inspection.types.ts
export type _InspectionPoint = Expect<
  | Mismatch<
      // `estado` tiene CHECK en `orden_inspeccion_puntos`.
      Omit<InspectionPoint, 'estado'>,
      Row<'orden_inspeccion_puntos'>
    >
  | NarrowMismatch<Pick<InspectionPoint, 'estado'>, Row<'orden_inspeccion_puntos'>>
>;

export type _OrderInspection = Expect<
  Mismatch<
    Omit<
      OrderInspection,
      // Relación embebida `orden_inspeccion_puntos`.
      'puntos'
    >,
    Row<'orden_inspecciones'>
  >
>;

export type _InspectionTemplatePoint = Expect<
  Mismatch<InspectionTemplatePoint, Row<'inspeccion_plantilla_puntos'>>
>;

export type _InspectionTemplate = Expect<
  Mismatch<
    Omit<
      InspectionTemplate,
      // Relación embebida `inspeccion_plantilla_puntos`.
      'puntos'
    >,
    Row<'inspeccion_plantillas'>
  >
>;

// parking.types.ts
export type _ParkingTier = Expect<Mismatch<ParkingTier, Row<'parqueo_tramos'>>>;

export type _ParkingProfile = Expect<
  | Mismatch<
      Omit<
        ParkingProfile,
        // Columnas TEXT con CHECK en `parqueo_perfiles`.
        | 'tipo'
        | 'evento_inicio'
        // Relación embebida `parqueo_tramos`.
        | 'tramos'
      >,
      Row<'parqueo_perfiles'>
    >
  | NarrowMismatch<Pick<ParkingProfile, 'tipo' | 'evento_inicio'>, Row<'parqueo_perfiles'>>
>;

export type _ParkingConfig = Expect<
  Mismatch<
    Omit<
      ParkingConfig,
      // Objeto agrupado desde `parqueo_perfiles` por `parkingService`.
      'perfiles'
    >,
    Row<'parqueo_config'>
  >
>;

export type _OrderParking = Expect<
  | Mismatch<
      Omit<
        OrderParking,
        // Columnas TEXT con CHECK en `orden_parqueo`.
        | 'perfil'
        | 'estado'
        // `detalle` es JSONB (`ParkingTierDetail[]`).
        | 'detalle'
        // Campos agregados desde el perfil activo por la RPC `parqueo_estado` / `parkingService`.
        | 'tarifa_inicial'
        | 'dias_gracia'
        | 'evento_inicio'
      >,
      Row<'orden_parqueo'>
    >
  | NarrowMismatch<Pick<OrderParking, 'perfil' | 'estado'>, Row<'orden_parqueo'>>
  | JsonMismatch<Pick<OrderParking, 'detalle'>, Row<'orden_parqueo'>>
>;

// timeTracking.types.ts
export type _LaborTimeEntry = Expect<
  Mismatch<
    Omit<
      LaborTimeEntry,
      // Relación embebida `perfiles` en `timeTrackingService`.
      'usuario'
    >,
    Row<'orden_labor_tiempos'>
  >
>;
