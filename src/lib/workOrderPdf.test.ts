// El PDF de la orden es para el cliente: tiene que llevar el color y los datos del taller de
// la orden, y decir el estado igual que su portal.
//
// jsPDF se sustituye por un doble que anota cada llamada: lo que importa aquí es qué se
// pinta y de qué color, no el binario.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Sede, WorkOrder } from '../types/database';
import { brandColors } from './brandColor';

const llamadas = vi.hoisted(() => ({ lista: [] as [string, unknown[]][] }));

vi.mock('jspdf', () => {
  class FakePdf {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    constructor() {
      return new Proxy(this, {
        get(target, prop: string) {
          if (prop in target) return (target as Record<string, unknown>)[prop];
          // Sin `then`: `buildWorkOrderPdf` es async y devuelve el documento, y un objeto
          // con `then` lo toma `await` por una promesa que nunca resuelve.
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

const { generateWorkOrderPdf } = await import('./workOrderPdf');

const SEDE = {
  id: 's1',
  nombre: 'Taller Amarillo',
  direccion: 'Calle 1',
  telefono: '+15550100',
  color_tema: '#e8c64a',
  logo_url: null,
} as unknown as Sede;

const orden = (estatus: string) =>
  ({
    id: 'o1',
    numero_orden: 'ORD-2026-001',
    estatus,
    tipo_trabajo: 'mecanica',
    creado_en: '2026-09-01T15:00:00Z',
    fecha_ingreso: '2026-09-01T15:00:00Z',
    cliente: { nombre: 'Marta', telefono: '+15550123' },
    vehiculo: { marca: 'Toyota', modelo: 'Camry', anio: 2019, placa: 'ABC123', vin: '1HGCM82633A004352' },
    labor_items: [],
    repuestos: [],
    avances: [],
    media: [],
    montos: { total_general: 0, total_repuestos: 0, deposito_inicial: 0 },
  }) as unknown as WorkOrder;

const textoPintado = () =>
  llamadas.lista.filter(([m]) => m === 'text' || m === 'textWithLink').map(([, a]) => String(Array.isArray(a[0]) ? a[0].join(' ') : a[0]));

/** El color de texto que estaba puesto cuando se pintó `buscado`. */
const colorAlPintar = (buscado: string) => {
  let color: unknown[] | null = null;
  for (const [m, a] of llamadas.lista) {
    if (m === 'setTextColor') color = a;
    if ((m === 'text' || m === 'textWithLink') && String(a[0]) === buscado) return color;
  }
  return undefined;
};

beforeEach(() => {
  llamadas.lista = [];
});

describe('generateWorkOrderPdf', () => {
  it('el nombre del taller sale en el color de esa sede, legible sobre blanco', async () => {
    await generateWorkOrderPdf(orden('en_proceso'), SEDE);

    // Antes era el dorado de la app para cualquier taller.
    expect(colorAlPintar('Taller Amarillo')).toEqual(brandColors('#e8c64a').text);
  });

  it('las rayas de sección llevan el color de la sede tal cual', async () => {
    await generateWorkOrderPdf(orden('en_proceso'), SEDE);

    const rayas = llamadas.lista.filter(([m]) => m === 'setDrawColor').map(([, a]) => a);
    expect(rayas).toContainEqual([232, 198, 74]);
  });

  // El estado se llamaba "Espera de Repuestos" antes de F1; el portal ya decía otra cosa.
  it('dice el estado igual que el portal del cliente', async () => {
    await generateWorkOrderPdf(orden('espera_autorizacion'), SEDE);

    const texto = textoPintado().join(' | ');
    expect(texto).toContain('Esperando su autorización');
    expect(texto).not.toContain('Espera de Repuestos');
  });
});
