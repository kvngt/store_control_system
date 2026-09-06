// @vitest-environment jsdom
//
// Regression tests for the user-administration dialog.
//
// Reported from the shop: adding an employee did nothing — the Create button
// wouldn't assign them to any sede and gave no explanation. The dialog had two
// separate ways to fail in total silence, and both are pinned down here:
//
//   1. handleCreateEmployee returned early on any empty required field, with
//      no message. The `required` attributes on the inputs are decorative:
//      they aren't inside a <form> and the button is a plain onClick, so the
//      browser never validates them.
//   2. Every failure was written to the page-level `error` state, which renders
//      at the top of the Settings page — underneath the fixed, full-screen
//      modal overlay (z-index 400). A real server error was invisible.
//
// Note the contrast with the rest of Settings, which reports through
// showToast() at z-index 500 and therefore does surface above the modal.
//
// Since then the dialog has moved out of the Talleres card into its own
// Usuarios section (nobody could find it where it was), and grown an edit mode.
// The failure modes above are properties of the dialog, not of where it lives,
// so the tests move with it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  SEDE_CENTRO,
  SEDE_NORTE,
} from '../test/renderWithProviders';
import type { UserProfile } from '../types/database';

const MECHANIC: UserProfile = {
  id: 'user-mecanico',
  nombre_completo: 'Luis Mejia',
  rol: 'mecanico',
  sede_id: SEDE_CENTRO.id,
  telefono: '555-0100',
  email: 'luis@restorify.test',
  creado_en: '2026-01-01T00:00:00Z',
};

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getSedes: vi.fn(),
  getUsers: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({
  useAuth: () => mocks.auth.current,
}));

vi.mock('../services/supabaseService', () => {
  const sedes = {
    getSedes: mocks.getSedes,
    // Unused by these tests, but Settings holds references to them.
    createSede: vi.fn(),
    updateSede: vi.fn(),
    deleteSede: vi.fn(),
    uploadSedeLogo: vi.fn(),
  };
  const users = {
    getUsers: mocks.getUsers,
    createEmployee: mocks.createEmployee,
    updateEmployee: mocks.updateEmployee,
    deleteEmployee: vi.fn(),
    moveUserToSede: vi.fn(),
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    isEmailTaken: vi.fn().mockResolvedValue(false),
  };
  return { sedesService: sedes, usersService: users, supabaseService: { ...sedes, ...users } };
});

const { default: Settings } = await import('./Settings');

/** Opens Settings as an admin and clicks through to the new-user dialog. */
async function openEmployeeDialog(sedes = [SEDE_CENTRO, SEDE_NORTE], users = [ADMIN_USER]) {
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getSedes.mockResolvedValue(sedes);
  mocks.getUsers.mockResolvedValue(users);

  const user = userEvent.setup();
  renderWithProviders(<Settings />);

  const openButton = await screen.findByRole('button', { name: /Nuevo Usuario/i });
  await user.click(openButton);

  const dialog = await screen.findByText('Nuevo Usuario', { selector: '.modal-title' });
  return { user, modal: dialog.closest('.modal') as HTMLElement };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('User administration dialog', () => {
  it('explains what is missing instead of doing nothing when a field is blank', async () => {
    const { user, modal } = await openEmployeeDialog();

    // Everything blank except the sede, which is preselected.
    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    expect(mocks.createEmployee).not.toHaveBeenCalled();
    // The point of the test: the reason has to be visible inside the dialog,
    // not written to a container the overlay covers.
    const alert = await within(modal).findByRole('alert');
    expect(alert).toBeVisible();
    expect(alert.textContent).toMatch(/completa|obligatorio/i);
  });

  it('surfaces a server error inside the dialog', async () => {
    const { user, modal } = await openEmployeeDialog();
    mocks.createEmployee.mockRejectedValue(
      new Error('A user with this email address has already been registered')
    );

    await user.type(within(modal).getByLabelText(/^Nombre$/i), 'Carlos Vega');
    await user.type(within(modal).getByLabelText(/Correo Electrónico/i), 'carlos@restorify.test');
    await user.type(within(modal).getByLabelText(/Contraseña Temporal/i), 'temporal123');
    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => expect(mocks.createEmployee).toHaveBeenCalled());

    const alert = await within(modal).findByRole('alert');
    expect(alert).toBeVisible();
    expect(alert).toHaveTextContent(/already been registered/i);
  });

  it('sends the selected sede with the new employee', async () => {
    const { user, modal } = await openEmployeeDialog();
    mocks.createEmployee.mockResolvedValue({ id: 'new-user' });

    await user.type(within(modal).getByLabelText(/^Nombre$/i), 'Carlos Vega');
    await user.type(within(modal).getByLabelText(/Correo Electrónico/i), 'carlos@restorify.test');
    await user.type(within(modal).getByLabelText(/Contraseña Temporal/i), 'temporal123');
    await user.selectOptions(within(modal).getByLabelText(/Sedes \/ Talleres/i), SEDE_NORTE.id);
    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => expect(mocks.createEmployee).toHaveBeenCalled());
    expect(mocks.createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre_completo: 'Carlos Vega',
        email: 'carlos@restorify.test',
        rol: 'mecanico',
        sede_id: SEDE_NORTE.id,
      })
    );
  });

  it('says why the employee cannot be created when no sede loaded', async () => {
    // getSedes() failing (or simply returning nothing) leaves the dropdown
    // with only the placeholder, and the old code answered every click with
    // silence. The admin needs to be told the sede list is the problem.
    const { user, modal } = await openEmployeeDialog([]);

    await user.type(within(modal).getByLabelText(/^Nombre$/i), 'Carlos Vega');
    await user.type(within(modal).getByLabelText(/Correo Electrónico/i), 'carlos@restorify.test');
    await user.type(within(modal).getByLabelText(/Contraseña Temporal/i), 'temporal123');
    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    expect(mocks.createEmployee).not.toHaveBeenCalled();
    const alert = await within(modal).findByRole('alert');
    expect(alert.textContent).toMatch(/sede|taller/i);
  });

  it('rejects a password the edge function would reject anyway', async () => {
    // create-employee enforces >= 6 characters server-side. Catching it here
    // saves a round trip and, more importantly, says so out loud.
    const { user, modal } = await openEmployeeDialog();

    await user.type(within(modal).getByLabelText(/^Nombre$/i), 'Carlos Vega');
    await user.type(within(modal).getByLabelText(/Correo Electrónico/i), 'carlos@restorify.test');
    await user.type(within(modal).getByLabelText(/Contraseña Temporal/i), '123');
    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    expect(mocks.createEmployee).not.toHaveBeenCalled();
    const alert = await within(modal).findByRole('alert');
    expect(alert.textContent).toMatch(/6/);
  });

  it('confirms out loud when the employee is created', async () => {
    const { user, modal } = await openEmployeeDialog();
    mocks.createEmployee.mockResolvedValue({ id: 'new-user' });

    await user.type(within(modal).getByLabelText(/^Nombre$/i), 'Carlos Vega');
    await user.type(within(modal).getByLabelText(/Correo Electrónico/i), 'carlos@restorify.test');
    await user.type(within(modal).getByLabelText(/Contraseña Temporal/i), 'temporal123');
    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    // Toasts sit at z-index 500, above the modal overlay — unlike the
    // page-level error box this dialog used to write into.
    expect(await screen.findByText(/Empleado creado correctamente/i)).toBeVisible();
  });
  // ----- editing, which did not exist at all before -------------------------
  // Reported from the shop: once a user had been created there was no way to
  // change anything about them. A mistyped email meant deleting the person and
  // starting over — which the delete path refuses anyway once they have work
  // assigned, so the account was simply stuck wrong.
  it('opens an existing user with their current details filled in', async () => {
    mocks.auth.current = authValue(ADMIN_USER);
    mocks.getSedes.mockResolvedValue([SEDE_CENTRO, SEDE_NORTE]);
    mocks.getUsers.mockResolvedValue([ADMIN_USER, MECHANIC]);

    const user = userEvent.setup();
    renderWithProviders(<Settings />);

    await screen.findByText(MECHANIC.nombre_completo);
    const row = screen.getByText(MECHANIC.nombre_completo).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /Editar usuario/i }));

    const dialog = (await screen.findByText('Editar usuario', { selector: '.modal-title' }))
      .closest('.modal') as HTMLElement;

    expect(within(dialog).getByLabelText(/^Nombre$/i)).toHaveValue(MECHANIC.nombre_completo);
    expect(within(dialog).getByLabelText(/Correo Electrónico/i)).toHaveValue(MECHANIC.email);
  });

  it('leaves the password alone when the field is left blank', async () => {
    mocks.auth.current = authValue(ADMIN_USER);
    mocks.getSedes.mockResolvedValue([SEDE_CENTRO, SEDE_NORTE]);
    mocks.getUsers.mockResolvedValue([ADMIN_USER, MECHANIC]);
    mocks.updateEmployee.mockResolvedValue({ ...MECHANIC, nombre_completo: 'Luis Mejía' });

    const user = userEvent.setup();
    renderWithProviders(<Settings />);

    await screen.findByText(MECHANIC.nombre_completo);
    const row = screen.getByText(MECHANIC.nombre_completo).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /Editar usuario/i }));
    const dialog = (await screen.findByText('Editar usuario', { selector: '.modal-title' }))
      .closest('.modal') as HTMLElement;

    const nameInput = within(dialog).getByLabelText(/^Nombre$/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Luis Mejía');
    await user.click(within(dialog).getByRole('button', { name: /^Guardar$/i }));

    await waitFor(() => expect(mocks.updateEmployee).toHaveBeenCalled());
    const payload = mocks.updateEmployee.mock.calls[0][0];
    expect(payload.nombre_completo).toBe('Luis Mejía');
    // The key must be absent, not empty: saving a name change has to not reset
    // somebody's password as a side effect.
    expect(payload).not.toHaveProperty('password');
  });
});
