import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '../context/LanguageContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { UnsavedChangesProvider } from '../context/UnsavedChangesContext';
import type { Sede, UserProfile } from '../types/database';

// Language/Theme/Toast/UnsavedChanges are pure client state, so the real
// providers work fine under jsdom. AuthContext is the one that talks to
// Supabase, so component tests mock that module instead of wrapping it.
// The router is included because pages reach for useNavigate() to deep-link
// into each other, and without one they throw on render.
export function renderWithProviders(ui: ReactElement) {
  // A fresh client per render: a cache shared between tests would let one
  // test's fixtures answer the next test's query. Retries are off so a test
  // that asserts an error sees it immediately instead of after a backoff.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
    <MemoryRouter>
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            <UnsavedChangesProvider>{ui}</UnsavedChangesProvider>
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </MemoryRouter>
    </QueryClientProvider>
  );
}

// ---- Fixtures -----------------------------------------------------------
// Shaped like real rows so a test failing tells you something about the app
// and not about the fixture.

export const SEDE_CENTRO: Sede = {
  id: 'sede-centro',
  nombre: 'Taller Centro',
  direccion: '120 Main St',
  telefono: '555-0100',
  capacidad: 10,
  color_tema: null,
  logo_url: null,
  fecha_creacion: '2026-01-01T00:00:00Z',
};

export const SEDE_NORTE: Sede = {
  ...SEDE_CENTRO,
  id: 'sede-norte',
  nombre: 'Taller Norte',
  direccion: '480 North Ave',
};

export const ADMIN_USER: UserProfile = {
  id: 'user-admin',
  nombre_completo: 'Ana Torres',
  rol: 'admin',
  sede_id: SEDE_CENTRO.id,
  telefono: '555-0111',
  email: 'ana@restorify.test',
  creado_en: '2026-01-01T00:00:00Z',
};

export const MECHANIC_USER: UserProfile = {
  ...ADMIN_USER,
  id: 'user-mecanico',
  nombre_completo: 'Luis Ramos',
  rol: 'mecanico',
  email: 'luis@restorify.test',
};

/** The shape `useAuth()` returns, with test-friendly no-op callbacks.
 *  `currentSede` is nullable because the real context allows it — an admin
 *  whose sede list failed to load has none, and screens have to cope. */
export function authValue(user: UserProfile, currentSede: Sede | null = SEDE_CENTRO) {
  return {
    user,
    isAuthenticated: true,
    loading: false,
    currentSede,
    allSedes: [SEDE_CENTRO, SEDE_NORTE],
    login: async () => ({ success: true }),
    logout: async () => {},
    setCurrentSede: () => {},
    refreshSedes: async () => {},
    refreshUser: async () => {},
  };
}
