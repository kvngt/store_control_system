// Plantillas de los correos al cliente.
//
// TypeScript puro, sin imports ni APIs de Deno: lo usa `process-outbox` y lo prueba
// Vitest desde src/ (src/lib/emailTemplates.test.ts).
//
// Los correos no llevan datos de la orden más allá de lo necesario para reconocerla
// (número y vehículo): avisan que hay algo nuevo y llevan el enlace personal. Lo
// demás —precios, fotos, firma— vive detrás de ese enlace, que se puede revocar.
// Un correo reenviado o una bandeja comprometida no exponen la cuenta del cliente.

export type EmailTemplate = 'recepcion' | 'estatus' | 'avance';

/** Estados de la orden que se anuncian al cliente. */
export const ANNOUNCED_STATUSES = ['en_proceso', 'espera_repuestos', 'finalizado', 'entregado'] as const;
export type AnnouncedStatus = (typeof ANNOUNCED_STATUSES)[number];

export interface EmailContext {
  /** Enlace personal del cliente: https://reinventa.shop/r/<token> */
  portalUrl: string;
  cliente: { nombre: string | null };
  taller: {
    nombre: string;
    direccion?: string | null;
    telefono?: string | null;
    /** Si hay, el cliente puede responder el correo y le llega al taller. */
    email?: string | null;
    logoUrl?: string | null;
    color?: string | null;
  };
  orden: {
    numero: string;
    estatus: string;
    fechaIngreso?: string | null;
    fechaEstimadaEntrega?: string | null;
  };
  /** "2019 Toyota Camry" */
  vehiculo: string | null;
  /** Zona horaria del taller, para las fechas. */
  timeZone?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_COLOR = '#D4A017';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeColor(color: string | null | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR;
}

/** Texto blanco u oscuro según qué se lea mejor sobre el color del taller. */
function textOn(hex: string): string {
  const int = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#111111' : '#FFFFFF';
}

function safeHttpsUrl(url: string | null | undefined): string | null {
  return url && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
}

function formatDate(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  // Una columna DATE llega como '2026-10-01': medianoche UTC sería el día anterior
  // en EE. UU. Se fija a mediodía para que el día no se mueva.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('es-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('es-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }
}

function firstName(name: string | null): string | null {
  const first = (name || '').trim().split(/\s+/)[0];
  return first || null;
}

interface Copy {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  button: string;
}

function copyFor(template: EmailTemplate, ctx: EmailContext): Copy | null {
  const tz = ctx.timeZone || 'America/Chicago';
  const vehicle = ctx.vehiculo?.trim() || 'su vehículo';
  const shop = ctx.taller.nombre;

  switch (template) {
    case 'recepcion': {
      const date = formatDate(ctx.orden.fechaIngreso, tz);
      const eta = formatDate(ctx.orden.fechaEstimadaEntrega, tz);
      return {
        subject: `Recibimos su ${vehicle} · ${ctx.orden.numero}`,
        preheader: `Vea el reporte de recepción con fotos y la firma.`,
        heading: `Su ${vehicle} ingresó al taller`,
        paragraphs: [
          `${shop} recibió su vehículo${date ? ` el ${date}` : ''} con la orden ${ctx.orden.numero}.`,
          'En el enlace puede ver el reporte de recepción: las fotos del estado en que llegó, el millaje, el nivel de gasolina y su firma. Ahí también verá el avance del trabajo.',
          ...(eta ? [`Fecha estimada de entrega: ${eta}.`] : []),
        ],
        button: 'Ver reporte de recepción',
      };
    }
    case 'estatus': {
      const status = ctx.orden.estatus as AnnouncedStatus;
      const byStatus: Record<AnnouncedStatus, Omit<Copy, 'button'>> = {
        en_proceso: {
          subject: `Estamos trabajando en su ${vehicle} · ${ctx.orden.numero}`,
          preheader: 'El trabajo en su vehículo ya comenzó.',
          heading: 'Comenzamos el trabajo',
          paragraphs: [`El equipo de ${shop} ya está trabajando en su ${vehicle}.`],
        },
        espera_repuestos: {
          subject: `Su ${vehicle} espera repuestos · ${ctx.orden.numero}`,
          preheader: 'Continuaremos en cuanto lleguen las piezas.',
          heading: 'Esperando repuestos',
          paragraphs: [`El trabajo en su ${vehicle} está en pausa mientras llegan las piezas. Continuaremos en cuanto estén en el taller.`],
        },
        finalizado: {
          subject: `Su ${vehicle} está listo · ${ctx.orden.numero}`,
          preheader: 'Ya puede pasar a recogerlo.',
          heading: 'Su vehículo está listo',
          paragraphs: [
            `Terminamos el trabajo en su ${vehicle}. Ya puede pasar a recogerlo a ${shop}.`,
            'En el enlace puede revisar el trabajo realizado y el saldo pendiente.',
          ],
        },
        entregado: {
          subject: `Gracias por su visita · ${ctx.orden.numero}`,
          preheader: 'Su reporte queda disponible en el enlace.',
          heading: 'Gracias por confiar en nosotros',
          paragraphs: [
            `Entregamos su ${vehicle}. El reporte del trabajo, con sus fotos, queda disponible en el enlace durante 90 días.`,
          ],
        },
      };
      const copy = byStatus[status];
      return copy ? { ...copy, button: 'Ver estado del vehículo' } : null;
    }
    case 'avance':
      return {
        subject: `Novedades de su ${vehicle} · ${ctx.orden.numero}`,
        preheader: 'El taller compartió fotos o videos del trabajo.',
        heading: 'Hay novedades del trabajo',
        paragraphs: [`${shop} compartió fotos o videos del avance en su ${vehicle}.`],
        button: 'Ver avances',
      };
    default:
      return null;
  }
}

export function renderEmail(template: string, ctx: EmailContext): RenderedEmail | null {
  if (!['recepcion', 'estatus', 'avance'].includes(template)) return null;
  const copy = copyFor(template as EmailTemplate, ctx);
  if (!copy) return null;

  const color = safeColor(ctx.taller.color);
  const buttonText = textOn(color);
  const logo = safeHttpsUrl(ctx.taller.logoUrl);
  const portal = safeHttpsUrl(ctx.portalUrl) ?? ctx.portalUrl;
  const unsubscribe = `${portal}?correos=baja`;
  const name = firstName(ctx.cliente.nombre);
  const greeting = name ? `Hola ${name}:` : 'Hola:';
  const contact = [ctx.taller.direccion, ctx.taller.telefono].filter((v) => v && String(v).trim()) as string[];

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1F;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;">
<tr><td style="height:6px;background:${color};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 8px;">
${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(ctx.taller.nombre)}" height="40" style="display:block;height:40px;max-width:200px;border:0;margin-bottom:12px;">` : ''}
<div style="font-size:14px;font-weight:600;color:#5A5A66;">${escapeHtml(ctx.taller.nombre)}</div>
</td></tr>
<tr><td style="padding:8px 28px 0;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111111;">${escapeHtml(copy.heading)}</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.55;">${escapeHtml(greeting)}</p>
${copy.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;">${escapeHtml(p)}</p>`).join('\n')}
</td></tr>
<tr><td style="padding:12px 28px 8px;">
<a href="${escapeHtml(portal)}" style="display:inline-block;background:${color};color:${buttonText};text-decoration:none;font-weight:700;font-size:16px;padding:14px 24px;border-radius:8px;">${escapeHtml(copy.button)}</a>
</td></tr>
<tr><td style="padding:8px 28px 24px;">
<p style="margin:0;font-size:13px;line-height:1.5;color:#6B6B76;">Orden ${escapeHtml(ctx.orden.numero)}${ctx.vehiculo ? ` · ${escapeHtml(ctx.vehiculo)}` : ''}. Este enlace es personal: no lo comparta.</p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #EDEDF0;">
<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#6B6B76;">${escapeHtml(ctx.taller.nombre)}${contact.length ? ` · ${contact.map(escapeHtml).join(' · ')}` : ''}</p>
${ctx.taller.email ? '<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#6B6B76;">Puede responder a este correo para comunicarse con el taller.</p>' : ''}
<p style="margin:0;font-size:12px;line-height:1.5;color:#9A9AA6;"><a href="${escapeHtml(unsubscribe)}" style="color:#9A9AA6;">No quiero recibir estos correos</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    greeting,
    '',
    copy.heading,
    '',
    ...copy.paragraphs,
    '',
    `${copy.button}: ${portal}`,
    '',
    `Orden ${ctx.orden.numero}${ctx.vehiculo ? ` · ${ctx.vehiculo}` : ''}. Este enlace es personal: no lo comparta.`,
    '',
    [ctx.taller.nombre, ...contact].join(' · '),
    ctx.taller.email ? 'Puede responder a este correo para comunicarse con el taller.' : null,
    `No quiero recibir estos correos: ${unsubscribe}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { subject: copy.subject, html, text };
}
