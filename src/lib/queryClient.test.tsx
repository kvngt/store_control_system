// @vitest-environment jsdom
//
// The reason this app took on TanStack Query was one concrete duplication:
// the Dashboard and Finanzas both read `getDashboardStats`, and both read the
// order list that Órdenes and Kanban read, so moving between those screens
// used to re-query data that had not changed.
//
// That saving is not a property of the library — it only happens if the two
// screens agree on the query key, argument for argument. They did not at
// first: Finanzas passed no capacity while the Dashboard passed the sede's,
// which produced two different keys and two fetches. These tests pin the
// agreement so it cannot drift back.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryClient';

const SEDE = 'sede-centro';
const CAPACITY = 12;

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('query keys', () => {
  it('gives the same key to the stats the Dashboard and Finanzas both read', () => {
    // Both screens pass `currentSede?.capacidad`.
    expect(queryKeys.dashboardStats(SEDE, CAPACITY)).toEqual(
      queryKeys.dashboardStats(SEDE, CAPACITY)
    );
    // And a different capacity really is a different result, so it stays part
    // of the key rather than being dropped to force a match.
    expect(queryKeys.dashboardStats(SEDE, CAPACITY)).not.toEqual(
      queryKeys.dashboardStats(SEDE, 20)
    );
  });

  it('never lets one sede answer another sede question', () => {
    expect(queryKeys.workOrders('sede-centro')).not.toEqual(queryKeys.workOrders('sede-norte'));
    expect(queryKeys.customers('sede-centro')).not.toEqual(queryKeys.customers('sede-norte'));
    // An admin whose sede list has not loaded is its own entry, not a wildcard
    // that could be served a specific sede's rows.
    expect(queryKeys.vehicles(undefined)).not.toEqual(queryKeys.vehicles('sede-centro'));
  });
});

describe('shared cache', () => {
  it('fetches the stats once for two screens that ask for the same sede', async () => {
    const getStats = vi.fn().mockResolvedValue({ ingresos_mes: 100 });

    // Stand-ins for the two screens, each written the way the real ones are.
    function Dashboardish() {
      const { data } = useQuery({
        queryKey: queryKeys.dashboardStats(SEDE, CAPACITY),
        queryFn: () => getStats(SEDE, CAPACITY),
      });
      return <div>dashboard:{data ? 'ready' : 'loading'}</div>;
    }
    function Financeish() {
      const { data } = useQuery({
        queryKey: queryKeys.dashboardStats(SEDE, CAPACITY),
        queryFn: () => getStats(SEDE, CAPACITY),
      });
      return <div>finance:{data ? 'ready' : 'loading'}</div>;
    }

    render(
      <>
        <Dashboardish />
        <Financeish />
      </>,
      { wrapper: wrapper(client) }
    );

    await waitFor(() => expect(screen.getByText('dashboard:ready')).toBeInTheDocument());
    expect(screen.getByText('finance:ready')).toBeInTheDocument();

    // One request served both screens. Before the migration this was two, and
    // it was two again for as long as the capacity argument disagreed.
    expect(getStats).toHaveBeenCalledTimes(1);
  });

  it('still fetches separately once the sede changes', async () => {
    const getOrders = vi.fn().mockResolvedValue([]);

    function Board({ sede }: { sede: string }) {
      const { data } = useQuery({
        queryKey: queryKeys.workOrders(sede),
        queryFn: () => getOrders(sede),
      });
      return <div>{sede}:{data ? 'ready' : 'loading'}</div>;
    }

    render(
      <>
        <Board sede="sede-centro" />
        <Board sede="sede-norte" />
      </>,
      { wrapper: wrapper(client) }
    );

    await waitFor(() => expect(screen.getByText('sede-norte:ready')).toBeInTheDocument());
    expect(getOrders).toHaveBeenCalledTimes(2);
    expect(getOrders).toHaveBeenCalledWith('sede-centro');
    expect(getOrders).toHaveBeenCalledWith('sede-norte');
  });
});
