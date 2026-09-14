import type { PortalResponse } from './portal.types';

// fetch directo a la edge function: sin el cliente de Supabase, que el portal no
// necesita y pesa más que todo el resto del paquete.
function portalEndpoint(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
  if (!base) throw new Error('VITE_SUPABASE_URL no está configurada.');
  return `${base}/functions/v1/portal`;
}

export class PortalRequestError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`portal HTTP ${status}`);
    this.status = status;
  }
}

/** El reporte. 404 y 410 son respuestas normales (enlace inexistente, vencido o revocado). */
export async function fetchPortal(token: string, signal?: AbortSignal): Promise<PortalResponse> {
  const res = await fetch(`${portalEndpoint()}?token=${encodeURIComponent(token)}`, {
    signal,
    // El token va en la URL de la función; que no viaje además como Referer.
    referrerPolicy: 'no-referrer',
  });
  if (res.ok || res.status === 404 || res.status === 410) {
    return (await res.json()) as PortalResponse;
  }
  throw new PortalRequestError(res.status);
}

export type QuoteAnswer =
  | { ok: true; autorizados: number; rechazados: number; total_autorizado: number }
  | {
      ok: false;
      motivo: 'enlace_invalido' | 'no_encontrado' | 'ya_respondido' | 'cancelado' | 'nombre_requerido' | 'presupuesto_cambio' | 'lineas_invalidas' | 'solicitud_invalida';
    };

/**
 * Responde el presupuesto. `shownIds` son todas las líneas que el cliente vio: si el
 * taller cambió el presupuesto mientras tanto, la respuesta vuelve con
 * `presupuesto_cambio` en vez de rechazar lo que el cliente no llegó a ver.
 */
export async function answerQuote(
  token: string,
  input: { quoteId: string; approvedIds: string[]; shownIds: string[]; name: string; comment: string }
): Promise<QuoteAnswer> {
  const res = await fetch(portalEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    referrerPolicy: 'no-referrer',
    body: JSON.stringify({
      token,
      accion: 'responder_presupuesto',
      presupuesto_id: input.quoteId,
      aprobadas: input.approvedIds,
      lineas: input.shownIds,
      nombre: input.name,
      comentario: input.comment,
    }),
  });
  if (!res.ok && res.status !== 400) throw new PortalRequestError(res.status);
  return (await res.json()) as QuoteAnswer;
}

export async function setEmailPreference(token: string, accepts: boolean): Promise<boolean> {
  const res = await fetch(portalEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    referrerPolicy: 'no-referrer',
    body: JSON.stringify({ token, accion: 'preferencia_correos', acepta: accepts }),
  });
  if (!res.ok) throw new PortalRequestError(res.status);
  const body = (await res.json()) as { ok: boolean; acepta_correos?: boolean };
  if (!body.ok) throw new PortalRequestError(404);
  return body.acepta_correos ?? accepts;
}
