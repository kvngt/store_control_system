// Envía lo que espera en `cola_envios`: notificaciones push a los teléfonos del
// equipo del taller y correos al cliente (Resend).
//
// La llaman la base al instante (pg_net, cuando se crea un aviso) y pg_cron cada
// minuto como red de seguridad. `claim_outbox` toma las filas con
// FOR UPDATE SKIP LOCKED, así que dos invocaciones a la vez no envían dos veces.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { isAuthorizedInternalCall, json } from '../_shared/internal.ts';
import { ANNOUNCED_STATUSES, renderEmail, renderEmployeeEmail } from '../_shared/email/templates.ts';

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

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

/** ~50 s de trabajo por invocación: lejos del límite de 400 s y del próximo cron. */
const TIME_BUDGET_MS = 50_000;

function vapidDetails() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:notificaciones@restorifyauto.net';
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
    telefonos?: { label: string; numero: string }[] | null;
    email: string | null;
    logo_url: string | null;
    color: string | null;
  };
  orden: { numero: string; estatus: string; fecha_ingreso: string | null; fecha_estimada_entrega: string | null };
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
}

/** Resend limita a 2 peticiones por segundo en el plan gratuito. */
const EMAIL_SPACING_MS = 550;

/** Quita lo que rompería la cabecera From: comillas, ángulos y saltos de línea. */
function displayName(name: string): string {
  return name.replace(/["<>\r\n]/g, '').trim().slice(0, 70) || 'Restorify';
}

/**
 * Un correo al cliente.
 *
 * Todo se decide al enviar, no al encolar: si el cliente se dio de baja, corrigió
 * su correo o la orden volvió a un estado que no se anuncia mientras el aviso
 * esperaba, se respeta el estado actual.
 */
async function sendEmail(job: OutboxJob): Promise<JobResult> {
  // El correo al técnico (06/10/2026) tiene su propio camino: nunca pasa por `datos_correo`,
  // que es el del cliente.
  if (job.plantilla === 'empleado') return sendEmployeeEmail(job);
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || '').replace(/\/+$/, '');
  const fromAddress = Deno.env.get('EMAIL_FROM_ADDRESS') || 'notificaciones@restorifyauto.net';
  // Falta configuración: se reintenta, porque arreglarla no requiere volver a
  // generar el aviso.
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada.');
  if (!/^https?:\/\//.test(siteUrl)) throw new Error('PUBLIC_SITE_URL no configurada.');

  const { data, error } = await supabase.rpc('datos_correo', { p_cola_id: job.id });
  if (error) throw error;
  const ctx = data as EmailData | null;

  if (!ctx) return { estado: 'omitido', detalle: 'La orden ya no existe.' };
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
  const dict = lang === 'en' ? ctx.traducciones ?? {} : {};
  const tr = (text: string) => dict[text.trim()] ?? text;

  const email = renderEmail(job.plantilla, {
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
    },
    vehiculo: ctx.vehiculo,
    timeZone: Deno.env.get('SHOP_TIMEZONE') || 'America/Chicago',
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
  });
  if (!email) return { estado: 'error', detalle: `Plantilla "${job.plantilla}" desconocida.` };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Si esta invocación muere después de que Resend aceptó el correo, el
      // reintento con la misma clave no manda un segundo correo.
      'Idempotency-Key': job.id,
    },
    body: JSON.stringify({
      from: `${displayName(ctx.taller.nombre)} <${fromAddress}>`,
      to: [ctx.cliente.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
      // El cliente responde al taller, no a una dirección que nadie lee.
      ...(ctx.taller.email ? { reply_to: ctx.taller.email } : {}),
      tags: [{ name: 'plantilla', value: job.plantilla }],
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, EMAIL_SPACING_MS));

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    if (job.plantilla === 'estatus') {
      await supabase.rpc('marcar_estatus_enviado', { p_cola_id: job.id, p_estatus: ctx.orden.estatus });
    }
    return { estado: 'enviado', proveedorId: body.id };
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
  return { estado: 'error', detalle: detail };
}

/**
 * Un correo a un técnico: orden o tarea asignada, o la respuesta del cliente a un presupuesto.
 * Se manda a la dirección que se encoló (la de su perfil) con lo que guardó `notificar`.
 */
async function sendEmployeeEmail(job: OutboxJob): Promise<JobResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || '').replace(/\/+$/, '');
  const fromAddress = Deno.env.get('EMAIL_FROM_ADDRESS') || 'notificaciones@restorifyauto.net';
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada.');
  if (!/^https?:\/\//.test(siteUrl)) throw new Error('PUBLIC_SITE_URL no configurada.');

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
    const { data: sede } = await supabase.from('sedes').select('nombre, logo_url, color_tema').eq('id', datos.sede_id).maybeSingle();
    if (sede) taller = { nombre: sede.nombre, logoUrl: sede.logo_url, color: sede.color_tema };
  }

  const email = renderEmployeeEmail({
    appUrl: `${siteUrl}${datos.url?.startsWith('/') ? datos.url : '/'}`,
    taller,
    tipo: datos.tipo ?? '',
    titulo: datos.titulo,
    lineas: (datos.lineas ?? []).map((l) => String(l ?? '')),
  });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': job.id,
    },
    body: JSON.stringify({
      from: `${displayName(taller.nombre)} <${fromAddress}>`,
      to: [job.destinatario],
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: 'plantilla', value: 'empleado' }],
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, EMAIL_SPACING_MS));

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { estado: 'enviado', proveedorId: body.id };
  }
  const body = (await res.text().catch(() => '')).slice(0, 300);
  if (res.status === 401 || /api key/i.test(body)) {
    throw new Error(`La llave de Resend no es válida: revisa el secreto RESEND_API_KEY. Resend HTTP ${res.status}: ${body}`);
  }
  const detail = `Resend HTTP ${res.status}: ${body}`;
  if (res.status === 429 || res.status >= 500) throw new Error(detail);
  return { estado: 'error', detalle: detail };
}

async function sendTraduccion(job: OutboxJob): Promise<JobResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.');

  if (!job.orden_id) return { estado: 'error', detalle: 'El job de traducción no tiene orden_id.' };

  const { data: orden, error: errOrden } = await supabase
    .from('ordenes_trabajo')
    .select('sede_id')
    .eq('id', job.orden_id)
    .single();

  if (errOrden || !orden) return { estado: 'omitido', detalle: 'La orden ya no existe.' };

  const { data: textos, error: errTextos } = await supabase
    .rpc('_textos_cliente', { p_orden_id: job.orden_id });

  if (errTextos) throw errTextos;
  if (!textos || textos.length === 0) return { estado: 'omitido', detalle: 'La orden no tiene textos visibles.' };

  const prompt = {
    contents: [{
      parts: [{ text: JSON.stringify(textos) }]
    }],
    systemInstruction: {
      parts: [{ text: "Eres un traductor técnico de un taller automotriz. Traduce el siguiente array JSON de español a inglés. Si una frase ya está en inglés, o es un nombre propio/marca, consérvala o corrígela si tiene errores. Devuelve estrictamente un objeto JSON con la forma {\"traducciones\": [\"texto1\", \"texto2\"]} manteniendo el mismo orden y longitud del array original. No incluyas markdown ni explicaciones." }]
    },
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  // El modelo se elige con GEMINI_MODEL: Google retira modelos (el `gemini-1.5-flash` que estaba
  // aquí ya no existe) y cambiarlo no debe exigir un despliegue. La llave va en el encabezado,
  // no en la URL, para que no quede en los registros de nadie.
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(prompt)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const detail = `Gemini HTTP ${res.status}: ${errText.slice(0, 300)}`;
    if (res.status >= 500 || res.status === 429) throw new Error(detail);
    return { estado: 'error', detalle: detail };
  }

  const body = await res.json().catch(() => ({}));
  const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) return { estado: 'error', detalle: 'Gemini no devolvió texto en el formato esperado.' };

  let traduccionesStr: string[];
  try {
    const parsed = JSON.parse(content);
    traduccionesStr = parsed.traducciones;
    if (!Array.isArray(traduccionesStr) || traduccionesStr.length !== textos.length) {
      throw new Error('La longitud del array traducido no coincide con el original.');
    }
  } catch (err) {
    return { estado: 'error', detalle: `Respuesta JSON inválida de Gemini: ${err instanceof Error ? err.message : String(err)}` };
  }

  const lote = textos.map((original: string, idx: number) => ({
    original,
    traduccion: traduccionesStr[idx] || original,
  }));

  const { error: saveErr } = await supabase.rpc('guardar_traducciones', {
    p_sede_id: orden.sede_id,
    p_idioma_destino: 'en',
    p_textos: lote
  });

  if (saveErr) throw saveErr;

  return { estado: 'enviado' };
}

async function handle(job: OutboxJob): Promise<JobResult> {
  switch (job.canal) {
    case 'push':
      return sendPush(job);
    case 'email':
      return sendEmail(job);
    case 'traduccion':
      return sendTraduccion(job);
    default:
      return { estado: 'error', detalle: `Canal "${job.canal}" desconocido.` };
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
          p_proveedor_id: result.proveedorId ?? null,
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
