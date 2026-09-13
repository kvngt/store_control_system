// Envía lo que espera en `cola_envios`. Hoy: notificaciones push a los teléfonos
// del equipo del taller. En la fase 4: los correos al cliente.
//
// La llaman la base al instante (pg_net, cuando se crea un aviso) y pg_cron cada
// minuto como red de seguridad. `claim_outbox` toma las filas con
// FOR UPDATE SKIP LOCKED, así que dos invocaciones a la vez no envían dos veces.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { isAuthorizedInternalCall, json } from '../_shared/internal.ts';

interface OutboxJob {
  id: string;
  canal: 'push' | 'email';
  destinatario: string;
  plantilla: string;
  datos: Record<string, unknown>;
  intentos: number;
}

interface JobResult {
  estado: 'enviado' | 'omitido' | 'error';
  detalle?: string;
}

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

/** ~50 s de trabajo por invocación: lejos del límite de 400 s y del próximo cron. */
const TIME_BUDGET_MS = 50_000;

function vapidDetails() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:notificaciones@reinventa.shop';
  if (!publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

/**
 * Un push a cada teléfono de la persona.
 *
 * `web-push` se usa solo para cifrar el mensaje y firmar la cabecera VAPID
 * (`generateRequestDetails`); la petición la manda `fetch`. Así no depende de la
 * capa de compatibilidad de `https` de Node dentro de Deno, que es la parte de
 * esa librería con más historial de problemas fuera de Node.
 */
async function sendPush(job: OutboxJob): Promise<JobResult> {
  const vapid = vapidDetails();
  // Falta configuración: se reintenta, porque arreglarla no requiere volver a
  // generar el aviso.
  if (!vapid) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configuradas.');

  const { data: subs, error } = await supabase
    .from('push_suscripciones')
    .select('id, endpoint, p256dh, auth')
    .eq('usuario_id', job.destinatario);
  if (error) throw error;
  if (!subs?.length) return { estado: 'omitido', detalle: 'La persona no tiene dispositivos con push.' };

  const payload = JSON.stringify({
    title: job.datos.titulo ?? 'Restorify',
    body: job.datos.cuerpo ?? '',
    url: job.datos.url ?? '/',
    tag: job.datos.tag,
  });

  let delivered = 0;
  const failures: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const request = webpush.generateRequestDetails(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          // Un día de vida: un aviso de "orden asignada" que llega mañana todavía
          // sirve; uno de hace una semana ya no.
          { TTL: 60 * 60 * 24, urgency: 'high', vapidDetails: vapid }
        );

        const res = await fetch(request.endpoint, {
          method: request.method,
          headers: request.headers as Record<string, string>,
          // Copia a un ArrayBuffer propio: `fetch` no acepta un Buffer de Node
          // (respaldado por ArrayBufferLike) como cuerpo.
          body: request.body ? new Uint8Array(request.body as ArrayLike<number>) : null,
        });

        if (res.status === 404 || res.status === 410) {
          // El navegador dio de baja la suscripción (app desinstalada, permiso
          // quitado). No va a volver: se borra.
          await supabase.from('push_suscripciones').delete().eq('id', sub.id);
          return;
        }
        if (!res.ok) {
          const text = (await res.text().catch(() => '')).slice(0, 300);
          throw new Error(`HTTP ${res.status} ${text}`.trim());
        }
        delivered += 1;
        await supabase.from('push_suscripciones').update({ ultimo_error: null }).eq('id', sub.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(message);
        await supabase.from('push_suscripciones').update({ ultimo_error: message.slice(0, 500) }).eq('id', sub.id);
      }
    })
  );

  if (delivered > 0) {
    return { estado: 'enviado', detalle: failures.length ? `Falló en ${failures.length} dispositivo(s).` : undefined };
  }
  if (failures.length === 0) return { estado: 'omitido', detalle: 'Todas las suscripciones estaban vencidas.' };
  throw new Error(failures.join(' | '));
}

async function handle(job: OutboxJob): Promise<JobResult> {
  switch (job.canal) {
    case 'push':
      return sendPush(job);
    default:
      // Los correos llegan en la fase 4. Si algo los encola antes, que quede a la
      // vista en vez de reintentarse para siempre.
      return { estado: 'error', detalle: `Canal "${job.canal}" todavía no implementado.` };
  }
}

Deno.serve(async (req) => {
  if (!isAuthorizedInternalCall(req)) return json({ error: 'No autorizado.' }, 401);

  const started = Date.now();
  const summary = { enviados: 0, omitidos: 0, errores: 0, reintentos: 0 };

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data, error } = await supabase.rpc('claim_outbox', { p_limit: 25 });
    if (error) return json({ error: error.message, ...summary }, 500);
    const jobs = (data ?? []) as OutboxJob[];
    if (jobs.length === 0) break;

    for (const job of jobs) {
      try {
        const result = await handle(job);
        await supabase.rpc('finish_outbox', {
          p_id: job.id,
          p_estado: result.estado,
          p_error: result.detalle ?? null,
        });
        if (result.estado === 'enviado') summary.enviados += 1;
        else if (result.estado === 'omitido') summary.omitidos += 1;
        else summary.errores += 1;
      } catch (err) {
        await supabase.rpc('finish_outbox', {
          p_id: job.id,
          p_estado: 'reintentar',
          p_error: err instanceof Error ? err.message : String(err),
        });
        summary.reintentos += 1;
      }
    }
  }

  return json(summary);
});
