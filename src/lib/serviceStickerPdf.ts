import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { serviceStickerUrl } from '../features/workOrders/nextService';
import { formatPhone } from './phone';

export interface ServiceStickerData {
  taller: {
    nombre: string;
    telefono?: string | null;
  };
  vehiculo: {
    anio: number;
    marca: string;
    modelo: string;
    placa: string;
  };
  servicio: {
    fecha: string | null;
    millas: number | null;
    nota: string | null;
    token: string;
  };
  numero_orden: string;
}

const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formatea la fecha 'YYYY-MM-DD' en formato legible con mes en texto,
 * sin conversiones de zona horaria UTC para evitar desfases de día.
 */
function formatStickerDate(dateStr: string, idioma: 'es' | 'en'): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  if (idioma === 'en') {
    return `${MESES_EN[m - 1]} ${d}, ${y}`;
  }
  return `${d} ${MESES_ES[m - 1]} ${y}`;
}

/**
 * Construye el documento PDF de 62 x 50 mm apaisado (Brother QL-810W)
 * con QR vectorial (20 x 20 mm, quiet zone 2 módulos).
 */
export async function buildServiceStickerPdf(
  data: ServiceStickerData,
  idioma: 'es' | 'en' = 'es'
): Promise<jsPDF> {
  const doc = new jsPDF({
    unit: 'mm',
    format: [62, 50],
    orientation: 'landscape',
  });

  // Configuración base de color y tipografía (solo negro sobre blanco)
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // --- 1. Encabezado (y: 3 a 9 mm) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  // Nombre del taller truncado a margen izquierdo
  const tallerNombre = (data.taller.nombre || '').slice(0, 26);
  doc.text(tallerNombre, 3, 6);

  // Teléfono del taller a la derecha
  if (data.taller.telefono) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(formatPhone(data.taller.telefono), 59, 6, { align: 'right' });
  }

  // Línea divisoria superior
  doc.setLineWidth(0.25);
  doc.line(3, 8.5, 59, 8.5);

  // --- 2. Columna izquierda (x: 3 a 37 mm) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(idioma === 'en' ? 'NEXT SERVICE' : 'PRÓXIMO SERVICIO', 3, 12.5);

  let curY = 18;

  // Fecha con mes en letras
  if (data.servicio.fecha) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(formatStickerDate(data.servicio.fecha, idioma), 3, curY);
    curY += 5.5;
  }

  // Millas (solo si vienen definidas)
  if (data.servicio.millas !== null && data.servicio.millas !== undefined) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`${Number(data.servicio.millas).toLocaleString('en-US')} mi`, 3, curY);
    curY += 5;
  }

  // Nota (máximo 2 renglones a 6 pt)
  if (data.servicio.nota) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    const noteLines = doc.splitTextToSize(data.servicio.nota.trim(), 34).slice(0, 2);
    doc.text(noteLines, 3, curY);
  }

  // --- 3. Columna derecha: QR vectorial (20 x 20 mm en x: 39 a 59 mm, y: 11 a 31 mm) ---
  const qrUrl = serviceStickerUrl(data.servicio.token);
  const qr = QRCode.create(qrUrl, { errorCorrectionLevel: 'M' });

  const qrX = 39;
  const qrY = 10.5;
  const qrSize = 20;
  const quietZone = 2;
  const totalModules = qr.modules.size + quietZone * 2;
  const modSize = qrSize / totalModules;

  // Fondo blanco para zona de silencio
  doc.setFillColor(255, 255, 255);
  doc.rect(qrX, qrY, qrSize, qrSize, 'F');

  // Módulos negros vectoriales
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < qr.modules.size; r++) {
    for (let c = 0; c < qr.modules.size; c++) {
      if (qr.modules.get(r, c)) {
        const x = qrX + (c + quietZone) * modSize;
        const y = qrY + (r + quietZone) * modSize;
        doc.rect(x, y, modSize, modSize, 'F');
      }
    }
  }

  // Texto debajo del QR (6 pt centrado en la columna QR)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  const scanLabel = idioma === 'en' ? 'Scan to book' : 'Escanea para agendar';
  doc.text(scanLabel, qrX + qrSize / 2, qrY + qrSize + 3, { align: 'center' });

  // --- 4. Pie de página (y: 37 a 48 mm) ---
  doc.setLineWidth(0.25);
  doc.line(3, 36.5, 59, 36.5);

  // Vehículo y placa
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const vehicleText = [data.vehiculo.anio || '', data.vehiculo.marca, data.vehiculo.modelo].join(' ').trim();
  doc.text(vehicleText.slice(0, 30), 3, 41);

  if (data.vehiculo.placa) {
    doc.text(data.vehiculo.placa, 59, 41, { align: 'right' });
  }

  // Número de orden
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(data.numero_orden || '', 3, 46);

  return doc;
}

/**
 * Genera el PDF y lo pone en la ventana abierta en el clic (`openStickerWindow`, en `features/workOrders/nextService.ts`); desde ahí se
 * imprime (Windows) o se comparte → Imprimir (iPhone). Sin ventana, lo descarga.
 */
export async function printServiceSticker(
  data: ServiceStickerData,
  idioma: 'es' | 'en',
  printWindow: Window | null
): Promise<void> {
  const doc = await buildServiceStickerPdf(data, idioma);
  const fileName = `sticker-${data.numero_orden || 'servicio'}.pdf`;
  if (printWindow && !printWindow.closed) {
    const url = URL.createObjectURL(doc.output('blob'));
    printWindow.location.href = url;
    // La ventana ya cargó el PDF; el blob se suelta después para no cortarle la carga.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    doc.save(fileName);
  }
}
