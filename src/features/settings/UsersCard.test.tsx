// @vitest-environment jsdom
//
// «Nuevo usuario» en Configuración: el teléfono lleva su país, como el del cliente (16/10/2026).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, SEDE_CENTRO } from '../../test/renderWithProviders';
import type { UserProfile } from '../../types/database';

const mocks = vi.hoisted(() => ({
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
}));
const notifMocks = vi.hoisted(() => ({
  usersWithPush: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../services/users.service', () => ({ usersService: mocks }));
vi.mock('../../services/notifications.service', () => ({ notificationsService: notifMocks }));

const { default: UsersCard } = await import('./UsersCard');

const USER_MOCK: UserProfile = {
  id: 'user-1',
  nombre_completo: 'Juan Pérez',
  email: 'juan@taller.local',
  telefono: '+15551234567',
  rol: 'mecanico',
  sede_id: 'sede-centro',
  creado_en: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it('al crear un empleado llama onCreated con el perfil creado', async () => {
    const created: UserProfile = {
      id: 'user-2',
      nombre_completo: 'Carlos Pintor',
      email: 'carlos@taller.com',
      telefono: '',
      rol: 'pintor',
      sede_id: 'sede-centro',
      creado_en: '2026-02-01T00:00:00Z',
    };
    mocks.createEmployee.mockResolvedValue(created);
    const onCreated = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <UsersCard
        users={[USER_MOCK]}
        sedes={[SEDE_CENTRO]}
        currentUserId="admin-1"
        loading={false}
        onChanged={vi.fn()}
        onCreated={onCreated}
      />
    );

    await user.click(screen.getByRole('button', { name: /Nuevo Usuario/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Carlos Pintor');
    await user.type(screen.getByLabelText('Correo Electrónico'), 'carlos@taller.com');
    await user.selectOptions(screen.getByLabelText('Rol'), 'pintor');
    await user.type(screen.getByLabelText('Contraseña Temporal'), 'clave1234');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText(/Empleado creado/)).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledWith(created);
  });
});
