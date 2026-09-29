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

/** Luma (0–255) por encima de la cual un pixel ya no cuenta como negro. */
const DARK_LUMA = 16;
/** Un cuadro es negro si menos de esta fracción de sus pixeles pasa el umbral. */
const LIT_FRACTION = 0.01;
/** Lado del lienzo de muestreo: 1 024 pixeles alcanzan para decidir y no cuestan nada. */
const SAMPLE_EDGE = 32;

/**
 * Si unos pixeles RGBA son un cuadro negro: casi ninguno pasa de un gris muy oscuro.
 *
 * No es "oscuro". Un taller con poca luz da un cuadro oscuro con zonas iluminadas, y
 * esas pasan. Lo que no pasa es lo que se veía en el teléfono: un canvas que recibió
 * la cámara antes de que tuviera imagen, o un fotograma del arranque del video.
 */
export function isBlackFrame(rgba: ArrayLike<number>): boolean {
  const pixels = Math.floor(rgba.length / 4);
  if (!pixels) return true;
  let lit = 0;
  for (let i = 0; i < pixels * 4; i += 4) {
    const luma = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    if (luma > DARK_LUMA) lit++;
  }
  return lit < pixels * LIT_FRACTION;
}

/**
 * Muestrea el fotograma en un lienzo diminuto. Si no se puede leer (sin contexto 2D,
 * lienzo contaminado), no se afirma nada: `false`, y la miniatura sigue su camino.
 */
function looksBlack(video: HTMLVideoElement): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_EDGE;
  canvas.height = SAMPLE_EDGE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  try {
    ctx.drawImage(video, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
    return isBlackFrame(ctx.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE).data);
  } catch {
    return false;
  }
}

/**
 * El fotograma que se está mostrando en un <video>, como miniatura JPEG, o null si no
 * hay imagen o el cuadro es negro.
 *
 * Una miniatura negra es peor que ninguna: pasa a ser el póster del video en la
 * galería, en el portal del cliente y en el borrador del avance, y hace creer que el
 * video no se grabó (reunión con el taller, sept. 2026). Sin miniatura, cada lugar
 * muestra el ícono de video.
 */
export async function thumbFromVideoElement(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  if (looksBlack(video)) return null;
  try {
    const { blob } = await drawJpeg(video, video.videoWidth, video.videoHeight, THUMB_MAX_EDGE, THUMB_QUALITY);
    return blob;
  } catch {
    return null;
  }
}

/** Dónde buscar la miniatura: 0.5 s, 1.5 s y la mitad, sin repetir ni pasar de la mitad. */
export function thumbTimes(duration: number | null): number[] {
  if (!duration || duration <= 0) return [0.5];
  const half = duration / 2;
  return [...new Set([0.5, 1.5, half].map((t) => Math.min(t, half)))];
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

    // El primer medio segundo de una grabación suele ser negro mientras la cámara ajusta
    // la exposición. Si ese cuadro no sirve se prueba más adelante, sin pasar de la mitad.
    let thumb: Blob | null = null;
    for (const at of thumbTimes(duration)) {
      video.currentTime = at;
      await once(video, 'seeked', 5000);
      thumb = await thumbFromVideoElement(video);
      if (thumb) break;
    }

    return { duration, width, height, thumb };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
