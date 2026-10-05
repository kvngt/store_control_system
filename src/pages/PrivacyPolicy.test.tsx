// @vitest-environment jsdom
//
// El aviso de privacidad es público (`/privacidad`) y tiene que decir lo que la app de verdad
// hace. Estas pruebas fijan lo que más fácil se olvida al cambiar la app: los proveedores que
// reciben datos (entre ellos la traducción con Google Gemini) y la regla de grabaciones de
// Maryland, en los dos idiomas.

import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import PrivacyPolicy from './PrivacyPolicy';

beforeEach(() => {
  localStorage.clear();
});

describe('PrivacyPolicy', () => {
  it('en español nombra a los proveedores, dónde se guardan los datos y la regla de grabaciones', () => {
    renderWithProviders(<PrivacyPolicy />);

    expect(screen.getByRole('heading', { level: 1, name: /Aviso de Privacidad/ })).toBeInTheDocument();
    expect(screen.getByText(/Google Gemini/)).toBeInTheDocument();
    expect(screen.getByText(/servidores ubicados en Canadá/)).toBeInTheDocument();
    expect(screen.getByText(/no graba conversaciones sin el permiso de todos/)).toBeInTheDocument();
    expect(screen.getByText(/No vendemos su información/)).toBeInTheDocument();
    // La app no lee datos de diagnóstico del vehículo: el aviso no lo puede decir.
    expect(screen.queryByText(/diagnóstico de su vehículo/)).not.toBeInTheDocument();
  });

  it('cambia al inglés desde la propia página (quien la abre no tiene sesión)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrivacyPolicy />);

    await user.click(screen.getByRole('button', { name: 'EN' }));

    expect(screen.getByRole('heading', { level: 1, name: /Privacy Notice/ })).toBeInTheDocument();
    expect(screen.getByText(/Google Gemini/)).toBeInTheDocument();
    expect(screen.getByText(/do not record conversations without the consent of everyone present/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
  });
});
