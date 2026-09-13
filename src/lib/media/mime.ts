import { MEDIA_BUCKET } from './constants';

/**
 * Formatos que cada navegador sabe grabar, en orden de preferencia.
 *
 * MP4 primero siempre: lo reproduce todo el mundo, incluido el iPhone del
 * cliente que abre el reporte. Safari graba MP4 desde hace años y Chrome desde
 * la versión 126; WebM queda solo como respaldo para navegadores que no pueden,
 * sabiendo que un iPhone antiguo podría no reproducirlo.
 */
const VIDEO_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

const AUDIO_CANDIDATES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

function recorderSupports(type: string): boolean {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
}

/** El primer formato que este navegador puede grabar, o null si no graba. */
export function pickRecorderMime(
  kind: 'video' | 'audio',
  isSupported: (type: string) => boolean = recorderSupports
): string | null {
  const candidates = kind === 'video' ? VIDEO_CANDIDATES : AUDIO_CANDIDATES;
  return candidates.find((type) => isSupported(type)) ?? null;
}

/**
 * `video/webm;codecs=vp9,opus` → `video/webm`.
 *
 * Storage compara el Content-Type contra la lista del bucket tal cual, así que
 * un tipo con parámetros de códec se rechazaría aunque el formato esté permitido.
 */
export function baseMime(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase();
}

/** Los mismos tipos que acepta el bucket `orden_media` (ver 20260919000000). */
export const ALLOWED_UPLOAD_MIMES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'video/mp4',
  'video/webm',
  'audio/mp4',
  'audio/webm',
  'audio/mpeg',
  'audio/ogg',
]);

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
};

export function extensionFor(mime: string): string {
  return EXTENSIONS[baseMime(mime)] ?? 'bin';
}

/**
 * Dónde vive un archivo: `{sede}/{orden}/{id}.{ext}`. Las políticas del bucket y
 * el trigger de `orden_media` validan esa forma, así que se construye en un solo
 * lugar.
 */
export function mediaPath(sedeId: string, ordenId: string, fileName: string): string {
  return `${sedeId}/${ordenId}/${fileName}`;
}

export { MEDIA_BUCKET };

/**
 * Escala un rectángulo para que su lado largo no pase de `maxEdge`, sin agrandar
 * nunca. Con `even`, redondea a pares: los codificadores H.264 los exigen.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
  even = false
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  const round = (n: number) => (even ? Math.max(2, Math.round(n / 2) * 2) : Math.max(1, Math.round(n)));
  return { width: round(width * scale), height: round(height * scale) };
}

/** 83 → "1:23". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
