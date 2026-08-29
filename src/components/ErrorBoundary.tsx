import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Restorify crashed:', error, info.componentStack);
  }

  render() {
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
