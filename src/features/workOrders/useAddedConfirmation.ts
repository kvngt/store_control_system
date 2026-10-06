import { useCallback, useEffect, useRef, useState } from 'react';

/** Cuánto se queda la confirmación junto al botón. */
const VISIBLE_MS = 4000;

/**
 * La línea que se acaba de agregar, por unos segundos y donde se tocó "Agregar". `flash(texto)`
 * la enciende.
 *
 * Además del aviso flotante: en el teléfono, con el teclado abierto, el aviso de arriba puede
 * quedar fuera de la vista, y el taller no sabía si el trabajo o el repuesto había entrado
 * (06/10/2026).
 */
export function useAddedConfirmation() {
  const [added, setAdded] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const flash = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setAdded(text);
    timer.current = setTimeout(() => setAdded(null), VISIBLE_MS);
  }, []);
  return { added, flash };
}
