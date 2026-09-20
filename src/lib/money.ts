/**
 * El dinero, escrito igual en toda la aplicación.
 *
 * Había dos formatos a la vez: `toFixed(2)` daba `$1200.00` en las tarjetas de una orden y
 * `toLocaleString()` daba `$1,650` en las listas. El segundo no es solo otro estilo, está
 * mal: `toLocaleString()` sin opciones **se come los centavos**. Un total de 1650.50 se
 * pinta "$1,650.5", que se lee como cinco centavos; 1650.256 se pinta con tres decimales; y
 * 1650.00 pierde el ".00", así que dos filas de la misma tabla no se alinean.
 *
 * Es notación de Estados Unidos a propósito, no por descuido. Los libros se cuadran contra
 * un estado de cuenta de Wells Fargo, y en español la app usa `es-US` — el mismo locale que
 * el portal del cliente — que formatea exactamente igual que `en-US`: `$1,650.50`. Sin
 * locale, en cambio, el navegador de un teléfono en español escribiría "1.650,50 US$" y la
 * misma cifra se vería distinta en cada aparato.
 */
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * `1650.5` → `$1,650.50`; `-200` → `-$200.00`; nada → `$0.00`.
 *
 * Trata lo que no es número como cero en vez de pintar "$NaN": los montos llegan de
 * PostgREST como cadena (`numeric`), y un embed que la RLS bloquea llega en null.
 */
export function money(value: number | string | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return usd.format(Number.isFinite(n) ? n : 0);
}

/**
 * El monto con su signo delante, para las filas de finanzas: `+$200.00` / `-$200.00`.
 *
 * Los movimientos se guardan siempre positivos y el signo lo da el tipo, así que se pasa
 * aparte. Se usa el valor absoluto para que un monto negativo por error no salga `+-$200`.
 */
export function moneySigned(value: number | string | null | undefined, positive: boolean): string {
  const n = Math.abs(typeof value === 'number' ? value : Number(value ?? 0));
  return `${positive ? '+' : '-'}${money(Number.isFinite(n) ? n : 0)}`;
}
