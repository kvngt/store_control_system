import { describe, it, expect } from 'vitest';
import { customerReportPhotos, groupByDay, reportAssetPaths, reportImagePath } from './reportMedia';
import type { OrderMedia } from '../types/database';

function media(overrides: Partial<OrderMedia>): OrderMedia {
  return {
    id: 'm', orden_id: 'o', sede_id: 's', avance_id: null, tipo: 'foto', origen: 'recepcion', zona: null,
    ruta: 's/o/foto.jpg', ruta_miniatura: 's/o/foto-thumb.jpg', mime: 'image/jpeg', bytes: 1, duracion_seg: null,
    ancho: null, alto: null, visible_cliente: true, proveedor: 'supabase', subido_por: null,
    creado_en: '2026-09-12T15:00:00Z',
    ...overrides,
  };
}

describe('reportMedia', () => {
  const order = {
    firma_ruta: 's/o/firma.png',
    media: [
      media({ id: 'r1' }),
      media({ id: 'r2', visible_cliente: false, ruta: 's/o/oculta.jpg', ruta_miniatura: null }),
      media({ id: 'a1', origen: 'avance', ruta: 's/o/avance.jpg', ruta_miniatura: null }),
      media({ id: 'a2', origen: 'avance', visible_cliente: false, ruta: 's/o/interna.jpg' }),
      media({ id: 'v1', origen: 'avance', tipo: 'video', ruta: 's/o/video.mp4' }),
    ],
  };

  it('el reporte solo lleva fotos publicadas: ni internas ni videos', () => {
    const { reception, progress } = customerReportPhotos(order);
    expect(reception.map((m) => m.id)).toEqual(['r1']);
    expect(progress.map((m) => m.id)).toEqual(['a1']);
  });

  it('usa la miniatura cuando existe y firma también la firma del cliente', () => {
    expect(reportImagePath(order.media[0])).toBe('s/o/foto-thumb.jpg');
    expect(reportAssetPaths(order)).toEqual(['s/o/foto-thumb.jpg', 's/o/avance.jpg', 's/o/firma.png']);
  });

  it('agrupa por día y en orden', () => {
    const groups = groupByDay([
      media({ id: 'b', creado_en: '2026-09-13T18:00:00' }),
      media({ id: 'a', creado_en: '2026-09-12T09:00:00' }),
      media({ id: 'c', creado_en: '2026-09-13T08:00:00' }),
    ]);
    expect(groups.map((g) => [g.day, g.items.map((m) => m.id)])).toEqual([
      ['2026-09-12', ['a']],
      ['2026-09-13', ['c', 'b']],
    ]);
  });
});
