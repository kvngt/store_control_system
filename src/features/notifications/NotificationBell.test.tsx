// @vitest-environment jsdom
//
// La campana es la mitad del sistema de avisos que el mecánico ve con la app
// abierta: tiene que contar bien, marcar bien, llevar a la orden, y avisar
// cuando algo llega mientras la persona está en otra pantalla.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, authValue, MECHANIC_USER } from '../../test/renderWithProviders';
import type { AppNotification } from '../../types/database';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  unreadCount: vi.fn(),
  markRead: vi.fn(async () => {}),
  markAllRead: vi.fn(async () => {}),
  onInsert: null as null | ((n: AppNotification) => void),
  navigate: vi.fn(),
}));

vi.mock('../../context/auth.context', () => ({ useAuth: () => authValue(MECHANIC_USER) }));
vi.mock('../../services/notifications.service', () => ({
  notificationsService: {
    list: mocks.list,
    unreadCount: mocks.unreadCount,
    markRead: mocks.markRead,
    markAllRead: mocks.markAllRead,
    subscribe: (_userId: string, onInsert: (n: AppNotification) => void) => {
      mocks.onInsert = onInsert;
      return () => {
        mocks.onInsert = null;
      };
    },
  },
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

const { default: NotificationBell } = await import('./NotificationBell');

const ASSIGNED: AppNotification = {
  id: 'n-1',
  usuario_id: MECHANIC_USER.id,
  sede_id: 'sede-centro',
  tipo: 'asignacion',
  titulo: 'Nueva orden asignada · ORD-2026-014',
  cuerpo: '2019 Toyota Camry — Marta Ruiz',
  datos: { numero_orden: 'ORD-2026-014', vehiculo: '2019 Toyota Camry', cliente: 'Marta Ruiz' },
  orden_id: 'ord-14',
  url: '/work-orders?open=ord-14',
  leida_en: null,
  creado_en: new Date().toISOString(),
};

const OLD_READ: AppNotification = {
  ...ASSIGNED,
  id: 'n-0',
  tipo: 'comision_generada',
  titulo: 'Comisión generada · ORD-2026-009',
  datos: { numero_orden: 'ORD-2026-009', vehiculo: '2018 Honda Civic', monto: 175 },
  leida_en: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([ASSIGNED, OLD_READ]);
  mocks.unreadCount.mockResolvedValue(1);
});

describe('NotificationBell', () => {
  it('muestra cuántos avisos hay sin leer', async () => {
    renderWithProviders(<NotificationBell />);
    expect(await screen.findByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' })).toBeInTheDocument();
  });

  it('al tocar un aviso lo marca leído y lleva a la orden', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await screen.findByText('1');

    await user.click(screen.getByRole('button', { name: /sin leer/ }));
    await user.click(await screen.findByText('Nueva orden asignada · ORD-2026-014'));

    expect(mocks.markRead).toHaveBeenCalledWith('n-1');
    expect(mocks.navigate).toHaveBeenCalledWith('/work-orders?open=ord-14');
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('marca todo como leído', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await screen.findByText('1');

    await user.click(screen.getByRole('button', { name: /sin leer/ }));
    await user.click(await screen.findByRole('button', { name: /Marcar todo leído/i }));

    expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
  });

  it('un aviso que llega en tiempo real suma al contador y aparece como toast', async () => {
    renderWithProviders(<NotificationBell />);
    await screen.findByText('1');
    await waitFor(() => expect(mocks.onInsert).not.toBeNull());

    act(() => {
      mocks.onInsert!({
        ...ASSIGNED,
        id: 'n-2',
        tipo: 'desasignacion',
        titulo: 'Ya no estás asignado · ORD-2026-020',
        datos: { numero_orden: 'ORD-2026-020', vehiculo: '2021 Ford F-150' },
      });
    });

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('Ya no estás asignado · ORD-2026-020')).toBeInTheDocument();
  });
});
