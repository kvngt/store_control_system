import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// Wrapper for modals that are code-split with React.lazy().
//
// Two things went wrong with a bare `<Suspense fallback={null}>`:
//
//   1. Nothing at all rendered between the click and the chunk finishing.
//      The bank-statement importer is a ~440 KB chunk, so on shop wifi that's
//      seconds of a button that looks broken — which is how it was reported.
//   2. If the chunk fails to download, React.lazy rethrows during render. With
//      no boundary in between, that reached the app-root ErrorBoundary and
//      replaced the *entire* app with the crash screen, losing whatever the
//      admin was doing. A stale chunk hash after a redeploy is enough to
//      trigger it, and a redeploy is exactly when someone is demoing.
//
// This keeps the failure inside the dialog and offers the one action that
// actually fixes a stale chunk: reload.

interface Props {
  children: ReactNode;
  onClose: () => void;
}

interface State {
  hasError: boolean;
}

class LazyModalBoundary extends Component<Props & { label: string; hint: string; reload: string }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Restorify: no se pudo cargar un módulo diferido', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="modal-overlay" onClick={this.props.onClose}>
        <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
              {this.props.label}
            </h3>
            <button className="modal-close" onClick={this.props.onClose}><X size={20} /></button>
          </div>
          <div className="modal-body">
            <p role="alert" style={{ color: 'var(--color-text-secondary)' }}>{this.props.hint}</p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              {this.props.reload}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default function LazyModal({ children, onClose }: Props) {
  const { t } = useLanguage();

  return (
    <LazyModalBoundary
      onClose={onClose}
      label={t('common.sectionLoadError')}
      hint={t('common.sectionLoadErrorHint')}
      reload={t('common.reload')}
    >
      <Suspense
        fallback={
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 320 }}>
              <div className="modal-body">
                <div className="loading-state" role="status">
                  <div className="spinner" />
                  <span>{t('common.loading')}</span>
                </div>
              </div>
            </div>
          </div>
        }
      >
        {children}
      </Suspense>
    </LazyModalBoundary>
  );
}
