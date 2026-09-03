// @vitest-environment jsdom
//
// Regression tests for the "Nuevo Empleado" dialog.
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

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getSedes: vi.fn(),
  getUsers: vi.fn(),
  createEmployee: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mocks.auth.current,
}));

vi.mock('../services/supabaseService', () => ({
  supabaseService: {
    getSedes: mocks.getSedes,
    getUsers: mocks.getUsers,
    createEmployee: mocks.createEmployee,
    // Unused by these tests, but Settings holds references to them.
    createSede: vi.fn(),
    updateSede: vi.fn(),
    deleteSede: vi.fn(),
    deleteEmployee: vi.fn(),
    moveUserToSede: vi.fn(),
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    uploadSedeLogo: vi.fn(),
    isEmailTaken: vi.fn().mockResolvedValue(false),
  },
}));

const { default: Settings } = await import('./Settings');

/** Opens Settings as an admin and clicks through to the employee dialog. */
async function openEmployeeDialog(sedes = [SEDE_CENTRO, SEDE_NORTE]) {
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getSedes.mockResolvedValue(sedes);
  mocks.getUsers.mockResolvedValue([ADMIN_USER]);

  const user = userEvent.setup();
  renderWithProviders(<Settings />);

  const openButton = await screen.findByRole('button', { name: /Nuevo Empleado/i });
  await user.click(openButton);

  const dialog = await screen.findByText('Nuevo Empleado', { selector: '.modal-title' });
  return { user, modal: dialog.closest('.modal') as HTMLElement };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Nuevo Empleado dialog', () => {
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
});
