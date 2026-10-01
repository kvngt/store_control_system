/**
 * Archivos de una versión que ya no existe.
 *
 * Las páginas y algunos diálogos se descargan al abrirlos (`React.lazy`), con un
 * hash en el nombre (`WorkOrders-abc123.js`). Si alguien tiene la app abierta —o
 * instalada y en segundo plano— cuando se publica una versión, Hostinger ya
 * reemplazó esos archivos: al entrar a una sección que no había abierto, la
 * descarga falla y la app entera caía en "Algo salió mal", que se arreglaba
 * recargando. Aquí se reconoce ese error y se recarga una vez, sola.
 */

const KEY = 'restorify:stale-chunk-reload';
/** Si ya se recargó hace menos que esto, no es una versión vieja: no se insiste. */
const WINDOW_MS = 10_000;

const PATTERNS = [
  'failed to fetch dynamically imported module', // Chrome, Edge
  'importing a module script failed', // Safari
  'error loading dynamically imported module', // Firefox
  'is not a valid javascript mime type', // el servidor respondió HTML en vez del archivo
  'unable to preload css',
  'chunkloaderror',
];

export function isStaleChunkError(error: unknown): boolean {
  if (!error) return false;
  const text = `${(error as Error).name ?? ''} ${(error as Error).message ?? String(error)}`.toLowerCase();
  return PATTERNS.some((p) => text.includes(p));
}

/**
 * Recarga la página para traer la versión publicada. Devuelve `false` sin hacer
 * nada si ya se intentó hace un momento: si el archivo sigue sin bajar después de
 * recargar, el problema es otro (sin señal, servidor caído) y recargar en ciclo
 * solo lo empeoraría.
 */
export function reloadForStaleChunk(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (now - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    // Sin sessionStorage (modo privado estricto) no hay cómo evitar el ciclo.
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Vite avisa con `vite:preloadError` cuando falla la descarga de un archivo
 * diferido, antes de que el error llegue a React.
 */
export function installStaleChunkReload() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForStaleChunk()) event.preventDefault();
  });
}
