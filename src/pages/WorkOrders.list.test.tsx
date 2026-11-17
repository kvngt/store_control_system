// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setViewportMatches } from '../test/viewport';
import {
  renderWithProviders,
  authValue,
  MECHANIC_USER,
  SEDE_CENTRO,
} from '../test/renderWithProviders';
import { ORDER, resetBaseMocks } from './workOrdersTestKit';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getWorkOrders: vi.fn(),
  getCustomers: vi.fn(),
  getVehicles: vi.fn(),
  getOperators: vi.fn(),
  getWorkOrderDetail: vi.fn(),
  getPaidCommissionKeys: vi.fn(),
  setArchived: vi.fn(),
  deleteWorkOrder: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

// El tablero abre el detalle de la orden al pulsar la tarjeta, y su pestaña Resumen monta la firma.
vi.mock('../features/workOrders/SignatureCard', () => ({
  default: ({ onSave }: { onSave: (dataUrl: string) => Promise<void> }) => (
    <button type="button" onClick={() => void onSave('data:image/png;base64,AAAA')}>Guardar firma de prueba</button>
  ),
}));

vi.mock('../services/workOrders.service', () => ({
  workOrdersService: {
    getWorkOrders: mocks.getWorkOrders,
    getWorkOrderDetail: mocks.getWorkOrderDetail,
    getPaidCommissionKeys: mocks.getPaidCommissionKeys,
    setArchived: mocks.setArchived,
    deleteWorkOrder: mocks.deleteWorkOrder,
  },
}));
vi.mock('../services/customers.service', () => ({
  customersService: { getCustomers: mocks.getCustomers },
}));
vi.mock('../services/vehicles.service', () => ({
  vehiclesService: { getVehicles: mocks.getVehicles },
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

beforeEach(() => {
  resetBaseMocks(mocks);
});

describe('WorkOrders', () => {
  // Decisión del dueño (04/11/2026, 20261010000041): una orden entregada no se borra, se archiva.
  it('una orden entregada se archiva; las demás se pueden borrar', async () => {
    mocks.getWorkOrders.mockResolvedValue([
      { ...ORDER, estatus: 'entregado' },
      { ...ORDER, id: 'ord-2', numero_orden: 'OT-2026-0043' },
    ]);
    mocks.setArchived.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);

    const archivar = await screen.findByRole('button', { name: 'Archivar OT-2026-0042' });
    expect(screen.queryByRole('button', { name: 'Eliminar OT-2026-0042' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar OT-2026-0043' })).toBeInTheDocument();

    await user.click(archivar);
    await waitFor(() => expect(mocks.setArchived).toHaveBeenCalledWith('ord-1', true));
    expect(mocks.deleteWorkOrder).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

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
    expect(await screen.findByRole('button', { name: 'Abrir la orden OT-2026-0042' })).toBeInTheDocument();
    expect(document.querySelector('.kanban-board')).toBeTruthy();
    expect(document.querySelector('.table-container')).toBeNull();

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
    await screen.findByRole('tablist', {}, { timeout: 8000 });
    expect(mocks.getWorkOrderDetail).toHaveBeenCalledWith(ORDER.id);
  });
});
