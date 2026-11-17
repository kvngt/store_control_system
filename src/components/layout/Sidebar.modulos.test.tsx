// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, authValue, ADMIN_USER, MECHANIC_USER } from '../../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => authValue(ADMIN_USER)),
}));

vi.mock('../../context/auth.context', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('../../features/notifications/pushDevice', () => ({
  detachThisDevice: vi.fn(async () => undefined),
}));

const { default: Sidebar } = await import('./Sidebar');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Sidebar — módulo comisiones', () => {
  it('muestra Comisiones al admin cuando el módulo está encendido', () => {
    mocks.useAuth.mockReturnValue(authValue(ADMIN_USER));
    renderWithProviders(
      <Sidebar collapsed={false} onToggle={vi.fn()} mobileOpen={false} onMobileClose={vi.fn()} />
    );

    expect(screen.getByRole('link', { name: 'Comisiones' })).toBeInTheDocument();
  });

  it('esconde Comisiones al admin cuando comisiones está apagado', () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'comisiones');
    mocks.useAuth.mockReturnValue(authValue(ADMIN_USER));
    renderWithProviders(
      <Sidebar collapsed={false} onToggle={vi.fn()} mobileOpen={false} onMobileClose={vi.fn()} />
    );

    expect(screen.queryByRole('link', { name: 'Comisiones' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Empleados' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finanzas' })).toBeInTheDocument();
  });

  it('muestra Mis comisiones al técnico cuando el módulo está encendido', () => {
    mocks.useAuth.mockReturnValue(authValue(MECHANIC_USER));
    renderWithProviders(
      <Sidebar collapsed={false} onToggle={vi.fn()} mobileOpen={false} onMobileClose={vi.fn()} />
    );

    expect(screen.getByRole('link', { name: 'Mis comisiones' })).toBeInTheDocument();
  });

  it('esconde Mis comisiones al técnico cuando comisiones está apagado', () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'comisiones');
    mocks.useAuth.mockReturnValue(authValue(MECHANIC_USER));
    renderWithProviders(
      <Sidebar collapsed={false} onToggle={vi.fn()} mobileOpen={false} onMobileClose={vi.fn()} />
    );

    expect(screen.queryByRole('link', { name: 'Mis comisiones' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Órdenes de Trabajo' })).toBeInTheDocument();
  });
});
