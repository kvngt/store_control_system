// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router-dom';
import { setViewportMatches } from '../test/viewport';
import {
  renderWithProviders,
  authValue,
  MECHANIC_USER,
  SEDE_CENTRO,
} from '../test/renderWithProviders';
import type { UserProfile, WorkOrder } from '../types/database';
import {
  DETAIL,
  ORDER,
  PAINTER,
  TECH_DETAIL,
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
  addPart: vi.fn(),
  setLaborTechnician: vi.fn(),
  setAssignmentOrigin: vi.fn(),
  addAssignment: vi.fn(),
  getPaidCommissionKeys: vi.fn(),
  getBalance: vi.fn(),
  getEstimate: vi.fn(),
  reportFinding: vi.fn(),
  quoteFinding: vi.fn(),
  discardFinding: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

// El detalle monta SignatureSection en la pestaña Resumen; sin esto cargaría react-signature-canvas.
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
    addPart: mocks.addPart,
    setLaborTechnician: mocks.setLaborTechnician,
    setLaborSpecialty: vi.fn(),
    setAssignmentOrigin: mocks.setAssignmentOrigin,
    addAssignment: mocks.addAssignment,
    getPaidCommissionKeys: mocks.getPaidCommissionKeys,
    getBalance: mocks.getBalance,
    deliver: vi.fn(),
    reportFinding: mocks.reportFinding,
    quoteFinding: mocks.quoteFinding,
    discardFinding: mocks.discardFinding,
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

  it('agregar un repuesto a una orden firmada avisa que falta la autorización', async () => {
    mocks.addPart.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user, 'Trabajos');

    const partsCard = screen.getAllByText(/Descripción de Repuestos/).map((el) => el.closest('.card')).find(Boolean) as HTMLElement;
    const descInput = within(partsCard).getByPlaceholderText('Descripción');
    await user.type(descInput, 'Bujías');
    await user.click(within(partsCard).getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByText('Repuesto agregado')).toBeInTheDocument();
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

  // Pedido del taller del 06/10/2026: un trabajo que el cliente no autorizó seguía "esperando
  // autorización" para el mecánico, y no sabía en qué iba la orden.
  it('el técnico ve el estado de la orden y lo rechazado como no autorizado', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...TECH_DETAIL,
      estatus: 'en_proceso',
      asignaciones: [{ id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' }],
      labor_items: [
        { id: 'lab-1', orden_id: ORDER.id, descripcion: 'Cambio de aceite', costo: 120, estado: 'aprobado', especialidad: 'mecanica', asignado_a: MECHANIC_USER.id, reparto_heredado: false, completado_en: '2026-10-06T12:00:00Z' },
        { id: 'lab-3', orden_id: ORDER.id, descripcion: 'Frenos traseros', costo: 300, estado: 'rechazado', especialidad: 'mecanica', asignado_a: MECHANIC_USER.id, reparto_heredado: false, presupuesto_id: 'p-2' },
      ],
      hallazgos: [{
        id: 'hal-1', orden_id: ORDER.id, sede_id: SEDE_CENTRO.id, reportado_por: MECHANIC_USER.id, descripcion: 'Frenos traseros gastados',
        estado: 'cotizado', en_reporte: false, texto_cliente: null, resuelto_por: null, resuelto_en: null, presupuesto_id: 'p-2', avance_id: null,
        creado_en: '2026-10-06T10:00:00Z',
      }],
    });
    mocks.getEstimate.mockResolvedValue({ bolsas: [], reparto: [], mi_total: 0, tareas: [], sin_asignar: [] });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);

    const status = document.querySelector('.tech-order-status') as HTMLElement;
    expect(status).toHaveTextContent('Estado de la orden');
    expect(status).toHaveTextContent('1 autorizada(s) por el cliente · 1 hecha(s)');
    expect(status).toHaveTextContent('El cliente no autorizó: Frenos traseros');

    await user.click(screen.getByRole('button', { name: /^Tareas/ }));
    const rejected = screen.getByText('Tarea: Frenos traseros').closest('.task-card') as HTMLElement;
    expect(within(rejected).getByText('No autorizada · no se realiza')).toBeInTheDocument();
    expect(within(rejected).queryByText('Esperando autorización')).toBeNull();
    expect(within(rejected).queryByRole('button', { name: /Realizado/ })).toBeNull();
    expect(screen.getByText('El cliente no lo autorizó')).toBeInTheDocument();
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
    await user.click(document.getElementById('labor-new-open') as HTMLElement);
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
    mocks.getOperators.mockResolvedValue([PAINTER, MECHANIC_USER]);
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
    // La tarea va de entrada a quien reportó el trabajo (pedido del taller, 06/10/2026).
    expect(document.getElementById('labor-new-technician')).toHaveValue(MECHANIC_USER.id);
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
    // B-08: el botón no se apaga; sin texto avisa qué falta y no guarda.
    expect(within(dialog).getByRole('button', { name: 'Descartar' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }));
    expect(mocks.discardFinding).not.toHaveBeenCalled();
    expect(await within(dialog).findByText('Escribe lo que verá el cliente.')).toBeInTheDocument();
    expect(text).toHaveAttribute('aria-invalid', 'true');

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

    // Desde el atajo de arriba de la orden (06/10/2026), que abre el mismo diálogo.
    await user.click(within(screen.getByRole('toolbar', { name: 'Acciones rápidas' })).getByRole('button', { name: /Reportar trabajo adicional/ }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar trabajo adicional' });
    const confirm = within(dialog).getByRole('button', { name: 'Reportar y pausar la orden' });
    // B-08: el botón no se apaga; sin texto avisa qué falta y no reporta.
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(mocks.reportFinding).not.toHaveBeenCalled();
    expect(await within(dialog).findByText('Describe lo que encontraste antes de reportarlo.')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox'), 'Fuga en la bomba de agua');
    await user.click(confirm);

    expect(mocks.reportFinding).toHaveBeenCalledWith(ORDER.id, 'Fuga en la bomba de agua');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  // 04/11/2026: con «Tareas» plegada (como arranca la orden), el atajo abría el diálogo escondido.
  it('el atajo «Reportar trabajo adicional» abre la sección Tareas y el diálogo se ve', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrderDetail.mockResolvedValue({
      ...TECH_DETAIL,
      asignaciones: [{ id: 'asg-1', orden_id: ORDER.id, usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' }],
      hallazgos: [],
    });
    mocks.getEstimate.mockResolvedValue({ bolsas: [], reparto: [], mi_total: 0, tareas: [], sin_asignar: [] });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrders />);
    await openDetail(user);
    // Se pliega «Tareas», como arranca la orden sin `&tab=`.
    const tareas = document.querySelector('[data-section="tareas"] .collapsible-section-toggle') as HTMLButtonElement;
    if (tareas.getAttribute('aria-expanded') === 'true') await user.click(tareas);
    expect(tareas.getAttribute('aria-expanded')).toBe('false');

    await user.click(within(screen.getByRole('toolbar', { name: 'Acciones rápidas' })).getByRole('button', { name: /Reportar trabajo adicional/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar trabajo adicional' });
    expect(dialog.closest('[hidden]')).toBeNull();
  });
});
