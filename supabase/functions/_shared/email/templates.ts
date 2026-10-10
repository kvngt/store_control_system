// Plantillas de los correos al cliente.
//
// TypeScript puro, sin imports ni APIs de Deno: lo usa `process-outbox` y lo prueba
// Vitest desde src/ (src/lib/emailTemplates.test.ts).
//
// Los correos no llevan datos de la orden más allá de lo necesario para reconocerla
// (número y vehículo): avisan que hay algo nuevo y llevan el enlace personal. Lo
// demás —precios, fotos, firma— vive detrás de ese enlace, que se puede revocar.
// Un correo reenviado o una bandeja comprometida no exponen la cuenta del cliente.

export type EmailTemplate = 'recepcion' | 'estatus' | 'avance' | 'presupuesto' | 'presupuesto_confirmacion' | 'reporte';

const TEMPLATES: readonly string[] = ['recepcion', 'estatus', 'avance', 'presupuesto', 'presupuesto_confirmacion', 'reporte'];

/** Estados de la orden que se anuncian al cliente. */
// `espera_autorizacion` no está a propósito: un aviso de que el vehículo espera
// autorización antes de que exista el presupuesto no le dice nada útil al cliente, y se
// pisa con el correo del presupuesto que sale minutos después.
export const ANNOUNCED_STATUSES = ['en_proceso', 'finalizado', 'entregado'] as const;
export type AnnouncedStatus = (typeof ANNOUNCED_STATUSES)[number];

/** Idioma del correo. Inglés por defecto (pedido del taller del 06/10/2026). */
export type EmailLanguage = 'es' | 'en';

export interface EmailContext {
  /**
   * El idioma que eligió el cliente en su enlace (`clientes.idioma`). Sin él, inglés: la
   * mayoría de los clientes del taller lo hablan.
   */
  lang?: EmailLanguage;
  /** Enlace personal del cliente: https://restorifyauto.net/r/<token> */
  portalUrl: string;
  cliente: { nombre: string | null };
  taller: {
    nombre: string;
    direccion?: string | null;
    telefono?: string | null;
    /** Los teléfonos con su descripción, como en el enlace (20261010000025). Si hay, van en
     *  lugar de `telefono`. */
    telefonos?: { label: string; numero: string }[] | null;
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
  /** Solo para `presupuesto` y `presupuesto_confirmacion`. */
  presupuesto?: QuoteEmailData | null;
}

export interface QuoteEmailData {
  numero: number;
  /** enviado | respondido | cancelado */
  estado: string;
  /** Cómo respondió: cliente_portal, admin_telefono, admin_presencial, admin_whatsapp. */
  via?: string | null;
  totalPropuesto: number;
  totalAprobado?: number | null;
  lineas: { descripcion: string; monto: number; estado: string }[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_COLOR = '#EBC334';

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

function formatDate(iso: string | null | undefined, timeZone: string, lang: EmailLanguage): string | null {
  if (!iso) return null;
  // Una columna DATE llega como '2026-10-01': medianoche UTC sería el día anterior
  // en EE. UU. Se fija a mediodía para que el día no se mueva.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const locale = lang === 'es' ? 'es-US' : 'en-US';
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (value: number | null | undefined) => usd.format(Number(value ?? 0));

const VIA_TEXT: Record<EmailLanguage, Record<string, string>> = {
  es: {
    cliente_portal: 'desde su enlace',
    admin_telefono: 'por teléfono',
    admin_presencial: 'en el taller',
    admin_whatsapp: 'por WhatsApp',
  },
  en: {
    cliente_portal: 'from your link',
    admin_telefono: 'by phone',
    admin_presencial: 'at the shop',
    admin_whatsapp: 'by WhatsApp',
  },
};

function firstName(name: string | null): string | null {
  const first = (name || '').trim().split(/\s+/)[0];
  return first || null;
}

/** "English: 240-355-1266" por teléfono, como en el enlace; sin lista, el teléfono de siempre. */
function shopPhones(taller: EmailContext['taller']): (string | null | undefined)[] {
  if (!Array.isArray(taller.telefonos) || taller.telefonos.length === 0) return [taller.telefono];
  return taller.telefonos.map((p) => (p.label?.trim() ? `${p.label.trim()}: ${p.numero}` : p.numero));
}

interface Copy {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Trabajos con su monto, debajo de los párrafos. El último es el total. */
  items?: { label: string; amount: string }[];
  button: string;
}

function copyEs(template: EmailTemplate, ctx: EmailContext): Copy | null {
  const tz = ctx.timeZone || 'America/Chicago';
  const vehicle = ctx.vehiculo?.trim() || 'su vehículo';
  const shop = ctx.taller.nombre;

  switch (template) {
    case 'recepcion': {
      const date = formatDate(ctx.orden.fechaIngreso, tz, 'es');
      const eta = formatDate(ctx.orden.fechaEstimadaEntrega, tz, 'es');
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
    case 'presupuesto': {
      const quote = ctx.presupuesto;
      const lines = (quote?.lineas ?? []).filter((l) => l.estado === 'pendiente');
      // Ya respondido o cancelado mientras el correo esperaba: no se manda.
      if (!quote || quote.estado !== 'enviado' || lines.length === 0) return null;
      const total = lines.reduce((sum, l) => sum + Number(l.monto), 0);
      return {
        subject: `Presupuesto para su ${vehicle} · ${ctx.orden.numero}`,
        preheader: `${lines.length} trabajo(s) por ${money(total)} esperan su autorización.`,
        heading: 'Tiene un presupuesto por autorizar',
        paragraphs: [
          `${shop} preparó un presupuesto para su ${vehicle}. En el enlace puede autorizar cada trabajo por separado: solo realizaremos lo que autorice.`,
        ],
        items: [...lines.map((l) => ({ label: l.descripcion, amount: money(l.monto) })), { label: 'Total', amount: money(total) }],
        button: 'Revisar y autorizar',
      };
    }
    case 'presupuesto_confirmacion': {
      const quote = ctx.presupuesto;
      if (!quote || quote.estado !== 'respondido') return null;
      const approved = quote.lineas.filter((l) => l.estado === 'aprobado');
      const rejected = quote.lineas.filter((l) => l.estado === 'rechazado');
      const via = quote.via ? VIA_TEXT.es[quote.via] : null;
      const byShop = !!quote.via && quote.via !== 'cliente_portal';
      const approvedTotal = quote.totalAprobado ?? approved.reduce((sum, l) => sum + Number(l.monto), 0);
      return {
        subject: `${byShop ? 'Registramos su autorización' : 'Recibimos su respuesta'} · ${ctx.orden.numero}`,
        preheader: approved.length ? `Autorizó ${approved.length} trabajo(s) por ${money(approvedTotal)}.` : 'No autorizó ningún trabajo.',
        heading: approved.length ? 'Estos son los trabajos que autorizó' : 'No autorizó ningún trabajo',
        paragraphs: [
          byShop
            ? `${shop} registró su respuesta al presupuesto${via ? ` ${via}` : ''}. Si algo no coincide con lo que acordó, responda a este correo o llame al taller.`
            : 'Guardamos su respuesta al presupuesto. Solo realizaremos los trabajos que autorizó.',
          ...(rejected.length ? [`No autorizados: ${rejected.map((l) => l.descripcion).join(', ')}.`] : []),
        ],
        items: approved.length
          ? [...approved.map((l) => ({ label: l.descripcion, amount: money(l.monto) })), { label: 'Total autorizado', amount: money(approvedTotal) }]
          : undefined,
        button: 'Ver su orden',
      };
    }
    case 'reporte':
      // Lo manda un admin a propósito ("Enviar reporte"): el reporte completo de la
      // orden, en el estado en que esté.
      return {
        subject: `Reporte de su ${vehicle} · ${ctx.orden.numero}`,
        preheader: 'El estado, las fotos y videos del trabajo y su cuenta, en un enlace.',
        heading: 'El reporte de su vehículo',
        paragraphs: [
          `${shop} le comparte el reporte de la orden ${ctx.orden.numero}.`,
          'En el enlace puede ver en qué va el trabajo, las fotos y videos que el taller compartió, los trabajos autorizados y su cuenta. No necesita crear una cuenta.',
        ],
        button: 'Ver reporte',
      };
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

function copyEn(template: EmailTemplate, ctx: EmailContext): Copy | null {
  const tz = ctx.timeZone || 'America/Chicago';
  const vehicle = ctx.vehiculo?.trim() || 'your vehicle';
  const shop = ctx.taller.nombre;

  switch (template) {
    case 'recepcion': {
      const date = formatDate(ctx.orden.fechaIngreso, tz, 'en');
      const eta = formatDate(ctx.orden.fechaEstimadaEntrega, tz, 'en');
      return {
        subject: `We received your ${vehicle} · ${ctx.orden.numero}`,
        preheader: 'See the check-in report with photos and your signature.',
        heading: `Your ${vehicle} is at the shop`,
        paragraphs: [
          `${shop} received your vehicle${date ? ` on ${date}` : ''} under order ${ctx.orden.numero}.`,
          'The link shows the check-in report: photos of the condition it arrived in, the mileage, the fuel level and your signature. You will also see the progress of the work there.',
          ...(eta ? [`Estimated delivery date: ${eta}.`] : []),
        ],
        button: 'View check-in report',
      };
    }
    case 'estatus': {
      const status = ctx.orden.estatus as AnnouncedStatus;
      const byStatus: Record<AnnouncedStatus, Omit<Copy, 'button'>> = {
        en_proceso: {
          subject: `We are working on your ${vehicle} · ${ctx.orden.numero}`,
          preheader: 'Work on your vehicle has started.',
          heading: 'We started the work',
          paragraphs: [`The ${shop} team is now working on your ${vehicle}.`],
        },
        finalizado: {
          subject: `Your ${vehicle} is ready · ${ctx.orden.numero}`,
          preheader: 'You can come pick it up.',
          heading: 'Your vehicle is ready',
          paragraphs: [
            `We finished the work on your ${vehicle}. You can pick it up at ${shop}.`,
            'The link shows the work done and the balance due.',
          ],
        },
        entregado: {
          subject: `Thank you for your visit · ${ctx.orden.numero}`,
          preheader: 'Your report stays available at the link.',
          heading: 'Thank you for trusting us',
          paragraphs: [
            `We delivered your ${vehicle}. The work report, with its photos, stays available at the link for 90 days.`,
          ],
        },
      };
      const copy = byStatus[status];
      return copy ? { ...copy, button: 'View vehicle status' } : null;
    }
    case 'presupuesto': {
      const quote = ctx.presupuesto;
      const lines = (quote?.lineas ?? []).filter((l) => l.estado === 'pendiente');
      if (!quote || quote.estado !== 'enviado' || lines.length === 0) return null;
      const total = lines.reduce((sum, l) => sum + Number(l.monto), 0);
      return {
        subject: `Estimate for your ${vehicle} · ${ctx.orden.numero}`,
        preheader: `${lines.length} job(s) for ${money(total)} are waiting for your authorization.`,
        heading: 'You have an estimate to authorize',
        paragraphs: [
          `${shop} prepared an estimate for your ${vehicle}. At the link you can authorize each job separately: we will only do what you authorize.`,
        ],
        items: [...lines.map((l) => ({ label: l.descripcion, amount: money(l.monto) })), { label: 'Total', amount: money(total) }],
        button: 'Review and authorize',
      };
    }
    case 'presupuesto_confirmacion': {
      const quote = ctx.presupuesto;
      if (!quote || quote.estado !== 'respondido') return null;
      const approved = quote.lineas.filter((l) => l.estado === 'aprobado');
      const rejected = quote.lineas.filter((l) => l.estado === 'rechazado');
      const via = quote.via ? VIA_TEXT.en[quote.via] : null;
      const byShop = !!quote.via && quote.via !== 'cliente_portal';
      const approvedTotal = quote.totalAprobado ?? approved.reduce((sum, l) => sum + Number(l.monto), 0);
      return {
        subject: `${byShop ? 'We recorded your authorization' : 'We received your answer'} · ${ctx.orden.numero}`,
        preheader: approved.length ? `You authorized ${approved.length} job(s) for ${money(approvedTotal)}.` : 'You did not authorize any work.',
        heading: approved.length ? 'These are the jobs you authorized' : 'You did not authorize any work',
        paragraphs: [
          byShop
            ? `${shop} recorded your answer to the estimate${via ? ` ${via}` : ''}. If anything does not match what you agreed to, reply to this email or call the shop.`
            : 'We saved your answer to the estimate. We will only do the jobs you authorized.',
          ...(rejected.length ? [`Not authorized: ${rejected.map((l) => l.descripcion).join(', ')}.`] : []),
        ],
        items: approved.length
          ? [...approved.map((l) => ({ label: l.descripcion, amount: money(l.monto) })), { label: 'Total authorized', amount: money(approvedTotal) }]
          : undefined,
        button: 'View your order',
      };
    }
    case 'reporte':
      return {
        subject: `Report for your ${vehicle} · ${ctx.orden.numero}`,
        preheader: 'The status, the photos and videos of the work and your account, in one link.',
        heading: 'Your vehicle report',
        paragraphs: [
          `${shop} is sharing the report for order ${ctx.orden.numero}.`,
          'At the link you can see how the work is going, the photos and videos the shop shared, the authorized jobs and your account. No account needed.',
        ],
        button: 'View report',
      };
    case 'avance':
      return {
        subject: `Updates on your ${vehicle} · ${ctx.orden.numero}`,
        preheader: 'The shop shared photos or videos of the work.',
        heading: 'There are updates on the work',
        paragraphs: [`${shop} shared photos or videos of the progress on your ${vehicle}.`],
        button: 'View updates',
      };
    default:
      return null;
  }
}

function copyFor(template: EmailTemplate, ctx: EmailContext, lang: EmailLanguage): Copy | null {
  return lang === 'es' ? copyEs(template, ctx) : copyEn(template, ctx);
}

/** Los textos fijos del correo (saludo y pie) en cada idioma. */
const CHROME: Record<EmailLanguage, {
  hello: (name: string | null) => string;
  order: string;
  personalLink: string;
  canReply: string;
  unsubscribe: string;
}> = {
  es: {
    hello: (name) => (name ? `Hola ${name}:` : 'Hola:'),
    order: 'Orden',
    personalLink: 'Este enlace es personal: no lo comparta.',
    canReply: 'Puede responder a este correo para comunicarse con el taller.',
    unsubscribe: 'No quiero recibir estos correos',
  },
  en: {
    hello: (name) => (name ? `Hi ${name},` : 'Hi,'),
    order: 'Order',
    personalLink: 'This link is personal: please do not share it.',
    canReply: 'You can reply to this email to reach the shop.',
    unsubscribe: 'I do not want to receive these emails',
  },
};

function renderItems(items: Copy['items']): string {
  if (!items?.length) return '';
  const rows = items
    .map((item, i) => {
      const weight = i === items.length - 1 ? 'font-weight:700;' : '';
      return `<tr><td style="padding:8px 0;font-size:15px;border-top:1px solid #EDEDF0;${weight}">${escapeHtml(item.label)}</td><td align="right" style="padding:8px 0 8px 12px;font-size:15px;white-space:nowrap;border-top:1px solid #EDEDF0;${weight}">${escapeHtml(item.amount)}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;border-collapse:collapse;">${rows}</table>`;
}

export function renderEmail(template: string, ctx: EmailContext): RenderedEmail | null {
  if (!TEMPLATES.includes(template)) return null;
  const lang: EmailLanguage = ctx.lang === 'es' ? 'es' : 'en';
  const chrome = CHROME[lang];
  const copy = copyFor(template as EmailTemplate, ctx, lang);
  if (!copy) return null;

  const color = safeColor(ctx.taller.color);
  const buttonText = textOn(color);
  const logo = safeHttpsUrl(ctx.taller.logoUrl);
  const portal = safeHttpsUrl(ctx.portalUrl) ?? ctx.portalUrl;
  const unsubscribe = `${portal}?correos=baja`;
  const name = firstName(ctx.cliente.nombre);
  const greeting = chrome.hello(name);
  const contact = [ctx.taller.direccion, ...shopPhones(ctx.taller)].filter((v) => v && String(v).trim()) as string[];

  const html = `<!doctype html>
<html lang="${lang}">
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
${renderItems(copy.items)}
</td></tr>
<tr><td style="padding:12px 28px 8px;">
<a href="${escapeHtml(portal)}" style="display:inline-block;background:${color};color:${buttonText};text-decoration:none;font-weight:700;font-size:16px;padding:14px 24px;border-radius:8px;">${escapeHtml(copy.button)}</a>
</td></tr>
<tr><td style="padding:8px 28px 24px;">
<p style="margin:0;font-size:13px;line-height:1.5;color:#6B6B76;">${chrome.order} ${escapeHtml(ctx.orden.numero)}${ctx.vehiculo ? ` · ${escapeHtml(ctx.vehiculo)}` : ''}. ${chrome.personalLink}</p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #EDEDF0;">
<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#6B6B76;">${escapeHtml(ctx.taller.nombre)}${contact.length ? ` · ${contact.map(escapeHtml).join(' · ')}` : ''}</p>
${ctx.taller.email ? `<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#6B6B76;">${chrome.canReply}</p>` : ''}
<p style="margin:0;font-size:12px;line-height:1.5;color:#9A9AA6;"><a href="${escapeHtml(unsubscribe)}" style="color:#9A9AA6;">${chrome.unsubscribe}</a></p>
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
    ...(copy.items ? ['', ...copy.items.map((item) => `- ${item.label}: ${item.amount}`)] : []),
    '',
    `${copy.button}: ${portal}`,
    '',
    `${chrome.order} ${ctx.orden.numero}${ctx.vehiculo ? ` · ${ctx.vehiculo}` : ''}. ${chrome.personalLink}`,
    '',
    [ctx.taller.nombre, ...contact].join(' · '),
    ctx.taller.email ? chrome.canReply : null,
    `${chrome.unsubscribe}: ${unsubscribe}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { subject: copy.subject, html, text };
}

// ------------------------------------------------------------------------------------
// Correo al técnico (06/10/2026): orden o tarea asignada y respuesta del presupuesto.
// ------------------------------------------------------------------------------------
// Va al equipo del taller, siempre en español, con el texto del aviso de la campana y un botón
// a la orden. No lleva datos del cliente más allá del vehículo y el número de orden.

export interface EmployeeEmailContext {
  /** Enlace a la orden dentro de la app: https://restorifyauto.net/work-orders?open=<id> */
  appUrl: string;
  taller: { nombre: string; logoUrl?: string | null; color?: string | null };
  /** asignacion | tarea_asignada | presupuesto_respondido */
  tipo: string;
  /** El título del aviso ("Nueva tarea · ORD-2026-014"). */
  titulo: string;
  /** Una línea por aviso juntado en este correo (varias tareas asignadas seguidas). */
  lineas: string[];
}

export function renderEmployeeEmail(ctx: EmployeeEmailContext): RenderedEmail {
  const color = safeColor(ctx.taller.color);
  const buttonText = textOn(color);
  const logo = safeHttpsUrl(ctx.taller.logoUrl);
  const url = safeHttpsUrl(ctx.appUrl) ?? ctx.appUrl;
  const lineas = ctx.lineas.map((l) => String(l ?? '').trim()).filter(Boolean);
  const intro =
    ctx.tipo === 'presupuesto_respondido'
      ? 'El cliente respondió el presupuesto de tu orden.'
      : 'Tienes trabajo nuevo asignado.';
  const button = 'Abrir la orden';
  const heading = ctx.titulo;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1F;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;">
<tr><td style="height:6px;background:${color};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 8px;">
${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(ctx.taller.nombre)}" height="40" style="display:block;height:40px;max-width:200px;border:0;margin-bottom:12px;">` : ''}
<div style="font-size:14px;font-weight:600;color:#5A5A66;">${escapeHtml(ctx.taller.nombre)}</div>
</td></tr>
<tr><td style="padding:8px 28px 0;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111111;">${escapeHtml(heading)}</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.55;">${escapeHtml(intro)}</p>
${lineas.map((l) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;">• ${escapeHtml(l)}</p>`).join('\n')}
</td></tr>
<tr><td style="padding:12px 28px 24px;">
<a href="${escapeHtml(url)}" style="display:inline-block;background:${color};color:${buttonText};text-decoration:none;font-weight:700;font-size:16px;padding:14px 24px;border-radius:8px;">${escapeHtml(button)}</a>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #EDEDF0;">
<p style="margin:0;font-size:12px;line-height:1.5;color:#9A9AA6;">Aviso automático de Restorify para el equipo de ${escapeHtml(ctx.taller.nombre)}.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [heading, '', intro, ...lineas.map((l) => `- ${l}`), '', `${button}: ${url}`].join('\n');
  return { subject: heading, html, text };
}
