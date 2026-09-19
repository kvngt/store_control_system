// Lo que responde la edge function `portal` (armado por `datos_portal` en la base).

export type PortalLinkState = 'ok' | 'no_encontrado' | 'revocado' | 'vencido';

export interface PortalShop {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  whatsapp: string | null;
  logo_url: string | null;
  color: string | null;
}

export interface PortalMedia {
  id: string;
  tipo: 'foto' | 'video' | 'audio';
  origen: 'recepcion' | 'avance';
  /** El avance al que pertenece, para agruparlo bajo su tarjeta. */
  avance_id: string | null;
  zona: string | null;
  mime: string;
  duracion_seg: number | null;
  ancho: number | null;
  alto: number | null;
  creado_en: string;
  /** URL firmada de 2 horas. */
  url: string;
  miniatura_url: string | null;
}

export interface PortalOrder {
  numero: string;
  estatus: 'recepcion' | 'en_proceso' | 'espera_autorizacion' | 'finalizado' | 'entregado';
  tipo_trabajo: string;
  porcentaje_avance: number;
  fecha_ingreso: string;
  fecha_estimada_entrega: string | null;
  fecha_finalizacion: string | null;
  millas_ingreso: number;
  nivel_gasolina: string;
  notas_recepcion: string | null;
  firma_url: string | null;
  firma_fecha: string | null;
}

export interface PortalQuoteLine {
  id: string;
  tipo: 'mano_obra' | 'repuesto';
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  monto: number;
}

/** El presupuesto que espera la respuesta del cliente. */
export interface PortalQuote {
  id: string;
  numero: number;
  enviado_en: string;
  total: number;
  lineas: PortalQuoteLine[];
}

export interface PortalQuoteHistory {
  numero: number;
  respondido_en: string;
  via: 'cliente_portal' | 'admin_telefono' | 'admin_presencial' | 'admin_whatsapp' | 'firma_recepcion';
  nombre: string | null;
  total_aprobado: number | null;
  autorizados: number;
  rechazados: number;
}

export interface PortalAccount {
  /** Solo lo autorizado: es lo que se cobra. */
  mano_obra: { descripcion: string; monto: number }[];
  repuestos: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[];
  /** Lo que el cliente no autorizó: no se hace ni se cobra. */
  no_autorizados?: { descripcion: string; monto: number }[];
  total_mano_obra: number;
  total_repuestos: number;
  total: number;
  deposito: number;
  pagado: number;
  saldo: number;
}

/** Un avance que el taller decidió mostrar. Sin autor: no se nombran los técnicos. */
export interface PortalProgress {
  id: string;
  fecha: string;
  mensaje: string | null;
}

export interface PortalReport {
  estado_enlace: 'ok';
  taller: PortalShop;
  enlace: { expira_en: string | null };
  orden: PortalOrder;
  cliente: { nombre: string; tiene_correo: boolean; acepta_correos: boolean };
  vehiculo: {
    marca: string;
    modelo: string;
    anio: number | null;
    color: string | null;
    placa: string | null;
    vin_final: string | null;
  };
  multimedia: PortalMedia[];
  avances?: PortalProgress[];
  presupuesto?: PortalQuote | null;
  presupuestos_respondidos?: PortalQuoteHistory[];
  cuenta: PortalAccount;
  urls_vencen_en: string;
}

/** Un enlace que ya no abre: igual trae el taller, para saber a quién llamar. */
export interface PortalUnavailable {
  estado_enlace: Exclude<PortalLinkState, 'ok'>;
  taller?: PortalShop;
}

export type PortalResponse = PortalReport | PortalUnavailable;
