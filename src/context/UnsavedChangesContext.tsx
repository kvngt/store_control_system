import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { UnsavedChangesContext, type Guard } from './unsavedChanges.context';

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  // Varios guardias a la vez. El hueco de `setGuard` se guarda aparte para que
  // su dueño pueda seguir reemplazándolo sin tocar a los demás.
  const guardsRef = useRef(new Set<Guard>());
  const slotRef = useRef<Guard | null>(null);

  const setGuard = useCallback((guard: Guard | null) => {
    slotRef.current = guard;
  }, []);

  const registerGuard = useCallback((guard: Guard) => {
    guardsRef.current.add(guard);
    return () => {
      guardsRef.current.delete(guard);
    };
  }, []);

  const hasGuards = useCallback(() => !!slotRef.current || guardsRef.current.size > 0, []);

  const confirmNavigation = useCallback(() => {
    // Basta con que uno diga que no. Se para en el primero para no encadenar
    // dos confirmaciones seguidas, que es una forma segura de que alguien
    // acepte la segunda sin leerla.
    if (slotRef.current && !slotRef.current()) return false;
    for (const guard of guardsRef.current) {
      if (!guard()) return false;
    }
    return true;
  }, []);

  // Also protect against closing the tab / hard refresh while dirty.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasGuards()) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasGuards]);

  const value = useMemo(
    () => ({ setGuard, registerGuard, confirmNavigation }),
    [setGuard, registerGuard, confirmNavigation],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}
