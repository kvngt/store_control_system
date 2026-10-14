// El sticker de próximo servicio va pegado en el parabrisas: 62 × 50 mm, solo negro, y un QR
// vectorial que lleva a /s/<código>.
//
// jsPDF se sustituye por un doble que anota cada llamada (como en workOrderPdf.test.ts): lo que
// importa es qué se pinta y dónde, no el binario.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import QRCode from 'qrcode';

const llamadas = vi.hoisted(() => ({ lista: [] as [string, unknown[]][], opciones: [] as unknown[] }));

vi.mock('jspdf', () => {
  class FakePdf {
    constructor(opciones: unknown) {
      llamadas.opciones.push(opciones);
      return new Proxy(this, {
        get(target, prop: string) {
          if (prop in target) return (target as Record<string, unknown>)[prop];
          if (prop === 'then') return undefined;
          if (prop === 'splitTextToSize') return (t: string) => [t];
          return (...args: unknown[]) => {
            llamadas.lista.push([prop, args]);
          };
        },
      });
    }
  }
  return { jsPDF: FakePdf };
});

const { buildServiceStickerPdf } = await import('./serviceStickerPdf');
type ServiceStickerData = Parameters<typeof buildServiceStickerPdf>[0];

const TOKEN = 'a1b2c3d4'.repeat(8);

const baseData: ServiceStickerData = {
  taller: { nombre: 'Restorify Auto', telefono: '+12403551266' },
  vehiculo: { anio: 2019, marca: 'Toyota', modelo: 'Camry', placa: 'ABC-1234' },
  servicio: { fecha: '2027-04-14', millas: 66250, nota: 'Aceite sintético 5W-30', token: TOKEN },
  numero_orden: 'ORD-2026-001',
};

const textos = () =>
  llamadas.lista.filter(([m]) => m === 'text').flatMap(([, a]) => (Array.isArray(a[0]) ? a[0] : [a[0]])) as string[];

describe('serviceStickerPdf', () => {
  beforeEach(() => {
    llamadas.lista = [];
    llamadas.opciones = [];
    vi.restoreAllMocks();
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://restorifyauto.net');
  });

  it('la hoja es de 62 × 50 mm, apaisada', async () => {
    await buildServiceStickerPdf(baseData, 'es');
    expect(llamadas.opciones[0]).toEqual({ unit: 'mm', format: [62, 50], orientation: 'landscape' });
  });

  it('el QR codifica /s/<código> y se dibuja en vectores dentro de su columna (39–59 mm)', async () => {
    const spyQr = vi.spyOn(QRCode, 'create');
    await buildServiceStickerPdf(baseData, 'es');

    expect(spyQr).toHaveBeenCalledWith(
      `https://restorifyauto.net/s/${TOKEN}`,
      expect.objectContaining({ errorCorrectionLevel: 'M' })
    );
    const modulos = llamadas.lista.filter(([m, a]) => m === 'rect' && a[4] === 'F' && (a[0] as number) > 38);
    expect(modulos.length).toBeGreaterThan(100);
    for (const [, [x, y, w, h]] of modulos) {
      expect(x as number).toBeGreaterThanOrEqual(39);
      expect((x as number) + (w as number)).toBeLessThanOrEqual(59.0001);
      expect((y as number) + (h as number)).toBeLessThanOrEqual(30.5001);
    }
    expect(llamadas.lista.some(([m]) => m === 'addImage')).toBe(false);
  });

  it('la fecha 2027-01-01 sale como 1 de enero, no 31 de diciembre (sin corrimiento UTC)', async () => {
    const enero = { ...baseData, servicio: { ...baseData.servicio, fecha: '2027-01-01' } };
    await buildServiceStickerPdf(enero, 'es');
    expect(textos()).toContain('1 ene 2027');

    llamadas.lista = [];
    await buildServiceStickerPdf(enero, 'en');
    expect(textos()).toContain('Jan 1, 2027');
  });

  it('las millas salen como «66,250 mi»; sin millas (pintura) no sale ninguna', async () => {
    await buildServiceStickerPdf(baseData, 'es');
    expect(textos()).toContain('66,250 mi');

    llamadas.lista = [];
    await buildServiceStickerPdf({ ...baseData, servicio: { ...baseData.servicio, millas: null } }, 'es');
    expect(textos().some((t) => / mi$/.test(t))).toBe(false);
  });

  it('textos en español y en inglés', async () => {
    await buildServiceStickerPdf(baseData, 'es');
    expect(textos()).toEqual(expect.arrayContaining(['PRÓXIMO SERVICIO', 'Escanea para agendar']));

    llamadas.lista = [];
    await buildServiceStickerPdf(baseData, 'en');
    expect(textos()).toEqual(expect.arrayContaining(['NEXT SERVICE', 'Scan to book']));
  });

  it('el pie lleva el vehículo, la placa y el número de orden; sin año no escribe un 0', async () => {
    await buildServiceStickerPdf(baseData, 'es');
    expect(textos()).toEqual(expect.arrayContaining(['2019 Toyota Camry', 'ABC-1234', 'ORD-2026-001']));

    llamadas.lista = [];
    await buildServiceStickerPdf({ ...baseData, vehiculo: { ...baseData.vehiculo, anio: 0 } }, 'es');
    expect(textos()).toContain('Toyota Camry');
  });

  it('solo negro: ningún color de texto, trazo ni relleno distinto de blanco o negro', async () => {
    await buildServiceStickerPdf(baseData, 'es');
    const colores = llamadas.lista.filter(([m]) => /^set(Text|Draw|Fill)Color$/.test(m)).map(([, a]) => a.join(','));
    for (const c of colores) expect(['0,0,0', '255,255,255']).toContain(c);
  });
});
