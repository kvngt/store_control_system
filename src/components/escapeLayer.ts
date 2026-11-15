import { useEffect, useRef, type RefObject } from 'react';

/**
 * La pila de capas que cierran con Escape (`Modal` y `ChoiceDialog`): Escape atiende solo a la de
 * arriba, para que con una pregunta abierta sobre un diálogo se cierre la pregunta y no los dos.
 *
 * Se escucha en la fase de burbuja de `window` y se respeta `defaultPrevented`: un control que ya
 * usó su Escape (el autocompletado de marca y modelo cierra su lista) no cierra además el diálogo.
 * Con la fase de captura, el diálogo se llevaba ese Escape antes de que el control lo viera.
 */

interface EscapeEntry {
  getElement: () => HTMLElement | null;
  onEscape: () => void;
}

const escapeStack: EscapeEntry[] = [];
let batchStart: number | null = null;
let listenerAttached = false;

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const top = escapeStack[escapeStack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.onEscape();
}

/** Registra una capa en la pila de Escape mientras está montada (y `active`). */
export function useEscapeLayer(elementRef: RefObject<HTMLElement | null>, onEscape: () => void, active = true) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    if (!listenerAttached) {
      window.addEventListener('keydown', handleGlobalKeyDown);
      listenerAttached = true;
    }

    const entry: EscapeEntry = {
      getElement: () => elementRef.current,
      onEscape: () => onEscapeRef.current(),
    };

    // Las capas montadas en el mismo commit de React se ordenan por su posición en el documento,
    // para que una hija quede encima de su madre (React monta primero los efectos de la hija).
    if (batchStart === null) {
      batchStart = escapeStack.length;
      queueMicrotask(() => {
        batchStart = null;
      });
    }

    let insertAt = escapeStack.length;
    const el = elementRef.current;
    if (el) {
      for (let i = batchStart; i < escapeStack.length; i++) {
        const existingEl = escapeStack[i].getElement();
        if (existingEl && (el.compareDocumentPosition(existingEl) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
          insertAt = i;
          break;
        }
      }
    }
    escapeStack.splice(insertAt, 0, entry);

    return () => {
      const idx = escapeStack.indexOf(entry);
      if (idx !== -1) escapeStack.splice(idx, 1);
      if (escapeStack.length === 0 && listenerAttached) {
        window.removeEventListener('keydown', handleGlobalKeyDown);
        listenerAttached = false;
      }
    };
  }, [active, elementRef]);
}
