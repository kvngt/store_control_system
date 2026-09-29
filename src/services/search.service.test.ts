import { describe, it, expect, vi, beforeEach } from 'vitest';

// Qué tablas llega a consultar de verdad la búsqueda: un builder de supabase-js no manda nada
// hasta que alguien lo espera, así que se anota la tabla en `then`.
const mocks = vi.hoisted(() => ({ consultadas: [] as string[] }));

vi.mock('../lib/supabase', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'or', 'ilike', 'limit', 'eq']) chain[method] = () => chain;
    chain.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
      mocks.consultadas.push(table);
      return Promise.resolve({ data: [], error: null }).then(resolve);
    };
    return chain;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

const { searchService } = await import('./search.service');

beforeEach(() => {
  mocks.consultadas = [];
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
});
