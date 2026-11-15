import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextServiceService } from './nextService.service';
import type { OrderNextService } from '../types/database';

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

describe('nextServiceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getNextService consulta la tabla orden_proximo_servicio con orden_id', async () => {
    const mockRow: OrderNextService = {
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
    fromMock.mockReturnValue({ select: selectMock });

    const result = await nextServiceService.getNextService('ord-123');

    expect(fromMock).toHaveBeenCalledWith('orden_proximo_servicio');
    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqMock).toHaveBeenCalledWith('orden_id', 'ord-123');
    expect(result).toEqual(mockRow);
  });

  it('suggest llama sugerir_proximo_servicio con los nombres de parámetros exactos', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await nextServiceService.suggest('ord-123', {
      fecha: '2027-04-14',
      millas: 66000,
      nota: 'Aceite 5W-30',
    });

    expect(rpcMock).toHaveBeenCalledWith('sugerir_proximo_servicio', {
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
    rpcMock.mockResolvedValueOnce({ data: mockResult, error: null });

    const res = await nextServiceService.program('ord-123', {
      fecha: '2027-04-14',
      millas: 66000,
      nota: 'Aceite 5W-30',
    });

    expect(rpcMock).toHaveBeenCalledWith('programar_proximo_servicio', {
      p_orden_id: 'ord-123',
      p_fecha: '2027-04-14',
      p_millas: 66000,
      p_nota: 'Aceite 5W-30',
      p_idioma: null,
    });
    expect(res).toEqual(mockResult);
  });

  // 20261010000038: el idioma que elige administración se guarda y lo usa la página del QR.
  it('program manda el idioma elegido con el nombre exacto p_idioma', async () => {
    rpcMock.mockResolvedValueOnce({ data: { token: 'c'.repeat(64) }, error: null });

    await nextServiceService.program('ord-123', { fecha: '2027-04-14', millas: null, nota: null }, 'en');

    expect(rpcMock).toHaveBeenCalledWith(
      'programar_proximo_servicio',
      expect.objectContaining({ p_idioma: 'en' })
    );
  });

  it('remove llama quitar_proximo_servicio con p_orden_id', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await nextServiceService.remove('ord-123');

    expect(rpcMock).toHaveBeenCalledWith('quitar_proximo_servicio', {
      p_orden_id: 'ord-123',
    });
  });

  it('discardSuggestion llama descartar_sugerencia_proximo_servicio con p_orden_id', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await nextServiceService.discardSuggestion('ord-123');

    expect(rpcMock).toHaveBeenCalledWith('descartar_sugerencia_proximo_servicio', {
      p_orden_id: 'ord-123',
    });
  });

  it('propaga errores cuando la base de datos devuelve error', async () => {
    const dbError = new Error('RPC error');
    rpcMock.mockResolvedValueOnce({ data: null, error: dbError });

    await expect(
      nextServiceService.suggest('ord-123', { fecha: null, millas: 1000, nota: null })
    ).rejects.toThrow('RPC error');
  });
});
