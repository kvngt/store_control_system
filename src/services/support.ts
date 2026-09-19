// Cross-cutting helpers shared by the domain services.

/**
 * Filas por página al leer listas completas. Es el máximo que devuelve la API de
 * Supabase por consulta con la configuración por defecto (Project Settings → API →
 * Max rows = 1000). **No lo bajes en el panel**: `fetchAll` corta en la primera página
 * que llega incompleta.
 */
export const PAGE_SIZE = 1000;

/**
 * Todas las filas de una consulta, de a páginas.
 *
 * PostgREST devuelve como máximo `Max rows` filas y **no avisa cuando corta**: una lista
 * de movimientos, órdenes o clientes que pasa de ese número pierde filas en silencio, y
 * todo lo que se calcule con ella sale mal. `page(from, to)` debe devolver la consulta
 * con `.range(from, to)` y un orden estable (que termine en una columna única, como
 * `id`); sin orden estable una fila puede repetirse o perderse entre páginas.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize: number = PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

// A DELETE the RLS policy refuses is not an error in PostgREST: the row simply
// isn't visible to the statement, so it reports success having removed nothing.
// Without this the UI would say "deleted" and then redraw the row still there.
// `.select('id')` makes the affected rows observable, so a no-op can be turned
// into the same 42501 the error mapper already renders as "no tienes permiso".
// Lo mismo para un UPDATE, que tiene el mismo agujero: una política que no deja pasar la
// fila devuelve cero filas y ningún error, así que la pantalla diría "guardado" sobre algo
// que no se guardó.
export function assertAffected(rows: { id: string }[] | null, entity: string) {
  if ((rows || []).length === 0) {
    throw Object.assign(
      new Error(`No se pudo guardar ${entity}: permiso denegado o el registro ya no existe.`),
      { code: '42501' }
    );
  }
}

export function assertDeleted(rows: { id: string }[] | null, entity: string) {
  if ((rows || []).length === 0) {
    throw Object.assign(
      new Error(`No se pudo eliminar ${entity}: permiso denegado o el registro ya no existe.`),
      { code: '42501' }
    );
  }
}
