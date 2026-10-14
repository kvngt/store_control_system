import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextServiceService } from './nextService.service';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('nextServiceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getNextService consulta la tabla orden_proximo_servicio con orden_id', async () => {
    const mockRow = {
      orden_id: 'ord-123',
      sede_id: 'sede-1',
      fecha: '2027-04-14',
      millas: 66000,
      nota: 'Aceite',
      token: 'a'.repeat(64),
      programado_por: 'user-1',
      programado_en: '2026-10-14T10:00:00Z',
      sugerido_fecha: null,
      sugerido_millas: null,
      sugerido_nota: null,
      sugerido_por: null,
      sugerido_en: null,
    };

    const maybeSingleMock = vi.fn().mockResolvedValueOnce({ data: mockRow, error: null });
    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

    const result = await nextServiceService.getNextService('ord-123');

    expect(supabase.from).toHaveBeenCalledWith('orden_proximo_servicio');
    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqMock).toHaveBeenCalledWith('orden_id', 'ord-123');
    expect(result).toEqual(mockRow);
  });

  it('suggest llama sugerir_proximo_servicio con los nombres de parámetros exactos', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

    await nextServiceService.suggest('ord-123', {
      fecha: '2027-04-14',
      millas: 66000,
      nota: 'Aceite 5W-30',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('sugerir_proximo_servicio', {
      p_orden_id: 'ord-123',
      p_fecha: '2027-04-14',
      p_millas: 66000,
      p_nota: 'Aceite 5W-30',
    });
  });

  it('program llama programar_proximo_servicio con los nombres de parámetros exactos', async () => {
    const mockResult = {
      orden_id: 'ord-123',
      fecha: '2027-04-14',
      millas: 66000,
      nota: 'Aceite 5W-30',
      token: 'b'.repeat(64),
    };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockResult, error: null } as any);

    const res = await nextServiceService.program('ord-123', {
      fecha: '2027-04-14',
      millas: 66000,
      nota: 'Aceite 5W-30',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('programar_proximo_servicio', {
      p_orden_id: 'ord-123',
      p_fecha: '2027-04-14',
      p_millas: 66000,
      p_nota: 'Aceite 5W-30',
    });
    expect(res).toEqual(mockResult);
  });

  it('remove llama quitar_proximo_servicio con p_orden_id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

    await nextServiceService.remove('ord-123');

    expect(supabase.rpc).toHaveBeenCalledWith('quitar_proximo_servicio', {
      p_orden_id: 'ord-123',
    });
  });

  it('discardSuggestion llama descartar_sugerencia_proximo_servicio con p_orden_id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

    await nextServiceService.discardSuggestion('ord-123');

    expect(supabase.rpc).toHaveBeenCalledWith('descartar_sugerencia_proximo_servicio', {
      p_orden_id: 'ord-123',
    });
  });

  it('propaga errores cuando la base de datos devuelve error', async () => {
    const dbError = new Error('RPC error');
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: dbError } as any);

    await expect(
      nextServiceService.suggest('ord-123', { fecha: null, millas: 1000, nota: null })
    ).rejects.toThrow('RPC error');
  });
});
