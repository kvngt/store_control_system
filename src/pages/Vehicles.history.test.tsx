// @vitest-environment jsdom
//
// El historial de un vehículo. Existía por cliente pero no por vehículo, y es por vehículo
// como se pregunta: "qué le hicimos a esta camioneta la vez pasada".

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  MECHANIC_USER,
  SEDE_CENTRO,
} from '../test/renderWithProviders';
import type { Customer, Vehicle, WorkOrder } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getVehicles: vi.fn(),
  getCustomers: vi.fn(),
  getVehicleDetail: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));
// Solo se sustituye useNavigate: renderWithProviders monta un MemoryRouter de verdad.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock('../services/supabaseService', () => {
  const vehicles = {
    getVehicles: mocks.getVehicles,
    getVehicleDetail: mocks.getVehicleDetail,
    createVehicle: vi.fn(),
    updateVehicle: vi.fn(),
    deleteVehicle: vi.fn(),
  };
  const customers = { getCustomers: mocks.getCustomers, createCustomer: vi.fn() };
  return { vehiclesService: vehicles, customersService: customers, supabaseService: { ...vehicles, ...customers } };
});

vi.mock('../lib/vin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/vin')>();
  return { ...actual, decodeVin: vi.fn().mockResolvedValue(null), fetchModelsForMake: vi.fn().mockResolvedValue([]) };
});

const CUSTOMER = { id: 'c1', nombre: 'PRUEBA Marta', sede_id: SEDE_CENTRO.id } as Customer;
const VEHICLE = {
  id: 'v1', cliente_id: 'c1', marca: 'Toyota', modelo: 'Camry', anio: 2019,
  color: 'Azul', placa: 'ABC123', vin: '1HGCM82633A004352', sede_id: SEDE_CENTRO.id,
  cliente_nombre: 'PRUEBA Marta',
} as Vehicle;

const ORDER = {
  id: 'o1', numero_orden: 'ORD-2026-001', estatus: 'entregado', tipo_trabajo: 'mecanica',
  creado_en: '2026-05-10T15:00:00Z', montos: { total_general: 1200 },
} as unknown as WorkOrder;

beforeEach(() => {
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getVehicles.mockResolvedValue([VEHICLE]);
  mocks.getCustomers.mockResolvedValue([CUSTOMER]);
  mocks.getVehicleDetail.mockResolvedValue({ vehicle: VEHICLE, customer: CUSTOMER, orders: [ORDER] });
  mocks.navigate.mockReset();
});

async function abrirDetalle() {
  const { default: Vehicles } = await import('./Vehicles');
  const user = userEvent.setup();
  renderWithProviders(<Vehicles />);
  await screen.findByText('Toyota Camry');
  await user.click(within(screen.getByRole('row', { name: /Toyota Camry/ })).getByRole('button', { name: 'Ver' }));
  return user;
}

describe('Historial del vehículo', () => {
  it('el ojo abre el detalle con las órdenes del vehículo', async () => {
    await abrirDetalle();

    expect(await screen.findByRole('heading', { name: /2019 Toyota Camry/ })).toBeInTheDocument();
    expect(screen.getByText(/Historial de Servicios \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('ORD-2026-001')).toBeInTheDocument();
    // Con el formato de `lib/money`, para que la prueba del técnico de abajo busque el
    // texto que un admin sí ve.
    expect(screen.getByText('$1,200.00')).toBeInTheDocument();
    expect(mocks.getVehicleDetail).toHaveBeenCalledWith('v1');
  });

  it('el número de orden abre esa orden', async () => {
    const user = await abrirDetalle();

    await user.click(await screen.findByRole('button', { name: 'ORD-2026-001' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/work-orders?open=o1');
  });

  // El dinero de la orden es solo de administración, aquí como en todas las demás pantallas.
  it('un técnico no ve la columna de total', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    await abrirDetalle();

    await screen.findByText('ORD-2026-001');
    expect(screen.queryByText('$1,200.00')).not.toBeInTheDocument();
  });

  // Sin el error del detalle en la lista de errores de la página, un fallo de red pintaba
  // "sin resultados": la pantalla afirmaba que el vehículo no existe.
  it('un historial que no carga se dice, no se pinta como vehículo sin datos', async () => {
    mocks.getVehicleDetail.mockRejectedValue(new Error('Se cayó la red'));
    await abrirDetalle();

    expect(await screen.findByText('Se cayó la red')).toBeInTheDocument();
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
  });

  it('un vehículo sin órdenes lo dice', async () => {
    mocks.getVehicleDetail.mockResolvedValue({ vehicle: VEHICLE, customer: CUSTOMER, orders: [] });
    await abrirDetalle();

    expect(await screen.findByText(/todavía no tiene órdenes/)).toBeInTheDocument();
  });
});
