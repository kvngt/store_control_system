// Context object, its shape, and the hook that reads it.
//
// Kept apart from the provider component on purpose: Vite's fast refresh only
// preserves state for a module that exports components and nothing else, so a
// file holding both the provider and `useAuth()` forced a full page reload on every
// edit. The provider lives in AuthContext.tsx.

import { createContext, useContext } from 'react';
import type { UserProfile, Sede } from '../types/database';

export interface LoginResult {
  success: boolean;
  /** The raw Supabase error, so the caller can translate it. Passing the
   *  message straight through is what put English text on the login screen. */
  error?: { code?: string; message?: string };
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  currentSede: Sede | null;
  allSedes: Sede[];
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  setCurrentSede: (sede: Sede | null) => void;
  /** Re-reads sedes after an admin edits branding/capacity, so the injected
   *  theme and logo update without a page reload. */
  refreshSedes: () => Promise<void>;
  /** Re-reads the signed-in profile after the user edits name/email/photo. */
  refreshUser: () => Promise<void>;
  /** True while the session came from a password-recovery link. The app shows
   *  the "choose a new password" screen instead of the normal routes: the
   *  recovery link does sign the user in, so without this flag they would land
   *  on the dashboard and never be asked for a new password. */
  passwordRecovery: boolean;
  /** Leaves recovery mode — after setting the password, or on cancel. */
  endPasswordRecovery: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
