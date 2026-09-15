// @vitest-environment jsdom
//
// La sesión en pantalla no depende de que la red conteste. Con mala señal en el
// taller, releer el perfil fallaba, el proveedor lo tomaba por "esta cuenta no
// tiene perfil" y mandaba al técnico al login a media captura.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ADMIN_USER, SEDE_CENTRO } from '../test/renderWithProviders';

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;

const mocks = vi.hoisted(() => ({
  listener: null as AuthListener | null,
  perfil: vi.fn(),
  sedes: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-admin' } } } }),
      onAuthStateChange: (cb: AuthListener) => {
        mocks.listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    from: (table: string) =>
      table === 'perfiles'
        ? { select: () => ({ eq: () => ({ single: () => mocks.perfil() }) }) }
        : { select: () => ({ order: () => mocks.sedes() }) },
  },
}));

const { AuthProvider } = await import('./AuthContext');
const { useAuth } = await import('./auth.context');

function Probe() {
  const { user, loading, currentSede } = useAuth();
  if (loading) return <p>cargando</p>;
  return <p>{user ? `sesión de ${user.nombre_completo} en ${currentSede?.nombre}` : 'sin sesión'}</p>;
}

const SESSION = { user: { id: ADMIN_USER.id } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.perfil.mockResolvedValue({ data: ADMIN_USER, error: null });
  mocks.sedes.mockResolvedValue({ data: [SEDE_CENTRO], error: null });
});

let queryClient: QueryClient;

async function renderSignedIn() {
  queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>
  );
  expect(await screen.findByText(`sesión de ${ADMIN_USER.nombre_completo} en ${SEDE_CENTRO.nombre}`)).toBeInTheDocument();
}

describe('AuthProvider', () => {
  it('no cierra la sesión en pantalla si releer el perfil falla por la red', async () => {
    await renderSignedIn();

    mocks.perfil.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    await act(async () => mocks.listener?.('SIGNED_IN', SESSION));

    expect(screen.getByText(/sesión de Ana Torres/)).toBeInTheDocument();
  });

  it('renovar el token no vuelve a pedir el perfil', async () => {
    await renderSignedIn();
    const calls = mocks.perfil.mock.calls.length;

    await act(async () => mocks.listener?.('TOKEN_REFRESHED', SESSION));

    expect(mocks.perfil).toHaveBeenCalledTimes(calls);
    expect(screen.getByText(/sesión de Ana Torres/)).toBeInTheDocument();
  });

  it('sin respuesta de las sedes conserva las que ya tenía', async () => {
    await renderSignedIn();

    mocks.sedes.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    await act(async () => mocks.listener?.('SIGNED_IN', SESSION));

    expect(screen.getByText(`sesión de ${ADMIN_USER.nombre_completo} en ${SEDE_CENTRO.nombre}`)).toBeInTheDocument();
  });

  it('al cerrar sesión borra los datos en caché de quien estaba', async () => {
    await renderSignedIn();
    queryClient.setQueryData(['work-orders', 'sede-centro'], [{ id: 'orden-con-montos' }]);

    await act(async () => mocks.listener?.('SIGNED_OUT', null));

    expect(queryClient.getQueryData(['work-orders', 'sede-centro'])).toBeUndefined();
  });

  it('si entra otra persona sin cerrar sesión, tampoco hereda la caché', async () => {
    await renderSignedIn();
    queryClient.setQueryData(['dashboard-stats', 'sede-centro', 10], { ingresos_mes: 15000 });

    mocks.perfil.mockResolvedValue({ data: { ...ADMIN_USER, id: 'otra-persona' }, error: null });
    await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'otra-persona' } }));

    expect(queryClient.getQueryData(['dashboard-stats', 'sede-centro', 10])).toBeUndefined();
  });

  it('una cuenta que de verdad no tiene perfil sí queda fuera', async () => {
    await renderSignedIn();

    mocks.perfil.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    await act(async () => mocks.listener?.('SIGNED_IN', SESSION));

    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
  });
});
