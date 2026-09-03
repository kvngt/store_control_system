// @vitest-environment jsdom
//
// The "Nuevo Pago" dialog had the same defect as "Nuevo Empleado", found while
// tracing that one: a submit handler that returned silently on invalid input,
// and failures written to the page-level error box that this dialog's overlay
// covers. Nobody had reported it yet — payroll is used less often than staff
// management — so these tests exist to keep it from surfacing later.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  MECHANIC_USER,
} from '../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getPayroll: vi.fn(),
  getUsers: vi.fn(),
  createPayroll: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mocks.auth.current,
}));

vi.mock('../services/supabaseService', () => ({
  supabaseService: {
    getPayroll: mocks.getPayroll,
    getUsers: mocks.getUsers,
    createPayroll: mocks.createPayroll,
  },
}));

const { default: Payroll } = await import('./Payroll');

async function openDialog() {
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getPayroll.mockResolvedValue([]);
  mocks.getUsers.mockResolvedValue([MECHANIC_USER]);

  const user = userEvent.setup();
  renderWithProviders(<Payroll />);

  await user.click(await screen.findByRole('button', { name: /Nuevo Pago/i }));
  const title = await screen.findByText('Nuevo Pago', { selector: '.modal-title' });
  return { user, modal: title.closest('.modal') as HTMLElement };
}

/** Fills the dialog with a valid entry, then applies the given overrides. */
async function fillValidEntry(
  user: ReturnType<typeof userEvent.setup>,
  modal: HTMLElement,
  overrides: { start?: string; end?: string; salary?: string } = {}
) {
  const dates = within(modal).getAllByDisplayValue('') // date inputs start empty
    .filter((el) => el.getAttribute('type') === 'date');

  await user.selectOptions(within(modal).getByLabelText(/Empleado/i), MECHANIC_USER.id);
  await user.type(dates[0], overrides.start ?? '2026-01-01');
  await user.type(dates[1], overrides.end ?? '2026-01-15');

  const numbers = within(modal).getAllByRole('spinbutton');
  await user.clear(numbers[0]);
  await user.type(numbers[0], overrides.salary ?? '900');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Nuevo Pago dialog', () => {
  it('explains what is missing instead of doing nothing', async () => {
    const { user, modal } = await openDialog();

    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    expect(mocks.createPayroll).not.toHaveBeenCalled();
    const alert = await within(modal).findByRole('alert');
    expect(alert).toBeVisible();
    expect(alert.textContent).toMatch(/empleado|período|salario/i);
  });

  it('rejects a period that ends before it starts', async () => {
    const { user, modal } = await openDialog();
    await fillValidEntry(user, modal, { start: '2026-01-15', end: '2026-01-01' });

    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    expect(mocks.createPayroll).not.toHaveBeenCalled();
    expect((await within(modal).findByRole('alert')).textContent).toMatch(/período/i);
  });

  it('rejects a base salary of zero', async () => {
    const { user, modal } = await openDialog();
    await fillValidEntry(user, modal, { salary: '0' });

    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    expect(mocks.createPayroll).not.toHaveBeenCalled();
    expect((await within(modal).findByRole('alert')).textContent).toMatch(/salario/i);
  });

  it('surfaces a server error inside the dialog', async () => {
    const { user, modal } = await openDialog();
    mocks.createPayroll.mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: '42501' })
    );
    await fillValidEntry(user, modal);

    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => expect(mocks.createPayroll).toHaveBeenCalled());
    const alert = await within(modal).findByRole('alert');
    expect(alert).toBeVisible();
    expect(alert.textContent).toMatch(/no tienes permiso/i);
  });

  it('records a valid entry and confirms it', async () => {
    const { user, modal } = await openDialog();
    mocks.createPayroll.mockResolvedValue({ id: 'pay-1' });
    await fillValidEntry(user, modal);

    await user.click(within(modal).getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => expect(mocks.createPayroll).toHaveBeenCalled());
    expect(mocks.createPayroll).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_id: MECHANIC_USER.id,
        periodo_inicio: '2026-01-01',
        periodo_fin: '2026-01-15',
        salario_base: 900,
      })
    );
    expect(await screen.findByText(/Pago registrado correctamente/i)).toBeVisible();
  });
});
