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
/** "2026-10-10" como fecha local ("10 oct 2026"), sin el corrimiento de `new Date('AAAA-MM-DD')`. */
export function formatDay(value: string, language: string): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function todayLocal(): string {
  return daysFromTodayLocal(0);
}

/**
 * Hoy más `days` días, en la zona del navegador, como `YYYY-MM-DD`. La fecha
 * estimada de entrega por defecto (hoy + 5) se calculaba en UTC y, capturada de
 * noche, caía un día después.
 */
export function daysFromTodayLocal(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** "2026-09" → ["2026-09-01", "2026-10-01"]: el mes, con el fin excluido. Sin `Date`: es texto. */
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
}

/** Rango del mes actual: del 1 de este mes hasta hoy (`[desde, hasta]`). */
export function currentMonthRangeLocal(): [string, string] {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return [`${year}-${month}-01`, `${year}-${month}-${day}`];
}

/** Rango del mes pasado: del 1 al último día del mes anterior (`[desde, hasta]`). */
export function previousMonthRangeLocal(): [string, string] {
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = prevMonthDate.getFullYear();
  const month = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, prevMonthDate.getMonth() + 1, 0).getDate();
  return [`${year}-${month}-01`, `${year}-${month}-${String(lastDay).padStart(2, '0')}`];
}

/** Rango de los últimos 30 días: hoy - 30 hasta hoy (`[desde, hasta]`). */
export function last30DaysRangeLocal(): [string, string] {
  return [daysFromTodayLocal(-30), daysFromTodayLocal(0)];
}

/** Formatea minutos como "1h 25m" o "25m". */
export function formatDurationMinutes(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m < 10 ? '0' : ''}${m}m`;
}

