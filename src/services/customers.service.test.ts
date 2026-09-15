import { describe, it, expect, vi } from 'vitest';

// Un query builder mínimo: cada tabla devuelve sus filas, sin importar los filtros.
const rows = vi.hoisted(() => ({
  clientes: [
    { id: 'c1', nombre: 'Marta' },
    { id: 'c2', nombre: 'Pedro' },
    { id: 'c3', nombre: 'Sin nada' },
  ],
  vehiculos: [
    { id: 'v1', cliente_id: 'c1' },
    { id: 'v2', cliente_id: 'c1' },
    { id: 'v3', cliente_id: 'c2' },
  ],
  ordenes_trabajo: [
    { id: 'o1', cliente_id: 'c2' },
    { id: 'o2', cliente_id: 'c2' },
    { id: 'o3', cliente_id: 'c2' },
    { id: 'o4', cliente_id: 'c1' },
  ],
}));

vi.mock('../lib/supabase', () => {
  const builder = (table: keyof typeof rows) => {
    const result = { data: rows[table], error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'eq', 'in']) chain[method] = () => chain;
    chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return { supabase: { from: (table: keyof typeof rows) => builder(table) } };
});

const { customersService } = await import('./customers.service');

describe('customersService.getCustomers', () => {
  it('cuenta vehículos y órdenes de cada cliente, con cero para quien no tiene', async () => {
    const customers = await customersService.getCustomers('sede-1');
    const byId = Object.fromEntries(customers.map((c) => [c.id, [c.vehiculos_count, c.ordenes_count]]));
    expect(byId).toEqual({ c1: [2, 1], c2: [1, 3], c3: [0, 0] });
  });
});
