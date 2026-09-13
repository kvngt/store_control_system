// @vitest-environment jsdom
//
// La tarjeta de push tiene que decir la verdad sobre cada dispositivo: en un
// iPhone sin instalar, el paso siguiente es instalar la app, no un botón que no
// va a funcionar.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  support: 'supported' as string,
  subscription: null as null | { endpoint: string; unsubscribe: () => Promise<boolean> },
  subscribeThisDevice: vi.fn(),
  registerDevice: vi.fn(async () => {}),
  unregisterDevice: vi.fn(async () => {}),
  sendTestPush: vi.fn(async () => true),
}));

vi.mock('../../lib/push', () => ({
  detectPushSupport: () => mocks.support,
  currentSubscription: async () => mocks.subscription,
  subscribeThisDevice: mocks.subscribeThisDevice,
  subscriptionKeys: (sub: { endpoint: string }) => ({ endpoint: sub.endpoint, p256dh: 'p', auth: 'a' }),
}));
vi.mock('../../services/notifications.service', () => ({
  notificationsService: {
    registerDevice: mocks.registerDevice,
    unregisterDevice: mocks.unregisterDevice,
    sendTestPush: mocks.sendTestPush,
  },
}));

const { default: PushSettingsCard } = await import('./PushSettingsCard');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.support = 'supported';
  mocks.subscription = null;
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
});

describe('PushSettingsCard', () => {
  it('en un iPhone sin instalar explica cómo agregar la app a inicio', () => {
    mocks.support = 'needs-install';
    renderWithProviders(<PushSettingsCard />);

    expect(screen.getByText(/Agregar a inicio/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Activar/ })).not.toBeInTheDocument();
  });

  it('dice que no está configurado cuando la build no trae llave VAPID', () => {
    mocks.support = 'not-configured';
    renderWithProviders(<PushSettingsCard />);
    expect(screen.getByText(/no están configuradas en este servidor/)).toBeInTheDocument();
  });

  it('activa este dispositivo y lo registra para la persona', async () => {
    const sub = { endpoint: 'https://push.example/1', unsubscribe: async () => true };
    mocks.subscribeThisDevice.mockResolvedValue(sub);
    const user = userEvent.setup();
    renderWithProviders(<PushSettingsCard />);

    await user.click(await screen.findByRole('button', { name: /Activar en este dispositivo/ }));

    await waitFor(() => expect(mocks.registerDevice).toHaveBeenCalledWith({ endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' }));
    expect(await screen.findByText(/Activas en este dispositivo/)).toBeInTheDocument();
  });

  it('explica qué hacer si la persona negó el permiso', async () => {
    mocks.subscribeThisDevice.mockRejectedValue(Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));
    const user = userEvent.setup();
    renderWithProviders(<PushSettingsCard />);

    await user.click(await screen.findByRole('button', { name: /Activar en este dispositivo/ }));
    expect(await screen.findByText('Permiso denegado')).toBeInTheDocument();
    expect(mocks.registerDevice).not.toHaveBeenCalled();
  });

  it('con push activo permite enviar una prueba y desactivar', async () => {
    const unsubscribe = vi.fn(async () => true);
    mocks.subscription = { endpoint: 'https://push.example/1', unsubscribe };
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() });
    const user = userEvent.setup();
    renderWithProviders(<PushSettingsCard />);

    await user.click(await screen.findByRole('button', { name: /Enviar prueba/ }));
    expect(mocks.sendTestPush).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Desactivar/ }));
    await waitFor(() => expect(mocks.unregisterDevice).toHaveBeenCalledWith('https://push.example/1'));
    expect(unsubscribe).toHaveBeenCalled();
  });
});
