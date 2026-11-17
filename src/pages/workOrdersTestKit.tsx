import type { ReactElement } from 'react';
import { expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  MECHANIC_USER,
  SEDE_CENTRO,
} from '../test/renderWithProviders';
import type { Customer, UserProfile, Vehicle, WorkOrder } from '../types/database';

export interface WorkOrdersBaseMocks {
  auth: { current: ReturnType<typeof authValue> | null };
  getWorkOrders: ReturnType<typeof vi.fn>;
  getCustomers: ReturnType<typeof vi.fn>;
  getVehicles: ReturnType<typeof vi.fn>;
  getOperators: ReturnType<typeof vi.fn>;
  getWorkOrderDetail: ReturnType<typeof vi.fn>;
  getPaidCommissionKeys: ReturnType<typeof vi.fn>;
}

export const CUSTOMER: Customer = {
  id: 'cli-1',
  sede_id: SEDE_CENTRO.id,
  nombre: 'Marta Ruiz',
  telefono: '555-0140',
  email: 'marta@example.test',
  direccion: '12 Oak St',
  notas_crm: '',
  creado_en: '2026-08-01T00:00:00Z',
};

export const VEHICLE: Vehicle = {
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

export const ORDER: WorkOrder = {
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
  con_seguro: false,
};

export const PAINTER: UserProfile = {
  ...MECHANIC_USER,
  id: 'user-pintor',
  rol: 'pintor',
  nombre_completo: 'Sara Vega',
};

// What `getWorkOrderDetail` returns: the order plus the rows the detail view
// draws but the board never loads.
export const DETAIL: WorkOrder = {
  ...ORDER,
  // Los totales como los deja la base: la tarjeta de totales ya no suma en el navegador.
  total_labor: 120,
  montos: { total_repuestos: 30, total_general: 150, deposito_inicial: 0 },
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
export const TECH_DETAIL: WorkOrder = {
  ...ORDER,
  total_labor: 120,
  montos: null,
  labor_items: [{ id: 'lab-1', orden_id: ORDER.id, descripcion: 'Cambio de aceite', costo: 120 }],
  repuestos: [],
  repuestos_resumen: [{ id: 'par-1', descripcion: 'Filtro de aceite', cantidad: 2 }],
  avances: [],
};

export function resetBaseMocks(mocks: WorkOrdersBaseMocks) {
  vi.clearAllMocks();
  // El alta se guarda sola como borrador (intakeDraft.ts): que uno no pase al siguiente caso.
  localStorage.clear();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getWorkOrders.mockResolvedValue([ORDER]);
  mocks.getCustomers.mockResolvedValue([CUSTOMER]);
  mocks.getVehicles.mockResolvedValue([VEHICLE]);
  mocks.getOperators.mockResolvedValue([PAINTER]);
  mocks.getWorkOrderDetail.mockResolvedValue(DETAIL);
  mocks.getPaidCommissionKeys.mockResolvedValue([]);
}

/**
 * Desde el 04/10/2026 las secciones del detalle arrancan cerradas (pedido del taller). Las
 * pruebas que miran adentro de las tarjetas abren las de la pestaña visible; las cerradas
 * tienen su propia prueba ("secciones plegables").
 */
export async function expandSections(user: ReturnType<typeof userEvent.setup>) {
  const toggles = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.collapsible-section-toggle[aria-expanded="false"]')
  ).filter((toggle) => !toggle.closest('[hidden]'));
  for (const toggle of toggles) await user.click(toggle);
}

/** Lo que se espera al detalle de la orden la primera vez que se abre en un archivo de prueba. */
export const DETAIL_TIMEOUT = 8000;

/**
 * Opens the detail view of the single order on the board, on the given tab. Desde el 03/10/2026
 * el detalle va en pestañas en escritorio (el ancho del stub de matchMedia): cada prueba abre la
 * que contiene lo que revisa.
 */
export async function openDetail(user: ReturnType<typeof userEvent.setup>, tab?: string) {
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
  // El detalle se carga diferido (`lazy`): la primera prueba de cada archivo lo trae en frío y
  // con el segundo que espera `findBy` por omisión no alcanza (pasaba al partir la prueba grande).
  await screen.findByRole('tablist', {}, { timeout: DETAIL_TIMEOUT });
  if (tab) await user.click(screen.getByRole('tab', { name: new RegExp(`^${tab}`) }));
  await expandSections(user);
}

/** Abre el alta de una orden (el asistente de cuatro pasos, F4) y devuelve el diálogo. */
export async function openIntakeDialog(user: ReturnType<typeof userEvent.setup>, ui: ReactElement) {
  renderWithProviders(ui);
  await screen.findAllByText('OT-2026-0042');
  await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));
  return (await screen.findByText(/^Nueva Orden/i, { selector: '.modal-title' })).closest('.modal') as HTMLElement;
}

/** "Siguiente": valida el paso actual y, si está bien, abre el que sigue. */
export const next = (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) =>
  user.click(within(dialog).getByRole('button', { name: /^Siguiente/ }));

/** El nombre del paso abierto, según la lista de pasos del encabezado. */
export const currentStep = (dialog: HTMLElement) => dialog.querySelector('[aria-current="step"]')?.textContent ?? '';

/** Paso 1 con el cliente de siempre, y al paso 2. */
export async function pickCustomer(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.selectOptions(document.getElementById('intake-customer') as HTMLSelectElement, CUSTOMER.id);
  await next(user, dialog);
  await waitFor(() => expect(currentStep(dialog)).toMatch(/Vehículo/));
}

/** Cliente y vehículo existentes: deja el asistente en el paso 3 (Trabajos). */
export async function goToWorkStep(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await pickCustomer(user, dialog);
  await user.selectOptions(document.getElementById('intake-vehicle') as HTMLSelectElement, VEHICLE.id);
  await next(user, dialog);
  await waitFor(() => expect(currentStep(dialog)).toMatch(/Trabajos/));
}

/**
 * Desde Trabajos: "Siguiente" al depósito (el último paso desde el 06/10/2026) y "Crear". Si
 * ya se está en el depósito, solo "Crear".
 */
export async function crear(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  if (!/Depósito/.test(currentStep(dialog))) {
    await next(user, dialog);
    await waitFor(() => expect(currentStep(dialog)).toMatch(/Depósito/));
  }
  await user.click(within(dialog).getByRole('button', { name: /^Crear$/i }));
}
