// @vitest-environment jsdom
//
// «Nuevo usuario» en Configuración: el teléfono lleva su país, como el del cliente (16/10/2026).

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersCard from './UsersCard';
import { renderWithProviders, SEDE_CENTRO } from '../../test/renderWithProviders';
import type { UserProfile } from '../../types/database';

const USER_MOCK: UserProfile = {
  id: 'user-1',
  nombre_completo: 'Juan Pérez',
  email: 'juan@taller.local',
  telefono: '+15551234567',
  rol: 'mecanico',
  sede_id: 'sede-centro',
  creado_en: '2026-01-01T00:00:00Z',
};

describe('UsersCard', () => {
  it('muestra el selector de país en el formulario de nuevo usuario', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <UsersCard
        users={[USER_MOCK]}
        sedes={[SEDE_CENTRO]}
        currentUserId="admin-1"
        loading={false}
        onChanged={vi.fn()}
      />
    );

    const newUserBtn = screen.getByRole('button', { name: /nuevo usuario|new user/i });
    await user.click(newUserBtn);

    const countrySelect = screen.getByRole('combobox', { name: /país del teléfono|phone country/i });
    expect(countrySelect).toBeInTheDocument();
  });
});
