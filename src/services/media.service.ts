// Fotos, videos y notas de voz de una orden: el transporte hacia el bucket
// privado `orden_media`, sus filas, y las URLs firmadas para verlos.
import { supabase } from '../lib/supabase';
import { MEDIA_BUCKET, RESUMABLE_THRESHOLD_BYTES } from '../lib/media/constants';
import { baseMime } from '../lib/media/mime';
import type { MediaUploader, UploadItem } from '../lib/media/uploadQueue';
import type { OrderMedia } from '../types/database';
import { assertAffected, assertDeleted } from './support';

/** Una hora. Las galerías las cachean 50 minutos y piden nuevas antes de que venzan. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function accessToken(): Promise<string> {
  // `getSession` renueva el token si venció, lo que importa en un video que tarda
  // más que la vida del token en subir.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Mismo `code` que `users.service.ts`: las dos rutas dicen lo mismo, traducido.
  if (!token) {
    throw Object.assign(new Error('La sesión expiró. Vuelve a iniciar sesión.'), {
      status: 401,
      code: 'session_expired',
    });
  }
  return token;
}

/**
 * El endpoint TUS. Supabase recomienda el host directo de Storage
 * (`<ref>.storage.supabase.co`) para archivos grandes: evita un salto de proxy y
 * es notablemente más rápido. Con un dominio propio o en local se usa la URL del
 * proyecto tal cual.
 */
export function resumableEndpoint(projectUrl: string = import.meta.env.VITE_SUPABASE_URL ?? ''): string {
  try {
    const url = new URL(projectUrl);
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    if (match) return `https://${match[1]}.storage.supabase.co/storage/v1/upload/resumable`;
    return `${url.origin}/storage/v1/upload/resumable`;
  } catch {
    return '/storage/v1/upload/resumable';
  }
}

function alreadyExists(err: unknown): boolean {
  const e = err as { statusCode?: string | number; status?: number; message?: string; originalResponse?: { getStatus?: () => number } };
  const status = Number(e?.statusCode ?? e?.status ?? e?.originalResponse?.getStatus?.());
  return status === 409 || /already exists|duplicate/i.test(e?.message ?? '');
}

/**
 * Subida reanudable por TUS, para todo lo que pase de 6 MB (en la práctica, los
 * videos). Un corte de red a la mitad retoma desde el último bloque confirmado en
 * vez de empezar de cero, y la huella se guarda en localStorage, así que también
 * retoma después de cerrar la pestaña.
 */
async function uploadResumable(
  path: string,
  blob: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal
): Promise<void> {
  const { Upload } = await import('tus-js-client');
  const token = await accessToken();

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(blob, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: MEDIA_BUCKET, objectName: path, contentType, cacheControl: '3600' },
      // Supabase exige bloques de exactamente 6 MB.
      chunkSize: RESUMABLE_THRESHOLD_BYTES,
      // La ruta es única por archivo (lleva su UUID): es la huella natural para
      // encontrar una subida a medias.
      fingerprint: async () => `restorify-media:${path}`,
      onBeforeRequest: async (req) => {
        req.setHeader('authorization', `Bearer ${await accessToken()}`);
      },
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: (err) => (alreadyExists(err) ? resolve() : reject(err)),
    });

    signal.addEventListener(
      'abort',
      () => {
        void upload.abort();
        reject(new DOMException('Subida cancelada', 'AbortError'));
      },
      { once: true }
    );

    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(() => upload.start());
  });
}

export const mediaService = {
  /** El transporte que usa la cola de subida en el navegador. */
  createUploader(): MediaUploader {
    return {
      async upload(item: UploadItem, which, onProgress, signal) {
        const isMain = which === 'principal';
        const blob = isMain ? item.blob : item.thumb;
        const path = isMain ? item.ruta : item.rutaMiniatura;
        if (!blob || !path) return;
        const contentType = isMain ? baseMime(item.mime) : 'image/jpeg';

        if (blob.size > RESUMABLE_THRESHOLD_BYTES) {
          await uploadResumable(path, blob, contentType, onProgress, signal);
          return;
        }

        const { error } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(path, blob, { contentType, cacheControl: '3600', upsert: false });
        // Un reintento de algo que ya había subido llega como "ya existe": para
        // la cola eso es éxito, no error.
        if (error && !alreadyExists(error)) throw error;
        onProgress(1);
      },

      async saveRow(item: UploadItem) {
        const { error } = await supabase.from('orden_media').insert({
          id: item.id,
          orden_id: item.ordenId,
          avance_id: item.avanceId,
          tipo: item.tipo,
          origen: item.origen,
          zona: item.zona,
          ruta: item.ruta,
          ruta_miniatura: item.rutaMiniatura,
          mime: item.mime,
          bytes: item.blob.size,
          duracion_seg: item.duracionSeg === null ? null : Math.round(item.duracionSeg * 10) / 10,
          ancho: item.ancho,
          alto: item.alto,
        });
        // 23505: la fila ya existe de un intento anterior que no llegó a confirmar.
        if (error && error.code !== '23505') throw error;
      },

      async removeFiles(item: UploadItem) {
        const paths = [item.ruta, item.rutaMiniatura].filter((p): p is string => !!p);
        await supabase.storage.from(MEDIA_BUCKET).remove(paths);
      },
    };
  },

  listOrderMedia: async (orderId: string) => {
    const { data, error } = await supabase
      .from('orden_media')
      .select('*')
      .eq('orden_id', orderId)
      .order('creado_en', { ascending: true });
    if (error) throw error;
    return (data || []) as OrderMedia[];
  },

  /** Publicar u ocultar un archivo en el reporte del cliente. Solo admin (RLS). */
  setVisibility: async (id: string, visible: boolean) => {
    // La política de UPDATE de `orden_media` exige `is_admin()`, y una política que no deja
    // pasar la fila devuelve cero filas sin error (es lo que comprueba SEC-45): sin pedir la
    // fila de vuelta, el interruptor se vería encendido sobre un archivo que sigue interno.
    const { data, error } = await supabase
      .from('orden_media')
      .update({ visible_cliente: visible })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    assertAffected(data, 'el archivo');
  },

  /**
   * Borra un archivo: primero la fila, porque es la que la app muestra y la que
   * RLS autoriza; después los archivos, como mejor esfuerzo. Al revés, un fallo a
   * la mitad dejaría una fila apuntando a un archivo que ya no existe.
   */
  deleteMedia: async (media: Pick<OrderMedia, 'id' | 'ruta' | 'ruta_miniatura'>) => {
    const { data, error } = await supabase.from('orden_media').delete().eq('id', media.id).select('id');
    if (error) throw error;
    assertDeleted(data, 'el archivo');
    await mediaService.removeStoragePaths([media.ruta, media.ruta_miniatura]);
  },

  /**
   * Borra objetos del bucket. Los borrados en cascada (una orden, un avance) se
   * llevan las filas pero la base no puede tocar Storage, así que quien borra
   * esas filas pasa por aquí antes para no dejar archivos huérfanos ocupando la
   * cuota del plan.
   */
  removeStoragePaths: async (paths: (string | null | undefined)[]) => {
    const clean = paths.filter((p): p is string => !!p);
    if (!clean.length) return;
    await supabase.storage.from(MEDIA_BUCKET).remove(clean);
  },

  /** URLs firmadas en una sola petición, como mapa ruta → URL. */
  signUrls: async (paths: string[], ttlSeconds = SIGNED_URL_TTL_SECONDS) => {
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return {} as Record<string, string>;
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(unique, ttlSeconds);
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const entry of data || []) {
      if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
    }
    return map;
  },

  /** Sube una firma (PNG pequeño) a la carpeta de su orden. */
  uploadSmallFile: async (path: string, blob: Blob, contentType: string) => {
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, blob, { contentType, cacheControl: '3600', upsert: false });
    if (error) throw error;
  },
};
