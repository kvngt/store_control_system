// @vitest-environment jsdom
//
// Regression tests for code-split modals.
//
// Reported from the shop: opening the bank-statement importer during a live
// session did nothing at all. The importer is a ~440 KB lazy chunk that was
// mounted under `<Suspense fallback={null}>`, so between the click and the
// download finishing the app rendered literally nothing — and if the download
// failed, React.lazy rethrew all the way to the app-root ErrorBoundary and
// replaced the whole screen.
//
// Both behaviours are pinned here against LazyModal directly, so the guarantee
// holds for any modal that gets code-split later.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { lazy } from 'react';
import { screen } from '@testing-library/react';
import LazyModal from './LazyModal';
import { renderWithProviders } from '../test/renderWithProviders';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LazyModal', () => {
  it('shows a loading state while the chunk is still downloading', () => {
    // A chunk that never arrives — the state the user sees on slow wifi.
    const NeverArrives = lazy(() => new Promise<never>(() => {}));

    renderWithProviders(
      <LazyModal onClose={() => {}}>
        <NeverArrives />
      </LazyModal>
    );

    expect(screen.getByRole('status')).toBeVisible();
    expect(screen.getByText(/Cargando/i)).toBeVisible();
  });

  it('keeps a failed chunk inside the dialog instead of crashing the app', async () => {
    // React logs the caught error; silence it so the run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const FailsToLoad = lazy(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module'))
    );

    renderWithProviders(
      <div>
        <span>El resto de Finanzas sigue aquí</span>
        <LazyModal onClose={() => {}}>
          <FailsToLoad />
        </LazyModal>
      </div>
    );

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByText(/No se pudo abrir esta sección/i)).toBeVisible();
    // The point: the surrounding page survived. Before this boundary existed,
    // the app-root ErrorBoundary swallowed everything.
    expect(screen.getByText('El resto de Finanzas sigue aquí')).toBeVisible();
    // And the one action that actually fixes a stale chunk is offered.
    expect(screen.getByRole('button', { name: /Recargar página/i })).toBeVisible();
  });

  it('renders the modal once the chunk resolves', async () => {
    const Arrives = lazy(async () => ({
      default: () => <div className="modal">Importar Estado de Cuenta</div>,
    }));

    renderWithProviders(
      <LazyModal onClose={() => {}}>
        <Arrives />
      </LazyModal>
    );

    expect(await screen.findByText('Importar Estado de Cuenta')).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
