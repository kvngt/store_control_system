import { createContext, useContext } from 'react';
import type { NewUpload, UploadItem } from '../../lib/media/uploadQueue';

export interface MediaUploadsApi {
  items: UploadItem[];
  online: boolean;
  enqueue: (uploads: Omit<NewUpload, 'userId'>[]) => UploadItem[];
  retry: (id: string) => void;
  discard: (id: string) => Promise<void>;
}

export const MediaUploadsContext = createContext<MediaUploadsApi | null>(null);

/**
 * La cola de subida de la sesión. Fuera del proveedor (una prueba que renderiza
 * una pantalla suelta) devuelve una cola inerte en vez de lanzar: una pantalla
 * que muestra fotos no debería necesitar la infraestructura de subida para
 * dibujarse.
 */
export function useMediaUploads(): MediaUploadsApi {
  return useContext(MediaUploadsContext) ?? INERT;
}

const INERT: MediaUploadsApi = {
  items: [],
  online: true,
  enqueue: () => [],
  retry: () => {},
  discard: async () => {},
};
