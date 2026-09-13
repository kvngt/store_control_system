import { THUMB_MAX_EDGE, THUMB_QUALITY } from './constants';
import { drawJpeg } from './image';

function once(target: EventTarget, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      target.removeEventListener(event, handler);
      resolve(false);
    }, timeoutMs);
    const handler = () => {
      clearTimeout(timer);
      target.removeEventListener(event, handler);
      resolve(true);
    };
    target.addEventListener(event, handler);
  });
}

/** El fotograma que se está mostrando en un <video>, como miniatura JPEG. */
export async function thumbFromVideoElement(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  try {
    const { blob } = await drawJpeg(video, video.videoWidth, video.videoHeight, THUMB_MAX_EDGE, THUMB_QUALITY);
    return blob;
  } catch {
    return null;
  }
}

/**
 * Duración, dimensiones y una miniatura de un archivo de video.
 *
 * Cada paso tiene su tiempo límite y un resultado parcial es un resultado: una
 * miniatura que no se pudo sacar no debe impedir subir el video. El único dato
 * sin el que no se sigue es la duración, porque el tope de 2 minutos depende de
 * ella — y quien llama decide qué hacer si llega en null.
 */
export async function inspectVideo(
  blob: Blob
): Promise<{ duration: number | null; width: number | null; height: number | null; thumb: Blob | null }> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    if (!(await once(video, 'loadedmetadata', 8000))) {
      return { duration: null, width: null, height: null, thumb: null };
    }

    let duration: number | null = Number.isFinite(video.duration) ? video.duration : null;
    // Un WebM de MediaRecorder reporta `Infinity` hasta que se busca el final.
    if (duration === null) {
      video.currentTime = Number.MAX_SAFE_INTEGER;
      await once(video, 'seeked', 5000);
      duration = Number.isFinite(video.duration) ? video.duration : null;
    }

    const width = video.videoWidth || null;
    const height = video.videoHeight || null;

    video.currentTime = Math.min(0.5, (duration ?? 1) / 2);
    await once(video, 'seeked', 5000);
    const thumb = await thumbFromVideoElement(video);

    return { duration, width, height, thumb };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
