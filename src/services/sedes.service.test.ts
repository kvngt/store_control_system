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
  { label: 'English', numero: '240-355-1266' },
  { label: 'Spanish', numero: '202-607-6126' },
  { label: 'Restorify office', numero: '+1 (301) 909-9937' },
];

beforeEach(() => {
  mocks.inserted = null;
  mocks.updated = null;
});

describe('sedesService — teléfonos', () => {
  it('createSede guarda la lista y pone en telefono el primer número', async () => {
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
      telefonos: PHONES,
      capacidad: 10,
    });
  });

  it('createSede sin teléfonos guarda una lista vacía y telefono vacío', async () => {
    await sedesService.createSede({ nombre: 'Nueva', direccion: '', capacidad: 10 });
    expect(mocks.inserted).toMatchObject({ telefono: '', telefonos: [] });
  });

  it('updateSede con la lista recalcula telefono, saltando un primero sin número', async () => {
    await sedesService.updateSede('sede-1', {
      telefonos: [{ label: 'Vacío', numero: '  ' }, ...PHONES.slice(1)],
    });
    expect(mocks.updated).toMatchObject({ telefono: '202-607-6126' });
  });

  it('updateSede sin la lista no toca telefono', async () => {
    await sedesService.updateSede('sede-1', { color_tema: '#112233' });
    expect(mocks.updated).toEqual({ color_tema: '#112233' });
  });
});
