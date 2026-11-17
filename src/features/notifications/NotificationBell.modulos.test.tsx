// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, authValue, ADMIN_USER } from '../../test/renderWithProviders';
import type { AppNotification } from '../../types/database';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  unreadCount: vi.fn(),
}));

vi.mock('../../context/auth.context', () => ({
  useAuth: () => authValue(ADMIN_USER),
}));

vi.mock('../../services/notifications.service', () => ({
  notificationsService: {
    list: mocks.list,
    unreadCount: mocks.unreadCount,
    markRead: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    removeAll: vi.fn(async () => undefined),
    subscribe: () => () => undefined,
  },
}));

const { default: NotificationBell } = await import('./NotificationBell');

const NOTIFS: AppNotification[] = [
  {
    id: 'n-asignacion',
    usuario_id: ADMIN_USER.id,
    sede_id: 'sede-centro',
    tipo: 'asignacion',
    titulo: 'Nueva orden asignada · ORD-001',
    cuerpo: '2020 Toyota Corolla',
    datos: { numero_orden: 'ORD-001', vehiculo: '2020 Toyota Corolla', cliente: 'Ana' },
    orden_id: 'ord-1',
    url: '/work-orders?open=ord-1',
    leida_en: null,
    creado_en: new Date().toISOString(),
  },
  {
    id: 'n-comision',
    usuario_id: ADMIN_USER.id,
    sede_id: 'sede-centro',
    tipo: 'comision_generada',
    titulo: 'Comisión aprobada · ORD-002',
    cuerpo: '',
    datos: { numero_orden: 'ORD-002', vehiculo: '2019 Honda Civic', monto: 120 },
    orden_id: 'ord-2',
    url: '/mis-comisiones',
    leida_en: null,
    creado_en: new Date().toISOString(),
  },
  {
    id: 'n-inspeccion',
    usuario_id: ADMIN_USER.id,
    sede_id: 'sede-centro',
    tipo: 'inspeccion_completada',
    titulo: 'Inspección lista · ORD-003',
    cuerpo: '',
    datos: { numero_orden: 'ORD-003' },
    orden_id: 'ord-3',
    url: '/work-orders?open=ord-3',
    leida_en: null,
    creado_en: new Date().toISOString(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue(NOTIFS);
  mocks.unreadCount.mockResolvedValue(3);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('NotificationBell — módulos comisiones e inspeccion', () => {
  it('muestra todos los avisos cuando los módulos están encendidos', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await screen.findByText('3');

    await user.click(screen.getByRole('button', { name: /sin leer/ }));
    expect(await screen.findByText('Nueva orden asignada · ORD-001')).toBeInTheDocument();
    expect(screen.getByText('Comisión aprobada · ORD-002')).toBeInTheDocument();
    expect(screen.getByText('Inspección lista · ORD-003')).toBeInTheDocument();
  });

  it('oculta avisos de comisión e inspección cuando esos módulos están apagados', async () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'comisiones,inspeccion');
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await screen.findByText('1');

    await user.click(screen.getByRole('button', { name: /sin leer/ }));
    expect(await screen.findByText('Nueva orden asignada · ORD-001')).toBeInTheDocument();
    expect(screen.queryByText('Comisión aprobada · ORD-002')).not.toBeInTheDocument();
    expect(screen.queryByText('Inspección lista · ORD-003')).not.toBeInTheDocument();
  });
});
