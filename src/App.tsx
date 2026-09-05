import { Suspense, lazy, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './lib/queryClient';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/auth.context';
import { ToastProvider } from './context/ToastContext';
import { UnsavedChangesProvider } from './context/UnsavedChangesContext';
import { isSupabaseConfigured } from './lib/supabase';
import ErrorBoundary from './components/ErrorBoundary';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';

// Split per route. Login, the dashboard and the shell stay in the entry chunk
// because they are what the first paint after sign-in needs; everything else is
// fetched when its route is first visited. A painter who only ever opens
// Órdenes and Kanban never downloads Finanzas, Nómina or Configuración — which
// on a phone over shop wifi is the difference the shop actually feels.
const Customers = lazy(() => import('./pages/Customers'));
const Vehicles = lazy(() => import('./pages/Vehicles'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const KanbanBoard = lazy(() => import('./pages/KanbanBoard'));
const Finance = lazy(() => import('./pages/Finance'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Settings = lazy(() => import('./pages/Settings'));

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user?.rol !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, loading, passwordRecovery } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  // A recovery link signs the user in before they've chosen a password, so this
  // has to win over every route — otherwise they land on the dashboard and the
  // password is never actually reset.
  if (passwordRecovery) {
    return <ResetPassword />;
  }

  return (
    <Suspense fallback={<div className="loading-state"><div className="spinner" /></div>}>
      <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/work-orders" element={<WorkOrders />} />
        <Route path="/kanban" element={<KanbanBoard />} />
        <Route
          path="/finance"
          element={
            <ProtectedRoute adminOnly>
              <Finance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payroll"
          element={
            <ProtectedRoute adminOnly>
              <Payroll />
            </ProtectedRoute>
          }
        />
        {/* Open to every role: profile, language and theme live here. The
            sede/staff management sections inside are admin-gated. */}
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function MissingConfigScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-6)',
        textAlign: 'center',
        background: '#0A0A0F',
        color: '#F0F0F5',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Configuración incompleta</h1>
      <p style={{ color: '#9A9AB0', maxWidth: 480 }}>
        Faltan las variables de entorno de Supabase (<code>VITE_SUPABASE_URL</code> y{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>). Agrégalas en la configuración de tu hosting
        y vuelve a compilar el proyecto — Vite las incrusta en el build, no las lee en
        tiempo real.
      </p>
    </div>
  );
}

export default function App() {
  // One client for the life of the app. Held in state rather than built at
  // module scope so a remount (a test, or React 19's StrictMode double-invoke)
  // never shares a cache it did not create.
  const [queryClient] = useState(createQueryClient);

  if (!isSupabaseConfigured) {
    return <MissingConfigScreen />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <LanguageProvider>
              <ToastProvider>
                <UnsavedChangesProvider>
                  <AuthProvider>
                    <AppRoutes />
                  </AuthProvider>
                </UnsavedChangesProvider>
              </ToastProvider>
            </LanguageProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
