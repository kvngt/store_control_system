import React, { useRef, useCallback, useEffect } from 'react';
import { UnsavedChangesContext, type Guard } from './unsavedChanges.context';

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const guardRef = useRef<Guard | null>(null);

  const setGuard = useCallback((guard: Guard | null) => {
    guardRef.current = guard;
  }, []);

  const confirmNavigation = useCallback(() => {
    if (guardRef.current) {
      return guardRef.current();
    }
    return true;
  }, []);

  // Also protect against closing the tab / hard refresh while dirty.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (guardRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return (
    <UnsavedChangesContext.Provider value={{ setGuard, confirmNavigation }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}
