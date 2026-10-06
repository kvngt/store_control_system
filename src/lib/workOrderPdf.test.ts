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

// En español o en inglés, como lo elija administración (decisión del taller, 05/10/2026).
describe('generateWorkOrderPdf: idioma y cuenta', () => {
  const conLineas = () =>
    ({
      ...orden('en_proceso'),
      total_labor: 400,
      labor_items: [{ id: 'l1', orden_id: 'o1', descripcion: 'Cambio de frenos', costo: 400, estado: 'aprobado' }],
      inspeccion_360_notas: 'Rayón en la puerta',
      montos: { total_general: 360, total_repuestos: 0, deposito_inicial: 100, descuento: 40 },
    }) as unknown as WorkOrder;

  it('en inglés traduce las etiquetas y lo que ya está traducido; lo demás sale como se escribió', async () => {
    await generateWorkOrderPdf(conLineas(), SEDE, {}, {
      language: 'en',
      translations: { 'Cambio de frenos': 'Brake replacement' },
      balance: { cobrado: 100, saldo: 260 },
    });
    const texto = textoPintado();
    expect(texto).toContain('Work Order ORD-2026-001');
    expect(texto).toContain('Labor');
    expect(texto).toContain('Brake replacement');
    expect(texto).toContain('Rayón en la puerta');
    expect(texto).toContain('Balance due');
    expect(texto.some((t) => t.startsWith('Orden de Trabajo'))).toBe(false);
  });

  // 06/10/2026: el enlace mostraba lo que el técnico escribió en un avance visible y el PDF no.
  it('lleva el texto de los avances visibles, traducido; nunca los internos', async () => {
    await generateWorkOrderPdf(
      {
        ...conLineas(),
        avances: [
          { id: 'a1', orden_id: 'o1', usuario_id: 'u1', descripcion: 'Ya lijamos la puerta', creado_en: '2026-09-02T15:00:00Z', visible_cliente: true },
          { id: 'a2', orden_id: 'o1', usuario_id: 'u1', descripcion: 'Nota interna del taller', creado_en: '2026-09-02T16:00:00Z', visible_cliente: false },
        ],
      } as unknown as WorkOrder,
      SEDE,
      {},
      { language: 'en', translations: { 'Ya lijamos la puerta': 'We already sanded the door' }, balance: { cobrado: 100, saldo: 260 } }
    );
    const texto = textoPintado();
    expect(texto).toContain('Work Progress');
    expect(texto).toContain('• We already sanded the door');
    expect(texto.some((t) => t.includes('Nota interna'))).toBe(false);
  });

  it('el resumen lleva el descuento y el saldo que da la base', async () => {
    await generateWorkOrderPdf(conLineas(), SEDE, {}, { balance: { cobrado: 100, saldo: 260 } });
    const texto = textoPintado();
    expect(texto).toContain('Descuento');
    expect(texto).toContain('-$40.00');
    expect(texto).toContain('$260.00');
  });

  it('una retirada sin reparar lo dice, sin avance', async () => {
    await generateWorkOrderPdf({ ...orden('entregado'), retirada_sin_reparar: true } as WorkOrder, SEDE);
    const estado = textoPintado().find((t) => t.startsWith('Estado:'));
    expect(estado).toContain('Retirado sin reparar');
    expect(estado).not.toContain('Avance');
  });
});
