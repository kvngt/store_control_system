// Envía lo que espera en `cola_envios`: notificaciones push a los teléfonos del
// equipo del taller y correos al cliente (Resend).
//
// La llaman la base al instante (pg_net, cuando se crea un aviso) y pg_cron cada
// minuto como red de seguridad. `claim_outbox` toma las filas con
// FOR UPDATE SKIP LOCKED, así que dos invocaciones a la vez no envían dos veces.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { DEFAULT_GEMINI_MODEL, pedirJsonAGemini } from '../_shared/gemini.ts';
import { type FetchFn, fetchConTope } from '../_shared/http.ts';
import { type EnvGetter, isAuthorizedInternalCall, json } from '../_shared/internal.ts';
import { ANNOUNCED_STATUSES, renderEmail, renderEmployeeEmail } from '../_shared/email/templates.ts';
import { enviarPorResend } from '../_shared/resend.ts';

export type { FetchFn };

export interface Deps {
  supabase: SupabaseClient;
  fetch: FetchFn;
  getEnv: EnvGetter;
  sleep: (ms: number) => Promise<void>;
  renderEmail: typeof renderEmail;
}

export function defaultDeps(): Deps {
  const getEnv: EnvGetter = (key) => Deno.env.get(key);
  return {
    supabase: createClient(getEnv('SUPABASE_URL')!, getEnv('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    }),
    fetch: (input, init) => globalThis.fetch(input, init),
    getEnv,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    renderEmail,
  };
}

interface OutboxJob {
  id: string;
  canal: 'push' | 'email' | 'traduccion';
  destinatario: string;
  plantilla: string;
  datos: Record<string, unknown>;
  orden_id?: string;
  intentos: number;
}

interface JobResult {
  estado: 'enviado' | 'omitido' | 'error';
  detalle?: string;
  /** Id del mensaje en el proveedor (Resend), para rastrear un correo. */
  proveedorId?: string;
}

/** ~50 s de trabajo por invocación: lejos del límite de 400 s y del próximo cron. */
const TIME_BUDGET_MS = 50_000;

/** Las plantillas que llevan las líneas del presupuesto (traducidas en inglés). */
const LINE_TEMPLATES: ReadonlySet<string> = new Set(['presupuesto', 'presupuesto_confirmacion']);

function vapidDetails(getEnv: EnvGetter) {
  const publicKey = getEnv('VAPID_PUBLIC_KEY');
  const privateKey = getEnv('VAPID_PRIVATE_KEY');
  const subject = getEnv('VAPID_SUBJECT') || 'mailto:notificaciones@restorifyauto.net';
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
async function sendPush(job: OutboxJob, deps: Deps): Promise<JobResult> {
  const vapid = vapidDetails(deps.getEnv);
  // Falta configuración: se reintenta, porque arreglarla no requiere volver a
  // generar el aviso.
  if (!vapid) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configuradas.');

  const { data: subs, error } = await deps.supabase
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

        const res = await fetchConTope(deps.fetch, request.endpoint, {
          method: request.method,
          headers: request.headers as Record<string, string>,
          // Copia a un ArrayBuffer propio: `fetch` no acepta un Buffer de Node
          // (respaldado por ArrayBufferLike) como cuerpo.
          body: request.body ? new Uint8Array(request.body as ArrayLike<number>) : null,
        });

        if (res.status === 404 || res.status === 410) {
          // El navegador dio de baja la suscripción (app desinstalada, permiso
          // quitado). No va a volver: se borra.
          await deps.supabase.from('push_suscripciones').delete().eq('id', sub.id);
          return;
        }
        if (!res.ok) {
          const text = (await res.text().catch(() => '')).slice(0, 300);
          throw new Error(`HTTP ${res.status} ${text}`.trim());
        }
        delivered += 1;
        await deps.supabase.from('push_suscripciones').update({ ultimo_error: null }).eq('id', sub.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(message);
        await deps.supabase.from('push_suscripciones').update({ ultimo_error: message.slice(0, 500) }).eq('id', sub.id);
      }
    })
  );

  if (delivered > 0) {
    return { estado: 'enviado', detalle: failures.length ? `Falló en ${failures.length} dispositivo(s).` : undefined };
  }
  if (failures.length === 0) return { estado: 'omitido', detalle: 'Todas las suscripciones estaban vencidas.' };
  throw new Error(failures.join(' | '));
}

/** Lo que devuelve `datos_correo`: todo leído al momento de enviar. */
interface EmailData {
  token: string;
  /** `idioma` desde 20261010000022 (es | en). Sin él, el correo sale en inglés. */
  cliente: { nombre: string | null; email: string | null; email_valido: boolean; acepta_correos: boolean; idioma?: string | null };
  /** Texto original → inglés de lo que el taller escribió (20261010000022). */
  traducciones?: Record<string, string> | null;
  taller: {
    nombre: string;
    direccion: string | null;
    telefono: string | null;
    /** Desde 20261010000025; la base ya los manda limpios. */
    telefonos?: { label: string; numero: string; tipo?: 'oficina' | 'celular'; whatsapp?: boolean }[] | null;
    email: string | null;
    logo_url: string | null;
    color: string | null;
  };
  orden: { numero: string; estatus: string; fecha_ingreso: string | null; fecha_estimada_entrega: string | null; retirada_sin_reparar?: boolean | null };
  vehiculo: string | null;
  ultimo_estatus_enviado: string | null;
  presupuesto: {
    numero: number;
    estado: string;
    via: string | null;
    total_propuesto: number;
    total_aprobado: number | null;
    lineas: { descripcion: string; monto: number; estado: string }[];
  } | null;
  parqueo?: {
    estado: string;
    inicio: string | null;
    tarifa_inicial: number;
  } | null;
}

/** Quita lo que rompería la cabecera From: comillas, ángulos y saltos de línea. */
function displayName(name: string): string {
  return name.replace(/["<>\r\n]/g, '').trim().slice(0, 70) || 'Restorify';
}

function emailEnvConfig(getEnv: EnvGetter) {
  const apiKey = getEnv('RESEND_API_KEY');
  const siteUrl = (getEnv('PUBLIC_SITE_URL') || '').replace(/\/+$/, '');
  const fromAddress = getEnv('EMAIL_FROM_ADDRESS') || 'notificaciones@restorifyauto.net';
  // Falta configuración: se reintenta, porque arreglarla no requiere volver a
  // generar el aviso.
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada.');
  if (!/^https?:\/\//.test(siteUrl)) throw new Error('PUBLIC_SITE_URL no configurada.');
  return { apiKey, siteUrl, fromAddress };
}

/**
 * Un correo al cliente.
 *
 * Todo se decide al enviar, no al encolar: si el cliente se dio de baja, corrigió
 * su correo o la orden volvió a un estado que no se anuncia mientras el aviso
 * esperaba, se respeta el estado actual.
 */
async function sendEmail(job: OutboxJob, deps: Deps): Promise<JobResult> {
  // El correo al técnico (06/10/2026) tiene su propio camino: nunca pasa por `datos_correo`,
  // que es el del cliente.
  if (job.plantilla === 'empleado') return sendEmployeeEmail(job, deps);
  const { apiKey, siteUrl, fromAddress } = emailEnvConfig(deps.getEnv);

  const { data, error } = await deps.supabase.rpc('datos_correo', { p_cola_id: job.id });
  if (error) throw error;
  const ctx = data as EmailData | null;

  if (!ctx) return { estado: 'omitido', detalle: 'La orden ya no existe o su enlace fue desactivado.' };
  if (!ctx.cliente?.email_valido || !ctx.cliente.email) {
    return { estado: 'omitido', detalle: 'El cliente no tiene un correo válido.' };
  }
  if (!ctx.cliente.acepta_correos) return { estado: 'omitido', detalle: 'El cliente pidió no recibir correos.' };

  if (job.plantilla === 'estatus') {
    if (!(ANNOUNCED_STATUSES as readonly string[]).includes(ctx.orden.estatus)) {
      return { estado: 'omitido', detalle: `La orden está en "${ctx.orden.estatus}", que no se anuncia.` };
    }
    if (ctx.ultimo_estatus_enviado === ctx.orden.estatus) {
      return { estado: 'omitido', detalle: 'El cliente ya recibió el aviso de este estado.' };
    }
  }

  if (job.plantilla === 'presupuesto') {
    if (!ctx.presupuesto || ctx.presupuesto.estado !== 'enviado') {
      return { estado: 'omitido', detalle: 'El presupuesto ya fue respondido o cancelado.' };
    }
    if (!ctx.presupuesto.lineas.some((l) => l.estado === 'pendiente')) {
      return { estado: 'omitido', detalle: 'El presupuesto no tiene trabajos pendientes.' };
    }
  }
  if (job.plantilla === 'presupuesto_confirmacion' && ctx.presupuesto?.estado !== 'respondido') {
    return { estado: 'omitido', detalle: 'El presupuesto no tiene una respuesta registrada.' };
  }

  // Inglés salvo que el cliente haya elegido español en su enlace (pedido del taller,
  // 06/10/2026). En inglés, las líneas del presupuesto van traducidas si ya hay traducción.
  const lang = ctx.cliente.idioma === 'es' ? 'es' : 'en';

  // Las líneas recién escritas se traducen unos segundos después (la traducción se encola a los
  // 10 s), y el correo del presupuesto, o el de su confirmación, salía antes con las líneas en
  // español. Si la traducción de esta orden sigue en cola, el correo vuelve a la cola
  // (reintentar: 1 min y luego 4 min). Solo las dos primeras veces: después sale como esté, para
  // que una traducción que falla no detenga el correo.
  if (lang === 'en' && LINE_TEMPLATES.has(job.plantilla) && job.orden_id && job.intentos <= 2) {
    const { count, error: pendingErr } = await deps.supabase
      .from('cola_envios')
      .select('id', { count: 'exact', head: true })
      .eq('canal', 'traduccion')
      .eq('orden_id', job.orden_id)
      .in('estado', ['pendiente', 'procesando']);
    if (!pendingErr && (count ?? 0) > 0) {
      throw new Error('Esperando la traducción de las líneas del presupuesto.');
    }
  }

  const dict = lang === 'en' ? ctx.traducciones ?? {} : {};
  const tr = (text: string) => dict[text.trim()] ?? text;

  const email = deps.renderEmail(job.plantilla, {
    lang,
    portalUrl: `${siteUrl}/r/${ctx.token}`,
    cliente: { nombre: ctx.cliente.nombre },
    taller: {
      nombre: ctx.taller.nombre,
      direccion: ctx.taller.direccion,
      telefono: ctx.taller.telefono,
      telefonos: ctx.taller.telefonos,
      email: ctx.taller.email,
      logoUrl: ctx.taller.logo_url,
      color: ctx.taller.color,
    },
    orden: {
      numero: ctx.orden.numero,
      estatus: ctx.orden.estatus,
      fechaIngreso: ctx.orden.fecha_ingreso,
      fechaEstimadaEntrega: ctx.orden.fecha_estimada_entrega,
      retirada_sin_reparar: ctx.orden.retirada_sin_reparar,
    },
    vehiculo: ctx.vehiculo,
    timeZone: deps.getEnv('SHOP_TIMEZONE') || 'America/New_York',
    presupuesto: ctx.presupuesto
      ? {
          numero: ctx.presupuesto.numero,
          estado: ctx.presupuesto.estado,
          via: ctx.presupuesto.via,
          totalPropuesto: Number(ctx.presupuesto.total_propuesto),
          totalAprobado: ctx.presupuesto.total_aprobado == null ? null : Number(ctx.presupuesto.total_aprobado),
          lineas: ctx.presupuesto.lineas.map((l) => ({ ...l, descripcion: tr(l.descripcion) })),
        }
      : null,
    parqueo: ctx.parqueo,
  });
  if (!email) return { estado: 'error', detalle: `Plantilla "${job.plantilla}" desconocida.` };

  const result = await enviarPorResend(deps.fetch, deps.sleep, {
    apiKey,
    idempotencyKey: job.id,
    payload: {
      from: `${displayName(ctx.taller.nombre)} <${fromAddress}>`,
      to: [ctx.cliente.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
      // El cliente responde al taller, no a una dirección que nadie lee.
      ...(ctx.taller.email ? { reply_to: ctx.taller.email } : {}),
      tags: [{ name: 'plantilla', value: job.plantilla }],
    },
  });

  if (!result.ok) return { estado: result.estado, detalle: result.detalle };

  if (job.plantilla === 'estatus') {
    await deps.supabase.rpc('marcar_estatus_enviado', { p_cola_id: job.id, p_estatus: ctx.orden.estatus });
  }
  return { estado: 'enviado', proveedorId: result.proveedorId };
}

/**
 * Un correo a un técnico: orden o tarea asignada, o la respuesta del cliente a un presupuesto.
 * Se manda a la dirección que se encoló (la de su perfil) con lo que guardó `notificar`.
 */
async function sendEmployeeEmail(job: OutboxJob, deps: Deps): Promise<JobResult> {
  const { apiKey, siteUrl, fromAddress } = emailEnvConfig(deps.getEnv);

  const datos = job.datos as {
    sede_id?: string | null;
    tipo?: string;
    titulo?: string;
    url?: string;
    lineas?: unknown[];
  };
  if (!datos.titulo) return { estado: 'omitido', detalle: 'El aviso no tiene título.' };

  let taller = { nombre: 'Restorify', logoUrl: null as string | null, color: null as string | null };
  if (datos.sede_id) {
    const { data: sede } = await deps.supabase.from('sedes').select('nombre, logo_url, color_tema').eq('id', datos.sede_id).maybeSingle();
    if (sede) taller = { nombre: sede.nombre, logoUrl: sede.logo_url, color: sede.color_tema };
  }

  const email = renderEmployeeEmail({
    appUrl: `${siteUrl}${datos.url?.startsWith('/') ? datos.url : '/'}`,
    taller,
    tipo: datos.tipo ?? '',
    titulo: datos.titulo,
    lineas: (datos.lineas ?? []).map((l) => String(l ?? '')),
  });

  const result = await enviarPorResend(deps.fetch, deps.sleep, {
    apiKey,
    idempotencyKey: job.id,
    payload: {
      from: `${displayName(taller.nombre)} <${fromAddress}>`,
      to: [job.destinatario],
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: 'plantilla', value: 'empleado' }],
    },
  });

  if (!result.ok) return { estado: result.estado, detalle: result.detalle };
  return { estado: 'enviado', proveedorId: result.proveedorId };
}

async function sendTraduccion(job: OutboxJob, deps: Deps): Promise<JobResult> {
  const apiKey = deps.getEnv('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.');

  if (!job.orden_id) return { estado: 'error', detalle: 'El job de traducción no tiene orden_id.' };

  const { data: orden, error: errOrden } = await deps.supabase
    .from('ordenes_trabajo')
    .select('sede_id')
    .eq('id', job.orden_id)
    .single();

  if (errOrden || !orden) return { estado: 'omitido', detalle: 'La orden ya no existe.' };

  const { data: textos, error: errTextos } = await deps.supabase
    .rpc('_textos_cliente', { p_orden_id: job.orden_id });

  if (errTextos) throw errTextos;
  if (!textos || textos.length === 0) return { estado: 'omitido', detalle: 'La orden no tiene textos visibles.' };

  const model = deps.getEnv('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  const gemini = await pedirJsonAGemini(deps.fetch, {
    apiKey,
    model,
    systemInstruction:
      'Eres un traductor técnico de un taller automotriz. Traduce el siguiente array JSON de español a inglés. Si una frase ya está en inglés, o es un nombre propio/marca, consérvala o corrígela si tiene errores. Devuelve estrictamente un objeto JSON con la forma {"traducciones": ["texto1", "texto2"]} manteniendo el mismo orden y longitud del array original. No incluyas markdown ni explicaciones.',
    userText: JSON.stringify(textos),
  });

  if (!gemini.ok) {
    // Una respuesta vacía, rota o de otro largo es lo que suele hacer un modelo de lenguaje de vez en
    // cuando: se reintenta (hasta cinco veces con espera creciente) en vez de dejar esa orden en
    // español hasta que alguien edite un texto (QA 19/10/2026).
    if (gemini.status < 400 || gemini.status === 429 || gemini.status >= 500) {
      throw new Error(gemini.detalle);
    }
    return { estado: 'error', detalle: gemini.detalle };
  }

  let traduccionesStr: string[];
  try {
    const parsed = JSON.parse(gemini.texto);
    traduccionesStr = parsed.traducciones;
    if (!Array.isArray(traduccionesStr) || traduccionesStr.length !== textos.length) {
      throw new Error('La longitud del array traducido no coincide con el original.');
    }
  } catch (err) {
    throw new Error(`Respuesta inválida de Gemini: ${err instanceof Error ? err.message : String(err)}`);
  }

  const lote = textos.map((original: string, idx: number) => ({
    original,
    traduccion: traduccionesStr[idx] || original,
  }));

  const { error: saveErr } = await deps.supabase.rpc('guardar_traducciones', {
    p_sede_id: orden.sede_id,
    p_idioma_destino: 'en',
    p_textos: lote
  });

  if (saveErr) throw saveErr;

  return { estado: 'enviado' };
}

async function handle(job: OutboxJob, deps: Deps): Promise<JobResult> {
  switch (job.canal) {
    case 'push':
      return sendPush(job, deps);
    case 'email':
      return sendEmail(job, deps);
    case 'traduccion':
      return sendTraduccion(job, deps);
    default:
      return { estado: 'error', detalle: `Canal "${job.canal}" desconocido.` };
  }
}

async function finishJob(
  deps: Deps,
  jobId: string,
  estado: 'enviado' | 'omitido' | 'error' | 'reintentar',
  error: string | null,
  proveedorId?: string | null,
): Promise<boolean> {
  const params: Record<string, unknown> = {
    p_id: jobId,
    p_estado: estado,
    p_error: error,
  };
  if (proveedorId !== undefined) params.p_proveedor_id = proveedorId;
  const { error: finishErr } = await deps.supabase.rpc('finish_outbox', params);
  if (finishErr) {
    // Registra solo el id del trabajo y el error de cierre, sin datos del cliente.
    console.error('finish_outbox', jobId, finishErr.message ?? String(finishErr));
    return false;
  }
  return true;
}

export async function handler(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (!isAuthorizedInternalCall(req, deps.getEnv)) return json({ error: 'No autorizado.' }, 401);

  const started = Date.now();
  const summary = { enviados: 0, omitidos: 0, errores: 0, reintentos: 0, errores_cierre: 0 };

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data, error } = await deps.supabase.rpc('claim_outbox', { p_limit: 25 });
    if (error) return json({ error: error.message, ...summary }, 500);
    const jobs = (data ?? []) as OutboxJob[];
    if (jobs.length === 0) break;

    for (const job of jobs) {
      try {
        const result = await handle(job, deps);
        const closed = await finishJob(deps, job.id, result.estado, result.detalle ?? null, result.proveedorId ?? null);
        if (!closed) summary.errores_cierre += 1;
        else if (result.estado === 'enviado') summary.enviados += 1;
        else if (result.estado === 'omitido') summary.omitidos += 1;
        else summary.errores += 1;
      } catch (err) {
        const closed = await finishJob(deps, job.id, 'reintentar', err instanceof Error ? err.message : String(err));
        if (!closed) summary.errores_cierre += 1;
        else summary.reintentos += 1;
      }
    }
  }

  return json(summary);
}

