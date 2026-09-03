// @vitest-environment jsdom
//
// Vehicles bought at auction arrive with no plate. Before this the plate was
// required, so the only way to register one was to invent a placeholder
// ("SIN PLACA", "N/A"), which then showed up in search results and printed on
// the work order as if it were a real plate.
//
// What matters here is that the no-plate path stores NULL — not an empty
// string, not a placeholder — so the rest of the app can tell "no plate" from
// "not filled in".

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  SEDE_CENTRO,
} from '../test/renderWithProviders';
import type { Customer, Vehicle } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getVehicles: vi.fn(),
  getCustomers: vi.fn(),
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mocks.auth.current,
}));

vi.mock('../services/supabaseService', () => ({
  supabaseService: {
    getVehicles: mocks.getVehicles,
    getCustomers: mocks.getCustomers,
    createVehicle: mocks.createVehicle,
    updateVehicle: mocks.updateVehicle,
    deleteVehicle: vi.fn(),
    createCustomer: vi.fn(),
  },
}));

// The VIN decoder reaches out to the NHTSA API on input; keep the test offline
// and deterministic by stubbing only the network call, not the validators.
vi.mock('../lib/vin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/vin')>();
  return {
    ...actual,
    decodeVin: vi.fn().mockResolvedValue(null),
    fetchModelsForMake: vi.fn().mockResolvedValue([]),
  };
});

const { default: Vehicles } = await import('./Vehicles');

const CUSTOMER: Customer = {
  id: 'cli-1',
  sede_id: SEDE_CENTRO.id,
  nombre: 'Marta Ruiz',
  telefono: '555-0170',
  email: 'marta@ejemplo.test',
  direccion: '10 Oak St',
  notas_crm: '',
  creado_en: '2026-01-01T00:00:00Z',
};

const PLATED_VEHICLE: Vehicle = {
  id: 'veh-1',
  cliente_id: CUSTOMER.id,
  sede_id: SEDE_CENTRO.id,
  marca: 'Toyota',
  modelo: 'Camry',
  anio: 2019,
  vin: '4T1B11HK5KU123456',
  placa: 'ABC1234',
  placa_estado: 'TX',
  color: 'Blanco',
  creado_en: '2026-01-01T00:00:00Z',
};

const AUCTION_VEHICLE: Vehicle = {
  ...PLATED_VEHICLE,
  id: 'veh-2',
  marca: 'Ford',
  modelo: 'F-150',
  vin: '1FTFW1ET5DFC12345',
  placa: null,
  placa_estado: null,
};

async function openNewVehicleForm(list: Vehicle[] = []) {
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getVehicles.mockResolvedValue(list);
  mocks.getCustomers.mockResolvedValue([CUSTOMER]);

  const user = userEvent.setup();
  const { container } = renderWithProviders(<Vehicles />);

  await user.click(await screen.findByRole('button', { name: /Nuevo Veh/i }));
  const modal = (await screen.findByLabelText(/Sin placa/i)).closest('.modal') as HTMLElement;
  const field = (id: string) => container.querySelector<HTMLElement>('#' + id)!;
  return { user, modal, field };
}

/** Fills everything except the plate, which is what each test varies. */
async function fillVehicleBasics(
  user: ReturnType<typeof userEvent.setup>,
  field: (id: string) => HTMLElement,
  vin: string
) {
  await user.type(field('vehicle-vin'), vin);
  await user.type(field('vehicle-brand'), 'Ford');
  await user.type(field('vehicle-model'), 'F-150');
  await user.selectOptions(field('vehicle-year'), '2019');
  // CustomerPicker: open it, then pick the only customer on file.
  await user.click(field('vehicle-owner-search'));
  await user.click(await screen.findByText(CUSTOMER.nombre));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Vehicle without a plate', () => {
  it('stores null rather than a placeholder string', async () => {
    const { user, modal, field } = await openNewVehicleForm();
    mocks.createVehicle.mockResolvedValue({ ...AUCTION_VEHICLE });

    await user.click(within(modal).getByLabelText(/Sin placa/i));
    await fillVehicleBasics(user, field, AUCTION_VEHICLE.vin);
    await user.click(field('vehicle-save'));

    await waitFor(() => expect(mocks.createVehicle).toHaveBeenCalled());
    const payload = mocks.createVehicle.mock.calls[0][0];
    // Not '' and not 'SIN PLACA': the column is nullable precisely so the app
    // can distinguish "has no plate" from "nobody typed one yet".
    expect(payload.placa).toBeNull();
    expect(payload.placa_estado).toBeNull();
  });

  it('disables the plate fields while the box is checked', async () => {
    const { user, modal } = await openNewVehicleForm();

    const plate = within(modal).getByLabelText(/^Placa$/i);

    expect(plate).toBeEnabled();

    await user.click(within(modal).getByLabelText(/Sin placa/i));
    expect(plate).toBeDisabled();
    expect(within(modal).getByLabelText(/Estado de la placa/i)).toBeDisabled();
  });

  it('still requires a plate when the box is not checked', async () => {
    const { user, modal, field } = await openNewVehicleForm();

    await fillVehicleBasics(user, field, PLATED_VEHICLE.vin);
    await user.click(field('vehicle-save'));

    expect(mocks.createVehicle).not.toHaveBeenCalled();
    expect(within(modal).getByText(/Ingresa el número de placa/i)).toBeVisible();
  });

  it('labels an existing plateless vehicle instead of showing a blank cell', async () => {
    mocks.auth.current = authValue(ADMIN_USER);
    mocks.getVehicles.mockResolvedValue([AUCTION_VEHICLE]);
    mocks.getCustomers.mockResolvedValue([CUSTOMER]);

    renderWithProviders(<Vehicles />);

    expect(await screen.findByText('Ford F-150')).toBeVisible();
    expect(screen.getByText('Sin placa')).toBeVisible();
  });

  it('reopens a plateless vehicle with the box already checked', async () => {
    mocks.auth.current = authValue(ADMIN_USER);
    mocks.getVehicles.mockResolvedValue([AUCTION_VEHICLE]);
    mocks.getCustomers.mockResolvedValue([CUSTOMER]);

    const user = userEvent.setup();
    renderWithProviders(<Vehicles />);

    await screen.findByText('Ford F-150');
    await user.click(within(screen.getByRole('row', { name: /Ford F-150/ })).getAllByRole('button')[0]);

    expect(await screen.findByLabelText(/Sin placa/i)).toBeChecked();
  });
});
