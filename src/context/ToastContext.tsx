import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { ToastContext, type ToastType } from './toast.context';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  detail?: string;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'success' ? (
              <CheckCircle2 size={20} className="toast-icon" />
            ) : (
              <XCircle size={20} className="toast-icon" />
            )}
            <div className="toast-body">
              <div className="toast-message">{toast.message}</div>
              {toast.detail && <div className="toast-detail">{toast.detail}</div>}
            </div>
            <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Cerrar">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
