// @vitest-environment jsdom
//
// La pantalla que abre el enlace de "¿Olvidaste tu contraseña?". Probado en el
// navegador contra Supabase local: un enlace vencido o ya usado mostraba el
// formulario sin aviso (y al guardar decía "revisa tu conexión"), y después de
// cambiar la contraseña "Entrar al sistema" dejaba a la persona en la misma pantalla.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders, authValue, MECHANIC_USER } from '../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  updatePassword: vi.fn(),
  endPasswordRecovery: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/supabaseService', () => ({
  supabaseService: { updatePassword: mocks.updatePassword },
}));

const { default: ResetPassword } = await import('./ResetPassword');

function renderAt() {
  renderWithProviders(
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<p>panel</p>} />
      <Route path="/login" element={<p>pantalla de login</p>} />
    </Routes>,
    { route: '/reset-password' }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = {
    ...authValue(MECHANIC_USER),
    passwordRecovery: true,
    endPasswordRecovery: mocks.endPasswordRecovery,
  };
  mocks.updatePassword.mockResolvedValue(undefined);
});

afterEach(() => {
  window.location.hash = '';
});

describe('ResetPassword', () => {
  it('con un enlace vencido explica qué pasó y no muestra el formulario', async () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired';
    mocks.auth = { ...mocks.auth, passwordRecovery: false, isAuthenticated: false, user: null };
    renderAt();

    expect(screen.getByRole('alert')).toHaveTextContent(/venció o ya se usó/);
    expect(screen.queryByLabelText(/contraseña nueva/i)).not.toBeInTheDocument();
  });

  it('abierta sin enlace ni sesión tampoco ofrece un formulario que no puede guardar', () => {
    mocks.auth = { ...mocks.auth, passwordRecovery: false, isAuthenticated: false, user: null };
    renderAt();

    expect(screen.getByRole('alert')).toHaveTextContent(/venció o ya se usó/);
  });

  it('después de guardar, "Entrar al sistema" lleva al panel', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.type(screen.getByLabelText(/contraseña nueva/i), 'Recuperada-2026');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Recuperada-2026');
    await user.click(screen.getByRole('button', { name: /guardar contraseña/i }));
    await user.click(await screen.findByRole('button', { name: /entrar al sistema/i }));

    expect(mocks.updatePassword).toHaveBeenCalledWith('Recuperada-2026');
    expect(mocks.endPasswordRecovery).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('panel')).toBeInTheDocument());
  });
});
