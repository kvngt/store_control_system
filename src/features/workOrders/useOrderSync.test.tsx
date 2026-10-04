// @vitest-environment jsdom
//
// Reporte del taller (octubre 2026): una técnica finalizó una orden y el admin, con la orden
// abierta, no lo vio hasta recargar. `useOrderSync` escucha los cambios de las órdenes por
// Realtime y vuelve a leer lo que las muestra. Esto fija qué relee, cuándo, y que el canal
// se cierra con la sesión.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';

const mocks = vi.hoisted(() => ({
  user: { id: 'admin-1' } as { id: string } | null,
  onChange: null as ((orderId: string) => void) | null,
  onReconnect: null as (() => void) | null,
  unsubscribe: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('../../context/auth.context', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../../services/workOrders.service', () => ({
  workOrdersService: { subscribeToChanges: mocks.subscribe },
}));

const { useOrderSync, BATCH_MS, HIDDEN_RELOAD_MS } = await import('./useOrderSync');

let visibility: DocumentVisibilityState = 'visible';

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useOrderSync(), { wrapper });
  /** Las claves que se invalidaron, como texto para compararlas fácil. */
  const keys = () => invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  return { hook, invalidate, keys };
}

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.user = { id: 'admin-1' };
  mocks.subscribe.mockReset().mockImplementation((onChange: (id: string) => void, onReconnect: () => void) => {
    mocks.onChange = onChange;
    mocks.onReconnect = onReconnect;
    return mocks.unsubscribe;
  });
  mocks.unsubscribe.mockReset();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useOrderSync', () => {
  it('cuando alguien cambia una orden, relee esa orden y el tablero', () => {
    const { keys } = setup();

    act(() => mocks.onChange!('ord-1'));
    // Todavía no: espera a que lleguen las demás filas del mismo cambio.
    expect(keys()).toEqual([]);

    act(() => { vi.advanceTimersByTime(BATCH_MS); });

    expect(keys()).toContain(JSON.stringify(queryKeys.workOrderDetail('ord-1')));
    expect(keys()).toContain(JSON.stringify(queryKeys.quotes('ord-1')));
    expect(keys()).toContain(JSON.stringify(['work-orders']));
    expect(keys()).toContain(JSON.stringify(['dashboard-stats']));
  });

  it('un cambio que toca varias filas a la vez es una sola lectura por orden', () => {
    const { keys } = setup();

    act(() => {
      // Finalizar: la orden, y por trigger sus montos y comisiones, en el mismo instante.
      mocks.onChange!('ord-1');
      mocks.onChange!('ord-1');
      mocks.onChange!('ord-2');
      mocks.onChange!('ord-1');
    });
    act(() => { vi.advanceTimersByTime(BATCH_MS); });

    const detail1 = JSON.stringify(queryKeys.workOrderDetail('ord-1'));
    expect(keys().filter((k) => k === detail1)).toHaveLength(1);
    expect(keys()).toContain(JSON.stringify(queryKeys.workOrderDetail('ord-2')));
    expect(keys().filter((k) => k === JSON.stringify(['work-orders']))).toHaveLength(1);
  });

  it('al reconectarse relee todas las órdenes: lo que cambió durante el corte no se reenvía', () => {
    const { keys } = setup();

    act(() => mocks.onReconnect!());

    expect(keys()).toContain(JSON.stringify(['work-orders']));
    expect(keys()).toContain(JSON.stringify(['work-order']));
    expect(keys()).toContain(JSON.stringify(['quotes']));
  });

  it('volver a la app después de un rato relee; un vistazo a otra pestaña no', () => {
    const { keys } = setup();

    setVisibility('hidden');
    act(() => { vi.advanceTimersByTime(5_000); });
    setVisibility('visible');
    expect(keys()).toEqual([]);

    setVisibility('hidden');
    act(() => { vi.advanceTimersByTime(HIDDEN_RELOAD_MS); });
    setVisibility('visible');
    expect(keys()).toContain(JSON.stringify(['work-order']));
  });

  it('sin sesión no escucha nada', () => {
    mocks.user = null;
    setup();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('al salir cierra el canal y descarta lo que estaba por releer', () => {
    const { hook, keys } = setup();

    act(() => mocks.onChange!('ord-1'));
    hook.unmount();
    act(() => { vi.advanceTimersByTime(BATCH_MS); });

    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(keys()).toEqual([]);
  });
});
