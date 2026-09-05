// Context object, its shape, and the hook that reads it.
//
// Kept apart from the provider component on purpose: Vite's fast refresh only
// preserves state for a module that exports components and nothing else, so a
// file holding both the provider and `useTheme()` forced a full page reload on every
// edit. The provider lives in ThemeContext.tsx.

import { createContext, useContext } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
