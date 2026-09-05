// Context object, its shape, and the hook that reads it.
//
// Kept apart from the provider component on purpose: Vite's fast refresh only
// preserves state for a module that exports components and nothing else, so a
// file holding both the provider and `useToast()` forced a full page reload on every
// edit. The provider lives in ToastContext.tsx.

import { createContext, useContext } from 'react';

export type ToastType = 'success' | 'error';

interface ToastContextType {
  showToast: (type: ToastType, message: string, detail?: string) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
