// @vitest-environment jsdom
//
// The order screen had no test at all while it was a 2,000-line component —
// the exact reason it was hard to change safely. Now that the intake dialog
// lives in its own component and its own hook, this pins the seam between
// them: the board renders, the dialog opens with the pickers the screen
// loaded, and a field typed in the dialog reaches the form state.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  MECHANIC_USER,
  SEDE_CENTRO,
} from '../test/renderWithProviders';
import type { Customer, UserProfile, Vehicle, WorkOrder } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getWorkOrders: vi.fn(),
  getCustomers: vi.fn(),
  getVehicles: vi.fn(),
  getOperators: vi.fn(),
  getWorkOrderDetail: vi.fn(),
  createWorkOrder: vi.fn(),
  addLaborItem: vi.fn(),
  updateWorkOrderStatus: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

// jsdom has no canvas, and the real signature pad reaches into one on mount.
// The signature flow is not what these tests are about.
vi.mock('react-signature-canvas', () => ({
  default: () => <canvas data-testid="signature-pad" />,
}));

vi.mock('../services/supabaseService', () => {
  const workOrders = {
    getWorkOrders: mocks.getWorkOrders,
    getWorkOrderDetail: mocks.getWorkOrderDetail,
    createWorkOrder: mocks.createWorkOrder,
    addLaborItem: mocks.addLaborItem,
    updateWorkOrderStatus: mocks.updateWorkOrderStatus,
    uploadOrderPhotos: vi.fn(),
  };
  const customers = { getCustomers: mocks.getCustomers, createCustomer: vi.fn() };
  const vehicles = { getVehicles: mocks.getVehicles, createVehicle: vi.fn() };
  const users = { getOperators: mocks.getOperators };
  return {
    workOrdersService: workOrders,
    customersService: customers,
    vehiclesService: vehicles,
    usersService: users,
    supabaseService: { ...workOrders, ...customers, ...vehicles, ...users },
  };
});

const { default: WorkOrders } = await import('./WorkOrders');

const CUSTOMER: Customer = {
  id: 'cli-1',
  sede_id: SEDE_CENTRO.id,
  nombre: 'Marta Ruiz',
  telefono: '555-0140',
  email: 'marta@example.test',
  direccion: '12 Oak St',
  notas_crm: '',
  creado_en: '2026-08-01T00:00:00Z',
};

const VEHICLE: Vehicle = {
  id: 'veh-1',
  cliente_id: CUSTOMER.id,
  sede_id: SEDE_CENTRO.id,
  marca: 'Toyota',
  modelo: 'Corolla',
  anio: 2019,
  vin: '1HGCM82633A004352',
  placa: 'ABC1234',
  placa_estado: 'FL',
  color: 'Gris',
  creado_en: '2026-08-01T00:00:00Z',
};

const ORDER: WorkOrder = {
  id: 'ord-1',
  numero_orden: 'OT-2026-0042',
  sede_id: SEDE_CENTRO.id,
  cliente_id: CUSTOMER.id,
  vehiculo_id: VEHICLE.id,
  tipo_trabajo: 'mecanica',
  estatus: 'en_proceso',
  millas_ingreso: 45000,
  nivel_gasolina: '1/2',
  deposito_inicial: 0,
  inspeccion_360_notas: '',
  fecha_ingreso: '2026-09-01T00:00:00Z',
  fecha_estimada_entrega: '2026-09-10',
  porcentaje_avance: 40,
  total_labor: 0,
  total_repuestos: 0,
  total_general: 0,
  creado_por: ADMIN_USER.id,
  creado_en: '2026-09-01T00:00:00Z',
  cliente: CUSTOMER,
  vehiculo: VEHICLE,
  asignaciones: [],
};

const PAINTER: UserProfile = { ...MECHANIC_USER, id: 'user-pintor', rol: 'pintor', nombre_completo: 'Sara Vega' };

// What `getWorkOrderDetail` returns: the order plus the rows the detail view
// draws but the board never loads.
const DETAIL: WorkOrder = {
  ...ORDER,
  labor_items: [{ id: 'lab-1', orden_id: ORDER.id, descripcion: 'Cambio de aceite', costo: 120 }],
  repuestos: [
    {
      id: 'par-1',
      orden_id: ORDER.id,
      descripcion: 'Filtro de aceite',
      cantidad: 2,
      costo_unitario: 8,
      precio_venta_unitario: 15,
      subtotal: 30,
    },
  ],
  avances: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getWorkOrders.mockResolvedValue([ORDER]);
  mocks.getCustomers.mockResolvedValue([CUSTOMER]);
  mocks.getVehicles.mockResolvedValue([VEHICLE]);
  mocks.getOperators.mockResolvedValue([PAINTER]);
  mocks.getWorkOrderDetail.mockResolvedValue(DETAIL);
});

/** Opens the detail view of the single order on the board. */
async function openDetail(user: ReturnType<typeof userEvent.setup>) {
  // Wait for the board itself, not the page header — the header renders while
  // the query is still in flight, so keying off it raced the data.
  // An admin gets one combined table; a technician gets their own orders plus
  // a collapsed section for the rest of the sede's.
  await waitFor(() =>
    expect(
      document.querySelector('.orders-section-toggle') || document.querySelector('.table-actions')
    ).toBeTruthy()
  );

  // An order a technician is not assigned to lives behind that toggle.
  const others = screen.queryByRole('button', { name: /Otras/i });
  if (others) await user.click(others);

  await screen.findAllByText('OT-2026-0042');
  // The board draws the same order as a desktop row and a mobile card; the
  // row's eye button is the one this reaches for.
  await user.click(document.querySelector('.table-actions button') as HTMLElement);
  return screen.findByText(/Cambio de aceite/);
}

describe('WorkOrders', () => {
  it('lists the sede orders', async () => {
    renderWithProviders(<WorkOrders />);

    // The board renders each order twice — a desktop table row and a mobile
    // card — so both layouts are expected to carry it.
    expect(await screen.findAllByText('OT-2026-0042')).toHaveLength(2);
    expect(screen.getAllByText('Marta Ruiz').length).toBeGreaterThan(0);
    expect(mocks.getWorkOrders).toHaveBeenCalledWith(SEDE_CENTRO.id);
  });

  it('opens the intake dialog with the customers and operators it loaded', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');

    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));

    const dialog = (await screen.findByText('Nueva Orden', { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    expect(dialog).toBeTruthy();
    // The pickers come from the screen's own load, through the extracted modal.
    expect(within(dialog).getByRole('option', { name: 'Marta Ruiz' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Sara Vega/)).toBeInTheDocument();
  });

  // The seam between the screen's close handler and the hook's `isDirty`:
  // a half-filled intake must not vanish on a stray click.
  it('asks before discarding a half-filled intake, and stays open on cancel', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText('Nueva Orden', { selector: '.modal-title' })).closest('.modal') as HTMLElement;

    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');
    await user.click(within(dialog).getByRole('button', { name: /Cancelar/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/sin guardar/i));
    expect(screen.getByText('Nueva Orden', { selector: '.modal-title' })).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('closes without asking when nothing has been entered', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText('Nueva Orden', { selector: '.modal-title' })).closest('.modal') as HTMLElement;

    await user.click(within(dialog).getByRole('button', { name: /Cancelar/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText('Nueva Orden', { selector: '.modal-title' })).not.toBeInTheDocument()
    );

    confirmSpy.mockRestore();
  });

  it('does not re-query the board just because the screen re-renders', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    expect(mocks.getWorkOrders).toHaveBeenCalledTimes(1);

    // Opening the dialog re-renders the screen. The sede has not changed, so
    // the queries behind the board must not run again — the loader depends on
    // `sedeId` alone now, not on the language or on an auth-context identity.
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    await screen.findByText('Nueva Orden', { selector: '.modal-title' });

    expect(mocks.getWorkOrders).toHaveBeenCalledTimes(1);
    expect(mocks.getCustomers).toHaveBeenCalledTimes(1);
  });
});

// Submitting the intake dialog used to run a string of `if`s that built one
// message out of field labels, so a form with several problems reported the
// first one and never said which box it meant.
describe('WorkOrders — intake validation', () => {
  it('reports every missing field on the field itself, and sends nothing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText('Nueva Orden', { selector: '.modal-title' })).closest('.modal') as HTMLElement;

    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));

    // Both branches complain, not just whichever was checked first.
    expect(await within(dialog).findByText(/Selecciona un cliente/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Selecciona un veh[íi]culo/i)).toBeInTheDocument();
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  it('will not let a minus sign into the odometer field at all', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    await screen.findByText('Nueva Orden', { selector: '.modal-title' });

    // The first line of defence is the keyboard: `min={0}` does nothing on a
    // noValidate form, and complaining on submit still means the operator got
    // to type the wrong thing first.
    const miles = document.getElementById('order-miles-in') as HTMLInputElement;
    await user.type(miles, '-500');
    expect(miles.value).toBe('500');
  });

  it('still rejects a negative odometer reading that got past the keyboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText('Nueva Orden', { selector: '.modal-title' })).closest('.modal') as HTMLElement;

    // A paste or an autofill never fires the keydown guard, so the schema has
    // to catch it and say so — rather than the value being silently rewritten,
    // which would hide a wrong reading instead of correcting it.
    const miles = document.getElementById('order-miles-in') as HTMLInputElement;
    fireEvent.change(miles, { target: { value: '-500' } });
    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));

    expect(await within(dialog).findByText(/no pueden ser negativas/i)).toBeInTheDocument();
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  it('asks for the fields of a customer being created inline', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText('Nueva Orden', { selector: '.modal-title' })).closest('.modal') as HTMLElement;

    // The customer picker is the dialog's first select.
    await user.selectOptions(within(dialog).getAllByRole('combobox')[0], '__new__');
    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));

    expect(await within(dialog).findByText(/nombre del cliente es obligatorio/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/tel[ée]fono del cliente es obligatorio/i)).toBeInTheDocument();
    // The existing-customer rule must not fire on the branch being skipped.
    expect(within(dialog).queryByText(/Selecciona un cliente/i)).not.toBeInTheDocument();
  });
});

// The detail view used to be ~690 lines inside the page, with its handlers on
// top of that. It is now `useWorkOrderDetail` plus five presentational cards;
// these pin the seams between them.
describe('WorkOrders — order detail', () => {
  it('shows the labor and parts the board never loads', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(mocks.getWorkOrderDetail).toHaveBeenCalledWith(ORDER.id);
    expect(screen.getByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.getByText('Filtro de aceite')).toBeInTheDocument();
    // 2 × $15 sale price: the row subtotal and the column total. There is no
    // separate unit-cost column any more — a part is billed on at what it cost,
    // so the price is the only money figure the shop enters.
    expect(screen.getAllByText('$30.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('$8.00')).not.toBeInTheDocument();
  });

  it('re-reads the order after adding a labor line, because the DB recomputes totals', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);
    expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(1);

    const laborCard = screen.getByText('Cambio de aceite').closest('.card') as HTMLElement;
    await user.type(within(laborCard).getByPlaceholderText(/Descripción/i), 'Alineación');
    await user.type(within(laborCard).getByPlaceholderText('$'), '80');
    // The card's only non-icon button is the one that adds the row.
    await user.click(laborCard.querySelector('.btn-secondary') as HTMLElement);

    await waitFor(() =>
      expect(mocks.addLaborItem).toHaveBeenCalledWith(ORDER.id, { descripcion: 'Alineación', costo: 80 })
    );
    // `total_labor` is a trigger-maintained column, so the client cannot patch
    // it locally — the order has to be read back.
    await waitFor(() => expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(2));
  });

  it('tells a technician who is not assigned that the order is read-only', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(screen.getByText(/Solo puedes consultar esta orden/i)).toBeInTheDocument();
    // Editing controls are present but disabled rather than hidden.
    const laborCard = screen.getByText('Cambio de aceite').closest('.card') as HTMLElement;
    expect(laborCard.querySelector('.btn-secondary')).toBeDisabled();
  });

  it('confirms before marking an order delivered', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    await user.selectOptions(screen.getByDisplayValue('En Proceso'), 'entregado');

    expect(confirmSpy).toHaveBeenCalled();
    // Cancelled, so nothing was sent.
    expect(mocks.updateWorkOrderStatus).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
