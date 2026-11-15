// Utilidades HTTP compartidas por las edge functions.

export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Cuánto se espera a un servicio externo (Resend, Gemini, el endpoint de un push). Sin tope, uno que
 * acepta la conexión y no responde detenía todo el lote hasta que el servidor mataba la función
 * (QA 19/10/2026). Al vencer, `fetch` lanza y el trabajo se reintenta con la espera creciente.
 */
export const FETCH_TIMEOUT_MS = 15_000;

export function fetchConTope(
  fetchFn: FetchFn,
  input: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetchFn(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
