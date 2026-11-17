// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setViewportMatches } from '../test/viewport';
import {
  renderWithProviders,
  authValue,
  MECHANIC_USER,
  SEDE_CENTRO,
  SEDE_NORTE,
} from '../test/renderWithProviders';
import type { UserProfile } from '../types/database';
import {
  DETAIL,
  ORDER,
  PAINTER,
  TECH_DETAIL,
  VEHICLE,
  openDetail,
  resetBaseMocks,
} from './workOrdersTestKit';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getWorkOrders: vi.fn(),
  getCustomers: vi.fn(),
  getVehicles: vi.fn(),
  getOperators: vi.fn(),
  getWorkOrderDetail: vi.fn(),
  addLaborItem: vi.fn(),
  markReadyForPickup: vi.fn(),
  getPaidCommissionKeys: vi.fn(),
  updateWorkOrderStatus: vi.fn(),
  updateWorkOrderProgress: vi.fn(),
  uploadSignature: vi.fn(),
  getBalance: vi.fn(),
  getEstimate: vi.fn(),
  getHistory: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

// Lo que importa de la firma aquí es qué hace la pantalla después de guardarla.
vi.mock('../features/workOrders/SignatureCard', () => ({
  default: ({ onSave }: { onSave: (dataUrl: string) => Promise<void> }) => (
    <button type="button" onClick={() => void onSave('data:image/png;base64,AAAA')}>Guardar firma de prueba</button>
  ),
}));

vi.mock('../services/workOrders.service', () => ({
  workOrdersService: {
    getWorkOrders: mocks.getWorkOrders,
    getWorkOrderDetail: mocks.getWorkOrderDetail,
    addLaborItem: mocks.addLaborItem,
    markReadyForPickup: mocks.markReadyForPickup,
    getPaidCommissionKeys: mocks.getPaidCommissionKeys,
    updateWorkOrderStatus: mocks.updateWorkOrderStatus,
    updateWorkOrderProgress: mocks.updateWorkOrderProgress,
    uploadSignature: mocks.uploadSignature,
    getBalance: mocks.getBalance,
    deliver: vi.fn(),
    getHistory: mocks.getHistory,
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
  commissionsService: { getEstimate: mocks.getEstimate },
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

describe('WorkOrders — order detail', () => {
  it('shows the labor and parts the board never loads', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Trabajos');

    expect(mocks.getWorkOrderDetail).toHaveBeenCalledWith(ORDER.id);
    expect(screen.getByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.getByText('Filtro de aceite')).toBeInTheDocument();
    // 2 × $15 sale price: the row subtotal and the column total.
    expect(screen.getAllByText('$30.00').length).toBeGreaterThan(0);
    // El costo (lo que pagó el taller) vuelve a verse, solo para administración: el taller
    // decidió el 05/10/2026 anotarlo cuando lo sabe, para ver la ganancia de las piezas.
    expect(screen.getAllByText('$8.00').length).toBeGreaterThan(0);
  });

  it('re-reads the order after the customer signs', async () => {
    mocks.uploadSignature.mockResolvedValue({ ruta: 'sede-centro/ord-1/firma-1.png', fecha: '2026-09-14T15:00:00Z' });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);
    expect(mocks.getWorkOrderDetail).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Guardar firma de prueba/ }));

    await waitFor(() => expect(mocks.uploadSignature).toHaveBeenCalled());
    // La firma la guarda la base con su fecha y dispara el enlace y el correo de recepción:
    // la orden se vuelve a leer. (Desde 20261010000022 ya no autoriza lo cotizado.)
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

    // La estimación llega después que la orden: su sección aparece cerrada y se abre aquí.
    const toggle = await screen.findByRole('button', { name: /Tu comisión estimada/i });
    if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle);
    const card = toggle.closest('.collapsible-section') as HTMLElement;
    expect(within(card).getByText('$350.00')).toBeVisible();
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

  it('B-02: apaga el deslizador de avance para el técnico cuando no hay nada autorizado', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...TECH_DETAIL,
      estatus: 'recepcion',
      asignaciones: [{ id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' }],
      labor_items: [{ id: 'lab-1', orden_id: ORDER.id, descripcion: 'Frenos', costo: 120, estado: 'borrador' }],
      repuestos_resumen: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(slider()).toBeDisabled();
    expect(box()).toBeDisabled();
    expect(screen.getAllByText(/todavía no autoriza ningún trabajo/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/la orden ya está cerrada/)).not.toBeInTheDocument();
  });

  it('B-02: deja mover el avance al técnico si tiene al menos una línea aprobada', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...TECH_DETAIL,
      estatus: 'en_proceso',
      asignaciones: [{ id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' }],
      labor_items: [{ id: 'lab-1', orden_id: ORDER.id, descripcion: 'Frenos', costo: 120, estado: 'aprobado' }],
    });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(slider()).toBeEnabled();
    expect(box()).toBeEnabled();
  });
});

// Pedido del taller (05/10/2026): finalizar lo hace el técnico, "listo para entregar" lo confirma
// administración (y recién entonces se le avisa al cliente); solo administración reabre.
describe('WorkOrders — finalizar y listo para entregar', () => {
  const FINALIZADA = { ...DETAIL, estatus: 'finalizado' as const, porcentaje_avance: 100 };

  it('administración ve "Por revisar" y "Marcar listo para entregar", y al marcarla se llama a la base', async () => {
    mocks.getWorkOrderDetail.mockResolvedValue(FINALIZADA);
    mocks.markReadyForPickup.mockResolvedValue({ lista_para_entregar_en: '2026-10-06T10:00:00Z', ya_estaba: false });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(screen.getAllByText('Por revisar').length).toBeGreaterThan(0);
    expect(document.getElementById('order-mark-ready')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Marcar listo para entregar/ }));
    expect(mocks.markReadyForPickup).toHaveBeenCalledWith(ORDER.id);
  });

  it('ya marcada, administración ve "Listo para entregar", no el botón, y "Entregar" es el único botón principal', async () => {
    mocks.getWorkOrderDetail.mockResolvedValue({ ...FINALIZADA, lista_para_entregar_en: '2026-10-06T10:00:00Z', labor_items: [] });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(screen.getAllByText('Listo para entregar').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Marcar listo para entregar/ })).not.toBeInTheDocument();
    const toolbar = screen.getByRole('toolbar', { name: 'Acciones rápidas' });
    const primaryButtons = Array.from(toolbar.querySelectorAll('button.btn-primary'));
    expect(primaryButtons).toHaveLength(1);
    expect(primaryButtons[0]).toHaveTextContent(/Entregar/);
    expect(within(toolbar).getByRole('button', { name: 'Agregar trabajo' })).not.toHaveClass('btn-primary');
  });

  it('un técnico no ve el botón y no puede reabrir la orden finalizada', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...TECH_DETAIL,
      estatus: 'finalizado',
      porcentaje_avance: 100,
      asignaciones: [{ id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' }],
    });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    expect(screen.queryByRole('button', { name: /Marcar listo para entregar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
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
    expect(await screen.findByText('Cambio de aceite')).toBeVisible();
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

// Pedido del taller (04/10/2026): dentro de cada pestaña las secciones arrancan cerradas, con el
// título y un resumen a la vista; se abre con la flecha lo que se necesita.
describe('WorkOrders — secciones plegables del detalle', () => {
  /** Abre la orden sin desplegar nada (el `openDetail` de arriba lo despliega todo). */
  async function openClosed(user: ReturnType<typeof userEvent.setup>) {
    renderWithProviders(<WorkOrders />);
    await screen.findAllByText('OT-2026-0042');
    await user.click(document.querySelector('.table-actions button') as HTMLElement);
    await screen.findByRole('tablist');
  }
  const section = (name: RegExp) => screen.getByRole('button', { name });

  it('al entrar, cada sección está cerrada y su encabezado dice qué hay', async () => {
    const user = userEvent.setup();
    await openClosed(user);

    const vehicle = section(/Información del Vehículo/);
    expect(vehicle).toHaveAttribute('aria-expanded', 'false');
    // El resumen del encabezado: la placa.
    expect(vehicle).toHaveTextContent(VEHICLE.placa!);
    expect(screen.getByText(VEHICLE.vin)).not.toBeVisible();
    expect(section(/Firma del Cliente/)).toHaveAttribute('aria-expanded', 'false');

    await user.click(vehicle);
    expect(vehicle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(VEHICLE.vin)).toBeVisible();
  });

  it('"Desplegar todo" abre las de la pestaña y "Contraer todo" las cierra', async () => {
    const user = userEvent.setup();
    await openClosed(user);
    await user.click(screen.getByRole('tab', { name: /^Trabajos/ }));

    await user.click(screen.getByRole('button', { name: /Desplegar todo/ }));
    expect(screen.getByText('Cambio de aceite')).toBeVisible();
    expect(screen.getByText('Filtro de aceite')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Contraer todo/ }));
    expect(screen.getByText('Cambio de aceite')).not.toBeVisible();
  });

  it('lo abierto sigue abierto al cambiar de pestaña y volver', async () => {
    const user = userEvent.setup();
    await openClosed(user);
    await user.click(section(/Información del Vehículo/));

    await user.click(screen.getByRole('tab', { name: /^Trabajos/ }));
    await user.click(screen.getByRole('tab', { name: /^Resumen/ }));
    expect(section(/Información del Vehículo/)).toHaveAttribute('aria-expanded', 'true');
  });

  it('un enlace a Trabajos abre Mano de obra y deja lo demás cerrado', async () => {
    renderWithProviders(<WorkOrders />, { route: `/work-orders?open=${ORDER.id}&tab=trabajos` });

    expect(await screen.findByText('Cambio de aceite')).toBeVisible();
    expect(section(/Mano de obra/)).toHaveAttribute('aria-expanded', 'true');
    expect(section(/Descripción de Repuestos/)).toHaveAttribute('aria-expanded', 'false');
  });

  it('el técnico que llega desde "Mis tareas" encuentra sus tareas abiertas', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue(TECH_DETAIL);
    renderWithProviders(<WorkOrders />, { route: `/work-orders?open=${ORDER.id}&tab=tareas` });

    await screen.findByRole('tablist');
    expect(await screen.findByRole('button', { name: /^Tareas/, expanded: true })).toBeInTheDocument();
  });

  it('en el teléfono, todas apiladas y cerradas, con un solo "Desplegar todo"', async () => {
    setViewportMatches(true);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />, { route: `/work-orders?open=${ORDER.id}` });

    const toggles = await screen.findAllByRole('button', { expanded: false });
    expect(toggles.length).toBeGreaterThan(5);
    expect(screen.getAllByRole('button', { name: /Desplegar todo/ })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Desplegar todo/ }));
    expect(screen.getByText('Cambio de aceite', { selector: '.line-desc' })).toBeVisible();
    expect(screen.getByText(VEHICLE.vin)).toBeVisible();
  });
});
