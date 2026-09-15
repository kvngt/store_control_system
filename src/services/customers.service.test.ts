import { describe, it, expect, vi } from 'vitest';

// La base cuenta vehículos y órdenes en la misma consulta (`vehiculos(count)`); el
// servicio los aplana. Cada página devuelve lo que diga `pages`.
const mocks = vi.hoisted(() => ({
  pages: [] as unknown[][],
  ranges: [] as [number, number][],
  selects: [] as string[],
}));

vi.mock('../lib/supabase', () => {
  const builder = () => {
    let from = 0;
    const chain: Record<string, unknown> = {};
    chain.select = (columns: string) => {
      mocks.selects.push(columns);
      return chain;
    };
    for (const method of ['order', 'eq']) chain[method] = () => chain;
    chain.range = (start: number, end: number) => {
      from = start;
      mocks.ranges.push([start, end]);
      return chain;
    };
    chain.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: mocks.pages[from === 0 ? 0 : 1] ?? [], error: null }).then(resolve);
    return chain;
  };
  return { supabase: { from: () => builder() } };
});

const { customersService } = await import('./customers.service');

describe('customersService.getCustomers', () => {
  it('toma los conteos que calcula la base, con cero para quien no tiene', async () => {
    mocks.pages = [[
      { id: 'c1', nombre: 'Marta', vehiculos: [{ count: 2 }], ordenes_trabajo: [{ count: 1 }] },
      { id: 'c2', nombre: 'Pedro', vehiculos: [{ count: 1 }], ordenes_trabajo: [{ count: 3 }] },
      { id: 'c3', nombre: 'Sin nada', vehiculos: [{ count: 0 }], ordenes_trabajo: [] },
    ]];
    const customers = await customersService.getCustomers('sede-1');

    expect(mocks.selects.at(-1)).toContain('vehiculos(count)');
    const byId = Object.fromEntries(customers.map((c) => [c.id, [c.vehiculos_count, c.ordenes_count]]));
    expect(byId).toEqual({ c1: [2, 1], c2: [1, 3], c3: [0, 0] });
    // Los arreglos de conteo no se filtran al objeto del cliente.
    expect(customers[0]).not.toHaveProperty('vehiculos');
  });
});
