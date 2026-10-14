/**
 * Fila de la tabla `orden_proximo_servicio` que almacena el próximo servicio programado
 * y/o la sugerencia emitida por el técnico.
 */
export interface OrderNextService {
  orden_id: string;
  sede_id: string;
  fecha: string | null;
  millas: number | null;
  nota: string | null;
  token: string | null;
  programado_por: string | null;
  programado_en: string | null;
  sugerido_fecha: string | null;
  sugerido_millas: number | null;
  sugerido_nota: string | null;
  sugerido_por: string | null;
  sugerido_en: string | null;
}

/**
 * Parámetros para programar o sugerir un próximo servicio.
 */
export interface NextServiceInput {
  fecha: string | null;
  millas: number | null;
  nota: string | null;
}

