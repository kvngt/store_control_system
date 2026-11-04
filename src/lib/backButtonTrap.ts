import { useCallback, useEffect, useRef, useState } from 'react';

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
 * - Al cerrar el diálogo por otro camino (la X, guardar) se llama a `release()`, o basta con
 *   desmontarlo: se quita la entrada de reserva para que el historial quede como estaba.
 * - La entrada copia el estado del historial que ya tenía (el del enrutador), para que React Router
 *   no vea una ubicación distinta.
 *
 * Los diálogos se anidan: el de un avance abre la cámara, que es otra capa con su propia trampa. Por
 * eso las trampas armadas forman una pila: cada «atrás» lo atiende solo la de arriba (cierra la
 * cámara, no el avance), y lo que hace una al soltarse (`history.go`) no lo toma ninguna como un
 * «atrás» de la persona. Las que se sueltan en el mismo momento (el avance se cierra con la cámara
 * abierta) se juntan en un solo `history.go(-n)`: dos `back()` seguidos no siempre se aplican los dos.
 * Antes cada trampa escuchaba por su cuenta, y la de afuera tomaba el cierre de la de adentro por un
 * «atrás».
 */

interface Trap {
  onBack: () => void;
}

/**
 * Las trampas armadas: la de arriba (la última) atiende el próximo «atrás». Las entradas de reserva
 * son todas copias del mismo estado, así que solo importa cuántas hay (una por trampa armada) y
 * quién contesta primero.
 */
const stack: Trap[] = [];
/** Movimientos del historial hechos por nosotros: su `popstate` no es un «atrás» de la persona. */
let ownPops = 0;
/** Entradas de reserva por quitar, juntas, al terminar lo que se está haciendo ahora. */
let pendingPops = 0;
/** Dónde empiezan en la pila las trampas armadas en este mismo commit de React (-1: ninguna). */
let batchStart = -1;
let listening = false;

/**
 * Cuántas entradas de reserva hay hasta esta, contándola (0: no es nuestra). Cada entrada guarda la
 * suya al dejarse; las de una versión anterior traían `true`, que vale como 1.
 */
function depthOf(state: unknown): number {
  const mark = (state as { restorifyTrap?: unknown } | null)?.restorifyTrap;
  if (typeof mark === 'number') return mark;
  return mark ? 1 : 0;
}

function onPopState() {
  if (ownPops > 0) {
    ownPops -= 1;
    return;
  }
  const depth = depthOf(window.history.state);
  if (depth >= stack.length) {
    // No se gastó ninguna entrada de las trampas armadas: fue un «adelante» (el botón del mouse, el
    // trackpad) hacia una entrada que ya se había soltado. No es un «atrás»: nadie cierra nada, y se
    // vuelve a la entrada que corresponde para que la cuenta no se desfase.
    if (depth > stack.length && stack.length > 0) {
      ownPops += 1;
      window.history.go(-(depth - stack.length));
    }
    return;
  }
  // «Atrás»: se gastaron las entradas de las de arriba (una, o varias si se saltó desde el menú del
  // navegador). Avisa primero a la de más arriba.
  const consumed = stack.splice(depth).reverse();
  for (const trap of consumed) trap.onBack();
}

function listen() {
  if (listening) return;
  window.addEventListener('popstate', onPopState);
  listening = true;
}

function flush() {
  const n = pendingPops;
  pendingPops = 0;
  // Si el enrutador ya navegó a otra pantalla, nuestras entradas quedaron debajo y no se tocan:
  // volver atrás aquí desharía esa navegación.
  if (n <= 0 || depthOf(window.history.state) === 0) return;
  ownPops += 1;
  window.history.go(-n);
}

function arm(trap: Trap) {
  if (stack.includes(trap)) return;
  listen();
  window.history.pushState({ ...(window.history.state ?? {}), restorifyTrap: stack.length + 1 }, '');
  if (batchStart === -1) {
    batchStart = stack.length;
    queueMicrotask(() => {
      batchStart = -1;
    });
  }
  // React corre los efectos de los hijos antes que los del padre: si un diálogo y el de adentro se
  // montan en el mismo commit, el padre llega después y tiene que quedar debajo.
  stack.splice(batchStart, 0, trap);
}

function release(trap: Trap) {
  const index = stack.indexOf(trap);
  // No está: ya la gastó un «atrás», o nunca se armó.
  if (index === -1) return;
  stack.splice(index, 1);
  pendingPops += 1;
  queueMicrotask(flush);
}

/** Solo para pruebas: deja la pila vacía entre una prueba y otra (el estado es del módulo). */
export function resetBackButtonTrapsForTests() {
  stack.length = 0;
  ownPops = 0;
  pendingPops = 0;
  batchStart = -1;
}

export function useBackButtonTrap(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  // Un objeto por diálogo, estable entre renders: es su lugar en la pila.
  const [trap] = useState<Trap>(() => ({ onBack: () => onBackRef.current() }));

  const rearm = useCallback(() => arm(trap), [trap]);
  const releaseTrap = useCallback(() => release(trap), [trap]);

  useEffect(() => {
    if (!active) return undefined;
    arm(trap);
    return () => release(trap);
  }, [active, trap]);

  return { rearm, release: releaseTrap };
}
