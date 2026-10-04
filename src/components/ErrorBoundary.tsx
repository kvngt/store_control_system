import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { isStaleChunkError, reloadForStaleChunk } from '../lib/staleChunk';
import { reportError } from '../lib/monitoring';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  /** Se está recargando para traer la versión publicada (ver `lib/staleChunk.ts`). */
  reloading: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', reloading: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Un archivo de una versión anterior no es un error de la app: se recarga sola
    // en vez de mostrar la pantalla de error.
    if (isStaleChunkError(error) && reloadForStaleChunk()) {
      this.setState({ reloading: true });
      return;
    }
    console.error('Restorify crashed:', error, info.componentStack);
    // Antes se quedaba en la consola del teléfono de quien lo vio: nadie se enteraba.
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.reloading) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)' }}>
          <div className="spinner" />
        </div>
      );
    }
    if (this.state.hasError) {
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
            background: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
          }}
        >
          <AlertTriangle size={40} style={{ color: 'var(--color-warning)' }} />
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
            Algo salió mal
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', maxWidth: 420 }}>
            Ocurrió un error inesperado. Intenta recargar la página; si el problema
            continúa, contacta a soporte.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Recargar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
