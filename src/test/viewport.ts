/**
 * `window.matchMedia` para jsdom, que no lo trae.
 *
 * Hace falta desde que la pantalla de Órdenes decide en JavaScript si monta la
 * tabla de escritorio o las tarjetas del teléfono, en vez de emitir las dos y
 * esconder una con CSS (ver `src/lib/useMediaQuery.ts`). `useMediaQuery` tolera
 * que `matchMedia` no exista — se queda en "no coincide" —, pero entonces la
 * mitad móvil de esa pantalla no sería alcanzable desde una prueba, que es
 * justo la mitad que se acaba de cambiar.
 *
 * El stub arranca en escritorio, que es lo que asumían las pruebas ya escritas.
 */
let matching = false;

/** Todas las listas creadas, para poder notificarles un cambio de ancho. */
const lists = new Set<{ media: string; dispatch: (matches: boolean) => void }>();

export function installMatchMedia() {
  if (typeof window === 'undefined') return;

  window.matchMedia = ((query: string) => {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const list = {
      media: query,
      get matches() {
        return matching;
      },
      onchange: null,
      addEventListener: (_type: string, fn: (e: MediaQueryListEvent) => void) => {
        listeners.add(fn);
      },
      removeEventListener: (_type: string, fn: (e: MediaQueryListEvent) => void) => {
        listeners.delete(fn);
      },
      // La API vieja: algo de terceros todavía la usa.
      addListener: (fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
      removeListener: (fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
      dispatchEvent: () => true,
    };

    const entry = {
      media: query,
      dispatch: (matches: boolean) =>
        listeners.forEach((fn) => fn({ matches, media: query } as MediaQueryListEvent)),
    };
    lists.add(entry);

    return list as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

/**
 * Pone el ancho simulado. Llamar **antes** de renderizar: `useMediaQuery` lee
 * el valor al inicializar su estado, precisamente para que un teléfono no monte
 * la tabla de escritorio y la cambie en el primer efecto.
 */
export function setViewportMatches(matches: boolean) {
  matching = matches;
  lists.forEach((entry) => entry.dispatch(matches));
}

/** Vuelve a escritorio. El `setup.ts` lo corre después de cada prueba. */
export function resetViewport() {
  matching = false;
  lists.clear();
}
