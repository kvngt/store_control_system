// El sticker con jsPDF de verdad (el otro archivo de pruebas usa un doble que no mide texto).
// QA 19/10/2026: el nombre largo del taller se encimaba con el teléfono, una nota de más de ~64
// caracteres se cortaba sin decirlo, y un carácter raro volvía ilegible la línea entera.

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Llamada = { texto: string[]; x: number; y: number; align?: string; fuente: number; negrita: boolean };

const registro = vi.hoisted(() => ({ lista: [] as Llamada[] }));

// jsPDF de verdad, con `text` anotando cada llamada (los métodos del documento viven en la instancia).
vi.mock('jspdf', async (importOriginal) => {
  const real = await importOriginal<typeof import('jspdf')>();
  class Anotador extends real.jsPDF {
    constructor(...args: ConstructorParameters<typeof real.jsPDF>) {
      super(...args);
      const texto = this.text.bind(this) as (...a: unknown[]) => unknown;
      (this as unknown as { text: unknown }).text = (...a: unknown[]) => {
        const [t, x, y, opciones] = a as [string | string[], number, number, { align?: string }?];
        registro.lista.push({
          texto: Array.isArray(t) ? t : [t],
          x, y, align: opciones?.align,
          fuente: this.getFontSize(),
          negrita: this.getFont().fontStyle === 'bold',
        });
        return texto(...a);
      };
    }
  }
  return { ...real, jsPDF: Anotador };
});

const { jsPDF } = await import('jspdf');
const { buildServiceStickerPdf } = await import('./serviceStickerPdf');

const TOKEN = 'a1b2c3d4'.repeat(8);
const base = {
  taller: { nombre: 'Restorify', telefono: '+13019099937' },
  vehiculo: { anio: 2019, marca: 'Toyota', modelo: 'Camry', placa: 'ABC-1234' },
  servicio: { fecha: '2027-04-14', millas: 66250, nota: 'Aceite sintético 5W-30', token: TOKEN },
  numero_orden: 'ORD-2026-001',
};

let llamadas: Llamada[] = [];

beforeEach(() => {
  registro.lista = [];
  vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://restorifyauto.net');
});

const anotadas = () => registro.lista;

/** Cuánto mide un texto con esa letra, medido con un jsPDF aparte. */
const ancho = (texto: string, fuente: number, negrita: boolean) => {
  const d = new jsPDF({ unit: 'mm', format: [62, 50] });
  d.setFont('helvetica', negrita ? 'bold' : 'normal');
  d.setFontSize(fuente);
  return d.getTextWidth(texto);
};

describe('sticker con jsPDF real', () => {
  it('un nombre de taller largo no pisa el teléfono', async () => {
    await buildServiceStickerPdf(
      { ...base, taller: { nombre: 'Hermanos Rodríguez Collision Center', telefono: '+13019099937' } },
      'es'
    );
    llamadas = anotadas();
    const nombre = llamadas.find((l) => l.y === 6 && l.x === 3)!;
    const telefono = llamadas.find((l) => l.y === 6 && l.align === 'right')!;
    const finNombre = 3 + ancho(nombre.texto[0], nombre.fuente, nombre.negrita);
    const inicioTelefono = 59 - ancho(telefono.texto[0], telefono.fuente, telefono.negrita);
    expect(finNombre).toBeLessThan(inicioTelefono);
    expect(nombre.texto[0].endsWith('…')).toBe(true);
  });

  it('un nombre corto sale completo', async () => {
    await buildServiceStickerPdf(base, 'es');
    expect(anotadas().find((l) => l.y === 6 && l.x === 3)!.texto[0]).toBe('Restorify');
  });

  it('una nota de 120 caracteres no se corta sin avisar: o cabe o termina en «…»', async () => {
    const nota = 'Cambio de aceite sintético, filtros de aceite y de aire, rotación de llantas y revisión de frenos delanteros y traseros';
    await buildServiceStickerPdf({ ...base, servicio: { ...base.servicio, nota } }, 'es');
    const bloque = anotadas().find((l) => l.x === 3 && l.texto.length > 1)!;
    const imprimido = bloque.texto.join(' ');
    // Cada renglón cabe en los 34 mm de la columna.
    for (const r of bloque.texto) expect(ancho(r, bloque.fuente, false)).toBeLessThanOrEqual(34.01);
    // Todo el texto está, o el último renglón lo dice con «…».
    expect(imprimido.replace('…', '').trim().length === nota.length || imprimido.endsWith('…')).toBe(true);
    // Y no se pasa de la línea del pie (36,5 mm).
    const alto = bloque.fuente * 0.3528 * 1.15;
    expect(bloque.y + (bloque.texto.length - 1) * alto).toBeLessThan(36.5);
  });

  it('una nota corta se queda en 6 pt', async () => {
    await buildServiceStickerPdf(base, 'es');
    const nota = anotadas().find((l) => l.texto.join(' ').includes('Aceite sintético'))!;
    expect(nota.fuente).toBe(6);
  });

  it('un guion que no se corta o un emoji en la nota no vuelven ilegible la línea', async () => {
    const doc = await buildServiceStickerPdf(
      { ...base, servicio: { ...base.servicio, nota: 'Aceite 5W‑30 ✓ 😀' } },
      'es'
    );
    const cadenas = [...doc.output().matchAll(/\((.*?)\) Tj/g)].map((m) => m[1]).join('');
    expect(cadenas).not.toContain('\u0000');
    expect(cadenas).toContain('Aceite 5W-30');
  });
});
