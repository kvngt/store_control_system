import { useEffect, useState } from 'react';

/**
 * Sigue una media query desde React, para decidir *qué se renderiza* y no sólo
 * qué se ve.
 *
 * Las utilidades `.desktop-only` / `.mobile-only` esconden con CSS, lo que es lo
 * correcto casi siempre: no hay salto al cargar y no hay un segundo criterio de
 * verdad sobre el ancho. Pero la lista de órdenes emite las dos versiones —
 * la tabla de escritorio y las tarjetas — y para un técnico la emite dos veces,
 * "mis órdenes" y el resto del tablero. Son cuatro copias del mismo marcado en
 * el DOM de un teléfono, con sus iconos y sus barras de avance, para mostrar
 * dos. Aquí sí vale preguntar el ancho y renderizar una.
 */
export const MOBILE_QUERY = '(max-width: 768px)';

export function useMediaQuery(query: string): boolean {
  // Se inicializa leyendo de una vez, no en `false`: arrancar en `false` haría
  // que un teléfono montara la tabla de escritorio y la cambiara en el primer
  // efecto, que es exactamente el parpadeo que este hook debería evitar.
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Atajo para el único punto de corte que la app distingue. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
