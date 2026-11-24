// @vitest-environment jsdom
//
// QA 19/10/2026: las alertas del panel («esperando autorización» y «avance bajo») se calculaban
// sobre las cinco órdenes más recientes. Una orden atascada que no era de las cinco últimas no
// avisaba nunca. Aquí hay ocho órdenes y las dos que esperan son las más viejas.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, authValue, ADMIN_USER, MECHANIC_USER, SEDE_CENTRO } from '../test/renderWithProviders';
import type { WorkOrder } from '../types/database';
import { daysFromTodayLocal } from '../lib/dates';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getWorkOrders: vi.fn(),
  getMyTasks: vi.fn(),
  getDashboardStats: vi.fn(),
  getAttention: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));
vi.mock('../services/workOrders.service', () => ({
  workOrdersService: {
    getWorkOrders: mocks.getWorkOrders,
    getMyTasks: mocks.getMyTasks,
    subscribeToChanges: vi.fn(() => () => undefined),
  },
}));
vi.mock('../services/dashboard.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/dashboard.service')>();
  return {
    ...actual,
    dashboardService: { getDashboardStats: mocks.getDashboardStats, getAttention: mocks.getAttention },
  };
});

const { default: Dashboard } = await import('./Dashboard');

const orden = (n: number, estatus: string, avance: number, entrega = daysFromTodayLocal(-5)): WorkOrder =>
  ({
    id: `o${n}`,
    numero_orden: `ORD-2026-0${n}`,
    estatus,
    porcentaje_avance: avance,
    fecha_estimada_entrega: entrega,
    cliente: { nombre: `Cliente ${n}` },
    vehiculo: { anio: 2020, marca: 'Toyota', modelo: 'Corolla' },
    asignaciones: [],
  }) as unknown as WorkOrder;

describe('Dashboard: alertas', () => {
  it('avisa de las órdenes atascadas aunque no sean de las cinco más recientes', async () => {
    mocks.auth.current = authValue(ADMIN_USER);
    // Las cinco primeras (las recientes) van bien; la 6 espera autorización y la 7 casi no avanza.
    mocks.getWorkOrders.mockResolvedValue([
      orden(1, 'en_proceso', 80), orden(2, 'en_proceso', 90), orden(3, 'en_proceso', 70), orden(4, 'en_proceso', 60),
      orden(5, 'en_proceso', 50), orden(6, 'espera_autorizacion', 40), orden(7, 'en_proceso', 10), orden(8, 'recepcion', 0),
    ]);
    mocks.getDashboardStats.mockResolvedValue({
      ordenes_activas: 8, ordenes_finalizadas_mes: 0, ingresos_mes: 0, egresos_mes: 0, ingresos_total: 0, egresos_total: 0,
      clientes_nuevos_mes: 0, tasa_ocupacion: 40, ordenes_por_estatus: {}, ingresos_por_mes: [],
    });
    mocks.getAttention.mockResolvedValue({ total: 0, grupos: [] });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText(/ORD-2026-06 · /)).toBeInTheDocument();
    expect(screen.getByText(/ORD-2026-07 · /)).toBeInTheDocument();
  });

  // 06/11/2026: con solo «menos del 30 %», cada orden recién autorizada salía como avance bajo.
  it('no avisa de avance bajo si la entrega todavía está lejos', async () => {
    mocks.auth.current = authValue(ADMIN_USER);
    mocks.getWorkOrders.mockResolvedValue([
      orden(1, 'en_proceso', 0, daysFromTodayLocal(10)),
      orden(2, 'en_proceso', 10, daysFromTodayLocal(1)),
    ]);
    mocks.getDashboardStats.mockResolvedValue({
      ordenes_activas: 2, ordenes_finalizadas_mes: 0, ingresos_mes: 0, egresos_mes: 0, ingresos_total: 0, egresos_total: 0,
      clientes_nuevos_mes: 0, tasa_ocupacion: 10, ordenes_por_estatus: {}, ingresos_por_mes: [],
    });
    mocks.getAttention.mockResolvedValue({ total: 0, grupos: [] });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText(/ORD-2026-02 · /)).toBeInTheDocument();
    expect(screen.queryByText(/ORD-2026-01 · /)).not.toBeInTheDocument();
  });

  it('B-12: el panel del técnico muestra Mis tareas y oculta Órdenes recientes', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrders.mockResolvedValue([orden(1, 'en_proceso', 40)]);
    mocks.getMyTasks.mockResolvedValue([]);
    mocks.getDashboardStats.mockResolvedValue({
      ordenes_activas: 1, ordenes_finalizadas_mes: 0, ingresos_mes: 0, egresos_mes: 0, ingresos_total: 0, egresos_total: 0,
      clientes_nuevos_mes: 0, tasa_ocupacion: 0, ordenes_por_estatus: {}, ingresos_por_mes: [],
    });
    mocks.getAttention.mockResolvedValue({ total: 0, grupos: [] });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByRole('region', { name: 'Mis tareas' })).toBeInTheDocument();
    expect(screen.queryByText('Órdenes recientes')).not.toBeInTheDocument();
  });

  it('A-06: en sobrecupo la tarjeta de ocupación del admin muestra el aviso en --color-warning', async () => {
    mocks.auth.current = authValue(ADMIN_USER, { ...SEDE_CENTRO, capacidad: 10 });
    mocks.getWorkOrders.mockResolvedValue([]);
    mocks.getDashboardStats.mockResolvedValue({
      ordenes_activas: 33, ordenes_finalizadas_mes: 0, ingresos_mes: 0, egresos_mes: 0, ingresos_total: 0, egresos_total: 0,
      clientes_nuevos_mes: 0, tasa_ocupacion: 100, ordenes_por_estatus: {}, ingresos_por_mes: [],
    });
    mocks.getAttention.mockResolvedValue({ total: 0, grupos: [] });

    renderWithProviders(<Dashboard />);

    const label = await screen.findByText('33 carros · 10 lugares (sobrecupo)');
    expect(label).toHaveStyle({ color: 'var(--color-warning)' });
  });
});
