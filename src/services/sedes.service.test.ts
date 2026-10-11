// `sedes.telefono` es el respaldo heredado de la lista de teléfonos: lo escribe solo este
// servicio, igual al primer número, para que nunca quede distinto de lo que ve el cliente.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserted: null as unknown,
  updated: null as unknown,
}));

vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: () => ({
        insert: (payload: unknown) => {
          mocks.inserted = payload;
          return {
            select: () => ({
              single: async () => ({ data: { id: 'sede-1', ...(payload as object) }, error: null }),
            }),
          };
        },
        update: (payload: unknown) => {
          mocks.updated = payload;
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'sede-1', ...(payload as object) }, error: null }),
              }),
            }),
          };
        },
      }),
    },
  };
});

const { sedesService } = await import('./sedes.service');

const PHONES = [
  { label: 'English', numero: '240-355-1266', tipo: 'celular' as const, whatsapp: false },
  { label: 'Spanish', numero: '202-607-6126', tipo: 'celular' as const, whatsapp: true },
  { label: 'Restorify office', numero: '+1 (301) 909-9937', tipo: 'oficina' as const, whatsapp: false },
];

beforeEach(() => {
  mocks.inserted = null;
  mocks.updated = null;
});

describe('sedesService — teléfonos y whatsapp', () => {
  it('createSede guarda la lista, telefono (primer número) y whatsapp (primer número con whatsapp)', async () => {
    await sedesService.createSede({
      nombre: 'Restorify Auto',
      direccion: '5010 46th Hyattsville MD',
      telefonos: PHONES,
      capacidad: 10,
    });

    expect(mocks.inserted).toEqual({
      nombre: 'Restorify Auto',
      direccion: '5010 46th Hyattsville MD',
      telefono: '240-355-1266',
      whatsapp: '202-607-6126',
      telefonos: PHONES,
      capacidad: 10,
    });
  });

  it('createSede sin teléfonos guarda una lista vacía, telefono vacío y whatsapp null', async () => {
    await sedesService.createSede({ nombre: 'Nueva', direccion: '', capacidad: 10 });
    expect(mocks.inserted).toMatchObject({ telefono: '', whatsapp: null, telefonos: [] });
  });

  it('updateSede con la lista recalcula telefono y whatsapp', async () => {
    await sedesService.updateSede('sede-1', {
      telefonos: [
        { label: 'Vacío', numero: '  ', tipo: 'oficina', whatsapp: false },
        { label: 'Oficina', numero: '301-909-9937', tipo: 'oficina', whatsapp: false },
        { label: 'Directo', numero: '240-111-2222', tipo: 'celular', whatsapp: true },
      ],
    });
    expect(mocks.updated).toMatchObject({
      telefono: '301-909-9937',
      whatsapp: '240-111-2222',
    });
  });

  it('updateSede con lista sin WhatsApp pone whatsapp en null', async () => {
    await sedesService.updateSede('sede-1', {
      telefonos: [
        { label: 'Oficina', numero: '301-909-9937', tipo: 'oficina', whatsapp: false },
      ],
    });
    expect(mocks.updated).toMatchObject({
      telefono: '301-909-9937',
      whatsapp: null,
    });
  });

  it('updateSede sin la lista no toca telefono ni whatsapp', async () => {
    await sedesService.updateSede('sede-1', { color_tema: '#112233' });
    expect(mocks.updated).toEqual({ color_tema: '#112233' });
  });
});
