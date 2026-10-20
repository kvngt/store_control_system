import { useCallback, useEffect, useRef } from 'react';

/**
 * El botón «atrás» de Android (y el del navegador) mientras hay un diálogo con trabajo a medias.
 *
 * Un diálogo no es una página: «atrás» no lo cierra, sale de la pantalla y se pierde todo lo que se
 * llevaba capturado (reportado en el taller: la orden nueva se cancelaba sola). El truco es dejar
 * una entrada de más en el historial mientras el diálogo está abierto: «atrás» gasta esa entrada,
 * nos avisa (`onBack`) y la pantalla sigue donde estaba.
 *
 * - `onBack` decide qué hacer: cerrar sin preguntar, o preguntar. Si la persona decide seguir, se
 *   llama a `rearm()` para dejar otra entrada de reserva.
 * - Al cerrar el diálogo por otro camino (la X, guardar la orden) se llama a `release()`, que quita
 *   la entrada de reserva para que el historial quede como estaba.
 * - La entrada copia el estado del historial que ya tenía (el del enrutador), para que React Router
 *   no vea una ubicación distinta.
 */
export function useBackButtonTrap(active: boolean, onBack: () => void) {
  const trapped = useRef(false);
  // Un `history.back()` nuestro (release) no debe tomarse por un «atrás» de la persona.
  const ignoreNext = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const push = useCallback(() => {
    if (trapped.current) return;
    window.history.pushState({ ...(window.history.state ?? {}), restorifyTrap: true }, '');
    trapped.current = true;
  }, []);

  const release = useCallback(() => {
    if (!trapped.current) return;
    trapped.current = false;
    if (window.history.state && (window.history.state as { restorifyTrap?: boolean }).restorifyTrap) {
      ignoreNext.current = true;
      window.history.back();
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    push();
    const handler = () => {
      if (ignoreNext.current) {
        ignoreNext.current = false;
        return;
      }
      // La entrada de reserva ya se gastó con este «atrás».
      trapped.current = false;
      onBackRef.current();
    };
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      release();
    };
  }, [active, push, release]);

  return { rearm: push, release };
}
