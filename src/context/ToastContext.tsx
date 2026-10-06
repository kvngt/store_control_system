import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { ToastContext, type ToastType } from './toast.context';
import { useLanguage } from './language.context';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  detail?: string;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { t } = useLanguage();

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Pending auto-dismiss timers, cleared on unmount so a toast raised just
  // before navigating away can't fire into a torn-down tree.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const showToast = useCallback((type: ToastType, message: string, detail?: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message, detail }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      dismiss(id);
    }, type === 'error' ? 8000 : 4500);
    timers.current.add(timer);
  }, [dismiss]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  // En el iPhone, con el teclado abierto, `position: fixed` se mide contra la página y no
  // contra lo que se ve: el aviso de "Mano de obra agregada" quedaba arriba, fuera de la
  // pantalla, y el taller no sabía si el trabajo había entrado (06/10/2026). Se corre lo que
  // la parte visible se haya desplazado.
  const viewportTop = useVisualViewportTop();

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Lo que se lee en voz alta es cada aviso, no el contenedor: un `role="status"` fijo y
          vacío chocaba con los demás estados de la pantalla. */}
      <div className="toast-stack" style={viewportTop > 0 ? { transform: `translateY(${viewportTop}px)` } : undefined}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={20} className="toast-icon" />
            ) : (
              <XCircle size={20} className="toast-icon" />
            )}
            <div className="toast-body">
              <div className="toast-message">{toast.message}</div>
              {toast.detail && <div className="toast-detail">{toast.detail}</div>}
            </div>
            <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label={t('common.close')}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Cuánto se desplazó la parte visible de la pantalla (el teclado del iPhone la corre). */
function useVisualViewportTop(): number {
  const [top, setTop] = useState(0);
  useEffect(() => {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!viewport) return;
    const update = () => setTop(Math.max(0, Math.round(viewport.offsetTop)));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return top;
}
