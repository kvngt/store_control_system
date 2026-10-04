// @vitest-environment jsdom
//
// The order screen had no test at all while it was a 2,000-line component —
// the exact reason it was hard to change safely. Now that the intake dialog
// lives in its own component and its own hook, this pins the seam between
// them: the board renders, the dialog opens with the pickers the screen
// loaded, and a field typed in the dialog reaches the form state.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router-dom';
import { setViewportMatches } from '../test/viewport';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  MECHANIC_USER,
  SEDE_CENTRO,
  SEDE_NORTE,
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
  createCustomer: vi.fn(),
  createVehicle: vi.fn(),
  addLaborItem: vi.fn(),
  setLaborTechnician: vi.fn(),
  setAssignmentOrigin: vi.fn(),
  addAssignment: vi.fn(),
  getPaidCommissionKeys: vi.fn(),
  updateWorkOrderStatus: vi.fn(),
  updateWorkOrderProgress: vi.fn(),
  uploadSignature: vi.fn(),
  getBalance: vi.fn(),
  getEstimate: vi.fn(),
  getHistory: vi.fn(),
  reportFinding: vi.fn(),
  quoteFinding: vi.fn(),
  discardFinding: vi.fn(),
  uploadReceipt: vi.fn(),
  removeDeliveryReceipt: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

// El formulario de vehículo decodifica el VIN y sugiere modelos contra una API externa.
// Aquí no hay red, y no es lo que se está probando.
vi.mock('../lib/vin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/vin')>();
  return { ...actual, decodeVin: vi.fn().mockResolvedValue(null), fetchModelsForMake: vi.fn().mockResolvedValue([]) };
});

// jsdom no tiene canvas para comprimir. Cada prueba decide cuándo termina una compresión.
const compress = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../lib/media/image', () => ({ compressImage: compress.fn }));

// jsdom has no canvas, and the real signature pad reaches into one on mount.
// The signature flow is not what these tests are about.
vi.mock('react-signature-canvas', () => ({
  default: () => <canvas data-testid="signature-pad" />,
}));

// Lo que importa de la firma aquí es qué hace la pantalla después de guardarla.
vi.mock('../features/workOrders/SignatureCard', () => ({
  default: ({ onSave }: { onSave: (dataUrl: string) => Promise<void> }) => (
    <button type="button" onClick={() => void onSave('data:image/png;base64,AAAA')}>Guardar firma de prueba</button>
  ),
}));

vi.mock('../services/supabaseService', () => {
  const workOrders = {
    getWorkOrders: mocks.getWorkOrders,
    getWorkOrderDetail: mocks.getWorkOrderDetail,
    createWorkOrder: mocks.createWorkOrder,
    addLaborItem: mocks.addLaborItem,
    setLaborTechnician: mocks.setLaborTechnician,
    setLaborSpecialty: vi.fn(),
    setAssignmentOrigin: mocks.setAssignmentOrigin,
    addAssignment: mocks.addAssignment,
    getPaidCommissionKeys: mocks.getPaidCommissionKeys,
    updateWorkOrderStatus: mocks.updateWorkOrderStatus,
    updateWorkOrderProgress: mocks.updateWorkOrderProgress,
    uploadSignature: mocks.uploadSignature,
    uploadOrderPhotos: vi.fn(),
    getBalance: mocks.getBalance,
    deliver: vi.fn(),
    uploadReceipt: mocks.uploadReceipt,
    removeDeliveryReceipt: mocks.removeDeliveryReceipt,
    reportFinding: mocks.reportFinding,
    quoteFinding: mocks.quoteFinding,
    discardFinding: mocks.discardFinding,
  };
  const customers = { getCustomers: mocks.getCustomers, createCustomer: mocks.createCustomer };
  const vehicles = { getVehicles: mocks.getVehicles, createVehicle: mocks.createVehicle };
  const users = { getOperators: mocks.getOperators };
  const commissions = { getEstimate: mocks.getEstimate };
  return {
    commissionsService: commissions,
    workOrdersService: workOrders,
    customersService: customers,
    vehiclesService: vehicles,
    usersService: users,
    supabaseService: { ...workOrders, ...customers, ...vehicles, ...users },
  };
});

// El historial de la orden se pide al servicio de órdenes directo (no por la fachada).
vi.mock('../services/workOrders.service', () => ({ workOrdersService: { getHistory: mocks.getHistory } }));

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
  inspeccion_360_notas: '',
  fecha_ingreso: '2026-09-01T00:00:00Z',
  fecha_estimada_entrega: '2026-09-10',
  porcentaje_avance: 40,
  total_labor: 0,
  // El dinero viene del embed de `orden_montos`, que solo recibe un admin.
  montos: { total_repuestos: 0, total_general: 0, deposito_inicial: 0 },
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

// Lo que la base le devuelve a un técnico por la misma consulta: `montos` y
// `repuestos` vienen vacíos por RLS, y las piezas llegan sin precio por
// `repuestos_de_orden`. El fixture refleja eso y no la vista de admin con
// columnas escondidas, que es justo lo que la migración evita.
const TECH_DETAIL: WorkOrder = {
  ...ORDER,
  total_labor: 120,
  montos: null,
  labor_items: [{ id: 'lab-1', orden_id: ORDER.id, descripcion: 'Cambio de aceite', costo: 120 }],
  repuestos: [],
  repuestos_resumen: [{ id: 'par-1', descripcion: 'Filtro de aceite', cantidad: 2 }],
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
  mocks.getPaidCommissionKeys.mockResolvedValue([]);
});

/**
 * Opens the detail view of the single order on the board, on the given tab. Desde el 03/10/2026
 * el detalle va en pestañas en escritorio (el ancho del stub de matchMedia): cada prueba abre la
 * que contiene lo que revisa.
 */
async function openDetail(user: ReturnType<typeof userEvent.setup>, tab?: string) {
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
  // A este ancho (escritorio, el que fija el stub de matchMedia) el tablero
  // monta la tabla, así que el botón del ojo de la fila es el camino de entrada.
  await user.click(document.querySelector('.table-actions button') as HTMLElement);
  await screen.findByRole('tablist');
  if (tab) await user.click(screen.getByRole('tab', { name: new RegExp(`^${tab}`) }));
}

/** Abre el alta de una orden (el asistente de cuatro pasos, F4) y devuelve el diálogo. */
async function openIntake(user: ReturnType<typeof userEvent.setup>) {
  renderWithProviders(<WorkOrders />);
  await screen.findAllByText('OT-2026-0042');
  await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
  return (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
}

/** "Siguiente": valida el paso actual y, si está bien, abre el que sigue. */
const next = (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) =>
  user.click(within(dialog).getByRole('button', { name: /^Siguiente/ }));

/** El nombre del paso abierto, según la lista de pasos del encabezado. */
const currentStep = (dialog: HTMLElement) => dialog.querySelector('[aria-current="step"]')?.textContent ?? '';

/** Paso 1 con el cliente de siempre, y al paso 2. */
async function pickCustomer(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.selectOptions(document.getElementById('intake-customer') as HTMLSelectElement, CUSTOMER.id);
  await next(user, dialog);
  await waitFor(() => expect(currentStep(dialog)).toMatch(/Vehículo/));
}

/** Cliente y vehículo existentes, sin depósito: deja el asistente en el paso 4 (Trabajos). */
async function goToWorkStep(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await pickCustomer(user, dialog);
  await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, VEHICLE.id);
  await next(user, dialog);
  await waitFor(() => expect(currentStep(dialog)).toMatch(/Depósito/));
  await next(user, dialog);
  await waitFor(() => expect(currentStep(dialog)).toMatch(/Trabajos/));
}

describe('WorkOrders', () => {
  it('lists the sede orders', async () => {
    renderWithProviders(<WorkOrders />);

    // Una sola vez. El tablero emitía la fila de escritorio **y** la tarjeta
    // móvil y escondía una con CSS, así que esta aserción esperaba dos; ahora
    // `useMediaQuery` elige cuál se monta y sólo hay una en el DOM.
    expect(await screen.findAllByText('OT-2026-0042')).toHaveLength(1);
    expect(document.querySelector('.table-container')).toBeTruthy();
    expect(document.querySelector('.workorder-card-list')).toBeNull();
    expect(screen.getAllByText('Marta Ruiz').length).toBeGreaterThan(0);
    expect(mocks.getWorkOrders).toHaveBeenCalledWith(SEDE_CENTRO.id);
  });

  // La otra mitad de lo mismo: en un teléfono se monta la lista de tarjetas y
  // la tabla no llega al DOM. Antes no se podía comprobar, porque las dos
  // versiones estaban siempre presentes.
  it('draws cards instead of a table on a phone', async () => {
    setViewportMatches(true);
    renderWithProviders(<WorkOrders />);

    expect(await screen.findAllByText('OT-2026-0042')).toHaveLength(1);
    expect(document.querySelector('.workorder-card-list')).toBeTruthy();
    expect(document.querySelector('.table-container')).toBeNull();
  });

  it('opens the intake dialog with the customers and operators it loaded', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');

    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));

    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    expect(dialog).toBeTruthy();
    // The pickers come from the screen's own load, through the extracted modal: the
    // customers on step 1, the technicians in the job editor of step 4.
    expect(within(dialog).getByRole('option', { name: 'Marta Ruiz' })).toBeInTheDocument();
    await goToWorkStep(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: /Agregar trabajo/ }));
    expect(within(dialog).getByRole('option', { name: /Sara Vega/ })).toBeInTheDocument();
  });

  // The seam between the screen's close handler and the hook's `isDirty`:
  // a half-filled intake must not vanish on a stray click.
  it('asks before discarding a half-filled intake, and stays open on cancel', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;

    await pickCustomer(user, dialog);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');
    await user.click(within(dialog).getByRole('button', { name: /Cancelar/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/sin guardar/i));
    expect(screen.getByText(/^Nueva Orden/i, { selector: '.modal-title' })).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('closes without asking when nothing has been entered', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;

    await user.click(within(dialog).getByRole('button', { name: /Cancelar/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText(/^Nueva Orden/i, { selector: '.modal-title' })).not.toBeInTheDocument()
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
    await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' });

    expect(mocks.getWorkOrders).toHaveBeenCalledTimes(1);
    expect(mocks.getCustomers).toHaveBeenCalledTimes(1);
  });
});

// Submitting the intake dialog used to run a string of `if`s that built one
// message out of field labels, so a form with several problems reported the
// first one and never said which box it meant.
// Abrir una orden es recibir un vehículo y comprometer al taller: es de administración.
// Antes esta prueba abría el formulario como mecánico y comprobaba que no trajera dinero;
// ahora el formulario no se le ofrece. Quien lo impone es la base
// (`ordenes_trabajo_insert`); esconder el botón solo evita un error en la cara.
describe('WorkOrders — abrir una orden es de administración', () => {
  it('un mecánico no ve el botón de nueva orden', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    renderWithProviders(<WorkOrders />);
    await screen.findByRole('heading', { name: /Mis Órdenes de Trabajo/i });

    expect(screen.queryByRole('button', { name: /Nueva Orden/i })).not.toBeInTheDocument();
  });

  // Desde 20261007000000 la base solo le entrega sus órdenes, así que ya no hay una sección
  // "Otras órdenes" que se quedaría vacía, ni se descargan clientes y vehículos para un alta
  // que no puede hacer.
  it('un técnico ve sus órdenes en una sola lista, sin "Otras" ni catálogos', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');

    expect(screen.queryByRole('button', { name: /Otras/i })).not.toBeInTheDocument();
    expect(mocks.getCustomers).not.toHaveBeenCalled();
    expect(mocks.getVehicles).not.toHaveBeenCalled();
  });

  // Un aviso o un enlace viejos a una orden que ya no es suya: la base contesta "no existe"
  // (la RLS la esconde) y la pantalla volvía a la lista sin decir nada.
  it('abrir una orden que no es suya lo explica en vez de volver callado a la lista', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockRejectedValueOnce({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
    renderWithProviders(<WorkOrders />, { route: '/work-orders?open=ord-ajena' });

    expect(await screen.findByText(/no está entre las tuyas/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Mis Órdenes de Trabajo/i })).toBeInTheDocument();
  });

  // La negativa de arriba solo significa algo si el botón existe para alguien.
  it('un admin sí lo ve', async () => {
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');

    expect(screen.getByRole('button', { name: /Nueva Orden/i })).toBeInTheDocument();
  });
});

// Pedido del taller (octubre 2026): en el alta también fotos extra, videos, notas de voz y
// galería, como en la tarjeta de la orden ya creada. Antes solo se podía después de crearla.
// Desde F4 la inspección va en el paso 2 (Vehículo y recepción).
describe('WorkOrders — inspección 360 en el alta', () => {
  it('ofrece foto, video, nota de voz y galería antes de crear la orden', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await pickCustomer(user, dialog);

    for (const name of ['Foto', 'Video', 'Nota de voz', 'Galería']) {
      expect(within(dialog).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('no deja crear la orden mientras un archivo de la galería se procesa', async () => {
    let finish: (media: unknown) => void = () => {};
    compress.fn.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await pickCustomer(user, dialog);

    const gallery = dialog.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    fireEvent.change(gallery, { target: { files: [new File(['x'], 'golpe.jpg', { type: 'image/jpeg' })] } });

    // Seguir de paso la dejaría afuera, igual que crear la orden.
    const proceed = within(dialog).getByRole('button', { name: /Procesando/ });
    expect(proceed).toBeDisabled();

    finish({ tipo: 'foto', blob: new Blob(['x'], { type: 'image/jpeg' }), mime: 'image/jpeg', thumb: null, duracionSeg: null, ancho: 1, alto: 1 });

    // Ya preparada: queda en el borrador, cuenta en el encabezado y se puede seguir.
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Siguiente/ })).toBeEnabled());
    expect(dialog.querySelectorAll('.draft-media')).toHaveLength(1);
    expect(within(dialog).getByText(/0\/6\s*\+1/)).toBeInTheDocument();
  });
});

describe('WorkOrders — intake validation', () => {
  // "Siguiente" valida el paso que se deja y dice qué falta en el campo mismo, sin mandar nada.
  it('reports every missing field on the field itself, and sends nothing', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);

    await next(user, dialog);
    expect(await within(dialog).findByText(/Selecciona un cliente/i)).toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Cliente/);

    // Elegir apaga el aviso en el momento, sin esperar a otro "Siguiente".
    await user.selectOptions(document.getElementById('intake-customer') as HTMLSelectElement, CUSTOMER.id);
    await waitFor(() => expect(within(dialog).queryByText(/Selecciona un cliente/i)).not.toBeInTheDocument());

    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Vehículo/));
    await next(user, dialog);
    expect(await within(dialog).findByText(/Selecciona un veh[íi]culo/i)).toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Vehículo/);
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  it('will not let a minus sign into the odometer field at all', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await pickCustomer(user, dialog);

    // The first line of defence is the keyboard: `min={0}` does nothing on a
    // noValidate form, and complaining on "Siguiente" still means the operator got
    // to type the wrong thing first.
    const miles = document.getElementById('order-miles-in') as HTMLInputElement;
    await user.type(miles, '-500');
    expect(miles.value).toBe('500');
  });

  it('still rejects a negative odometer reading that got past the keyboard', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await pickCustomer(user, dialog);
    await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, VEHICLE.id);

    // A paste or an autofill never fires the keydown guard, so the schema has
    // to catch it and say so — rather than the value being silently rewritten,
    // which would hide a wrong reading instead of correcting it.
    const miles = document.getElementById('order-miles-in') as HTMLInputElement;
    fireEvent.change(miles, { target: { value: '-500' } });
    await next(user, dialog);

    expect(await within(dialog).findByText(/no pueden ser negativas/i)).toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Vehículo/);
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  it('asks for the fields of a customer being created inline', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);

    await user.selectOptions(document.getElementById('intake-customer') as HTMLSelectElement, '__new__');
    await next(user, dialog);

    expect(await within(dialog).findByText(/nombre del cliente es obligatorio/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/tel[ée]fono del cliente es obligatorio/i)).toBeInTheDocument();
    // The existing-customer rule must not fire on the branch being skipped.
    expect(within(dialog).queryByText(/Selecciona un cliente/i)).not.toBeInTheDocument();
  });
});

// Lo que se guarda antes que la orden no se deshace — un cliente y un vehículo sin orden
// son filas válidas, se crean igual desde sus propias pantallas — pero hay que decirlo. Sin
// el aviso, quien lee "no se pudo crear la orden" da por hecho que no quedó nada y vuelve a
// dar de alta el mismo vehículo.
describe('WorkOrders — el alta que falla a medio camino lo dice', () => {
  const abrirConVehiculoNuevo = async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await pickCustomer(user, dialog);

    await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, '__new__');
    await user.type(document.getElementById('vehicle-brand') as HTMLInputElement, 'Toyota');
    await user.type(document.getElementById('vehicle-model') as HTMLInputElement, 'Camry');
    const anio = document.getElementById('vehicle-year') as HTMLSelectElement;
    await user.selectOptions(anio, anio.options[1].value);
    // El VIN es obligatorio para un vehículo nuevo (workOrderForm.schema: 17 caracteres).
    await user.type(document.getElementById('vehicle-vin') as HTMLInputElement, '1HGCM82633A004352');

    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Depósito/));
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Trabajos/));
    return { user, dialog };
  };

  it('avisa que el vehículo ya quedó guardado cuando la orden falla', async () => {
    mocks.createVehicle.mockResolvedValue({ ...VEHICLE, id: 'veh-nuevo' });
    mocks.createWorkOrder.mockRejectedValue(new Error('Se cayó la red'));

    const { user, dialog } = await abrirConVehiculoNuevo();
    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));
    expect(await within(dialog).findByText(/Se cayó la red/)).toBeInTheDocument();
    expect(within(dialog).getByText(/El vehículo nuevo ya quedó guardado/)).toBeInTheDocument();
  });

  // El botón "Agregar" de los repuestos vivía dentro de un `<label>`, así que su nombre
  // accesible arrastraba el texto de la etiqueta: un lector de pantalla leía
  // "Descripción de Repuestos Agregar" y este `getByRole` no lo encontraba. La mano de obra
  // usa el editor de tareas (F3), con su propio botón verde.
  it('los botones de agregar línea se llaman por lo que agregan', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    expect(within(dialog).getAllByRole('button', { name: /^Agregar$/i })).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: /^Agregar trabajo$/i })).toBeInTheDocument();
  });

  it('no inventa el aviso cuando no se creó nada', async () => {
    mocks.createWorkOrder.mockRejectedValue(new Error('Se cayó la red'));
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));

    expect(await within(dialog).findByText(/Se cayó la red/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/ya quedó guardado/)).not.toBeInTheDocument();
  });
});

// El alta en cuatro pasos (F4, reunión con el taller del 03/10/2026): lo que no se ve en un
// paso no puede perderse ni mandarse distinto de lo que se eligió.
describe('WorkOrders — el alta en cuatro pasos', () => {
  beforeEach(() => {
    mocks.createWorkOrder.mockResolvedValue({ ...ORDER, id: 'ord-nueva', numero_orden: 'OT-2026-0043' });
  });

  /** Paso 3 con un depósito: monto, método y (opcional) el archivo del comprobante. */
  async function fillDeposit(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    amount: string,
    method: string,
    receipt?: File
  ) {
    await pickCustomer(user, dialog);
    await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, VEHICLE.id);
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Depósito/));
    const deposit = document.getElementById('order-deposit') as HTMLInputElement;
    await user.clear(deposit);
    await user.type(deposit, amount);
    await user.selectOptions(document.getElementById('payment-method') as HTMLSelectElement, method);
    if (receipt) await user.upload(document.getElementById('payment-receipt') as HTMLInputElement, receipt);
  }

  it('Enter dentro de un paso avanza al siguiente; no crea la orden', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await pickCustomer(user, dialog);
    await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, VEHICLE.id);
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Depósito/));

    // El depósito es el único campo de texto del paso 3: un Enter ahí enviaba el formulario.
    await user.type(document.getElementById('order-deposit') as HTMLInputElement, '{Enter}');

    await waitFor(() => expect(currentStep(dialog)).toMatch(/Trabajos/));
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  it('manda cada tarea con su tipo, su técnico y fuera del reparto heredado', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    // Una tarea de pintura en una orden de mecánica: antes se guardaba como mecánica.
    await user.click(within(dialog).getByRole('button', { name: /Agregar trabajo/ }));
    await user.selectOptions(document.getElementById('create-order-type') as HTMLSelectElement, 'pintura');
    await user.type(document.getElementById('create-order-description') as HTMLInputElement, 'Pintar puerta');
    await user.type(document.getElementById('create-order-price') as HTMLInputElement, '350');
    await user.selectOptions(document.getElementById('create-order-technician') as HTMLSelectElement, PAINTER.id);
    await user.click(document.getElementById('create-order-submit') as HTMLElement);
    expect(within(dialog).getByText('Pintar puerta')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(1));
    const input = mocks.createWorkOrder.mock.calls[0][0];
    expect(input.tipo_trabajo).toBe('mecanica');
    expect(input.labor_items).toEqual([
      { descripcion: 'Pintar puerta', costo: 350, especialidad: 'pintura', asignado_a: PAINTER.id, reparto_heredado: false },
    ]);
    expect(input.asignaciones).toEqual([{ usuario_id: PAINTER.id, tipo_tarea: 'pintura' }]);
  });

  it('no crea la orden con un trabajo escrito sin agregar', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: /Agregar trabajo/ }));
    await user.type(document.getElementById('create-order-description') as HTMLInputElement, 'Frenos');
    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));

    expect(await within(dialog).findByText(/trabajo escrito sin agregar/i)).toBeInTheDocument();
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  it('un doble clic en "Siguiente" del paso 3 no crea la orden al caer en "Crear"', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    // El segundo clic de un doble clic llega con detail = 2.
    fireEvent.click(within(dialog).getByRole('button', { name: /^Crear$/i }), { detail: 2 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  it('vuelve a un paso ya visto sin perder lo escrito', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await pickCustomer(user, dialog);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');
    await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, VEHICLE.id);
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Depósito/));

    await user.click(within(dialog).getByRole('button', { name: /Vehículo y recepción/ }));
    expect(currentStep(dialog)).toMatch(/Vehículo/);
    expect((document.getElementById('order-miles-in') as HTMLInputElement).value).toBe('45000');
    // Los pasos de adelante que nunca se abrieron no se pueden saltar.
    expect(within(dialog).queryByRole('button', { name: /^Trabajos$/ })).not.toBeInTheDocument();
  });

  it('pide el método si hay depósito, y manda el método, el número y el comprobante', async () => {
    mocks.uploadReceipt.mockResolvedValue(`${SEDE_CENTRO.id}/comprobante-alta-1.jpg`);
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await pickCustomer(user, dialog);
    await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, VEHICLE.id);
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Depósito/));

    const deposit = document.getElementById('order-deposit') as HTMLInputElement;
    await user.clear(deposit);
    await user.type(deposit, '200');
    await next(user, dialog);
    expect(currentStep(dialog)).toMatch(/Depósito/);
    expect(dialog.querySelector('[role="alert"]')).toBeTruthy();

    await user.selectOptions(document.getElementById('payment-method') as HTMLSelectElement, 'cheque');
    await user.type(document.getElementById('payment-check') as HTMLInputElement, '1042');
    await user.upload(
      document.getElementById('payment-receipt') as HTMLInputElement,
      new File(['x'], 'cheque.jpg', { type: 'image/jpeg' })
    );
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Trabajos/));
    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(1));
    expect(mocks.uploadReceipt).toHaveBeenCalledWith(SEDE_CENTRO.id, 'alta', expect.any(File));
    expect(mocks.createWorkOrder.mock.calls[0][0]).toMatchObject({
      deposito_inicial: 200,
      deposito_metodo: 'cheque',
      deposito_cheque: '1042',
      deposito_comprobante: `${SEDE_CENTRO.id}/comprobante-alta-1.jpg`,
    });
  });

  it('si la base rechaza la orden borra el comprobante; si se cae la red lo deja y no lo sube otra vez', async () => {
    mocks.uploadReceipt.mockResolvedValue(`${SEDE_CENTRO.id}/comprobante-alta-1.jpg`);
    mocks.createWorkOrder.mockRejectedValueOnce({ code: '22023', message: 'Elige cómo dejó el depósito el cliente' });
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await fillDeposit(user, dialog, '50', 'efectivo', new File(['x'], 'recibo.jpg', { type: 'image/jpeg' }));
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Trabajos/));

    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));
    await waitFor(() => expect(mocks.removeDeliveryReceipt).toHaveBeenCalledWith(`${SEDE_CENTRO.id}/comprobante-alta-1.jpg`));

    // Segundo intento: se sube de nuevo (el anterior se borró) y ahora falla la red.
    mocks.createWorkOrder.mockRejectedValueOnce({ code: '', message: 'TypeError: Failed to fetch' });
    mocks.removeDeliveryReceipt.mockClear();
    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));
    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(2));
    expect(mocks.uploadReceipt).toHaveBeenCalledTimes(2);
    expect(mocks.removeDeliveryReceipt).not.toHaveBeenCalled();

    // Tercer intento: usa el comprobante que quedó, sin subirlo otra vez.
    await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));
    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(3));
    expect(mocks.uploadReceipt).toHaveBeenCalledTimes(2);
    expect(mocks.createWorkOrder.mock.calls[2][0].deposito_comprobante).toBe(`${SEDE_CENTRO.id}/comprobante-alta-1.jpg`);
  });
});

// The detail view used to be ~690 lines inside the page, with its handlers on
// top of that. It is now `useWorkOrderDetail` plus five presentational cards;
// these pin the seams between them.
// F7 (reunión con el taller del 03/10/2026): Órdenes y Kanban son dos vistas de la misma
// página, con la misma búsqueda. La vista se recuerda y `/kanban` redirige a `?vista=tablero`.
describe('WorkOrders — lista y tablero en la misma página', () => {
  // La vista elegida se guarda en el navegador: sin limpiar, las pruebas de después abrirían
  // el tablero.
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('cambia al tablero, lo recuerda, y la búsqueda filtra también el tablero', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Tablero' }));
    expect(screen.getByRole('button', { name: 'Tablero' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.kanban-board')).toBeTruthy();
    expect(document.querySelector('.table-container')).toBeNull();
    expect(screen.getByRole('button', { name: 'Abrir la orden OT-2026-0042' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Buscar...' }), 'zzz');
    expect(screen.queryByRole('button', { name: 'Abrir la orden OT-2026-0042' })).not.toBeInTheDocument();
    first.unmount();

    // Otra visita a Órdenes abre la vista que se usó la última vez.
    renderWithProviders(<WorkOrders />);
    expect(await screen.findByRole('button', { name: 'Abrir la orden OT-2026-0042' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tablero' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('?vista=tablero abre el tablero, y el número de la tarjeta abre la orden', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />, { route: '/work-orders?vista=tablero' });

    await user.click(await screen.findByRole('button', { name: 'Abrir la orden OT-2026-0042' }));
    await screen.findByRole('tablist');
    expect(mocks.getWorkOrderDetail).toHaveBeenCalledWith(ORDER.id);
  });
});

describe('WorkOrders — order detail', () => {
  it('shows the labor and parts the board never loads', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Trabajos');

    expect(mocks.getWorkOrderDetail).toHaveBeenCalledWith(ORDER.id);
    expect(screen.getByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.getByText('Filtro de aceite')).toBeInTheDocument();
    // 2 × $15 sale price: the row subtotal and the column total. There is no
    // separate unit-cost column any more — a part is billed on at what it cost,
    // so the price is the only money figure the shop enters.
    expect(screen.getAllByText('$30.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('$8.00')).not.toBeInTheDocument();
  });

  it('re-reads the order after the customer signs, because the signature authorizes the quote', async () => {
    mocks.uploadSignature.mockResolvedValue({ ruta: 'sede-centro/ord-1/firma-1.png', fecha: '2026-09-14T15:00:00Z' });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);
    expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Guardar firma de prueba/ }));

    await waitFor(() => expect(mocks.uploadSignature).toHaveBeenCalled());
    // Las líneas pasan de "sin autorizar" a autorizadas y cambian los totales: eso
    // lo hace un trigger, así que la orden se vuelve a leer.
    await waitFor(() => expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(2));
  });

  it('only offers to assign staff from the order own sede', async () => {
    const otherSedeTech: UserProfile = { ...MECHANIC_USER, id: 'user-norte', nombre_completo: 'Pedro Norte', sede_id: SEDE_NORTE.id };
    mocks.getOperators.mockResolvedValue([PAINTER, otherSedeTech]);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(await screen.findByRole('option', { name: /Sara Vega/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Pedro Norte/ })).not.toBeInTheDocument();
  });

  it('re-reads the order after adding a labor line, because the DB recomputes totals', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Trabajos');
    expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(1);

    const laborCard = screen.getByText('Cambio de aceite').closest('.card') as HTMLElement;
    // El botón verde "Agregar trabajo" abre el editor de tareas (03/10/2026: el "+" gris no se
    // entendía; desde 20261010000006 cada tarea lleva tipo y técnico).
    await user.click(within(laborCard).getByRole('button', { name: 'Agregar trabajo' }));
    await user.type(within(laborCard).getByLabelText('Descripción'), 'Alineación');
    await user.type(within(laborCard).getByLabelText('Precio'), '80');
    await user.click(within(laborCard).getByRole('button', { name: 'Agregar' }));

    // Orden de mecánica sin tareas con técnico: tipo mecánica, sin técnico.
    await waitFor(() =>
      expect(mocks.addLaborItem).toHaveBeenCalledWith(ORDER.id, {
        descripcion: 'Alineación',
        costo: 80,
        especialidad: 'mecanica',
        asignado_a: null,
      })
    );
    // `total_labor` is a trigger-maintained column, so the client cannot patch
    // it locally — the order has to be read back.
    await waitFor(() => expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(2));
  });

  it('tells a technician who is not assigned that the order is read-only', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue(TECH_DETAIL);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(screen.getByText(/Solo puedes consultar esta orden/i)).toBeInTheDocument();
    // Cotizar es de administración: la fila de alta de labor no existe para un
    // técnico, y la tarjeta dice por qué en vez de mostrar un botón muerto.
    const laborCard = screen.getByText('Cambio de aceite').closest('.card') as HTMLElement;
    expect(within(laborCard).queryByRole('button', { name: /^Agregar/ })).toBeNull();
    expect(within(laborCard).getByText(/la cotiza administración/i)).toBeInTheDocument();

    // Y no puede tomarla. Asignarse dispara `sync_order_commissions`, así que unirse a una
    // orden ajena era repartirse la mano de obra de quien la está trabajando.
    expect(screen.queryByRole('button', { name: /Unirme a la orden/i })).not.toBeInTheDocument();
  });

  it('shows an admin the totals and the report buttons', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Cobro');

    // $120 de labor + $30 de repuestos, sin depósito.
    expect(screen.getAllByText('$150.00').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Descargar PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar reporte/i })).toBeInTheDocument();
  });

  it('shows a technician which parts the order needs, without a single price', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...TECH_DETAIL,
      asignaciones: [{ id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' }],
    });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Orden');

    const partsCard = screen.getByText('Filtro de aceite').closest('.card') as HTMLElement;
    expect(within(partsCard).getByText('× 2')).toBeInTheDocument();
    expect(within(partsCard).queryByText(/\$/)).toBeNull();
    // Ni totales, ni depósito, ni forma de mandar el reporte.
    expect(screen.queryByText('$150.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Depósito$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar PDF/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar reporte/i })).not.toBeInTheDocument();
  });

  it('shows an assigned technician the commission the labor would pay them, and how', async () => {
    const sede = { ...SEDE_CENTRO, comision_porcentaje: 35 };
    mocks.auth.current = { ...authValue(MECHANIC_USER, sede), allSedes: [sede, SEDE_NORTE] };
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...TECH_DETAIL,
      total_labor: 1000,
      asignaciones: [
        { id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' },
        { id: 'asg-2', orden_id: ORDER.id, usuario_id: PAINTER.id, tipo_tarea: 'pintura', estatus_tarea: 'pendiente' },
      ],
    });
    // Desde 20261009000000 la cuenta la hace la base, por especialidad: la pintora no comparte
    // la bolsa de mecánica, así que $1,000 al 35 % son del mecánico solo.
    mocks.getEstimate.mockResolvedValue({
      bolsas: [{ especialidad: 'mecanica', base: 1000, tecnicos: 1 }],
      reparto: [{ usuario_id: MECHANIC_USER.id, especialidad: 'mecanica', esquema: 'comision', porcentaje: 35, tecnicos: 1, monto: 350, heredado: true, tareas: 0 }],
      mi_total: 350,
      tareas: [],
      sin_asignar: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    const card = (await screen.findByText(/Tu comisión estimada/i)).closest('.card') as HTMLElement;
    expect(within(card).getByText('$350.00')).toBeInTheDocument();
    expect(within(card).getByText(/Mecánica: mano de obra \$1,000\.00 × 35% ÷ 1/)).toBeInTheDocument();
    expect(mocks.getEstimate).toHaveBeenCalledWith(ORDER.id);
  });

  it('asks how the customer paid before marking an order delivered', async () => {
    mocks.getBalance.mockResolvedValue({ total: 1200, cobrado: 1200, saldo: 0 });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    await user.selectOptions(screen.getByDisplayValue('En Proceso'), 'entregado');

    expect(await screen.findByRole('dialog', { name: /Entregar/ })).toBeInTheDocument();
    expect(await screen.findByText('No hay nada pendiente de cobro.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Cancelled, so nothing was sent and the selector shows the real status again.
    expect(mocks.updateWorkOrderStatus).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('En Proceso')).toBeInTheDocument();
  });
});

// Reporte del taller (octubre 2026): una orden quedó Finalizada en 80 % y después en 0 %,
// con el control ya bloqueado. El control deslizante guardaba en cada paso del arrastre sin
// esperar a nada, y la casilla vacía se guardaba como 0; una de esas escrituras llegó a la
// base después de "Finalizado". La base ya lo corrige (14_avance_orden_cerrada.test.sql);
// esto fija que la pantalla no mande la ráfaga ni pinte un número que la base no guardó.
describe('WorkOrders — avance de la orden', () => {
  const slider = () => document.querySelector('input[type="range"]') as HTMLInputElement;
  // La casilla de número que va con el control, no la de costo de la mano de obra.
  const box = () => slider().parentElement!.querySelector('input[type="number"]') as HTMLInputElement;

  beforeEach(() => {
    mocks.updateWorkOrderProgress.mockResolvedValue(undefined);
  });

  it('arrastrar no guarda nada; soltar guarda una vez, el valor final', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    fireEvent.change(slider(), { target: { value: '50' } });
    fireEvent.change(slider(), { target: { value: '65' } });
    fireEvent.change(slider(), { target: { value: '80' } });
    expect(mocks.updateWorkOrderProgress).not.toHaveBeenCalled();
    // La casilla acompaña al arrastre aunque todavía no se haya guardado.
    expect(box().value).toBe('80');

    fireEvent.pointerUp(slider());

    await waitFor(() => expect(mocks.updateWorkOrderProgress).toHaveBeenCalledTimes(1));
    expect(mocks.updateWorkOrderProgress).toHaveBeenCalledWith(ORDER.id, 80);
  });

  it('soltar sin haber movido nada no escribe', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    fireEvent.pointerUp(slider());
    fireEvent.blur(slider());

    expect(mocks.updateWorkOrderProgress).not.toHaveBeenCalled();
  });

  it('borrar la casilla y salir no guarda 0: vuelve a lo guardado', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    const input = box();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(mocks.updateWorkOrderProgress).not.toHaveBeenCalled();
    expect(input.value).toBe('40');
  });

  it('después de guardar muestra lo que guardó la base, no lo que pidió', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);
    expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(1);

    // Mientras tanto la orden se finalizó desde otra pantalla: la base dejó el avance en 100.
    mocks.getWorkOrderDetail.mockResolvedValue({ ...DETAIL, estatus: 'finalizado', porcentaje_avance: 100 });

    fireEvent.change(slider(), { target: { value: '80' } });
    fireEvent.pointerUp(slider());

    await waitFor(() => expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(slider().value).toBe('100'));
    expect(box().value).toBe('100');
    expect(box()).toBeDisabled();
    expect(slider()).toBeDisabled();
    expect(screen.getByText(/la orden ya está cerrada/)).toBeInTheDocument();
  });
});

// Reunión con el taller (03/10/2026): en escritorio había que recorrer hasta doce tarjetas. El
// detalle va en pestañas, cada rol con las suyas.
describe('WorkOrders — pestañas del detalle', () => {
  it('un admin ve cinco pestañas y abre en Resumen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.replace(/\d+$/, ''))).toEqual([
      'Resumen', 'Trabajos', 'Fotos y avances', 'Cobro y cliente', 'Historial',
    ]);
    expect(screen.getByRole('tab', { name: /^Resumen/ })).toHaveAttribute('aria-selected', 'true');
    // La mano de obra está en Trabajos, todavía sin montar.
    expect(screen.queryByText('Cambio de aceite')).not.toBeInTheDocument();
  });

  it('un técnico ve tres y abre en sus tareas', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue(TECH_DETAIL);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: /^Tareas/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Cambio de aceite')).toBeInTheDocument();
  });

  it('Trabajos avisa cuando hay algo sin autorizar', async () => {
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...DETAIL,
      labor_items: [{ id: 'lab-1', orden_id: ORDER.id, descripcion: 'Cambio de aceite', costo: 120, estado: 'borrador' }],
    });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(within(screen.getByRole('tab', { name: /^Trabajos/ })).getByRole('img', { name: /sin autorizar/ })).toBeInTheDocument();
  });

  it('un enlace con la pestaña abre la orden en esa pestaña', async () => {
    renderWithProviders(<WorkOrders />, { route: `/work-orders?open=${ORDER.id}&tab=trabajos` });

    expect(await screen.findByRole('tab', { name: /^Trabajos/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Cambio de aceite')).toBeInTheDocument();
  });

  it('el historial se pide solo al abrir su pestaña', async () => {
    mocks.getHistory.mockResolvedValue([
      {
        id: 1, ocurrido_en: '2026-10-03T19:23:00Z', actor_nombre: 'Rosa Mecánica', origen: 'app', entidad: 'orden',
        entidad_id: ORDER.id, accion: 'cambiar', resumen: ORDER.numero_orden,
        cambios: { porcentaje_avance: { antes: 80, despues: 0 } },
      },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);
    expect(mocks.getHistory).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: /^Historial/ }));

    expect(await screen.findByText('Rosa Mecánica')).toBeInTheDocument();
    expect(screen.getByText('Avance: 80 % → 0 %')).toBeInTheDocument();
    expect(mocks.getHistory).toHaveBeenCalledWith(ORDER.id, 51);
  });

  it('las flechas del teclado cambian de pestaña', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    screen.getByRole('tab', { name: /^Resumen/ }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: /^Trabajos/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Trabajos/ })).toHaveFocus();
  });
});

// Comisión por tarea (reunión con el taller, 03/10/2026; 20261010000006): cada línea de mano de
// obra tiene su técnico, que es quien cobra su comisión. Lo asigna administración.
describe('WorkOrders — tareas con técnico', () => {
  const TASK_DETAIL: WorkOrder = {
    ...DETAIL,
    firma_ruta: 'sede-centro/ord-1/firma.png',
    labor_items: [
      { id: 'lab-1', orden_id: ORDER.id, descripcion: 'Cambio de aceite', costo: 120, estado: 'aprobado', especialidad: 'mecanica', asignado_a: null, reparto_heredado: false },
    ],
  };
  const MECHANIC_OF_SEDE: UserProfile = { ...MECHANIC_USER, nombre_completo: 'Rosa Mecánica' };

  beforeEach(() => {
    mocks.getWorkOrderDetail.mockResolvedValue(TASK_DETAIL);
    mocks.getOperators.mockResolvedValue([PAINTER, MECHANIC_OF_SEDE]);
    mocks.setLaborTechnician.mockResolvedValue(undefined);
  });

  it('el técnico se elige entre el personal de la sede de la orden, aunque arriba se haya elegido otra', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Trabajos');

    await waitFor(() => expect(mocks.getOperators).toHaveBeenCalledWith(ORDER.sede_id));
    const row = screen.getByText('Cambio de aceite').closest('tr') as HTMLElement;
    expect(await within(row).findByRole('option', { name: /Rosa Mecánica/ })).toBeInTheDocument();
  });

  it('asignar el técnico de una tarea la guarda y relee la orden', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Trabajos');
    expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(1);

    const row = screen.getByText('Cambio de aceite').closest('tr') as HTMLElement;
    await within(row).findByRole('option', { name: /Rosa Mecánica/ });
    await user.selectOptions(within(row).getByRole('combobox', { name: 'Técnico' }), MECHANIC_OF_SEDE.id);

    await waitFor(() => expect(mocks.setLaborTechnician).toHaveBeenCalledWith('lab-1', MECHANIC_OF_SEDE.id));
    // Quien recibe la tarea entra a la orden y cambia la comisión: lo hace la base.
    await waitFor(() => expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Técnico actualizado')).toBeInTheDocument();
  });

  it('si la base no deja cambiar el técnico, muestra su razón en español', async () => {
    mocks.setLaborTechnician.mockRejectedValue({
      code: '42501',
      message: 'La comisión de esta tarea ya se pagó. Para cambiarle el técnico o la especialidad, deshaz ese pago en Comisiones.',
    });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Trabajos');

    const row = screen.getByText('Cambio de aceite').closest('tr') as HTMLElement;
    await within(row).findByRole('option', { name: /Rosa Mecánica/ });
    await user.selectOptions(within(row).getByRole('combobox', { name: 'Técnico' }), MECHANIC_OF_SEDE.id);

    expect(await screen.findByText(/ya se pagó\. Para cambiarle el técnico/)).toBeInTheDocument();
  });

  it('una tarea con la comisión pagada no ofrece cambiarle el técnico', async () => {
    mocks.getPaidCommissionKeys.mockResolvedValue([{ id: 'c-1', labor_id: 'lab-1', especialidad: 'mecanica' }]);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Trabajos');

    const row = screen.getByText('Cambio de aceite').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(row).getByRole('combobox', { name: 'Técnico' })).toBeDisabled());
    expect(mocks.getPaidCommissionKeys).toHaveBeenCalledWith(ORDER.id);
  });

  it('el Resumen avisa de las tareas sin técnico y lleva a Trabajos', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(screen.getByRole('note')).toHaveTextContent('1 tarea(s) sin técnico: nadie cobrará su comisión');
    expect(within(screen.getByRole('tab', { name: /^Trabajos/ })).getByRole('img')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver trabajos' }));
    expect(screen.getByRole('tab', { name: /^Trabajos/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('agregar una tarea a una orden firmada avisa que falta la autorización', async () => {
    mocks.addLaborItem.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Trabajos');

    const laborCard = screen.getByText('Cambio de aceite').closest('.card') as HTMLElement;
    await user.click(within(laborCard).getByRole('button', { name: 'Agregar trabajo' }));
    await user.type(within(laborCard).getByLabelText('Descripción'), 'Pulido');
    await user.click(within(laborCard).getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByText('Mano de obra agregada')).toBeInTheDocument();
    expect(screen.getByText(/Falta la autorización del cliente/)).toBeInTheDocument();
  });

  it('entregar con una tarea autorizada sin técnico lo avisa en el diálogo', async () => {
    mocks.getBalance.mockResolvedValue({ total: 120, cobrado: 120, saldo: 0 });
    // El diálogo lo lee de la base (`comisiones_estimadas`), no de las líneas que cargó el detalle.
    mocks.getEstimate.mockResolvedValue({
      bolsas: [], reparto: [], mi_total: 0, tareas: [],
      sin_asignar: [{ labor_id: 'lab-1', descripcion: 'Cambio de aceite', especialidad: 'mecanica', costo: 120, estado: 'aprobado' }],
    });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    await user.selectOptions(screen.getByDisplayValue('En Proceso'), 'entregado');

    const dialog = await screen.findByRole('dialog', { name: /Entregar/ });
    expect(within(dialog).getByRole('note')).toHaveTextContent('nadie cobrará su comisión');
    expect(within(dialog).getByRole('note')).toHaveTextContent('Cambio de aceite');
  });

  it('el técnico ve quién tiene cada tarea y no puede marcar la de otro', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...TECH_DETAIL,
      asignaciones: [{ id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' }],
      labor_items: [
        { id: 'lab-1', orden_id: ORDER.id, descripcion: 'Cambio de aceite', costo: 120, estado: 'aprobado', especialidad: 'mecanica', asignado_a: MECHANIC_USER.id, reparto_heredado: false, tecnico: { id: MECHANIC_USER.id, nombre_completo: MECHANIC_USER.nombre_completo, rol: 'mecanico' } },
        { id: 'lab-2', orden_id: ORDER.id, descripcion: 'Pintar defensa', costo: 400, estado: 'aprobado', especialidad: 'pintura', asignado_a: PAINTER.id, reparto_heredado: false, tecnico: { id: PAINTER.id, nombre_completo: PAINTER.nombre_completo, rol: 'pintor' } },
      ],
    });
    mocks.getEstimate.mockResolvedValue({ bolsas: [], reparto: [], mi_total: 0, tareas: [], sin_asignar: [] });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    // Desde F5 lo suyo va en tarjetas ("Mis tareas") y lo de los demás en una tabla de solo
    // lectura debajo.
    const mine = screen.getByText('Tarea: Cambio de aceite').closest('.task-card') as HTMLElement;
    const theirs = screen.getByText('Pintar defensa').closest('tr') as HTMLElement;
    expect(within(theirs).getByText('Sara Vega')).toBeInTheDocument();
    expect(within(mine).getByRole('button', { name: /Realizado/ })).toBeInTheDocument();
    expect(within(theirs).queryByRole('button')).toBeNull();
    // Ni selectores: asignar es de administración.
    expect(within(mine).queryByRole('combobox')).toBeNull();
    expect(within(theirs).queryByRole('combobox')).toBeNull();
  });

  // Quién entra al reparto por especialidad de los trabajos anteriores lo decide el origen de la
  // asignación (20261010000006). La tarjeta lo dice, y administración lo cambia sin quitar a nadie
  // de la orden (a quien tiene tareas no se le puede quitar).
  describe('el reparto heredado en la tarjeta de técnicos', () => {
    const HEREDADA = { id: 'lab-h', orden_id: ORDER.id, descripcion: 'Frenos (antes)', costo: 300, estado: 'aprobado' as const, especialidad: 'mecanica' as const, asignado_a: null, reparto_heredado: true };
    const porTarea = { id: 'asg-t', orden_id: ORDER.id, usuario_id: MECHANIC_OF_SEDE.id, tipo_tarea: 'mecanica' as const, estatus_tarea: 'pendiente' as const, origen: 'tarea' as const, usuario: MECHANIC_OF_SEDE };
    const aMano = { id: 'asg-m', orden_id: ORDER.id, usuario_id: PAINTER.id, tipo_tarea: 'pintura' as const, estatus_tarea: 'pendiente' as const, origen: 'manual' as const, usuario: PAINTER };

    beforeEach(() => {
      mocks.getWorkOrderDetail.mockResolvedValue({
        ...TASK_DETAIL,
        labor_items: [...(TASK_DETAIL.labor_items ?? []), HEREDADA],
        asignaciones: [porTarea, aMano],
      });
      mocks.setAssignmentOrigin.mockResolvedValue(undefined);
    });

    it('distingue a quien entró por una tarea y lo suma al reparto', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkOrders />);
      await openDetail(user);

      const card = screen.getByText('Rosa Mecánica').closest('.card') as HTMLElement;
      expect(within(card).getByText('Por tarea')).toBeInTheDocument();
      expect(within(card).getByText('En el reparto')).toBeInTheDocument();

      await user.click(within(card).getByRole('button', { name: 'Sumar al reparto' }));
      await waitFor(() => expect(mocks.setAssignmentOrigin).toHaveBeenCalledWith('asg-t', 'manual'));
    });

    it('saca del reparto a alguien sin quitarlo de la orden', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkOrders />);
      await openDetail(user);

      const card = screen.getByText('Sara Vega').closest('.card') as HTMLElement;
      await user.click(within(card).getByRole('button', { name: 'Sacar del reparto' }));
      await waitFor(() => expect(mocks.setAssignmentOrigin).toHaveBeenCalledWith('asg-m', 'tarea'));
    });

    it('con el reparto de esa especialidad ya pagado no ofrece cambiarlo', async () => {
      mocks.getPaidCommissionKeys.mockResolvedValue([{ id: 'c-1', labor_id: null, especialidad: 'mecanica' }]);
      const user = userEvent.setup();
      renderWithProviders(<WorkOrders />);
      await openDetail(user);

      const card = screen.getByText('Rosa Mecánica').closest('.card') as HTMLElement;
      await waitFor(() => expect(within(card).getByRole('button', { name: 'Sumar al reparto' })).toBeDisabled());
    });

    it('agregar a mano a quien ya está por una tarea lo mete al reparto en vez de duplicarlo', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WorkOrders />);
      await openDetail(user);

      const card = screen.getByText('Rosa Mecánica').closest('.card') as HTMLElement;
      const picker = within(card).getByRole('combobox');
      await within(picker).findByRole('option', { name: /Rosa Mecánica/ });
      // Quien ya está a mano en la orden no se vuelve a ofrecer.
      expect(within(picker).queryByRole('option', { name: /Sara Vega/ })).toBeNull();
      await user.selectOptions(picker, MECHANIC_OF_SEDE.id);
      await user.click(within(card).getByRole('button', { name: /Agregar/ }));

      await waitFor(() => expect(mocks.setAssignmentOrigin).toHaveBeenCalledWith('asg-t', 'manual'));
      expect(mocks.addAssignment).not.toHaveBeenCalled();
    });
  });

  // En el teléfono las secciones siguen montadas (solo se esconden). Abrir otra orden que ya
  // estaba en caché, desde un aviso, no desmontaba el detalle: el editor de tareas seguía abierto
  // con lo escrito y el técnico de la orden anterior.
  it('en el teléfono, abrir otra orden empieza el editor de tareas de cero', async () => {
    setViewportMatches(true);
    const OTRA: WorkOrder = { ...TASK_DETAIL, id: 'ord-2', numero_orden: 'OT-2026-0099', labor_items: [] };
    mocks.getWorkOrderDetail.mockImplementation(async (id: string) => (id === 'ord-2' ? OTRA : TASK_DETAIL));
    function IrA() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate('/?open=ord-1')}>abrir la 42</button>
          <button type="button" onClick={() => navigate('/?open=ord-2')}>abrir la 99</button>
        </>
      );
    }
    const user = userEvent.setup();
    renderWithProviders(<><WorkOrders /><IrA /></>, { route: '/?open=ord-2' });
    await screen.findByText(/OT-2026-0099/);
    // La 42 se abre después, así que la 99 queda en caché: volver a ella no pasa por la lista.
    await user.click(screen.getByRole('button', { name: 'abrir la 42' }));
    await screen.findByText(/OT-2026-0042/);

    await user.click(screen.getByRole('button', { name: /^Mano de obra/ }));
    await user.click(screen.getByRole('button', { name: 'Agregar trabajo' }));
    await user.type(screen.getByLabelText('Descripción'), 'Pulido');

    await user.click(screen.getByRole('button', { name: 'abrir la 99' }));
    await screen.findByText(/OT-2026-0099/);

    expect(screen.queryByDisplayValue('Pulido')).toBeNull();
    expect(screen.queryByLabelText('Descripción')).toBeNull();
  });
});

// F6: el técnico reporta trabajo adicional y administración lo cotiza o lo descarta.
describe('WorkOrders — trabajo adicional reportado (F6)', () => {
  const HALLAZGO = {
    id: 'hal-1',
    orden_id: ORDER.id,
    sede_id: SEDE_CENTRO.id,
    reportado_por: MECHANIC_USER.id,
    descripcion: 'Pastillas traseras gastadas',
    estado: 'pendiente' as const,
    en_reporte: false,
    texto_cliente: null,
    resuelto_por: null,
    resuelto_en: null,
    presupuesto_id: null,
    avance_id: 'av-h1',
    creado_en: '2026-10-04T15:00:00Z',
  };
  const ADMIN_VIEW: WorkOrder = {
    ...DETAIL,
    estatus: 'espera_autorizacion',
    motivo_autorizacion: 'Pastillas traseras gastadas',
    asignaciones: [{ id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente', usuario: MECHANIC_USER }],
    hallazgos: [HALLAZGO],
  };

  it('administración lo ve en Resumen y al cotizar precarga la tarea en Trabajos', async () => {
    mocks.getWorkOrderDetail.mockResolvedValue(ADMIN_VIEW);
    mocks.quoteFinding.mockResolvedValue('Pastillas traseras gastadas');
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    const card = screen.getByRole('region', { name: 'El taller reportó trabajo adicional' });
    expect(within(card).getByText('Pastillas traseras gastadas')).toBeInTheDocument();
    expect(within(card).getByText(new RegExp(MECHANIC_USER.nombre_completo))).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: /Cotizar al cliente/ }));

    expect(mocks.quoteFinding).toHaveBeenCalledWith('hal-1');
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Trabajos/ })).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByDisplayValue('Pastillas traseras gastadas')).toBeInTheDocument();
  });

  it('al descartar, el admin decide si va al reporte y con qué texto', async () => {
    mocks.getWorkOrderDetail.mockResolvedValue(ADMIN_VIEW);
    mocks.discardFinding.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    await user.click(screen.getByRole('button', { name: /Descartar…/ }));
    const dialog = screen.getByRole('dialog', { name: 'Descartar trabajo adicional' });
    const text = within(dialog).getByRole('textbox');
    // Arranca con lo que escribió el técnico, para no empezar de cero.
    expect(text).toHaveValue('Pastillas traseras gastadas');

    await user.click(within(dialog).getByRole('checkbox', { name: /Mostrarlo en el reporte del cliente/ }));
    await user.clear(text);
    expect(within(dialog).getByRole('button', { name: 'Descartar' })).toBeDisabled();

    await user.type(text, 'Las pastillas traseras tienen poca vida.');
    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }));

    expect(mocks.discardFinding).toHaveBeenCalledWith('hal-1', true, 'Las pastillas traseras tienen poca vida.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('el técnico reporta desde Tareas y el estado ya no le ofrece la pausa', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...TECH_DETAIL,
      asignaciones: [{ id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' }],
      hallazgos: [],
    });
    mocks.getEstimate.mockResolvedValue({ bolsas: [], reparto: [], mi_total: 0, tareas: [], sin_asignar: [] });
    mocks.reportFinding.mockResolvedValue({ hallazgo_id: 'hal-2', avance_id: 'av-2' });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    const status = screen.getAllByRole('combobox').find((el) => (el as HTMLSelectElement).value === 'en_proceso') as HTMLSelectElement;
    expect(Array.from(status.options).map((o) => o.value)).not.toContain('espera_autorizacion');

    await user.click(screen.getByRole('button', { name: /Reportar trabajo adicional/ }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar trabajo adicional' });
    const confirm = within(dialog).getByRole('button', { name: 'Reportar y pausar la orden' });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox'), 'Fuga en la bomba de agua');
    await user.click(confirm);

    expect(mocks.reportFinding).toHaveBeenCalledWith(ORDER.id, 'Fuga en la bomba de agua');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
