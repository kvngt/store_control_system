// Cliente compartido de Resend para enviar correos transaccionales desde las edge functions.
import { type FetchFn, fetchConTope } from './http.ts';

/** Resend limita a 2 peticiones por segundo en el plan gratuito. */
export const EMAIL_SPACING_MS = 550;

export type SleepFn = (ms: number) => Promise<void>;

export interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface ResendSendOptions {
  apiKey: string;
  idempotencyKey: string;
  payload: ResendEmailPayload;
}

export type ResendSendResult =
  | { ok: true; proveedorId?: string }
  | { ok: false; estado: 'error'; detalle: string };

export async function enviarPorResend(
  fetchFn: FetchFn,
  sleep: SleepFn,
  { apiKey, idempotencyKey, payload }: ResendSendOptions,
): Promise<ResendSendResult> {
  const res = await fetchConTope(fetchFn, 'https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Si esta invocación muere después de que Resend aceptó el correo, el
      // reintento con la misma clave no manda un segundo correo.
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  await sleep(EMAIL_SPACING_MS);

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, proveedorId: body.id };
  }

  const body = (await res.text().catch(() => '')).slice(0, 300);
  // La llave mal puesta (401, o el 400 "API key is invalid" que manda Resend) es configuración:
  // se dice con palabras que señalen el secreto, y se reintenta con la espera creciente de
  // `finish_outbox`, para que los correos salgan solos si la llave se corrige a tiempo. Pasó
  // en producción el 02/10/2026; después de los reintentos queda en error y se puede
  // reintentar desde la app (`reintentar_envio`).
  if (res.status === 401 || /api key/i.test(body)) {
    throw new Error(`La llave de Resend no es válida: revisa el secreto RESEND_API_KEY. Resend HTTP ${res.status}: ${body}`);
  }
  const detail = `Resend HTTP ${res.status}: ${body}`;
  // Límite de envío o falla de Resend: vale la pena reintentar. Otro 4xx (dirección
  // inválida, dominio sin verificar) no se arregla solo.
  if (res.status === 429 || res.status >= 500) throw new Error(detail);
  return { ok: false, estado: 'error', detalle: detail };
}
