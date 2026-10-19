import { describe, it, expect, vi, beforeEach } from 'vitest';
import { catalogService } from './catalog.service';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('catalogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list llama a catalogo_de_trabajos con los parámetros adecuados', async () => {
    const mockJobs = [
      {
        id: 'job-1',
        nombre: 'Frenos',
        activo: true,
        total: 150,
        lineas: [],
      },
    ];
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockJobs, error: null } as any);

    const result = await catalogService.list('sede-123', true);

    expect(supabase.rpc).toHaveBeenCalledWith('catalogo_de_trabajos', {
      p_sede_id: 'sede-123',
      p_incluir_inactivos: true,
    });
    expect(result).toEqual(mockJobs);
  });

  it('list usa p_incluir_inactivos = false por defecto', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as any);

    const result = await catalogService.list('sede-123');

    expect(supabase.rpc).toHaveBeenCalledWith('catalogo_de_trabajos', {
      p_sede_id: 'sede-123',
      p_incluir_inactivos: false,
    });
    expect(result).toEqual([]);
  });

  it('save llama a guardar_trabajo_catalogo con lineas y posiciones', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'job-uuid-1', error: null } as any);

    const result = await catalogService.save({
      id: 'job-1',
      sede_id: 'sede-123',
      nombre: '  Cambio de Aceite  ',
      activo: true,
      lineas: [
        {
          tipo: 'mano_obra',
          descripcion: 'Cambio',
          especialidad: 'mecanica',
          cantidad: 1,
          precio: 50,
          posicion: 0,
        },
        {
          tipo: 'repuesto',
          descripcion: 'Aceite 5W-30',
          cantidad: 5,
          precio: 10,
          posicion: 1,
        },
      ],
    });

    expect(supabase.rpc).toHaveBeenCalledWith('guardar_trabajo_catalogo', {
      p_id: 'job-1',
      p_sede_id: 'sede-123',
      p_nombre: 'Cambio de Aceite',
      p_activo: true,
      p_lineas: [
        {
          tipo: 'mano_obra',
          descripcion: 'Cambio',
          especialidad: 'mecanica',
          cantidad: 1,
          precio: 50,
          posicion: 0,
        },
        {
          tipo: 'repuesto',
          descripcion: 'Aceite 5W-30',
          cantidad: 5,
          precio: 10,
          posicion: 1,
        },
      ],
    });
    expect(result).toBe('job-uuid-1');
  });

  it('save usa null en id si no se especifica y asigna posicion por índice', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'job-new-uuid', error: null } as any);

    const result = await catalogService.save({
      sede_id: 'sede-123',
      nombre: 'Frenos',
      lineas: [
        {
          tipo: 'mano_obra',
          descripcion: 'Instalación',
          especialidad: 'mecanica',
          cantidad: 1,
          precio: 80,
          posicion: undefined as any,
        },
      ],
    });

    expect(supabase.rpc).toHaveBeenCalledWith('guardar_trabajo_catalogo', {
      p_id: null,
      p_sede_id: 'sede-123',
      p_nombre: 'Frenos',
      p_activo: true,
      p_lineas: [
        {
          tipo: 'mano_obra',
          descripcion: 'Instalación',
          especialidad: 'mecanica',
          cantidad: 1,
          precio: 80,
          posicion: 0,
        },
      ],
    });
    expect(result).toBe('job-new-uuid');
  });

  it('remove llama a borrar_trabajo_catalogo con p_id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

    await catalogService.remove('job-123');

    expect(supabase.rpc).toHaveBeenCalledWith('borrar_trabajo_catalogo', {
      p_id: 'job-123',
    });
  });

  it('propaga errores de supabase.rpc', async () => {
    const error = new Error('Database error');
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error } as any);

    await expect(catalogService.remove('job-123')).rejects.toThrow('Database error');
  });
});
