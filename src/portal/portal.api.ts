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
