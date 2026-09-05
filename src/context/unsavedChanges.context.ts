// Context object, its shape, and the hook that reads it.
//
// Kept apart from the provider component on purpose: Vite's fast refresh only
// preserves state for a module that exports components and nothing else, so a
// file holding both the provider and `useUnsavedChanges()` forced a full page reload on every
// edit. The provider lives in UnsavedChangesContext.tsx.

import { createContext, useContext } from 'react';

export type Guard = () => boolean; // return true = OK to leave, false = user cancelled

interface UnsavedChangesContextType {
  setGuard: (guard: Guard | null) => void;
  confirmNavigation: () => boolean;
}

export const UnsavedChangesContext = createContext<UnsavedChangesContextType | undefined>(undefined);

export function useUnsavedChanges() {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider');
  }
  return context;
}
