// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, authValue, MECHANIC_USER } from '../../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../../test/renderWithProviders').authValue> | null },
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
}));

vi.mock('../../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));
vi.mock('../../services/users.service', () => ({
  usersService: {
    updateProfile: mocks.updateProfile,
    uploadAvatar: mocks.uploadAvatar,
  },
}));

const { default: ProfileCard } = await import('./ProfileCard');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(MECHANIC_USER);
});

describe('ProfileCard', () => {
  it('renderiza el perfil del usuario actual y su título', () => {
    renderWithProviders(<ProfileCard />);

    expect(screen.getByRole('heading', { name: /Mi Perfil/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue(MECHANIC_USER.nombre_completo)).toBeInTheDocument();
    expect(screen.getByDisplayValue(MECHANIC_USER.email)).toBeInTheDocument();
  });
});
