// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  isStaleChunkError: vi.fn(() => false),
  reloadForStaleChunk: vi.fn(() => false),
  reportError: vi.fn(),
}));

vi.mock('./Sidebar', () => ({ default: () => <nav data-testid="sidebar" /> }));
vi.mock('./Header', () => ({ default: () => <header data-testid="header" /> }));
vi.mock('./BottomNav', () => ({ default: () => <nav data-testid="bottom-nav" /> }));
vi.mock('../SchemaDriftBanner', () => ({ default: () => null }));
vi.mock('../../features/media/MediaUploadsProvider', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../features/media/UploadTray', () => ({
  default: () => <div data-testid="upload-tray" />,
}));
vi.mock('../../context/auth.context', () => ({
  useAuth: () => ({ currentSede: null, user: null }),
}));
vi.mock('../../context/theme.context', () => ({
  useTheme: () => ({ theme: 'light' }),
}));
vi.mock('../../context/language.context', () => ({
  useLanguage: () => ({ t: (k: string) => (k === 'common.retry' ? 'Reintentar' : k) }),
}));
vi.mock('../../lib/branding', () => ({
  applySedeBranding: vi.fn(),
  clearSedeBranding: vi.fn(),
}));
vi.mock('../../features/notifications/pushDevice', () => ({
  syncThisDevice: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../features/workOrders/useOrderSync', () => ({
  useOrderSync: vi.fn(),
}));
vi.mock('../../lib/monitoring', () => ({
  reportError: mocks.reportError,
}));
vi.mock('../../lib/staleChunk', () => ({
  isStaleChunkError: mocks.isStaleChunkError,
  reloadForStaleChunk: mocks.reloadForStaleChunk,
}));

const { default: AppLayout } = await import('./AppLayout');

describe('AppLayout ErrorBoundary del Outlet', () => {
  let consoleErrorSpy: { mockRestore: () => void } | undefined;

  beforeEach(() => {
    mocks.isStaleChunkError.mockReset().mockReturnValue(false);
    mocks.reloadForStaleChunk.mockReset().mockReturnValue(false);
    mocks.reportError.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  it('mantiene vivos el menú, el encabezado y la bandeja de subidas si falla la pantalla y permite reintentar', () => {
    let shouldCrash = true;
    function BrokenScreen() {
      if (shouldCrash) throw new Error('boom');
      return <div data-testid="recovered">Pantalla recuperada</div>;
    }

    render(
      <MemoryRouter initialEntries={['/ruta-rota']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/ruta-rota" element={<BrokenScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('upload-tray')).toBeInTheDocument();
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();

    shouldCrash = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(screen.getByTestId('recovered')).toBeInTheDocument();
  });

  it('conserva la recarga automática cuando el fallo es de chunk viejo', () => {
    mocks.isStaleChunkError.mockReturnValue(true);
    mocks.reloadForStaleChunk.mockReturnValue(true);

    function ChunkErrorScreen(): ReactNode {
      throw new Error('Failed to fetch dynamically imported module');
    }

    const { container } = render(
      <MemoryRouter initialEntries={['/chunk-viejo']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/chunk-viejo" element={<ChunkErrorScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(mocks.reloadForStaleChunk).toHaveBeenCalledOnce();
    expect(container.querySelector('.spinner')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });
});
