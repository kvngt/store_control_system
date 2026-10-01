// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lazy, Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

// Reportado en el teléfono: después de publicar una versión, entrar a una sección
// mostraba "Algo salió mal" y recargando ya funcionaba. Era la página diferida de
// la versión anterior, que ya no existe en el servidor.

const reload = vi.fn();

function failingPage(message: string) {
  return lazy(() => Promise.reject(new Error(message)));
}

beforeEach(() => {
  sessionStorage.clear();
  reload.mockReset();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('ErrorBoundary', () => {
  it('una página de una versión anterior recarga sola, sin la pantalla de error', async () => {
    const Page = failingPage('Failed to fetch dynamically imported module: /assets/WorkOrders-abc12345.js');
    render(
      <ErrorBoundary>
        <Suspense fallback={null}><Page /></Suspense>
      </ErrorBoundary>
    );
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Algo salió mal')).toBeNull();
  });

  it('si después de recargar sigue fallando, muestra la pantalla de error', async () => {
    sessionStorage.setItem('restorify:stale-chunk-reload', String(Date.now()));
    const Page = failingPage('Failed to fetch dynamically imported module: /assets/WorkOrders-abc12345.js');
    render(
      <ErrorBoundary>
        <Suspense fallback={null}><Page /></Suspense>
      </ErrorBoundary>
    );
    expect(await screen.findByText('Algo salió mal')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('un error de la app sigue mostrando la pantalla de error', async () => {
    const Page = failingPage("Cannot read properties of undefined (reading 'nombre')");
    render(
      <ErrorBoundary>
        <Suspense fallback={null}><Page /></Suspense>
      </ErrorBoundary>
    );
    expect(await screen.findByText('Algo salió mal')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
