import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));

const { dashboardService, monthLabel } = await import('./dashboard.service');

const RESUMEN = {
  ordenes_activas: 4,
  ordenes_finalizadas_mes: 2,
  ingresos_mes: 15000,
  egresos_mes: 3200.5,
  ingresos_total: 48000,
  egresos_total: 9100,
  clientes_nuevos_mes: 3,
  ordenes_por_estatus: { recepcion: 1, en_proceso: 2, espera_autorizacion: 1, finalizado: 1, entregado: 5 },
  ingresos_por_mes: [
    { mes_inicio: '2026-08-01', ingresos: 9000, egresos: 1000 },
    { mes_inicio: '2026-09-01', ingresos: 15000, egresos: 3200.5 },
  ],
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: RESUMEN, error: null });
});

describe('dashboardService.getDashboardStats', () => {
  it('pide los totales a la base con el día y la zona del navegador', async () => {
    await dashboardService.getDashboardStats('sede-1', 10);

    const [name, params] = mocks.rpc.mock.calls[0];
    expect(name).toBe('resumen_panel');
    expect(params.p_sede_id).toBe('sede-1');
    expect(params.p_hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof params.p_tz).toBe('string');
  });

  it('sin sede pide todas las que permite RLS', async () => {
    await dashboardService.getDashboardStats(undefined, 10);
    expect(mocks.rpc.mock.calls[0][1].p_sede_id).toBeNull();
  });

  it('arma las tarjetas y la ocupación con lo que devuelve la base', async () => {
    const stats = await dashboardService.getDashboardStats('sede-1', 8);

    expect(stats.ingresos_mes).toBe(15000);
    expect(stats.ingresos_total).toBe(48000);
    expect(stats.tasa_ocupacion).toBe(50);
    expect(stats.ingresos_por_mes).toEqual([
      { mes: monthLabel('2026-08-01'), ingresos: 9000, egresos: 1000 },
      { mes: monthLabel('2026-09-01'), ingresos: 15000, egresos: 3200.5 },
    ]);
  });

  it('una capacidad en cero no divide entre cero', async () => {
    const stats = await dashboardService.getDashboardStats('sede-1', 0);
    expect(Number.isFinite(stats.tasa_ocupacion)).toBe(true);
  });

  it('un error de la base llega a la pantalla, no se convierte en ceros', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function does not exist' } });
    await expect(dashboardService.getDashboardStats('sede-1', 10)).rejects.toMatchObject({ code: '42883' });
  });
});

describe('monthLabel', () => {
  it('usa el mes de la fecha, sin correrlo por UTC', () => {
    expect(monthLabel('2026-09-01')).toBe(new Date(2026, 8, 1).toLocaleDateString('es', { month: 'short' }));
  });
});
