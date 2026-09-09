/**
 * Fechas del taller, en la zona horaria del taller.
 *
 * Todo lo de aquí existe por el mismo defecto, que apareció dos veces:
 * `new Date('2026-09-01')` **no** es el 1 de septiembre local. Una cadena
 * ISO de sólo fecha se parsea como medianoche **UTC** por especificación, y
 * `getMonth()` la convierte de vuelta a hora local — así que en cualquier zona
 * al oeste de UTC (toda Norteamérica) resulta el 31 de agosto.
 *
 * Eso importa porque `finanzas_movimientos.fecha` es una columna `DATE`:
 * PostgREST la devuelve exactamente en ese formato, y los triggers de la orden
 * la llenan con `CURRENT_DATE`. Un carro entregado el día 1 reportaba su
 * ingreso en el mes anterior, en los KPI del panel y en las seis barras del
 * gráfico. Nada lo decía, y cada cierre de mes empezaba con una cifra
 * ligeramente equivocada.
 */

/** `YYYY-MM-DD` -> [año, mes 0-indexado] sin pasar por `Date`, o null. */
function isoParts(value: string): [number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]) - 1];
}

/**
 * True cuando `value` cae en el mismo mes natural que `ref`.
 *
 * Acepta las dos formas en las que la base devuelve una fecha:
 * - `DATE` -> `'2026-09-01'`, que se lee por componentes, sin zona horaria
 *   que la pueda mover de mes.
 * - `TIMESTAMPTZ` -> `'2026-09-01T14:03:00+00:00'`, que sí lleva un instante
 *   real y se compara en la hora local del navegador, que es donde está el
 *   taller.
 */
export function isSameMonth(value: string, ref: Date): boolean {
  if (!value) return false;

  const parts = isoParts(value);
  if (parts) {
    const [year, month] = parts;
    return month === ref.getMonth() && year === ref.getFullYear();
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

/**
 * Hoy, en la zona del navegador, como `YYYY-MM-DD`.
 *
 * Reemplaza a `new Date().toISOString().split('T')[0]`, que da la fecha **UTC**:
 * en EE.UU. después de las 18:00–19:00 locales eso ya es mañana, así que un
 * movimiento capturado a las 8 de la noche y un cheque de comisiones firmado a
 * esa hora se guardaban con la fecha del día siguiente. Es el valor por defecto
 * de dos formularios de dinero, y también el que se compara contra el estado de
 * cuenta al conciliar.
 */
export function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
