// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_USER, MECHANIC_USER, SEDE_CENTRO, authValue, renderWithProviders } from '../test/renderWithProviders';
import type { UserProfile } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getSedes: vi.fn(),
  getUsers: vi.fn(),
  createEmployee: vi.fn(),
  getPaySchemes: vi.fn(),
  getSummary: vi.fn(),
  getRecentAssignments: vi.fn(),
  getRecentProgress: vi.fn(),
  usersWithPush: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

vi.mock('../services/sedes.service', () => ({
  sedesService: { getSedes: mocks.getSedes },
}));
vi.mock('../services/users.service', () => ({
  usersService: {
    getUsers: mocks.getUsers,
    createEmployee: mocks.createEmployee,
    updateEmployee: vi.fn(),
    deleteEmployee: vi.fn(),
  },
}));

vi.mock('../services/employees.service', () => ({
  employeesService: {
    getPaySchemes: mocks.getPaySchemes,
    savePayScheme: vi.fn(),
    getSummary: mocks.getSummary,
    getRecentAssignments: mocks.getRecentAssignments,
    getRecentProgress: mocks.getRecentProgress,
  },
}));

vi.mock('../services/notifications.service', () => ({
  notificationsService: { usersWithPush: mocks.usersWithPush },
}));

const { default: Employees } = await import('./Employees');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getSedes.mockResolvedValue([SEDE_CENTRO]);
  mocks.getUsers.mockResolvedValue([ADMIN_USER, MECHANIC_USER]);
  mocks.getPaySchemes.mockResolvedValue([]);
  mocks.getSummary.mockResolvedValue({
    comisiones_pendientes: 0,
    comisiones_pagadas: 0,
    ordenes_activas: 0,
    ordenes_entregadas: 0,
  });
  mocks.getRecentAssignments.mockResolvedValue([]);
  mocks.getRecentProgress.mockResolvedValue([]);
  mocks.usersWithPush.mockResolvedValue({});
});

describe('Employees', () => {
  it('al crear un mecánico abre enseguida su detalle para fijar el pago con un aviso', async () => {
    const created: UserProfile = {
      id: 'user-new-mech',
      nombre_completo: 'Pedro Gómez',
      email: 'pedro@taller.com',
      telefono: '',
      rol: 'mecanico',
      sede_id: SEDE_CENTRO.id,
      creado_en: '2026-03-01T00:00:00Z',
    };
    mocks.createEmployee.mockResolvedValue(created);
    const user = userEvent.setup();
    renderWithProviders(<Employees />);

    await screen.findAllByText(MECHANIC_USER.nombre_completo);
    await user.click(screen.getByRole('button', { name: /Nuevo Usuario/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Pedro Gómez');
    await user.type(screen.getByLabelText('Correo Electrónico'), 'pedro@taller.com');
    await user.selectOptions(screen.getByLabelText('Rol'), 'mecanico');
    await user.type(screen.getByLabelText('Contraseña Temporal'), 'clave1234');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Pedro Gómez');
    expect(dialog).toHaveTextContent(/Ajusta cómo se le paga/);
  });

  it('al crear un administrador no abre el modal de pago', async () => {
    const created: UserProfile = {
      id: 'user-new-admin',
      nombre_completo: 'Sofía Administración',
      email: 'sofia@taller.com',
      telefono: '',
      rol: 'admin',
      sede_id: SEDE_CENTRO.id,
      creado_en: '2026-03-01T00:00:00Z',
    };
    mocks.createEmployee.mockResolvedValue(created);
    const user = userEvent.setup();
    renderWithProviders(<Employees />);

    await screen.findAllByText(MECHANIC_USER.nombre_completo);
    await user.click(screen.getByRole('button', { name: /Nuevo Usuario/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Sofía Administración');
    await user.type(screen.getByLabelText('Correo Electrónico'), 'sofia@taller.com');
    await user.selectOptions(screen.getByLabelText('Rol'), 'admin');
    await user.type(screen.getByLabelText('Contraseña Temporal'), 'clave1234');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(mocks.createEmployee).toHaveBeenCalled());
    await screen.findByText(/Empleado creado/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
