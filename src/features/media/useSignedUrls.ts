import { useQuery } from '@tanstack/react-query';
import { mediaService, SIGNED_URL_TTL_SECONDS } from '../../services/media.service';

/**
 * URLs firmadas para un conjunto de rutas del bucket privado, en una sola
 * petición y cacheadas un poco menos que su vida útil, para que ninguna galería
 * intente mostrar una URL que venció mientras estaba abierta.
 *
 * Firmar no descarga nada: el archivo solo viaja cuando un <img> o <video> usa
 * la URL. Por eso se firman juntas la miniatura y el original.
 */
export function useSignedUrls(paths: (string | null | undefined)[]) {
  const clean = [...new Set(paths.filter((p): p is string => !!p))].sort();
  const ttlMs = SIGNED_URL_TTL_SECONDS * 1000;

  const query = useQuery({
    queryKey: ['signed-urls', ...clean],
    queryFn: () => mediaService.signUrls(clean),
    enabled: clean.length > 0,
    staleTime: ttlMs - 10 * 60 * 1000,
    gcTime: ttlMs - 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { urls: query.data ?? EMPTY, loading: query.isPending && clean.length > 0 };
}

const EMPTY: Record<string, string> = {};
