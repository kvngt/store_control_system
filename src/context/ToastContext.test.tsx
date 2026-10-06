// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider } from './ToastContext';
import { LanguageProvider } from './LanguageContext';
import { useToast } from './toast.context';
import { useEffect } from 'react';

function TestComponent({ type, message }: { type: 'success' | 'error'; message: string }) {
  const { showToast } = useToast();
  useEffect(() => {
    showToast(type, message);
  }, [type, message, showToast]);
  return null;
}

describe('ToastContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('un aviso de éxito se anuncia con "status" y uno de error con "alert"', () => {
    const { container, rerender } = render(
      <LanguageProvider><ToastProvider>
        <TestComponent type="success" message="Exito" />
      </ToastProvider></LanguageProvider>
    );

    const stack = container.querySelector('.toast-stack')!;
    // El contenedor vacío no es una región viva: lo son los avisos.
    expect(stack.getAttribute('role')).toBeNull();
    const ok = stack.querySelector('.toast-success')!;
    expect(ok.getAttribute('role')).toBe('status');
    expect(ok.getAttribute('aria-live')).toBe('polite');

    rerender(
      <LanguageProvider><ToastProvider>
        <TestComponent type="error" message="Fallo" />
      </ToastProvider></LanguageProvider>
    );

    const bad = stack.querySelector('.toast-error')!;
    expect(bad.getAttribute('role')).toBe('alert');
    expect(bad.getAttribute('aria-live')).toBe('assertive');
  });
});
