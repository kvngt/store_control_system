// @vitest-environment jsdom
//
// QA 19/10/2026: las alertas del panel («esperando autorización» y «avance bajo») se calculaban
// sobre las cinco órdenes más recientes. Una orden atascada que no era de las cinco últimas no
// avisaba nunca. Aquí hay ocho órdenes y las dos que esperan son las más viejas.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, authValue, ADMIN_USER } from '../test/renderWithProviders';
import type { WorkOrder } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getWorkOrders: vi.fn(),
  getDashboardStats: vi.fn(),
  getAttention: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));
vi.mock('../services/workOrders.service', () => ({
  workOrdersService: { getWorkOrders: mocks.getWorkOrders, subscribeToChanges: vi.fn(() => () => undefined) },
}));
vi.mock('../services/dashboard.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/dashboard.service')>();
  return {
    ...actual,
    dashboardService: { getDashboardStats: mocks.getDashboardStats, getAttention: mocks.getAttention },
  };
});

const { default: Dashboard } = await import('./Dashboard');

const orden = (n: number, estatus: string, avance: number): WorkOrder =>
  ({
    id: `o${n}`,
    numero_orden: `ORD-2026-0${n}`,
    estatus,
    porcentaje_avance: avance,
    fecha_estimada_entrega: '2026-11-01',
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
});
