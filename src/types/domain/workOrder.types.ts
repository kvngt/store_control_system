import type { OrderStatus, TaskStatus, WorkType } from './enums';
import type { OrderMedia } from './media.types';
import type { Customer } from './customer.types';
import type { UserProfile } from './auth.types';
import type { Vehicle } from './vehicle.types';
import type { LineState } from './quote.types';
import type { PaymentMethod } from './finance.types';

export interface WorkOrder {
  id: string;
  numero_orden: string;
  sede_id: string;
  cliente_id: string;
  vehiculo_id: string;
  tipo_trabajo: WorkType;
  estatus: OrderStatus;
  millas_ingreso: number;
  nivel_gasolina: string;
  inspeccion_360_notas: string;
  fecha_ingreso: string;
  fecha_estimada_entrega: string;
  fecha_finalizacion?: string;
  /** Ruta de la firma en el bucket privado `orden_media`. No es una URL: se firma para verla. */
  firma_ruta?: string | null;
  firma_fecha?: string | null;
  porcentaje_avance: number;
  /** Visible para toda la sede: la comisión del técnico sale de aquí. */
  total_labor: number;
  /**
   * Por qué la orden está en "espera de autorización": lo escribe el técnico al moverla,
   * y es lo primero que el admin necesita leer antes de cotizar. La base lo exige para
   * fijar ese estado y lo limpia al salir de él.
   */
  motivo_autorizacion?: string | null;
  /**
   * Cuándo un admin la mandó al archivo a mano. Solo una orden entregada puede tenerla, y
   * sacarla de "Entregado" la limpia (ver 20261005000000). Las que nadie archiva salen solas
   * del tablero a los 90 días de entregadas.
   */
  archivada_en?: string | null;
  /**
   * Se cerró sin hacer el trabajo (`retirar_sin_reparar`, 20261010000017). Siempre con
   * estatus `entregado`; en pantalla y para el cliente es otro estado.
   */
  retirada_sin_reparar?: boolean;
  /**
   * Cuándo administración confirmó que el vehículo está listo para entregar
   * (`marcar_lista_para_entregar`, 20261010000021). Solo con estatus finalizado o entregado; se
   * borra al reabrir. Hasta entonces el cliente ve "En revisión final" y no recibe correo.
   */
  lista_para_entregar_en?: string | null;
  lista_para_entregar_por?: string | null;
  creado_por: string;
  creado_en: string;
  // Virtual fields from joins
  /**
   * El dinero de la orden. Vive en `orden_montos`, que solo un administrador
   * puede leer: para un mecánico o pintor PostgREST devuelve `null` en el embed.
   * Por eso es opcional y nullable, y ninguna pantalla debe asumir que existe.
   */
  montos?: OrderAmounts | null;
  cliente?: Customer;
  vehiculo?: Vehicle;
  asignaciones?: OrderAssignment[];
  /** Fotos, videos y notas de voz de la recepción y de los avances. */
  media?: OrderMedia[];
  /** Solo administradores (RLS). Para un técnico llega vacío. */
  repuestos?: WorkOrderPart[];
  /** Qué piezas lleva la orden, sin precios. Lo que ve un técnico. */
  repuestos_resumen?: PartSummary[];
  labor_items?: LaborItem[];
  avances?: OrderProgressUpdate[];
  /** Hay un presupuesto enviado esperando la respuesta del cliente. */
  esperando_autorizacion?: boolean;
  /** Hay una pieza pedida que no ha llegado (`ordenes_esperando_repuestos`). */
  esperando_repuestos?: boolean;
  /** Trabajo adicional que reportó el taller (F6). Lo leen admin y los técnicos de la orden. */
  hallazgos?: OrderFinding[];
}

/**
 * Un hallazgo: el técnico vio algo más que hacer. Pendiente hasta que administración lo
 * cotiza (sale en un presupuesto) o lo descarta (y decide si el cliente lo ve en su reporte,
 * con `texto_cliente`). Se escribe solo por RPC (`reportar_hallazgo`, `cotizar_hallazgo`,
 * `descartar_hallazgo`).
 */
export interface OrderFinding {
  id: string;
  orden_id: string;
  sede_id: string;
  reportado_por: string;
  descripcion: string;
  estado: 'pendiente' | 'cotizado' | 'descartado';
  en_reporte: boolean;
  texto_cliente: string | null;
  resuelto_por: string | null;
  resuelto_en: string | null;
  presupuesto_id: string | null;
  avance_id: string | null;
  creado_en: string;
}

/** Totales y depósito de una orden. Solo administradores (ver `orden_montos`). */
export interface OrderAmounts {
  total_repuestos: number;
  total_general: number;
  deposito_inicial: number;
  /** Lo absorbe el taller: baja `total_general`, no la mano de obra (`aplicar_descuento`). */
  descuento?: number;
  descuento_motivo?: string | null;
}

/** Si una pieza se pidió y si ya llegó. Nulo: no se sigue. */
export type PartOrderState = 'pedido' | 'recibido';

/**
 * Un repuesto como lo ve un técnico: qué pieza y cuántas, sin precio.
 * Viene de la función `repuestos_de_orden`, no de la tabla.
 */
export interface PartSummary {
  id: string;
  descripcion: string;
  cantidad: number;
  estado?: LineState;
  estado_pedido?: PartOrderState | null;
}

export interface OrderProgressUpdate {
  id: string;
  orden_id: string;
  usuario_id: string;
  descripcion: string;
  creado_en: string;
  /**
   * Si el cliente ve este avance en su enlace. Lo marca el técnico, y con él salen su
   * texto y sus archivos. Al cliente no le llega el autor.
   */
  visible_cliente?: boolean;
  /** La tarea (`orden_labor`) de la que es este avance, si se registró desde una (20261010000009). */
  labor_id?: string | null;
  // Virtual
  usuario?: UserProfile;
}

export interface LaborItem {
  id: string;
  orden_id: string;
  descripcion: string;
  costo: number;
  /** La bolsa de comisión a la que va (20261009000000). Por omisión, la del tipo de orden. */
  especialidad?: 'mecanica' | 'pintura';
  /** Solo `aprobado` se cobra. Ausente en datos anteriores a la fase 5 = aprobado. */
  estado?: LineState;
  presupuesto_id?: string | null;
  creado_en?: string;
  /** Cuándo se tachó el trabajo, y quién. Nulo = pendiente de hacer. */
  completado_en?: string | null;
  completado_por?: string | null;
  /**
   * El técnico de esta tarea: cobra su comisión (20261010000006). Solo lo escribe
   * administración. Nulo = sin técnico (nadie cobra) o, si `reparto_heredado`, el reparto por
   * especialidad de antes.
   */
  asignado_a?: string | null;
  /**
   * true = línea anterior a la comisión por tarea: sin técnico se reparte por especialidad
   * entre los asignados a mano. La app crea las suyas con false.
   */
  reparto_heredado?: boolean;
  /** El perfil de `asignado_a`, embebido (`perfiles!asignado_a`). */
  tecnico?: Pick<UserProfile, 'id' | 'nombre_completo' | 'rol'> | null;
}

export interface OrderAssignment {
  id: string;
  orden_id: string;
  usuario_id: string;
  tipo_tarea: 'mecanica' | 'pintura';
  estatus_tarea: TaskStatus;
  /**
   * manual = lo asignó administración (entra al reparto heredado); tarea = se agregó solo al
   * darle una tarea, y cobra por sus tareas (20261010000006).
   */
  origen?: 'manual' | 'tarea';
  // Virtual
  usuario?: UserProfile;
}

export interface WorkOrderPart {
  id: string;
  orden_id: string;
  descripcion: string;
  cantidad: number;
  /** Lo que le costó al taller. Por defecto el precio; administración lo cambia si lo sabe. */
  costo_unitario: number;
  precio_venta_unitario: number;
  subtotal: number;
  estado?: LineState;
  presupuesto_id?: string | null;
  creado_en?: string;
  estado_pedido?: PartOrderState | null;
  pedido_en?: string | null;
  recibido_en?: string | null;
}

export interface WorkOrderInput {
  sede_id: string;
  cliente_id: string;
  vehiculo_id: string;
  tipo_trabajo: WorkType;
  millas_ingreso: number;
  nivel_gasolina: string;
  /** Solo lo toma `create_work_order` si quien llama es admin. */
  deposito_inicial: number;
  deposito_metodo?: PaymentMethod | null;
  deposito_cheque?: string | null;
  deposito_comprobante?: string | null;
  inspeccion_360_notas: string;
  fecha_estimada_entrega: string;
  labor_items: Omit<LaborItem, 'id' | 'orden_id'>[];
  /** El precio, y el costo si administración lo sabe (sin él, la base usa el precio). */
  repuestos: (Omit<WorkOrderPart, 'id' | 'orden_id' | 'subtotal' | 'costo_unitario'> & { costo_unitario?: number | null })[];
  asignaciones: { usuario_id: string; tipo_tarea: 'mecanica' | 'pintura' }[];
}

/** Un valor que cambió en el historial: el de antes, el de después, o los dos. */
export interface HistoryChange {
  antes?: unknown;
  despues?: unknown;
}

/**
 * Una fila de `historial_orden` (20261010000004): quién cambió qué en una orden. Solo admin.
 * `cambios` lleva, por campo, el antes y el después (o solo uno al crear o borrar).
 */
export interface OrderHistoryEntry {
  id: number;
  ocurrido_en: string;
  actor_nombre: string | null;
  origen: 'app' | 'portal' | 'sistema';
  entidad: 'orden' | 'mano_obra' | 'repuesto' | 'asignacion' | 'deposito' | 'descuento' | 'presupuesto' | 'archivo' | 'avance';
  entidad_id: string | null;
  accion: 'crear' | 'cambiar' | 'borrar';
  resumen: string | null;
  cambios: Record<string, HistoryChange>;
}
