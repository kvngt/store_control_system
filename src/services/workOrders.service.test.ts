import { describe, it, expect, vi, beforeEach } from 'vitest';

// Un DELETE que RLS no permite no devuelve error: devuelve cero filas. `deleted`
// es lo que responde la base al borrar.
const mocks = vi.hoisted(() => ({
  deleted: [] as { id: string }[],
  tables: [] as string[],
}));

vi.mock('../lib/supabase', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['delete', 'eq', 'select']) chain[method] = () => chain;
    chain.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: mocks.deleted, error: null }).then(resolve);
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        mocks.tables.push(table);
        return builder();
      },
    },
  };
});

const { workOrdersService } = await import('./workOrders.service');

const removers = [
  ['removeLaborItem', 'orden_labor'],
  ['removePart', 'orden_repuestos'],
  ['removeAssignment', 'orden_asignaciones'],
] as const;

describe('workOrdersService: borrar líneas y asignaciones', () => {
  beforeEach(() => {
    mocks.tables = [];
  });

  it.each(removers)('%s termina bien cuando la base borra la fila', async (method, table) => {
    mocks.deleted = [{ id: 'x' }];
    await expect(workOrdersService[method]('x')).resolves.toBeUndefined();
    expect(mocks.tables).toEqual([table]);
  });

  it.each(removers)('%s falla si la base no borró nada (RLS), en vez de fingir éxito', async (method) => {
    mocks.deleted = [];
    await expect(workOrdersService[method]('x')).rejects.toThrow(/No se pudo eliminar/);
  });
});
