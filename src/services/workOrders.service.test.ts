import { describe, it, expect, vi, beforeEach } from 'vitest';

// Un DELETE o un UPDATE que RLS no permite no devuelve error: devuelve cero filas. `deleted`
// es lo que responde la base a la escritura.
const mocks = vi.hoisted(() => ({
  deleted: [] as { id: string }[],
  tables: [] as string[],
}));

vi.mock('../lib/supabase', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['delete', 'update', 'eq', 'select']) chain[method] = () => chain;
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

vi.mock('./media.service', () => ({
  mediaService: { uploadSmallFile: vi.fn().mockResolvedValue(undefined) },
}));

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

// Un UPDATE tiene el mismo agujero que un DELETE, y con peores consecuencias: la pantalla
// dibuja el estado nuevo, o dice "firmada", sobre una orden que la base no cambió.
const escritores: [string, () => Promise<unknown>, string][] = [
  ['updateWorkOrderStatus', () => workOrdersService.updateWorkOrderStatus('o1', 'en_proceso'), 'ordenes_trabajo'],
  ['updateWorkOrderProgress', () => workOrdersService.updateWorkOrderProgress('o1', 50), 'ordenes_trabajo'],
  ['updateAssignmentStatus', () => workOrdersService.updateAssignmentStatus('a1', 'en_curso'), 'orden_asignaciones'],
  ['setProgressVisibility', () => workOrdersService.setProgressVisibility('v1', true), 'orden_avances'],
];

describe('workOrdersService: escrituras que RLS puede rechazar en silencio', () => {
  beforeEach(() => {
    mocks.tables = [];
  });

  it.each(escritores)('%s termina bien cuando la base escribió la fila', async (_nombre, llamar, tabla) => {
    mocks.deleted = [{ id: 'o1' }];
    await expect(llamar()).resolves.not.toThrow();
    expect(mocks.tables).toEqual([tabla]);
  });

  it.each(escritores)('%s falla si la base no escribió nada, en vez de fingir éxito', async (_nombre, llamar) => {
    mocks.deleted = [];
    await expect(llamar()).rejects.toThrow(/No se pudo guardar/);
  });
});

// La firma aparte porque sube un archivo antes de escribir la fila, y ese orden es justo el
// problema: la imagen ya está en Storage cuando el UPDATE se queda en cero filas.
describe('uploadSignature', () => {
  beforeEach(() => {
    mocks.tables = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['x'])) }));
  });

  const orden = { id: 'o1', sede_id: 's1' };

  it('devuelve la ruta cuando la base guardó la firma', async () => {
    mocks.deleted = [{ id: 'o1' }];
    await expect(workOrdersService.uploadSignature(orden, 'data:image/png;base64,AA')).resolves.toMatchObject({
      ruta: expect.stringContaining('firma-'),
    });
  });

  // Sin esto decía "firmada", la orden quedaba sin firma y, como la primera firma autoriza
  // lo cotizado, el total se quedaba en cero.
  it('falla si la base no guardó la firma, en vez de devolver la ruta', async () => {
    mocks.deleted = [];
    await expect(workOrdersService.uploadSignature(orden, 'data:image/png;base64,AA')).rejects.toThrow(
      /No se pudo guardar/
    );
  });
});
