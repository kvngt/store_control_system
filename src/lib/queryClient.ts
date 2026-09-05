import { QueryClient } from '@tanstack/react-query';

/**
 * Query keys, in one place so an invalidation and the query it is meant to
 * invalidate can never drift apart.
 *
 * Every key that reads shop data carries the sede: the app is multi-tenant and
 * two workshops' caches must never answer each other's questions. `sedeId` is
 * `undefined` only for an admin whose sede list has not loaded yet, and that is
 * a distinct cache entry rather than a wildcard.
 */
export const queryKeys = {
  workOrders: (sedeId?: string) => ['work-orders', sedeId] as const,
  workOrderDetail: (orderId: string) => ['work-order', orderId] as const,
  customers: (sedeId?: string) => ['customers', sedeId] as const,
  customerDetail: (customerId: string) => ['customer', customerId] as const,
  vehicles: (sedeId?: string) => ['vehicles', sedeId] as const,
  operators: (sedeId?: string) => ['operators', sedeId] as const,
  users: (sedeId?: string) => ['users', sedeId] as const,
  transactions: (sedeId?: string) => ['transactions', sedeId] as const,
  importBatches: (sedeId?: string) => ['import-batches', sedeId] as const,
  payroll: (sedeId?: string) => ['payroll', sedeId] as const,
  sedes: () => ['sedes'] as const,
  /**
   * The dashboard KPIs. `capacity` is part of the key because the occupancy
   * percentage is computed against it, so two sedes with different capacities
   * are genuinely different results.
   */
  dashboardStats: (sedeId?: string, capacity?: number) => ['dashboard-stats', sedeId, capacity] as const,
} as const;

/**
 * Builds the app's query client.
 *
 * A factory rather than a module-level singleton so each test gets its own
 * cache; the app creates exactly one, in `main.tsx`.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Shop data changes when someone in the shop changes it, not on its
        // own. Thirty seconds is long enough that moving between Finanzas and
        // the Dashboard — which read the same `getDashboardStats` — reuses one
        // answer instead of asking twice, and short enough that a colleague's
        // edit shows up without a reload.
        staleTime: 30_000,
        // Refetching every query because the operator alt-tabbed back to the
        // tablet is a lot of requests on shop wifi for data that is usually
        // unchanged; `staleTime` plus explicit invalidation after each mutation
        // already keeps the screens honest.
        refetchOnWindowFocus: false,
        // A retry cannot fix the failures this app actually hits — an RLS
        // refusal, a violated constraint, a missing row — and it would only
        // delay the message the user needs to see. One extra attempt covers
        // the genuinely transient case of a dropped connection.
        retry: 1,
      },
    },
  });
}
