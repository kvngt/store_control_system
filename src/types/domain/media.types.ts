/** Qué es un archivo de la orden. */
export type MediaKind = 'foto' | 'video' | 'audio';

/**
 * De dónde viene: la recepción del vehículo (el reporte de ingreso que firma el
 * cliente) o un avance del trabajo.
 */
export type MediaOrigin = 'recepcion' | 'avance';

/** Una fila de `orden_media`. Las rutas son del bucket privado `orden_media`. */
export interface OrderMedia {
  id: string;
  orden_id: string;
  sede_id: string;
  avance_id: string | null;
  tipo: MediaKind;
  origen: MediaOrigin;
  zona: string | null;
  ruta: string;
  ruta_miniatura: string | null;
  mime: string;
  bytes: number;
  duracion_seg: number | null;
  ancho: number | null;
  alto: number | null;
  /** Solo un admin la cambia. La recepción nace visible; los avances, no. */
  visible_cliente: boolean;
  proveedor: string;
  subido_por: string | null;
  creado_en: string;
}

/**
 * Un archivo ya procesado en el navegador (foto comprimida, video en 720p, nota
 * de voz) y listo para entrar a la cola de subida.
 */
export interface PreparedMedia {
  tipo: MediaKind;
  blob: Blob;
  /** El MIME completo, con códecs si los hay. */
  mime: string;
  /** Miniatura JPEG. Null para audio o si no se pudo extraer un fotograma. */
  thumb: Blob | null;
  duracionSeg: number | null;
  ancho: number | null;
  alto: number | null;
}
