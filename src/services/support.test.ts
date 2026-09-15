import { describe, it, expect } from 'vitest';
import { fetchAll } from './support';

describe('fetchAll', () => {
  it('pide páginas hasta que una llega incompleta y junta todas las filas', async () => {
    const table = Array.from({ length: 2500 }, (_, i) => i);
    const calls: [number, number][] = [];

    const rows = await fetchAll<number>(async (from, to) => {
      calls.push([from, to]);
      return { data: table.slice(from, to + 1), error: null };
    });

    expect(rows).toHaveLength(2500);
    expect(rows[2499]).toBe(2499);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('con menos de una página hace una sola consulta', async () => {
    let calls = 0;
    const rows = await fetchAll<number>(async () => {
      calls += 1;
      return { data: [1, 2, 3], error: null };
    });
    expect(rows).toEqual([1, 2, 3]);
    expect(calls).toBe(1);
  });

  it('pide una página más cuando la anterior llegó justo llena', async () => {
    const table = Array.from({ length: 1000 }, (_, i) => i);
    let calls = 0;
    const rows = await fetchAll<number>(async (from, to) => {
      calls += 1;
      return { data: table.slice(from, to + 1), error: null };
    });
    expect(rows).toHaveLength(1000);
    expect(calls).toBe(2);
  });

  it('propaga el error de cualquier página', async () => {
    const failure = { code: '42501', message: 'denied' };
    await expect(
      fetchAll<number>(async (from) => (from === 0 ? { data: new Array(1000).fill(0), error: null } : { data: null, error: failure }))
    ).rejects.toBe(failure);
  });
});
