/**
 * Estado de una línea de mano de obra o repuesto. Solo `aprobado` se cobra: entra
 * en los totales, en el costo de repuestos y en las comisiones.
 */
export type LineState = 'borrador' | 'pendiente' | 'aprobado' | 'rechazado';

/** Cómo respondió el cliente un presupuesto. */
export type QuoteResponseVia =
  | 'cliente_portal'
  | 'admin_telefono'
  | 'admin_presencial'
  | 'admin_whatsapp'
  | 'firma_recepcion';

/** Las vías que puede registrar un admin a mano. */
export type AdminAuthorizationVia = Extract<QuoteResponseVia, 'admin_telefono' | 'admin_presencial' | 'admin_whatsapp'>;

/** Una fila de `presupuestos`. Solo admin. */
export interface Quote {
  id: string;
  orden_id: string;
  sede_id: string;
  numero: number;
  estado: 'enviado' | 'respondido' | 'cancelado';
  creado_en: string;
  enviado_por: string | null;
  total_propuesto: number;
  respondido_en: string | null;
  respondido_via: QuoteResponseVia | null;
  respondido_por_nombre: string | null;
  respondido_por_perfil: string | null;
  total_aprobado: number | null;
  comentario_cliente: string | null;
  nota_admin: string | null;
  cancelado_en: string | null;
}

/** Lo que devuelve `enviar_presupuesto`. */
export interface SendQuoteResult {
  presupuesto_id: string;
  numero: number;
  lineas: number | null;
  total: number;
  correo: 'encolado' | 'sin_correo' | 'no_solicitado';
}

/** Lo que devuelve una respuesta registrada. */
export interface QuoteResolution {
  presupuesto_id: string;
  numero: number;
  autorizados: number;
  rechazados: number;
  total_autorizado: number;
}
