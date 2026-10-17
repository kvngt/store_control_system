import { compressImage } from '../../lib/media/image';
import { MediaProcessingError } from '../../lib/media/errors';
import type { PreparedMedia } from '../../types/database';

/**
 * Prepara un archivo multimedia (comprime una imagen o convierte un video).
 * Reutilizado por la barra de captura y por la acción de foto directa del técnico.
 */
export async function prepareMediaFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<PreparedMedia> {
  if (file.type.startsWith('image/')) {
    return await compressImage(file);
  } else if (file.type.startsWith('video/')) {
    const { prepareGalleryVideo } = await import('../../lib/media/galleryVideo');
    return await prepareGalleryVideo(file, onProgress ? { onProgress } : undefined);
  }
  throw new MediaProcessingError('unsupported-file');
}
