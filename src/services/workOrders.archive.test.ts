// La forma de la consulta del archivo, no su resultado.
//
// `ArchivedOrders.test.tsx` sustituye el servicio entero, así que nunca vio la consulta
// que se manda de verdad. Y la primera versión de esta búsqueda estaba rota: un `or` de
// PostgREST no puede nombrar una tabla embebida (`clientes.nombre.ilike...` → 400
// PGRST100), y una coma dentro del término parte el árbol lógico y devuelve 42703. Las dos
// veces el 400 se pintaba en pantalla como "no hay órdenes archivadas", que es la peor
// forma posible de fallar: parece un dato, no un error.
//
// Por eso aquí se mira el texto del filtro: es lo único que distingue una consulta que la
// API acepta de una que rechaza.

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Consulta {
  table: string;
  or?: string;
  filtros: [string, string, unknown][];
  ilike?: [string, string];
  limit?: number;
  range?: [number, number];
}

const mocks = vi.hoisted(() => ({
  consultas: [] as unknown[],
  clientes: [] as { id: string }[],
  ordenes: [] as unknown[],
}));

vi.mock('./quotes.service', () => ({
  quotesService: { waitingOrderIds: vi.fn().mockResolvedValue(new Set<string>()) },
}));

vi.mock('../lib/supabase', () => {
  const from = (table: string) => {
    const rec: Consulta = { table, filtros: [] };
    mocks.consultas.push(rec);
    const filas = () => (table === 'clientes' ? mocks.clientes : mocks.ordenes);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order']) chain[m] = () => chain;
    for (const op of ['eq', 'lt', 'gte', 'is'] as const) {
      chain[op] = (col: string, val: unknown) => {
        rec.filtros.push([op, col, val]);
        return chain;
      };
    }
    chain.ilike = (col: string, patron: string) => {
      rec.ilike = [col, patron];
      return chain;
    };
    chain.limit = (n: number) => {
      rec.limit = n;
      return chain;
    };
    chain.or = (expr: string) => {
      rec.or = expr;
      return chain;
    };
    chain.range = (from_: number, to: number) => {
      rec.range = [from_, to];
      return Promise.resolve({ data: filas(), error: null });
    };
    // El builder de supabase-js es él mismo una promesa: la consulta de clientes se espera
    // sin `.range()`.
    chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: filas(), error: null }).then(resolve);
    return chain;
  };
  return { supabase: { from } };
});

const { workOrdersService } = await import('./workOrders.service');

const ORDENES = ['id', 'numero_orden', 'estatus', 'cliente_id', 'sede_id', 'fecha_finalizacion'];

/**
 * Los términos de un `or`, partiendo solo por las comas de primer nivel: las de dentro de
 * un `in.(…)` pertenecen a la lista.
 */
function terminos(expr: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = '';
  for (const c of expr) {
    if (c === '(') nivel++;
    else if (c === ')') nivel--;
    else if (c === ',' && nivel === 0) {
      partes.push(actual);
      actual = '';
      continue;
    }
    actual += c;
  }
  partes.push(actual);
  return partes;
}

const deTabla = (t: string) => (mocks.consultas as Consulta[]).filter((c) => c.table === t);
const archivo = () => deTabla('ordenes_trabajo')[0];

beforeEach(() => {
  mocks.consultas = [];
  mocks.clientes = [];
  mocks.ordenes = [];
});

describe('getArchivedWorkOrders: la consulta que se manda', () => {
  it('sin término no filtra por texto', async () => {
    await workOrdersService.getArchivedWorkOrders('s1');
    expect(archivo().or).toBeUndefined();
    expect(deTabla('clientes')).toHaveLength(0);
  });

  it('cada término del `or` es columna.operador.valor de la propia orden', async () => {
    mocks.clientes = [{ id: 'c1' }, { id: 'c2' }];
    await workOrdersService.getArchivedWorkOrders('s1', { search: 'Marta' });

    const partes = terminos(archivo().or!);
    expect(partes).toEqual(['numero_orden.ilike.*Marta*', 'cliente_id.in.(c1,c2)']);
    for (const parte of partes) {
      const [col, op] = parte.split('.');
      // Nombrar la tabla embebida era el fallo original: `clientes.nombre` deja `clientes`
      // como columna, que en `ordenes_trabajo` no existe.
      expect(ORDENES).toContain(col);
      expect(op).toMatch(/^(ilike|in|eq|gte|lt|is)$/);
    }
  });

  it('sin clientes que casen no manda una lista vacía', async () => {
    await workOrdersService.getArchivedWorkOrders('s1', { search: 'Marta' });
    // `cliente_id.in.()` es un 400: buscar algo que no existe tiene que dar cero filas,
    // no un error.
    expect(archivo().or).toBe('numero_orden.ilike.*Marta*');
  });

  it('una coma o un paréntesis en el término no parten el filtro', async () => {
    await workOrdersService.getArchivedWorkOrders('s1', { search: 'Pérez, Juan (padre) 100%' });

    const partes = terminos(archivo().or!);
    expect(partes).toHaveLength(1);
    expect(partes[0]).toBe('numero_orden.ilike.*Pérez  Juan  padre  100*');
  });

  it('los clientes se buscan acotados: sus ids viajan en la URL', async () => {
    await workOrdersService.getArchivedWorkOrders('s1', { search: 'a' });

    const [q] = deTabla('clientes');
    expect(q.ilike).toEqual(['nombre', '%a%']);
    expect(q.limit).toBeGreaterThan(0);
    expect(q.limit).toBeLessThanOrEqual(200);
  });

  it('pide exactamente la página pedida', async () => {
    await workOrdersService.getArchivedWorkOrders('s1', { limit: 25, offset: 50 });
    expect(archivo().range).toEqual([50, 74]);
  });
});

// Las dos listas tienen que partir las órdenes en dos: si los cortes se separan, una orden
// entregada justo en la frontera no sale en ninguna de las dos y parece desaparecida.
describe('el corte de 90 días es el mismo en las dos listas', () => {
  it('el tablero pide desde el corte y el archivo antes del corte', async () => {
    await workOrdersService.getWorkOrders('s1');
    const tablero = archivo().or!;
    mocks.consultas = [];
    await workOrdersService.getArchivedWorkOrders('s1');
    const corteArchivo = archivo().filtros.find(
      ([op, col]) => op === 'lt' && col === 'fecha_finalizacion'
    );

    expect(corteArchivo).toBeDefined();
    expect(tablero).toContain(`fecha_finalizacion.gte.${corteArchivo![2]}`);
    // Y una entregada sin fecha sigue en el tablero: existe, y sin esto no estaría en
    // ninguna de las dos listas.
    expect(tablero).toContain('fecha_finalizacion.is.null');
  });
});
