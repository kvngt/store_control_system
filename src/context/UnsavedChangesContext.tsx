import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';

type Guard = () => boolean; // return true = OK to leave, false = user cancelled

interface UnsavedChangesContextType {
  setGuard: (guard: Guard | null) => void;
  confirmNavigation: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType | undefined>(undefined);

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

export function useUnsavedChanges() {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider');
  }
  return context;
}
