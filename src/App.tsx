import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { isSupabaseConfigured } from './lib/supabase';
import ErrorBoundary from './components/ErrorBoundary';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Vehicles from './pages/Vehicles';
import WorkOrders from './pages/WorkOrders';
import KanbanBoard from './pages/KanbanBoard';
import Finance from './pages/Finance';
import Payroll from './pages/Payroll';
import Settings from './pages/Settings';

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
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
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
        <Route
          path="/settings"
          element={
            <ProtectedRoute adminOnly>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
  if (!isSupabaseConfigured) {
    return <MissingConfigScreen />;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
