// @vitest-environment jsdom
//
// The order screen had no test at all while it was a 2,000-line component —
// the exact reason it was hard to change safely. Now that the intake dialog
// lives in its own component and its own hook, this pins the seam between
// them: the board renders, the dialog opens with the pickers the screen
// loaded, and a field typed in the dialog reaches the form state.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderWithProviders, SEDE_CENTRO } from '../test/renderWithProviders';
import {
  CUSTOMER,
  ORDER,
  PAINTER,
  VEHICLE,
  crear,
  currentStep,
  goToWorkStep,
  next,
  openIntakeDialog,
  pickCustomer,
  resetBaseMocks,
} from './workOrdersTestKit';

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
  getPaidCommissionKeys: vi.fn(),
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

// Al terminar el alta, la página abre el detalle de la orden creada, cuya pestaña Resumen monta la firma.
vi.mock('../features/workOrders/SignatureCard', () => ({
  default: ({ onSave }: { onSave: (dataUrl: string) => Promise<void> }) => (
    <button type="button" onClick={() => void onSave('data:image/png;base64,AAAA')}>Guardar firma de prueba</button>
  ),
}));

vi.mock('../services/workOrders.service', () => ({
  workOrdersService: {
    getWorkOrders: mocks.getWorkOrders,
    getWorkOrderDetail: mocks.getWorkOrderDetail,
    createWorkOrder: mocks.createWorkOrder,
    getPaidCommissionKeys: mocks.getPaidCommissionKeys,
    uploadReceipt: mocks.uploadReceipt,
    removeDeliveryReceipt: mocks.removeDeliveryReceipt,
  },
}));
vi.mock('../services/customers.service', () => ({
  customersService: { getCustomers: mocks.getCustomers, createCustomer: mocks.createCustomer },
}));
vi.mock('../services/vehicles.service', () => ({
  vehiclesService: { getVehicles: mocks.getVehicles, createVehicle: mocks.createVehicle },
}));
vi.mock('../services/users.service', () => ({
  usersService: { getOperators: mocks.getOperators },
}));
vi.mock('../services/commissions.service', () => ({
  commissionsService: { getEstimate: vi.fn().mockResolvedValue({ sin_asignar: [] }) },
}));
vi.mock('../services/parking.service', () => ({
  parkingService: {
    getConfig: vi.fn().mockResolvedValue({ habilitado: false }),
    getOrderParking: vi.fn().mockResolvedValue({ monto: 0, dias_cobrados: 0, estado: 'inactivo' }),
  },
}));

const { default: WorkOrders } = await import('./WorkOrders');
const { default: Sidebar } = await import('../components/layout/Sidebar');

function LocationEcho() {
  const location = useLocation();
  return <span data-testid="current-path">{location.pathname}</span>;
}

const openIntake = (user: ReturnType<typeof userEvent.setup>) => openIntakeDialog(user, <WorkOrders />);

beforeEach(() => {
  resetBaseMocks(mocks);
});

describe('WorkOrders', () => {
  it('opens the intake dialog with the customers and operators it loaded', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');

    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));

    // El modal se carga con import() diferido: en una máquina lenta pasa del segundo que espera findBy.
    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' }, { timeout: 10000 })).closest('.modal') as HTMLElement;
    expect(dialog).toBeTruthy();
    // The pickers come from the screen's own load, through the extracted modal: the
    // customers on step 1 (buscador), the technicians in the job editor of step 4.
    await user.click(document.getElementById('intake-customer-search') as HTMLInputElement);
    expect(within(dialog).getByRole('option', { name: /Marta Ruiz/ })).toBeInTheDocument();
    await goToWorkStep(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: /Agregar trabajo/ }));
    expect(within(dialog).getByRole('option', { name: /Sara Vega/ })).toBeInTheDocument();
  });

  // The seam between the screen's close handler and the hook's `isDirty`:
  // a half-filled intake must not vanish on a stray click.
  it('asks before discarding a half-filled intake, and stays open on «Seguir editando»', async () => {
    const user = userEvent.setup();

    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;

    await pickCustomer(user, dialog);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');
    await user.click(within(dialog).getByRole('button', { name: /Cancelar/i }));

    const pregunta = await screen.findByRole('alertdialog');
    expect(within(pregunta).getByText('¿Salir de la orden?')).toBeInTheDocument();
    await user.click(within(pregunta).getByRole('button', { name: 'Seguir editando' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText(/^Nueva Orden/i, { selector: '.modal-title' })).toBeInTheDocument();
    expect((document.getElementById('order-miles-in') as HTMLInputElement).value).toBe('45000');
  });

  // Reportado en el taller: en Android, «atrás» sacaba de la pantalla y la orden se perdía.
  it('el botón «atrás» no pierde la orden: pregunta, y «Seguir editando» la deja como estaba', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    await pickCustomer(user, dialog);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');

    act(() => { window.history.back(); });

    const pregunta = await screen.findByRole('alertdialog');
    expect(within(pregunta).getByRole('button', { name: 'Guardar borrador y salir' })).toBeInTheDocument();
    expect(screen.getByText(/^Nueva Orden/i, { selector: '.modal-title' })).toBeInTheDocument();

    await user.click(within(pregunta).getByRole('button', { name: 'Seguir editando' }));
    // Otro «atrás» vuelve a preguntar.
    act(() => { window.history.back(); });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  // Revisión del 04/11/2026: el primer «atrás» abría la pregunta sin volver a armar la trampa, y el
  // segundo (el gesto natural para cerrarla) salía de la pantalla y perdía las fotos y el comprobante.
  it('un segundo «atrás» con la pregunta abierta la cierra y el alta sigue en pantalla', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    await pickCustomer(user, dialog);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');

    act(() => { window.history.back(); });
    await screen.findByRole('alertdialog');
    act(() => { window.history.back(); });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText(/^Nueva Orden/i, { selector: '.modal-title' })).toBeInTheDocument();
    expect((document.getElementById('order-miles-in') as HTMLInputElement).value).toBe('45000');
    // Y la trampa sigue armada: el tercero vuelve a preguntar.
    expect(window.history.state).toMatchObject({ restorifyTrap: expect.any(Number) });
    act(() => { window.history.back(); });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('«atrás» con el formulario vacío cierra sin preguntar', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' });

    act(() => { window.history.back(); });

    await waitFor(() =>
      expect(screen.queryByText(/^Nueva Orden/i, { selector: '.modal-title' })).not.toBeInTheDocument()
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('«Guardar borrador y salir» lo guarda, y al abrir «Nueva orden» se ofrece retomarlo', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    let dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    await pickCustomer(user, dialog);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');

    await user.click(within(dialog).getByRole('button', { name: /Cancelar/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar borrador y salir' }));
    await waitFor(() =>
      expect(screen.queryByText(/^Nueva Orden/i, { selector: '.modal-title' })).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const oferta = await screen.findByRole('alertdialog');
    expect(within(oferta).getByText('Tienes una orden sin terminar')).toBeInTheDocument();
    await user.click(within(oferta).getByRole('button', { name: 'Continuar el borrador' }));

    dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    await waitFor(() => expect((document.getElementById('order-miles-in') as HTMLInputElement).value).toBe('45000'));
  });

  it('«Descartar y salir» borra el borrador: la próxima vez empieza limpio', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    await pickCustomer(user, dialog);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');

    await user.click(within(dialog).getByRole('button', { name: /Cancelar/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar y salir' }));
    await waitFor(() =>
      expect(screen.queryByText(/^Nueva Orden/i, { selector: '.modal-title' })).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('si se retoma un borrador y se vuelve a salir, sigue preguntando (hay trabajo que no se debe perder)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    await pickCustomer(user, dialog);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');
    await user.click(within(dialog).getByRole('button', { name: /Cancelar/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar borrador y salir' }));
    await waitFor(() => expect(screen.queryByText(/^Nueva Orden/i, { selector: '.modal-title' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Continuar el borrador' }));
    const retomado = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    await user.click(within(retomado).getByRole('button', { name: /Cancelar/i }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
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

  it('con el alta sucia, navegar por el menú abre ChoiceDialog y «Descartar y salir» navega', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <Sidebar collapsed={false} onToggle={vi.fn()} mobileOpen={false} onMobileClose={vi.fn()} />
        <WorkOrders />
        <LocationEcho />
      </>,
      { route: '/work-orders' },
    );

    await screen.findAllByText('OT-2026-0042');
    expect(screen.getByTestId('current-path').textContent).toBe('/work-orders');

    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
    const dialog = (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
    await pickCustomer(user, dialog);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000');

    await user.click(screen.getByRole('link', { name: 'Clientes' }));
    const exitDialog = await screen.findByRole('alertdialog');
    expect(within(exitDialog).getByText('¿Salir de la orden?')).toBeInTheDocument();
    expect(screen.getByTestId('current-path').textContent).toBe('/work-orders');

    await user.click(within(exitDialog).getByRole('button', { name: 'Seguir editando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('current-path').textContent).toBe('/work-orders');
    expect(screen.getByText(/^Nueva Orden/i, { selector: '.modal-title' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Clientes' }));
    const exitDialog2 = await screen.findByRole('alertdialog');
    await user.click(within(exitDialog2).getByRole('button', { name: 'Descartar y salir' }));

    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/customers'));
    expect(screen.queryByText(/^Nueva Orden/i, { selector: '.modal-title' })).not.toBeInTheDocument();
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
    await user.click(document.getElementById('intake-customer-search') as HTMLInputElement);
    await user.click(await within(dialog).findByRole('option', { name: /Marta Ruiz/ }));
    await waitFor(() => expect(within(dialog).queryByText(/Selecciona un cliente/i)).not.toBeInTheDocument());

    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Vehículo/));
    // Su único vehículo llega elegido; quien lo vacía a propósito ve el aviso.
    const vehicle = document.getElementById('intake-vehicle') as HTMLSelectElement;
    await waitFor(() => expect(vehicle.value).toBe(VEHICLE.id));
    await user.selectOptions(vehicle, '');
    await next(user, dialog);
    expect(await within(dialog).findByText(/Selecciona un veh[íi]culo/i)).toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Vehículo/);
    expect(vehicle.value).toBe('');
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

    await user.click(document.getElementById('intake-new-customer') as HTMLElement);
    await next(user, dialog);

    expect(await within(dialog).findByText(/nombre del cliente es obligatorio/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/tel[ée]fono del cliente es obligatorio/i)).toBeInTheDocument();
    // The existing-customer rule must not fire on the branch being skipped.
    expect(within(dialog).queryByText(/Selecciona un cliente/i)).not.toBeInTheDocument();
  });
});

// Pedido del taller del 06/10/2026: el cliente y el vehículo nuevos quedan registrados aunque
// la orden se cancele, para no volver a escribirlos.
describe('WorkOrders — el cliente nuevo del alta queda guardado', () => {
  async function typeNewCustomer(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.click(document.getElementById('intake-new-customer') as HTMLElement);
    await user.type(within(dialog).getByPlaceholderText('Nombre'), 'Pedro Pérez');
    const phone = dialog.querySelector('input[type="tel"]') as HTMLInputElement;
    await user.type(phone, '5551234567');
  }

  it('se guarda al pasar al vehículo, y la orden ya no lo vuelve a crear', async () => {
    mocks.createCustomer.mockResolvedValue({ ...CUSTOMER, id: 'cli-nuevo', nombre: 'Pedro Pérez' });
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await typeNewCustomer(user, dialog);
    await next(user, dialog);

    await waitFor(() => expect(currentStep(dialog)).toMatch(/Vehículo/));
    expect(mocks.createCustomer).toHaveBeenCalledTimes(1);
    expect(mocks.createCustomer.mock.calls[0][0]).toMatchObject({ nombre: 'Pedro Pérez' });
    // A-12 (Q2 tanda 3): ya no sale el aviso de éxito al avanzar; el indicador de pasos lo dice.
    expect(screen.queryByText('Cliente guardado')).not.toBeInTheDocument();
  });

  it('al cancelar, guarda el cliente nuevo que ya estaba completo', async () => {
    mocks.createCustomer.mockResolvedValue({ ...CUSTOMER, id: 'cli-nuevo', nombre: 'Pedro Pérez' });
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await typeNewCustomer(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    const pregunta = await screen.findByRole('alertdialog');
    // La pregunta avisa que el cliente nuevo se guarda igual.
    expect(within(pregunta).getByText(/se guardan igual/)).toBeInTheDocument();
    await user.click(within(pregunta).getByRole('button', { name: 'Descartar y salir' }));

    await waitFor(() => expect(mocks.createCustomer).toHaveBeenCalledTimes(1));
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  it('el costo del repuesto viaja con la orden; vacío, sale como nulo', async () => {
    mocks.createWorkOrder.mockResolvedValue({ ...ORDER, id: 'ord-nueva', numero_orden: 'OT-2026-0043' });
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    for (const [desc, price, cost] of [['Filtro', '15', '9'], ['Aceite', '30', '']]) {
      await user.click(within(dialog).getByRole('button', { name: /Agregar repuesto/ }));
      await user.type(document.getElementById('create-order-part-description') as HTMLInputElement, desc);
      await user.type(document.getElementById('create-order-part-price') as HTMLInputElement, price);
      if (cost) await user.type(document.getElementById('create-order-part-cost') as HTMLInputElement, cost);
      await user.click(document.getElementById('create-order-part-submit') as HTMLElement);
      await user.click(within(dialog).getAllByRole('button', { name: 'Cancelar' })[0]);
    }
    await crear(user, dialog);

    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(1));
    expect(mocks.createWorkOrder.mock.calls[0][0].repuestos).toEqual([
      expect.objectContaining({ descripcion: 'Filtro', precio_venta_unitario: 15, costo_unitario: 9 }),
      expect.objectContaining({ descripcion: 'Aceite', precio_venta_unitario: 30, costo_unitario: null }),
    ]);
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
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Trabajos/));
    return { user, dialog };
  };

  it('avisa que el vehículo ya quedó guardado cuando la orden falla', async () => {
    mocks.createVehicle.mockResolvedValue({ ...VEHICLE, id: 'veh-nuevo' });
    mocks.createWorkOrder.mockRejectedValue(new Error('Se cayó la red'));

    const { user, dialog } = await abrirConVehiculoNuevo();
    await crear(user, dialog);
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

    expect(within(dialog).getByRole('button', { name: /^Agregar repuesto$/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Agregar trabajo$/i })).toBeInTheDocument();
  });

  it('no inventa el aviso cuando no se creó nada', async () => {
    mocks.createWorkOrder.mockRejectedValue(new Error('Se cayó la red'));
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);
    await crear(user, dialog);

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

  /** El depósito (paso 4) con: monto, método y (opcional) el archivo del comprobante. */
  async function fillDeposit(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    amount: string,
    method: string,
    receipt?: File
  ) {
    await goToWorkStep(user, dialog);
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
    // Un Enter en las millas (paso 2) enviaba el formulario entero desde la mitad del asistente.
    await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, VEHICLE.id);
    await user.type(document.getElementById('order-miles-in') as HTMLInputElement, '45000{Enter}');

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

    await crear(user, dialog);

    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(1));
    const input = mocks.createWorkOrder.mock.calls[0][0];
    expect(input.tipo_trabajo).toBe('mecanica');
    expect(input.labor_items).toEqual([
      { descripcion: 'Pintar puerta', costo: 350, especialidad: 'pintura', asignado_a: PAINTER.id, reparto_heredado: false },
    ]);
    expect(input.asignaciones).toEqual([{ usuario_id: PAINTER.id, tipo_tarea: 'pintura' }]);
  });

  // Pedido del taller del 06/10/2026: lo agregado en el alta solo se podía borrar, y no se
  // sabía si un trabajo o un repuesto ya había entrado.
  it('un trabajo agregado se edita desde la lista y sale con lo corregido', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: /Agregar trabajo/ }));
    await user.type(document.getElementById('create-order-description') as HTMLInputElement, 'Frenos');
    await user.type(document.getElementById('create-order-price') as HTMLInputElement, '100');
    await user.click(document.getElementById('create-order-submit') as HTMLElement);
    expect(await screen.findByText('Trabajo agregado: Frenos')).toBeInTheDocument();
    expect(within(dialog).getByText('Trabajos (1)')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Editar Frenos' }));
    const desc = document.getElementById('edit-task-0-description') as HTMLInputElement;
    expect(desc).toHaveValue('Frenos');
    await user.clear(desc);
    await user.type(desc, 'Frenos delanteros');
    const price = document.getElementById('edit-task-0-price') as HTMLInputElement;
    await user.clear(price);
    await user.type(price, '150');
    await user.click(document.getElementById('edit-task-0-submit') as HTMLElement);
    expect(within(dialog).getByText('Frenos delanteros')).toBeInTheDocument();

    await crear(user, dialog);
    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(1));
    expect(mocks.createWorkOrder.mock.calls[0][0].labor_items).toEqual([
      expect.objectContaining({ descripcion: 'Frenos delanteros', costo: 150 }),
    ]);
  });

  it('un repuesto se agrega con su editor, se edita y sale con la orden', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: /Agregar repuesto/ }));
    await user.type(document.getElementById('create-order-part-description') as HTMLInputElement, 'Filtro');
    await user.type(document.getElementById('create-order-part-price') as HTMLInputElement, '15');
    await user.click(document.getElementById('create-order-part-submit') as HTMLElement);
    expect(await screen.findByText('Repuesto agregado: Filtro')).toBeInTheDocument();
    expect(within(dialog).getByText('Repuestos (1)')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Editar Filtro' }));
    const qty = document.getElementById('edit-part-0-quantity') as HTMLInputElement;
    await user.clear(qty);
    await user.type(qty, '2');
    await user.click(document.getElementById('edit-part-0-submit') as HTMLElement);

    await crear(user, dialog);
    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(1));
    expect(mocks.createWorkOrder.mock.calls[0][0].repuestos).toEqual([
      expect.objectContaining({ descripcion: 'Filtro', cantidad: 2, precio_venta_unitario: 15 }),
    ]);
  });

  it('no crea la orden con una línea abierta en edición', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: /Agregar repuesto/ }));
    await user.type(document.getElementById('create-order-part-description') as HTMLInputElement, 'Filtro');
    // Salir de Trabajos lo perdería: no deja seguir al depósito.
    await next(user, dialog);
    expect(await within(dialog).findByText(/repuesto escrito sin agregar/i)).toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Trabajos/);

    await user.click(document.getElementById('create-order-part-submit') as HTMLElement);
    await user.click(within(dialog).getByRole('button', { name: 'Editar Filtro' }));
    await next(user, dialog);
    expect(await within(dialog).findByText(/Termina de editar la línea abierta/)).toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Trabajos/);
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  it('no crea la orden con un trabajo escrito sin agregar', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: /Agregar trabajo/ }));
    await user.type(document.getElementById('create-order-description') as HTMLInputElement, 'Frenos');
    await next(user, dialog);

    expect(await within(dialog).findByText(/trabajo escrito sin agregar/i)).toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Trabajos/);
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();
  });

  // Revisión 03/11/2026: «Anterior» también desmonta el editor; antes perdía lo escrito sin avisar.
  it('«Anterior» tampoco sale de Trabajos con un trabajo escrito sin agregar', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: /Agregar trabajo/ }));
    await user.type(document.getElementById('create-order-description') as HTMLInputElement, 'Frenos');
    await user.click(within(dialog).getByRole('button', { name: /^Anterior$/ }));

    expect(await within(dialog).findByText(/trabajo escrito sin agregar/i)).toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Trabajos/);
  });

  it('un doble clic en "Siguiente" del paso 3 no crea la orden al caer en "Crear"', async () => {
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Depósito/));

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
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Trabajos/));

    await user.click(within(dialog).getByRole('button', { name: /Vehículo y recepción/ }));
    expect(currentStep(dialog)).toMatch(/Vehículo/);
    expect((document.getElementById('order-miles-in') as HTMLInputElement).value).toBe('45000');
    // Los pasos de adelante que nunca se abrieron no se pueden saltar.
    expect(within(dialog).queryByRole('button', { name: /^Depósito$/ })).not.toBeInTheDocument();
  });

  it('pide el método si hay depósito, y manda el método, el número y el comprobante', async () => {
    mocks.uploadReceipt.mockResolvedValue(`${SEDE_CENTRO.id}/comprobante-alta-1.jpg`);
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await goToWorkStep(user, dialog);
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Depósito/));

    const deposit = document.getElementById('order-deposit') as HTMLInputElement;
    await user.clear(deposit);
    await user.type(deposit, '200');
    // Es el último paso: "Crear" valida el método antes de crear.
    await crear(user, dialog);
    expect(currentStep(dialog)).toMatch(/Depósito/);
    expect(dialog.querySelector('[role="alert"]')).toBeTruthy();
    expect(mocks.createWorkOrder).not.toHaveBeenCalled();

    await user.selectOptions(document.getElementById('payment-method') as HTMLSelectElement, 'cheque');
    await user.type(document.getElementById('payment-check') as HTMLInputElement, '1042');
    await user.upload(
      document.getElementById('payment-receipt') as HTMLInputElement,
      new File(['x'], 'cheque.jpg', { type: 'image/jpeg' })
    );
    await crear(user, dialog);

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

    await crear(user, dialog);
    await waitFor(() => expect(mocks.removeDeliveryReceipt).toHaveBeenCalledWith(`${SEDE_CENTRO.id}/comprobante-alta-1.jpg`));

    // Segundo intento: se sube de nuevo (el anterior se borró) y ahora falla la red.
    mocks.createWorkOrder.mockRejectedValueOnce({ code: '', message: 'TypeError: Failed to fetch' });
    mocks.removeDeliveryReceipt.mockClear();
    await crear(user, dialog);
    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(2));
    expect(mocks.uploadReceipt).toHaveBeenCalledTimes(2);
    expect(mocks.removeDeliveryReceipt).not.toHaveBeenCalled();

    // Tercer intento: usa el comprobante que quedó, sin subirlo otra vez.
    await crear(user, dialog);
    await waitFor(() => expect(mocks.createWorkOrder).toHaveBeenCalledTimes(3));
    expect(mocks.uploadReceipt).toHaveBeenCalledTimes(2);
    expect(mocks.createWorkOrder.mock.calls[2][0].deposito_comprobante).toBe(`${SEDE_CENTRO.id}/comprobante-alta-1.jpg`);
  });
});

describe('WorkOrders — toasts de error al guardar cliente o vehículo en el alta', () => {
  it('muestra el toast de cliente cuando falla guardar cliente nuevo (y no el de crear orden)', async () => {
    mocks.createCustomer.mockRejectedValue(new Error('Teléfono duplicado'));
    const user = userEvent.setup();
    const dialog = await openIntake(user);

    await user.click(document.getElementById('intake-new-customer') as HTMLElement);
    await user.type(within(dialog).getByPlaceholderText('Nombre'), 'Ana López');
    await user.type(dialog.querySelector('input[type="tel"]') as HTMLInputElement, '3015550101');
    await next(user, dialog);

    expect(await screen.findByText('No se pudo guardar el cliente')).toBeInTheDocument();
    expect(screen.queryByText('Falló al crear la orden')).not.toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Cliente/);
  });

  it('muestra el toast de vehículo cuando falla guardar vehículo nuevo (y no el de crear orden)', async () => {
    mocks.createVehicle.mockRejectedValue(new Error('Placa duplicada'));
    const user = userEvent.setup();
    const dialog = await openIntake(user);
    await pickCustomer(user, dialog);

    await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, '__new__');
    await user.type(document.getElementById('vehicle-brand') as HTMLInputElement, 'Toyota');
    await user.type(document.getElementById('vehicle-model') as HTMLInputElement, 'Camry');
    const anio = document.getElementById('vehicle-year') as HTMLSelectElement;
    await user.selectOptions(anio, anio.options[1].value);
    await user.type(document.getElementById('vehicle-vin') as HTMLInputElement, '1HGCM82633A004352');
    await next(user, dialog);

    expect(await screen.findByText('No se pudo guardar el vehículo')).toBeInTheDocument();
    expect(screen.queryByText('Falló al crear la orden')).not.toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Vehículo/);
  });
});

describe('WorkOrders — Q2 Tanda 1 (recepción limpia)', () => {
  it('A-01/A-18: bloquea teléfono incompleto, permite elegir idioma y lo manda al crear cliente', async () => {
    mocks.createCustomer.mockResolvedValue({ ...CUSTOMER, id: 'cli-es', nombre: 'Luis Mora', idioma: 'es' });
    const user = userEvent.setup();
    const dialog = await openIntake(user);

    await user.click(document.getElementById('intake-new-customer') as HTMLElement);
    await user.type(within(dialog).getByPlaceholderText('Nombre'), 'Luis Mora');
    const telInput = document.getElementById('intake-new-customer-phone') as HTMLInputElement;
    await user.type(telInput, '512abc');
    expect(telInput.value).toBe('512');

    // English por defecto.
    expect(within(dialog).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');

    await next(user, dialog);
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(telInput).toHaveAttribute('aria-invalid', 'true');
    expect(await within(dialog).findByText(/teléfono válido/i)).toBeInTheDocument();

    await user.type(telInput, '5550199');
    await user.click(within(dialog).getByRole('button', { name: 'Español' }));
    await next(user, dialog);

    await waitFor(() => expect(currentStep(dialog)).toMatch(/Vehículo/));
    expect(mocks.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Luis Mora', telefono: '+15125550199', idioma: 'es' })
    );
  });

  it('A-02: avisa si ya existe cliente con ese teléfono en la sede y permite usarlo', async () => {
    const existing = { ...CUSTOMER, id: 'cli-dup', nombre: 'Carlos Mena', telefono: '+13015550140' };
    const otherSede = { ...CUSTOMER, id: 'cli-other', sede_id: 'sede-norte', nombre: 'Otro Taller', telefono: '+13015559999' };
    mocks.getCustomers.mockResolvedValue([existing, otherSede]);
    const user = userEvent.setup();
    const dialog = await openIntake(user);

    await user.click(document.getElementById('intake-new-customer') as HTMLElement);
    const telInput = document.getElementById('intake-new-customer-phone') as HTMLInputElement;
    await user.type(telInput, '3015559999');
    expect(within(dialog).queryByText(/Ya existe/i)).not.toBeInTheDocument();

    await user.clear(telInput);
    await user.type(telInput, '3015550140');
    expect(await within(dialog).findByText(/Ya existe Carlos Mena/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Usar este cliente' }));
    expect(await within(dialog).findByText('Carlos Mena')).toBeInTheDocument();
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it('A-08: busca entre muchos clientes y usa buscador de vehículos cuando hay más de 8', async () => {
    const manyCustomers = Array.from({ length: 12 }, (_, i) => ({
      ...CUSTOMER,
      id: `cli-${i + 1}`,
      nombre: i === 10 ? 'Zulema Díaz' : `Cliente ${i + 1}`,
      telefono: `+151255501${String(i).padStart(2, '0')}`,
    }));
    const manyVehicles = Array.from({ length: 9 }, (_, i) => ({
      ...VEHICLE,
      id: `veh-${i + 1}`,
      cliente_id: 'cli-11',
      marca: i === 8 ? 'Subaru' : 'Toyota',
      modelo: i === 8 ? 'Outback' : `Corolla ${i + 1}`,
      placa: `XYZ${100 + i}`,
    }));
    mocks.getCustomers.mockResolvedValue(manyCustomers);
    mocks.getVehicles.mockResolvedValue(manyVehicles);
    const user = userEvent.setup();
    const dialog = await openIntake(user);

    await user.type(document.getElementById('intake-customer-search') as HTMLInputElement, '5125550110');
    await user.click(await within(dialog).findByRole('option', { name: /Zulema Díaz/ }));
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Vehículo/));

    const vehicleSearch = document.getElementById('intake-vehicle-search') as HTMLInputElement;
    expect(vehicleSearch).toBeInTheDocument();
    expect(document.getElementById('intake-new-vehicle')).toBeInTheDocument();
    await user.type(vehicleSearch, 'XYZ108');
    await user.click(await within(dialog).findByRole('option', { name: /Subaru Outback/ }));
    expect(await within(dialog).findByText(/Subaru Outback/)).toBeInTheDocument();
  });

  it('A-03: placa o VIN repetidos señalan su campo en el paso 2 sin perder el cliente guardado', async () => {
    mocks.createCustomer.mockResolvedValue({ ...CUSTOMER, id: 'cli-new-ok', nombre: 'Rosa Gil' });
    mocks.createVehicle.mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_vehiculos_placa"',
    });
    const user = userEvent.setup();
    const dialog = await openIntake(user);

    await user.click(document.getElementById('intake-new-customer') as HTMLElement);
    await user.type(within(dialog).getByPlaceholderText('Nombre'), 'Rosa Gil');
    await user.type(document.getElementById('intake-new-customer-phone') as HTMLInputElement, '5125550100');
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Vehículo/));
    expect(mocks.createCustomer).toHaveBeenCalledTimes(1);

    await user.type(document.getElementById('vehicle-brand') as HTMLInputElement, 'Honda');
    await user.type(document.getElementById('vehicle-model') as HTMLInputElement, 'Civic');
    const anio = document.getElementById('vehicle-year') as HTMLSelectElement;
    await user.selectOptions(anio, anio.options[1].value);
    await user.type(document.getElementById('vehicle-plate') as HTMLInputElement, 'ABC1234');
    await next(user, dialog);

    const plateInput = document.getElementById('vehicle-plate') as HTMLInputElement;
    await waitFor(() => expect(plateInput).toHaveAttribute('aria-invalid', 'true'));
    expect(await within(dialog).findByText(/Ya hay un vehículo con esa placa/i)).toBeInTheDocument();
    expect(currentStep(dialog)).toMatch(/Vehículo/);
    await waitFor(() => expect(document.activeElement).toBe(plateInput));
  });
});
