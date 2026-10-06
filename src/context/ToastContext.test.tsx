// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
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

  // 06/10/2026: en el iPhone, con el teclado abierto, el aviso quedaba fuera de la vista.
  it('sigue a la parte visible de la pantalla cuando el teclado la desplaza', () => {
    const listeners: Record<string, () => void> = {};
    const viewport = {
      offsetTop: 0,
      addEventListener: (name: string, fn: () => void) => { listeners[name] = fn; },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('visualViewport', viewport);
    const { container } = render(
      <LanguageProvider><ToastProvider>
        <TestComponent type="success" message="Mano de obra agregada" />
      </ToastProvider></LanguageProvider>
    );
    const stack = container.querySelector('.toast-stack') as HTMLElement;
    expect(stack.style.transform).toBe('');

    viewport.offsetTop = 320;
    act(() => listeners.scroll());
    expect(stack.style.transform).toBe('translateY(320px)');
    vi.unstubAllGlobals();
  });
});
