import { jsPDF } from 'jspdf';
import type { Sede, WorkOrder } from '../types/database';

const MARGIN = 15;
const LINE = 6;
const BRAND: [number, number, number] = [212, 160, 23]; // --color-primary
const MUTED: [number, number, number] = [110, 110, 130];

// Keeps the minus sign in front of the currency symbol: "-$100.00", not
// "$-100.00", which is how the shop's paperwork reads.
const money = (value: number) =>
  `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}`;

const STATUS_LABELS: Record<string, string> = {
  recepcion: 'Recepción',
  en_proceso: 'En Proceso',
  espera_repuestos: 'Espera de Repuestos',
  finalizado: 'Finalizado',
  entregado: 'Entregado',
};

// Phone photos come in at several MB each; embedding them raw produced a
// ~24MB PDF that email providers reject. Downscale to at most MAX_PHOTO_PX on
// the long edge and re-encode as JPEG so the whole report stays a couple of MB.
const MAX_PHOTO_PX = 900;
const JPEG_QUALITY = 0.72;

// Supabase Storage URLs are public, so a plain fetch works. Any image that
// fails (network, CORS, deleted file) is skipped rather than failing the
// whole report.
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

export async function generateWorkOrderPdf(order: WorkOrder, sede?: Sede | null) {
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
    doc.setDrawColor(...BRAND);
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
  if (sede?.logo_url) {
    const logo = await toPngDataUrl(sede.logo_url, 300);
    if (logo) {
      const logoH = 14;
      const logoW = Math.min(40, logoH * logo.ratio);
      try {
        doc.addImage(logo.dataUrl, 'PNG', MARGIN, y - 3, logoW, logoH);
        headerX = MARGIN + logoW + 4;
      } catch {
        // Unsupported image — fall back to the text-only header.
      }
    }
  }

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND);
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
    `Generado: ${new Date().toLocaleDateString('es')} ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`,
    pageWidth - MARGIN,
    y + 2,
    { align: 'right' }
  );
  y += sede?.direccion || sede?.telefono ? 14 : 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 30);
  doc.text(`Orden de Trabajo ${order.numero_orden}`, MARGIN, y);
  y += 5;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(
    `Estado: ${STATUS_LABELS[order.estatus] || order.estatus}  ·  Avance: ${order.porcentaje_avance}%  ·  Tipo: ${order.tipo_trabajo}`,
    MARGIN,
    y
  );
  y += LINE;

  // ===== Customer & vehicle =====
  sectionTitle('Cliente y Vehículo');
  const half = contentWidth / 2;
  label('Cliente', order.cliente?.nombre || '', MARGIN, half - 5);
  label('Teléfono', order.cliente?.telefono || '', MARGIN + half, half - 5);
  y += 11;
  label('Vehículo', `${order.vehiculo?.anio || ''} ${order.vehiculo?.marca || ''} ${order.vehiculo?.modelo || ''}`.trim(), MARGIN, half - 5);
  label('Placa', order.vehiculo?.placa || '', MARGIN + half, half - 5);
  y += 11;
  label('VIN', order.vehiculo?.vin || '', MARGIN, half - 5);
  label('Millas de ingreso', String(order.millas_ingreso ?? ''), MARGIN + half, half - 5);
  y += 11;
  label('Fecha de ingreso', order.fecha_ingreso ? new Date(order.fecha_ingreso).toLocaleDateString('es') : '', MARGIN, half - 5);
  label('Entrega estimada', order.fecha_estimada_entrega || '', MARGIN + half, half - 5);
  y += 11;

  // ===== Labor =====
  const laborItems = order.labor_items || [];
  if (laborItems.length) {
    sectionTitle('Mano de Obra');
    doc.setFontSize(9);
    laborItems.forEach((item) => {
      ensureSpace(LINE);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 20, 30);
      const lines = doc.splitTextToSize(item.descripcion, contentWidth - 30);
      doc.text(lines, MARGIN, y);
      doc.text(money(Number(item.costo)), pageWidth - MARGIN, y, { align: 'right' });
      y += LINE * lines.length;
    });
    ensureSpace(LINE);
    doc.setFont('helvetica', 'bold');
    doc.text('Total mano de obra', MARGIN, y);
    doc.text(money(Number(order.total_labor)), pageWidth - MARGIN, y, { align: 'right' });
    y += LINE;
  }

  // ===== Parts =====
  const parts = order.repuestos || [];
  if (parts.length) {
    sectionTitle('Repuestos');
    doc.setFontSize(9);
    parts.forEach((part) => {
      ensureSpace(LINE);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 20, 30);
      const lines = doc.splitTextToSize(`${part.descripcion}  (x${part.cantidad})`, contentWidth - 30);
      doc.text(lines, MARGIN, y);
      doc.text(money(Number(part.subtotal)), pageWidth - MARGIN, y, { align: 'right' });
      y += LINE * lines.length;
    });
    ensureSpace(LINE);
    doc.setFont('helvetica', 'bold');
    doc.text('Total repuestos', MARGIN, y);
    doc.text(money(Number(order.total_repuestos)), pageWidth - MARGIN, y, { align: 'right' });
    y += LINE;
  }

  // ===== Totals =====
  sectionTitle('Resumen');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 20, 30);
  const balance = Number(order.total_general) - Number(order.deposito_inicial);
  const rows: [string, string][] = [
    ['Subtotal', money(Number(order.total_labor) + Number(order.total_repuestos))],
    ['Depósito recibido', `-${money(Number(order.deposito_inicial))}`],
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
  doc.text(balance < 0 ? 'Saldo a favor del cliente' : 'Saldo pendiente', MARGIN, y);
  doc.text(money(Math.abs(balance)), pageWidth - MARGIN, y, { align: 'right' });
  y += LINE + 2;

  // ===== Technicians =====
  const assignments = order.asignaciones || [];
  if (assignments.length) {
    sectionTitle('Técnicos Asignados');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    assignments.forEach((a) => {
      ensureSpace(LINE);
      doc.setTextColor(20, 20, 30);
      doc.text(`${a.usuario?.nombre_completo || '—'} — ${a.tipo_tarea} (${a.estatus_tarea})`, MARGIN, y);
      y += LINE;
    });
  }

  // ===== Intake notes =====
  if (order.inspeccion_360_notas) {
    sectionTitle('Notas de Inspección 360°');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 30);
    const notes = doc.splitTextToSize(order.inspeccion_360_notas, contentWidth);
    ensureSpace(LINE * notes.length);
    doc.text(notes, MARGIN, y);
    y += LINE * notes.length;
  }

  // ===== Progress log =====
  const avances = order.avances || [];
  if (avances.length) {
    sectionTitle('Avance del Trabajo');
    for (const avance of avances) {
      ensureSpace(LINE * 2);
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(
        `${new Date(avance.creado_en).toLocaleDateString('es')} — ${avance.usuario?.nombre_completo || ''}`,
        MARGIN,
        y
      );
      y += 4;
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 30);
      const lines = doc.splitTextToSize(avance.descripcion, contentWidth);
      ensureSpace(LINE * lines.length);
      doc.text(lines, MARGIN, y);
      y += LINE * lines.length;

      // Up to 3 photos per entry, laid out in a row.
      const photos = (avance.fotos || []).slice(0, 3);
      if (photos.length) {
        const imgW = 45;
        const imgH = 34;
        ensureSpace(imgH + 4);
        let x = MARGIN;
        for (const url of photos) {
          const dataUrl = await toDataUrl(url);
          if (dataUrl) {
            try {
              doc.addImage(dataUrl, 'JPEG', x, y, imgW, imgH);
            } catch {
              // Unsupported image format — skip it rather than break the report.
            }
          }
          x += imgW + 4;
        }
        y += imgH + 4;
      }
      y += 2;
    }
  }

  // ===== Intake photos =====
  const intakePhotos = (order.inspeccion_360_fotos || []).filter(Boolean).slice(0, 12) as string[];
  if (intakePhotos.length) {
    sectionTitle('Fotos de Recepción');
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
  if (order.firma_cliente_url) {
    const firma = await toPngDataUrl(order.firma_cliente_url, 600);
    if (firma) {
      const sigH = 22;
      const sigW = Math.min(70, sigH * firma.ratio);
      // Reserve the whole block (title + rule + image + name line) up front so
      // the heading never lands alone at the bottom of a page.
      ensureSpace(sigH + 34);
      sectionTitle('Conformidad del Cliente');
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
      doc.text(order.cliente?.nombre || 'Cliente', MARGIN, y);
      if (order.firma_fecha) {
        doc.text(`Firmado: ${new Date(order.firma_fecha).toLocaleDateString('es')}`, MARGIN + 70, y, {
          align: 'right',
        });
      }
      y += LINE;
    }
  }

  doc.save(`${order.numero_orden}.pdf`);
}
