import { jsPDF } from 'jspdf';
import type { Sede, WorkOrder } from '../types/database';
import { customerObservations, customerReportPhotos, progressTimeline, reportImagePath } from './reportMedia';
import { money } from './money';
import { brandColors } from './brandColor';
import { formatPhone } from './phone';

export type PdfLanguage = 'es' | 'en';

export interface WorkOrderPdfOptions {
  /** El enlace personal del cliente, si la orden tiene: la versión web con videos. */
  portalUrl?: string;
  /** El idioma del documento; lo elige administración al descargarlo (05/10/2026). */
  language?: PdfLanguage;
  /**
   * Texto original → traducción al inglés (`traducciones_orden`, la misma que usa el portal).
   * Con el PDF en inglés, las descripciones y notas que ya estén traducidas salen traducidas;
   * las que no, como las escribió el taller.
   */
  translations?: Record<string, string>;
  /** Lo recibido y lo que falta (o sobra), como lo cuenta la base (`saldo_orden`). */
  balance?: { cobrado: number; saldo: number } | null;
}

const MARGIN = 15;
const LINE = 6;
/** Clear space between the workshop's header block and the report title. */
const HEADER_GAP = 8;
const MUTED: [number, number, number] = [110, 110, 130];

// Keeps the minus sign in front of the currency symbol: "-$100.00", not
// "$-100.00", which is how the shop's paperwork reads.

// Los textos del documento, en los dos idiomas. Como el portal (`src/portal/strings.ts`), este
// módulo tiene los suyos: lo lee el cliente, no la pantalla del taller.
const STRINGS = {
  es: {
    locale: 'es-US',
    status: {
      recepcion: 'Recepción',
      en_proceso: 'En Proceso',
      // Era "Espera de Repuestos", el nombre del estado antes de que F1 lo convirtiera en la
      // espera de la autorización del cliente. Dice lo mismo que el portal.
      espera_autorizacion: 'Esperando su autorización',
      finalizado: 'Finalizado',
      entregado: 'Entregado',
      retirada: 'Retirado sin reparar',
    } as Record<string, string>,
    workType: { mecanica: 'Mecánica', pintura: 'Pintura', combinado: 'Mecánica y pintura' } as Record<string, string>,
    generated: 'Generado',
    title: 'Orden de Trabajo',
    statusLabel: 'Estado',
    progress: 'Avance',
    type: 'Tipo',
    online: 'Vea este reporte en línea, con videos y el estado actualizado:',
    customerVehicle: 'Cliente y Vehículo',
    customer: 'Cliente',
    phone: 'Teléfono',
    vehicle: 'Vehículo',
    plate: 'Placa',
    vin: 'VIN',
    milesIn: 'Millas de ingreso',
    dateIn: 'Fecha de ingreso',
    estimated: 'Entrega estimada',
    labor: 'Mano de Obra',
    laborTotal: 'Total mano de obra',
    parts: 'Repuestos',
    partsTotal: 'Total repuestos',
    summary: 'Resumen',
    discount: 'Descuento',
    total: 'Total',
    deposit: 'Depósito recibido',
    received: 'Total recibido',
    balanceDue: 'Saldo pendiente',
    credit: 'Saldo a favor del cliente',
    intakeNotes: 'Notas de Inspección 360°',
    observations: 'Observaciones del Taller',
    progressPhotos: 'Avances del Trabajo',
    intakePhotos: 'Fotos de Recepción',
    signature: 'Conformidad del Cliente',
    customerFallback: 'Cliente',
    signed: 'Firmado',
  },
  en: {
    locale: 'en-US',
    status: {
      recepcion: 'Received',
      en_proceso: 'In progress',
      espera_autorizacion: 'Awaiting your authorization',
      finalizado: 'Completed',
      entregado: 'Delivered',
      retirada: 'Picked up without repair',
    } as Record<string, string>,
    workType: { mecanica: 'Mechanical', pintura: 'Paint', combinado: 'Mechanical and paint' } as Record<string, string>,
    generated: 'Generated',
    title: 'Work Order',
    statusLabel: 'Status',
    progress: 'Progress',
    type: 'Type',
    online: 'See this report online, with videos and the latest status:',
    customerVehicle: 'Customer and Vehicle',
    customer: 'Customer',
    phone: 'Phone',
    vehicle: 'Vehicle',
    plate: 'Plate',
    vin: 'VIN',
    milesIn: 'Mileage in',
    dateIn: 'Date in',
    estimated: 'Estimated completion',
    labor: 'Labor',
    laborTotal: 'Labor total',
    parts: 'Parts',
    partsTotal: 'Parts total',
    summary: 'Summary',
    discount: 'Discount',
    total: 'Total',
    deposit: 'Deposit received',
    received: 'Total received',
    balanceDue: 'Balance due',
    credit: 'Credit due to customer',
    intakeNotes: '360° Inspection Notes',
    observations: 'Shop Observations',
    progressPhotos: 'Work Progress',
    intakePhotos: 'Intake Photos',
    signature: 'Customer Acknowledgment',
    customerFallback: 'Customer',
    signed: 'Signed',
  },
};

/** 'AAAA-MM-DD' como fecha local, sin el corrimiento de zona de `new Date('AAAA-MM-DD')`. */
function formatDay(value: string, locale: string) {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(locale);
}

// Phone photos come in at several MB each; embedding them raw produced a
// ~24MB PDF that email providers reject. Downscale to at most MAX_PHOTO_PX on
// the long edge and re-encode as JPEG so the whole report stays a couple of MB.
const MAX_PHOTO_PX = 900;
const JPEG_QUALITY = 0.72;

// URLs firmadas del bucket privado, así que un fetch simple funciona. Una imagen
// que falla (red, CORS, archivo borrado) se omite en vez de romper el reporte.
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const scale = Math.min(1, MAX_PHOTO_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return null;
  }
}

// Logos and signatures are small and often transparent, so they keep their
// alpha channel as PNG instead of going through the JPEG path above (which
// would flatten transparency to black). Returns the aspect ratio too, so the
// caller can place them without distorting.
async function toPngDataUrl(url: string, maxPx = 400) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());

    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return { dataUrl: canvas.toDataURL('image/png'), ratio: width / height };
  } catch {
    return null;
  }
}

/**
 * El reporte impreso de la orden, para el cliente o el archivo.
 *
 * Desde la fase 6 es la versión en papel del reporte web y sigue sus mismas reglas
 * (`datos_portal`): solo las fotos que administración publicó, sin las notas
 * internas de los avances ni los nombres de los técnicos, y solo los trabajos
 * autorizados. Ya no se sube a ningún lado: se descarga.
 *
 * `urls`: ruta del bucket privado → URL firmada (miniaturas visibles y la firma);
 * quien lo llama firma lo necesario (ver `useWorkOrderDetail`).
 */
async function buildWorkOrderPdf(
  order: WorkOrder,
  sede?: Sede | null,
  urls: Record<string, string> = {},
  options: WorkOrderPdfOptions = {}
) {
  const photos = customerReportPhotos(order);
  const lang: PdfLanguage = options.language ?? 'es';
  const S = STRINGS[lang];
  // En inglés, lo que el taller escribió en español sale traducido si ya hay traducción.
  const tr = (text: string) => (lang === 'en' ? options.translations?.[text] ?? text : text);
  const urlsOf = (list: typeof photos.reception, limit: number) =>
    list
      .map((m) => urls[reportImagePath(m)])
      .filter((u): u is string => !!u)
      .slice(0, limit);

  // El color del taller de la orden — no el de la sede elegida arriba — igual que el logo.
  // Las rayas lo llevan tal cual; el texto, oscurecido si hace falta para leerse en blanco.
  const brand = brandColors(sede?.color_tema);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    y += 4;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 40);
    doc.text(title, MARGIN, y);
    y += 2;
    doc.setDrawColor(...brand.accent);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + contentWidth, y);
    y += LINE;
  };

  const label = (text: string, value: string, x: number, width: number) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(text, x, y);
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 30);
    doc.text(doc.splitTextToSize(value || '—', width), x, y + 4.5);
  };

  // ===== Header =====
  // The workshop's own logo and name lead the report: the client receiving it
  // should see their shop, not the platform.
  let headerX = MARGIN;
  // How far down the logo actually reaches. The title is placed below this
  // rather than at a fixed offset: the logo was 14mm tall starting 3mm above
  // the cursor, so it ran to y+11 while the advance was only 10-14mm — leaving
  // "Orden de Trabajo" printed across the bottom of the shop's own logo, which
  // is exactly how this was reported. A shorter logo plus a real gap fixes both
  // halves of that.
  let headerBottom = y;
  if (sede?.logo_url) {
    const logo = await toPngDataUrl(sede.logo_url, 300);
    if (logo) {
      const logoH = 11;
      const logoW = Math.min(32, logoH * logo.ratio);
      try {
        doc.addImage(logo.dataUrl, 'PNG', MARGIN, y - 2, logoW, logoH);
        headerX = MARGIN + logoW + 5;
        headerBottom = Math.max(headerBottom, y - 2 + logoH);
      } catch {
        // Unsupported image — fall back to the text-only header.
      }
    }
  }

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brand.text);
  doc.text(sede?.nombre || 'RESTORIFY', headerX, y + 2);

  if (sede?.direccion || sede?.telefono) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text([sede.direccion, sede.telefono].filter(Boolean).join('  ·  '), headerX, y + 7);
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(
    `${S.generated}: ${new Date().toLocaleDateString(S.locale)} ${new Date().toLocaleTimeString(S.locale, { hour: '2-digit', minute: '2-digit' })}`,
    pageWidth - MARGIN,
    y + 2,
    { align: 'right' }
  );
  // The header block ends below whichever is taller: the text column or the
  // logo. HEADER_GAP is then real white space between the two, not the slack
  // left over from a font metric.
  const textBottom = y + (sede?.direccion || sede?.telefono ? 9 : 4);
  y = Math.max(textBottom, headerBottom) + HEADER_GAP;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 30);
  doc.text(`${S.title} ${order.numero_orden}`, MARGIN, y);
  y += 5;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  const statusKey = order.retirada_sin_reparar ? 'retirada' : order.estatus;
  doc.text(
    [
      `${S.statusLabel}: ${S.status[statusKey] || order.estatus}`,
      // Una orden retirada sin reparar no tiene avance que contar.
      ...(order.retirada_sin_reparar ? [] : [`${S.progress}: ${order.porcentaje_avance}%`]),
      `${S.type}: ${S.workType[order.tipo_trabajo] || order.tipo_trabajo}`,
    ].join('  ·  '),
    MARGIN,
    y
  );
  y += LINE;

  // La versión web lleva los videos, las notas de voz y el estado al día.
  if (options.portalUrl) {
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(S.online, MARGIN, y);
    y += 4.5;
    doc.setTextColor(...brand.text);
    doc.textWithLink(options.portalUrl, MARGIN, y, { url: options.portalUrl });
    y += LINE;
  }

  // ===== Customer & vehicle =====
  sectionTitle(S.customerVehicle);
  const half = contentWidth / 2;
  label(S.customer, order.cliente?.nombre || '', MARGIN, half - 5);
  label(S.phone, formatPhone(order.cliente?.telefono), MARGIN + half, half - 5);
  y += 11;
  label(S.vehicle, `${order.vehiculo?.anio || ''} ${order.vehiculo?.marca || ''} ${order.vehiculo?.modelo || ''}`.trim(), MARGIN, half - 5);
  label(S.plate, order.vehiculo?.placa || '', MARGIN + half, half - 5);
  y += 11;
  label(S.vin, order.vehiculo?.vin || '', MARGIN, half - 5);
  label(S.milesIn, String(order.millas_ingreso ?? ''), MARGIN + half, half - 5);
  y += 11;
  label(S.dateIn, order.fecha_ingreso ? new Date(order.fecha_ingreso).toLocaleDateString(S.locale) : '', MARGIN, half - 5);
  label(S.estimated, order.fecha_estimada_entrega ? formatDay(order.fecha_estimada_entrega, S.locale) : '', MARGIN + half, half - 5);
  y += 11;

  // ===== Labor =====
  // Solo lo autorizado: es lo que se cobra y lo que suman los totales.
  const laborItems = (order.labor_items || []).filter((l) => (l.estado ?? 'aprobado') === 'aprobado');
  if (laborItems.length) {
    sectionTitle(S.labor);
    doc.setFontSize(9);
    laborItems.forEach((item) => {
      ensureSpace(LINE);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 20, 30);
      const lines = doc.splitTextToSize(tr(item.descripcion), contentWidth - 30);
      doc.text(lines, MARGIN, y);
      doc.text(money(Number(item.costo)), pageWidth - MARGIN, y, { align: 'right' });
      y += LINE * lines.length;
    });
    ensureSpace(LINE);
    doc.setFont('helvetica', 'bold');
    doc.text(S.laborTotal, MARGIN, y);
    doc.text(money(Number(order.total_labor)), pageWidth - MARGIN, y, { align: 'right' });
    y += LINE;
  }

  // ===== Parts =====
  // Los montos viven en `orden_montos`, que solo lee un admin — y solo un admin
  // genera reportes. Si faltaran (una orden cargada sin el embed), se derivan de
  // las líneas en vez de imprimir "$NaN" en un documento para el cliente.
  const parts = (order.repuestos || []).filter((p) => (p.estado ?? 'aprobado') === 'aprobado');
  const totalRepuestos = Number(
    order.montos?.total_repuestos ?? parts.reduce((sum, p) => sum + Number(p.subtotal), 0)
  );
  const totalGeneral = Number(order.montos?.total_general ?? Number(order.total_labor) + totalRepuestos);
  const deposito = Number(order.montos?.deposito_inicial ?? 0);
  const descuento = Number(order.montos?.descuento ?? 0);
  if (parts.length) {
    sectionTitle(S.parts);
    doc.setFontSize(9);
    parts.forEach((part) => {
      ensureSpace(LINE);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 20, 30);
      const lines = doc.splitTextToSize(`${tr(part.descripcion)}  (x${part.cantidad})`, contentWidth - 30);
      doc.text(lines, MARGIN, y);
      doc.text(money(Number(part.subtotal)), pageWidth - MARGIN, y, { align: 'right' });
      y += LINE * lines.length;
    });
    ensureSpace(LINE);
    doc.setFont('helvetica', 'bold');
    doc.text(S.partsTotal, MARGIN, y);
    doc.text(money(totalRepuestos), pageWidth - MARGIN, y, { align: 'right' });
    y += LINE;
  }

  // ===== Totals =====
  // Las cifras son las de la base: el total ya trae el descuento, y lo recibido y el saldo
  // salen de `saldo_orden` (depósito, pagos y devoluciones). Sin ellas (una llamada vieja), lo
  // de antes: una orden entregada ya cobró su saldo.
  sectionTitle(S.summary);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 20, 30);
  const delivered = order.estatus === 'entregado';
  const balance = options.balance ? options.balance.saldo : delivered ? 0 : totalGeneral - deposito;
  const rows: [string, string][] = [
    ...(descuento > 0.009 ? ([[S.discount, `-${money(descuento)}`]] as [string, string][]) : []),
    [S.total, money(totalGeneral)],
    [S.deposit, money(deposito)],
    ...(options.balance && Math.abs(options.balance.cobrado - deposito) > 0.009
      ? ([[S.received, money(options.balance.cobrado)]] as [string, string][])
      : []),
  ];
  rows.forEach(([k, v]) => {
    ensureSpace(LINE);
    doc.text(k, MARGIN, y);
    doc.text(v, pageWidth - MARGIN, y, { align: 'right' });
    y += LINE;
  });
  ensureSpace(LINE + 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  // A deposit larger than the job total isn't an error — it's money the shop
  // owes back, and the report should say so rather than print a negative debt.
  doc.text(balance < -0.009 ? S.credit : S.balanceDue, MARGIN, y);
  doc.text(money(Math.abs(balance)), pageWidth - MARGIN, y, { align: 'right' });
  y += LINE + 2;

  // ===== Intake notes =====
  if (order.inspeccion_360_notas) {
    sectionTitle(S.intakeNotes);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 30);
    const notes = doc.splitTextToSize(tr(order.inspeccion_360_notas), contentWidth);
    ensureSpace(LINE * notes.length);
    doc.text(notes, MARGIN, y);
    y += LINE * notes.length;
  }

  // ===== Observaciones del taller (F6) =====
  // Lo que administración decidió contarle al cliente de un hallazgo que no se hará ahora.
  const observations = customerObservations(order);
  if (observations.length) {
    sectionTitle(S.observations);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 30);
    observations.forEach((o) => {
      const lines = doc.splitTextToSize(`• ${tr(o.texto_cliente!.trim())}`, contentWidth);
      ensureSpace(LINE * lines.length);
      doc.text(lines, MARGIN, y);
      y += LINE * lines.length;
    });
  }

  // ===== Avances publicados =====
  // Lo mismo que ve el cliente en su enlace, por día: el texto de los avances que se marcaron
  // visibles (traducido si el PDF va en inglés) y las fotos publicadas. Las notas internas no
  // salen (06/10/2026: antes salían solo las fotos y faltaba lo que el taller escribió).
  const progressDays = progressTimeline(order)
    .map(({ day, notes, photos: dayPhotos }) => ({ day, notes, urls: urlsOf(dayPhotos, 6) }))
    .filter((g) => g.urls.length > 0 || g.notes.length > 0);
  if (progressDays.length) {
    sectionTitle(S.progressPhotos);
    const imgW = 45;
    const imgH = 34;
    for (const group of progressDays) {
      ensureSpace(LINE + imgH + 4);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(new Date(`${group.day}T12:00:00`).toLocaleDateString(S.locale), MARGIN, y);
      y += 3;
      if (group.notes.length) {
        doc.setFontSize(10);
        doc.setTextColor(20, 20, 30);
        for (const note of group.notes) {
          const lines = doc.splitTextToSize(`• ${tr(note)}`, contentWidth);
          y += 2;
          ensureSpace(LINE * lines.length);
          doc.text(lines, MARGIN, y);
          y += LINE * lines.length - 2;
        }
        y += 3;
      }
      if (group.urls.length === 0) {
        y += 3;
        continue;
      }
      let x = MARGIN;
      for (const url of group.urls) {
        if (x + imgW > pageWidth - MARGIN) {
          x = MARGIN;
          y += imgH + 4;
          ensureSpace(imgH + 4);
        }
        const dataUrl = await toDataUrl(url);
        if (dataUrl) {
          try {
            doc.addImage(dataUrl, 'JPEG', x, y, imgW, imgH);
          } catch {
            // Formato no soportado: se omite en vez de romper el reporte.
          }
        }
        x += imgW + 4;
      }
      y += imgH + 6;
    }
  }

  // ===== Intake photos =====
  const intakePhotos = urlsOf(photos.reception, 12);
  if (intakePhotos.length) {
    sectionTitle(S.intakePhotos);
    const imgW = 55;
    const imgH = 41;
    let x = MARGIN;
    for (const url of intakePhotos) {
      ensureSpace(imgH + 4);
      if (x + imgW > pageWidth - MARGIN) {
        x = MARGIN;
        y += imgH + 4;
        ensureSpace(imgH + 4);
      }
      const dataUrl = await toDataUrl(url);
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, 'JPEG', x, y, imgW, imgH);
        } catch {
          // ignore unsupported image
        }
      }
      x += imgW + 4;
    }
    y += imgH + 4;
  }

  // ===== Customer signature =====
  const firmaUrl = order.firma_ruta ? urls[order.firma_ruta] : undefined;
  if (firmaUrl) {
    const firma = await toPngDataUrl(firmaUrl, 600);
    if (firma) {
      const sigH = 22;
      const sigW = Math.min(70, sigH * firma.ratio);
      // Reserve the whole block (title + rule + image + name line) up front so
      // the heading never lands alone at the bottom of a page.
      ensureSpace(sigH + 34);
      sectionTitle(S.signature);
      try {
        doc.addImage(firma.dataUrl, 'PNG', MARGIN, y, sigW, sigH);
      } catch {
        // ignore unsupported image
      }
      y += sigH + 1;
      doc.setDrawColor(...MUTED);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y, MARGIN + 70, y);
      y += 4;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(order.cliente?.nombre || S.customerFallback, MARGIN, y);
      if (order.firma_fecha) {
        doc.text(`${S.signed}: ${new Date(order.firma_fecha).toLocaleDateString(S.locale)}`, MARGIN + 70, y, {
          align: 'right',
        });
      }
      y += LINE;
    }
  }

  return doc;
}

/** The file name the shop expects to see in their downloads folder. */
export function workOrderPdfName(order: WorkOrder, language: PdfLanguage = 'es') {
  return language === 'en' ? `${order.numero_orden}-EN.pdf` : `${order.numero_orden}.pdf`;
}

/** Genera el reporte y lo descarga. */
export async function generateWorkOrderPdf(
  order: WorkOrder,
  sede?: Sede | null,
  urls: Record<string, string> = {},
  options: WorkOrderPdfOptions = {}
) {
  const doc = await buildWorkOrderPdf(order, sede, urls, options);
  doc.save(workOrderPdfName(order, options.language));
}
