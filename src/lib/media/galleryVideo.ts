import {
  BlobSource,
  BufferTarget,
  canEncodeVideo,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  Quality,
  WEBM,
} from 'mediabunny';
import type { PreparedMedia } from '../../types/database';
import {
  MAX_MEDIA_SECONDS,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_EDGE,
  VIDEO_BITRATE,
} from './constants';
import { MediaProcessingError } from './errors';
import { ALLOWED_UPLOAD_MIMES, baseMime, fitWithin } from './mime';
import { inspectVideo } from './videoFrame';

export interface GalleryVideoOptions {
  /** 0..1 mientras se convierte. */
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

/**
 * Un video elegido de la galería del teléfono, listo para subir.
 *
 * Lo que sale de la cámara nativa no se parece a lo que la plataforma puede
 * guardar: un iPhone graba HEVC en 1080p o 4K, entre 60 y 350 MB por minuto. Aquí
 * se convierte en el propio teléfono a H.264 720p (~11 MB/min) con WebCodecs, que
 * usa el codificador por hardware — segundos, no minutos, y sin descargar nada
 * pesado. ffmpeg.wasm se descartó por eso: ~30 MB de descarga y una conversión que
 * en iPhone se cae por memoria.
 *
 * Este módulo entero se carga diferido (ver `MediaCaptureBar`), así que Mediabunny
 * solo se descarga cuando alguien elige un video. Los imports son estáticos y con
 * nombre a propósito: con un import dinámico del paquete y acceso por espacio de
 * nombres, el bundler conserva la librería completa y no puede descartar nada.
 *
 * Si el navegador no puede convertir, se sube el original solo cuando ya es un
 * formato que todos reproducen y cabe en el bucket; si no, se pide grabarlo desde
 * la app, que ya graba liviano.
 */
export async function prepareGalleryVideo(file: File, options: GalleryVideoOptions = {}): Promise<PreparedMedia> {
  // Solo los contenedores que sale de la galería de un teléfono: MP4 y MOV
  // (Android, iPhone) y WebM/Matroska. `ALL_FORMATS` arrastra también HLS,
  // MPEG-TS y los demuxers de audio, y casi duplicaba lo que se descarga.
  const input = new Input({ formats: [MP4, QTFF, WEBM, MATROSKA], source: new BlobSource(file) });

  try {
    let duration: number;
    try {
      duration = await input.computeDuration();
    } catch {
      throw new MediaProcessingError('unsupported-file');
    }
    // Un segundo de holgura: los contenedores redondean distinto.
    if (duration > MAX_MEDIA_SECONDS + 1) throw new MediaProcessingError('too-long');

    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new MediaProcessingError('no-video');

    const target = fitWithin(track.displayWidth, track.displayHeight, MAX_VIDEO_EDGE, true);
    const quality = new Quality({ bitrate: VIDEO_BITRATE });
    const canEncode =
      typeof VideoEncoder !== 'undefined' &&
      (await canEncodeVideo('avc', { width: target.width, height: target.height, quality }).catch(() => false));

    if (!canEncode) return uploadOriginal(file);

    const output = new Output({
      // `in-memory`: el índice va al principio del archivo, así el <video> del
      // cliente empieza a reproducir sin descargarlo entero.
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: 'avc',
        width: target.width,
        height: target.height,
        fit: 'fill',
        quality,
      },
      // Sin bitrate para el audio a propósito: así se copia tal cual cuando ya es
      // AAC (lo normal en un teléfono) en vez de recodificarlo, y un Safari sin
      // codificador de audio WebCodecs no lo descarta.
      audio: { codec: 'aac' },
      showWarnings: false,
    });

    const lostVideo = conversion.discardedTracks.some((d) => d.track.isVideoTrack());
    if (!conversion.isValid || lostVideo) return uploadOriginal(file);

    if (options.onProgress) conversion.onProgress = (p) => options.onProgress?.(p);
    const onAbort = () => void conversion.cancel();
    options.signal?.addEventListener('abort', onAbort);
    try {
      await conversion.execute();
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }

    const buffer = output.target.buffer;
    if (!buffer) throw new MediaProcessingError('cannot-convert');
    const blob = new Blob([buffer], { type: 'video/mp4' });
    if (blob.size > MAX_UPLOAD_BYTES) throw new MediaProcessingError('too-large');

    const info = await inspectVideo(blob);
    return {
      tipo: 'video',
      blob,
      mime: 'video/mp4',
      thumb: info.thumb,
      duracionSeg: Math.min(duration, MAX_MEDIA_SECONDS),
      ancho: info.width ?? target.width,
      alto: info.height ?? target.height,
    };
  } finally {
    input.dispose();
  }
}

async function uploadOriginal(file: File): Promise<PreparedMedia> {
  const mime = baseMime(file.type || '');
  // Un .mov HEVC de iPhone no se reproduce en Chrome ni en el navegador de la
  // mayoría de los clientes. Mejor pedir que lo graben desde la app que guardar
  // un archivo que nadie puede ver.
  if (!ALLOWED_UPLOAD_MIMES.has(mime) || !mime.startsWith('video/')) {
    throw new MediaProcessingError('cannot-convert');
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new MediaProcessingError('too-large');

  const info = await inspectVideo(file);
  if (info.duration === null) throw new MediaProcessingError('unsupported-file');
  if (info.duration > MAX_MEDIA_SECONDS + 1) throw new MediaProcessingError('too-long');

  return {
    tipo: 'video',
    blob: file,
    mime,
    thumb: info.thumb,
    duracionSeg: Math.min(info.duration, MAX_MEDIA_SECONDS),
    ancho: info.width,
    alto: info.height,
  };
}
