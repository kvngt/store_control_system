/**
 * Límites de la multimedia de una orden.
 *
 * Los números salen del presupuesto de Supabase Pro (100 GB de storage, 250 GB
 * de egress) para ~120 órdenes al mes: comprimido, una orden pesa ~40 MB; sin
 * comprimir, entre 300 MB y 1 GB. La compresión en el navegador no es un detalle
 * de rendimiento, es lo que hace que el plan alcance.
 */

/** Pedido del cliente: videos y notas de voz de hasta 2 minutos. */
export const MAX_MEDIA_SECONDS = 120;

/** 720p. Suficiente para ver una falla, y ~11 MB por minuto. */
export const MAX_VIDEO_EDGE = 1280;
export const VIDEO_BITRATE = 1_500_000;
export const VIDEO_AUDIO_BITRATE = 96_000;

/** Voz, no música: 48 kbps es claro y pesa ~0.35 MB por minuto. */
export const VOICE_BITRATE = 48_000;

/** 1920 px en el lado largo: se lee una placa o un rayón, y pesa ~300 KB. */
export const PHOTO_MAX_EDGE = 1920;
export const PHOTO_QUALITY = 0.82;
export const THUMB_MAX_EDGE = 480;
export const THUMB_QUALITY = 0.72;

/** Mismo tope que el bucket `orden_media`. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Por encima de esto se sube por TUS (reanudable). Supabase exige bloques de
 * exactamente 6 MB, y por debajo una subida normal es una sola petición.
 */
export const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024;

export const MEDIA_BUCKET = 'orden_media';
