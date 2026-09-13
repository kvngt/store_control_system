/** Una fila de `orden_enlaces`: el enlace personal del cliente a su reporte. Solo admin. */
export interface CustomerLink {
  id: string;
  orden_id: string;
  sede_id: string;
  token: string;
  creado_en: string;
  /** Null mientras la orden no se entrega; al entregar, 90 días. */
  expira_en: string | null;
  revocado_en: string | null;
  ultimo_acceso_en: string | null;
  accesos: number;
}

export type CustomerEmailTemplate = 'recepcion' | 'estatus' | 'avance';

export type OutboxState = 'pendiente' | 'procesando' | 'enviado' | 'omitido' | 'error';

/** Un correo al cliente en `cola_envios` (canal email). */
export interface CustomerEmail {
  id: string;
  plantilla: CustomerEmailTemplate | string;
  estado: OutboxState;
  destinatario: string;
  datos: { estatus?: string; estatus_enviado?: string } & Record<string, unknown>;
  intentos: number;
  ultimo_error: string | null;
  enviar_despues_de: string;
  creado_en: string;
  enviado_en: string | null;
}
