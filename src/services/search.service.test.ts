import { describe, it, expect, vi, beforeEach } from 'vitest';

// Qué tablas llega a consultar de verdad la búsqueda: un builder de supabase-js no manda nada
// hasta que alguien lo espera, así que se anota la tabla en `then`.
const mocks = vi.hoisted(() => ({
  consultadas: [] as string[],
  errorByTable: {} as Record<string, unknown>,
}));

vi.mock('../lib/supabase', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'or', 'ilike', 'limit', 'eq']) chain[method] = () => chain;
    chain.then = (resolve: (value: { data: unknown[]; error: unknown }) => unknown) => {
      mocks.consultadas.push(table);
      const err = mocks.errorByTable[table] ?? null;
      return Promise.resolve({ data: err ? [] : [], error: err }).then(resolve);
    };
    return chain;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

const { searchService } = await import('./search.service');

beforeEach(() => {
  mocks.consultadas = [];
  mocks.errorByTable = {};
});

describe('searchService.globalSearch', () => {
  it('administración busca órdenes, clientes y vehículos', async () => {
    await searchService.globalSearch('camry', 'sede-1');
    expect(mocks.consultadas.sort()).toEqual(['clientes', 'ordenes_trabajo', 'vehiculos']);
  });

  // Reunión con el taller (sept. 2026): Clientes y Vehículos son de administración. Un técnico
  // busca entre sus órdenes; un resultado de cliente lo mandaría a una pantalla que no es suya.
  it('un técnico solo busca órdenes', async () => {
    const results = await searchService.globalSearch('camry', 'sede-1', { directory: false });
    expect(mocks.consultadas).toEqual(['ordenes_trabajo']);
    expect(results.customers).toEqual([]);
    expect(results.vehicles).toEqual([]);
  });

  it('lanza el error de Supabase en vez de devolver resultados vacíos', async () => {
    const dbError = { message: 'network error' };
    mocks.errorByTable = { ordenes_trabajo: dbError };

    await expect(searchService.globalSearch('camry', 'sede-1')).rejects.toEqual(dbError);
  });
});
