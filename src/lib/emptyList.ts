const SHARED_EMPTY: readonly unknown[] = Object.freeze([]);

/**
 * The stand-in list for a query that has not resolved yet.
 *
 * Always the *same* array, which is the whole point. Writing
 * `query.data ?? []` allocates a fresh array on every render, so every
 * `useMemo` and `useEffect` downstream sees a changed dependency and re-runs
 * forever — the filtered lists on Vehículos and Finanzas were recomputing on
 * every keystroke before this existed.
 *
 * It is frozen, so a caller that mistakes it for a working array fails loudly
 * instead of quietly sharing a mutation with every other screen.
 *
 * @example
 * const vehicles = vehiclesQuery.data ?? emptyList<Vehicle>();
 */
export function emptyList<T>(): T[] {
  return SHARED_EMPTY as T[];
}
