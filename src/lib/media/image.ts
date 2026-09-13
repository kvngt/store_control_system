import type { PreparedMedia } from '../../types/database';
import { PHOTO_MAX_EDGE, PHOTO_QUALITY, THUMB_MAX_EDGE, THUMB_QUALITY } from './constants';
import { MediaProcessingError } from './errors';
import { fitWithin } from './mime';

/**
 * Carga una imagen en un <img> y espera a que esté decodificada.
 *
 * <img> y no `createImageBitmap`: todos los navegadores actuales aplican la
 * orientación EXIF al dibujar un <img> en un canvas, mientras que el soporte de
 * `imageOrientation` en `createImageBitmap` varía entre versiones de Safari. Una
 * foto de iPhone tomada en vertical tiene que salir en vertical.
 */
function loadImage(blob: Blob): Promise<{ img: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  const release = () => URL.revokeObjectURL(url);
  return new Promise((resolve, reject) => {
    img.onload = () => resolve({ img, release });
    img.onerror = () => {
      release();
      reject(new MediaProcessingError('unsupported-image'));
    };
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new MediaProcessingError('unsupported-image'))),
      'image/jpeg',
      quality
    );
  });
}

/** Dibuja `source` escalado a `maxEdge` y lo devuelve como JPEG. */
export async function drawJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
  quality: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const { width, height } = fitWithin(sourceWidth, sourceHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new MediaProcessingError('unsupported-image');
  // Fondo blanco: un PNG con transparencia convertido a JPEG sale negro si no.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await canvasToJpeg(canvas, quality);
  return { blob, width, height };
}

/**
 * Una foto del teléfono, lista para subir: 1920 px en el lado largo, JPEG, y una
 * miniatura de 480 px para las galerías.
 *
 * Volver a codificar en un canvas elimina el EXIF, y con él la ubicación GPS de
 * donde se tomó la foto — que no tiene por qué terminar en un reporte que el
 * cliente puede reenviar. JPEG y no WebP: jsPDF no sabe insertar WebP en el PDF.
 */
export async function compressImage(file: Blob): Promise<PreparedMedia> {
  const { img, release } = await loadImage(file);
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new MediaProcessingError('unsupported-image');

    const full = await drawJpeg(img, w, h, PHOTO_MAX_EDGE, PHOTO_QUALITY);
    const thumb = await drawJpeg(img, w, h, THUMB_MAX_EDGE, THUMB_QUALITY);

    return {
      tipo: 'foto',
      blob: full.blob,
      mime: 'image/jpeg',
      thumb: thumb.blob,
      duracionSeg: null,
      ancho: full.width,
      alto: full.height,
    };
  } finally {
    release();
  }
}
