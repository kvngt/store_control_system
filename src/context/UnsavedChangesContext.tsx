import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { UnsavedChangesContext, type DirtyCheck, type Guard } from './unsavedChanges.context';

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  // Varios guardias a la vez. El hueco de `setGuard` se guarda aparte para que
  // su dueño pueda seguir reemplazándolo sin tocar a los demás.
  // Cada guardia con su revisión de "hay algo sin guardar" (opcional, ver DirtyCheck).
  const guardsRef = useRef(new Map<Guard, DirtyCheck | undefined>());
  const slotRef = useRef<Guard | null>(null);
  const slotDirtyRef = useRef<DirtyCheck | undefined>(undefined);

  const setGuard = useCallback((guard: Guard | null, isDirty?: DirtyCheck) => {
    slotRef.current = guard;
    slotDirtyRef.current = guard ? isDirty : undefined;
  }, []);

  const registerGuard = useCallback((guard: Guard, isDirty?: DirtyCheck) => {
    guardsRef.current.set(guard, isDirty);
    return () => {
      guardsRef.current.delete(guard);
    };
  }, []);

  const anyDirty = useCallback(() => {
    if (slotRef.current && (slotDirtyRef.current?.() ?? true)) return true;
    for (const isDirty of guardsRef.current.values()) {
      if (isDirty?.() ?? true) return true;
    }
    return false;
  }, []);

  const confirmNavigation = useCallback(() => {
    // Basta con que uno diga que no. Se para en el primero para no encadenar
    // dos confirmaciones seguidas, que es una forma segura de que alguien
    // acepte la segunda sin leerla.
    if (slotRef.current && !slotRef.current()) return false;
    for (const guard of guardsRef.current.keys()) {
      if (!guard()) return false;
    }
    return true;
  }, []);

  // Also protect against closing the tab / hard refresh while dirty.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (anyDirty()) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [anyDirty]);

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
