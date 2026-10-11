import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parkingService } from './parking.service';
import { supabase } from '../lib/supabase';
import type { ParkingConfig, ParkingProfile, OrderParkingAdjustments } from '../types/domain/parking.types';

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('parkingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getConfig llama parqueo_config_sede con p_sede_id', async () => {
    const mockData = { habilitado: true };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockData, error: null } as any);

    const res = await parkingService.getConfig('sede-123');
    expect(supabase.rpc).toHaveBeenCalledWith('parqueo_config_sede', { p_sede_id: 'sede-123' });
    expect(res).toEqual(mockData);
  });

  it('saveConfig llama guardar_config_parqueo con las claves exactas p_sede_id y p_config', async () => {
    const payload: ParkingConfig = {
      habilitado: true,
      vigente_desde: '2026-10-10',
      incluir_ordenes_previas: false,
      avisar_cliente: true,
      politica_es: 'Regla ES',
      politica_en: 'Rule EN',
      perfiles: {
        seguro: {
          habilitado: true,
          evento_inicio: 'ingreso',
          cobra_dia_evento: true,
          dias_gracia: 0,
          gracia_dias_habiles: false,
          tope_dias: null,
          tope_monto: null,
          tramos: [{ desde_dia: 1, tarifa_diaria: 40 }],
        },
        particular: {
          habilitado: true,
          evento_inicio: 'lista_para_entregar',
          cobra_dia_evento: false,
          dias_gracia: 2,
          gracia_dias_habiles: false,
          tope_dias: null,
          tope_monto: null,
          tramos: [{ desde_dia: 1, tarifa_diaria: 25 }],
        },
      },
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: payload, error: null } as any);

    const res = await parkingService.saveConfig('sede-123', payload);
    expect(supabase.rpc).toHaveBeenCalledWith('guardar_config_parqueo', {
      p_sede_id: 'sede-123',
      p_config: payload,
    });
    expect(res).toEqual(payload);
  });

  it('getPreview llama vista_previa_parqueo con p_perfil, p_fecha_evento y p_hasta', async () => {
    const perfil: ParkingProfile = {
      habilitado: true,
      evento_inicio: 'ingreso',
      cobra_dia_evento: true,
      dias_gracia: 0,
      gracia_dias_habiles: false,
      tope_dias: null,
      tope_monto: null,
      tramos: [{ desde_dia: 1, tarifa_diaria: 40 }],
    };
    const mockPreview = { inicio: '2026-10-01', dias: 5, monto: 200, detalle: [], tope_aplicado: false };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockPreview, error: null } as any);

    const res = await parkingService.getPreview(perfil, '2026-10-01', '2026-10-05');
    expect(supabase.rpc).toHaveBeenCalledWith('vista_previa_parqueo', {
      p_perfil: perfil,
      p_fecha_evento: '2026-10-01',
      p_hasta: '2026-10-05',
    });
    expect(res).toEqual(mockPreview);
  });

  it('getOrderParking llama parqueo_de_orden con p_orden_id', async () => {
    const mockOrderParking = { orden_id: 'ord-1', monto: 120, estado: 'acumulando' };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockOrderParking, error: null } as any);

    const res = await parkingService.getOrderParking('ord-1');
    expect(supabase.rpc).toHaveBeenCalledWith('parqueo_de_orden', { p_orden_id: 'ord-1' });
    expect(res).toEqual(mockOrderParking);
  });

  it('adjustOrderParking llama ajustar_parqueo_orden con p_orden_id y p_ajustes exactos', async () => {
    const adjustments: OrderParkingAdjustments = {
      cobrar: false,
      tarifa_manual: 35,
      inicio_manual: '2026-10-12',
      dias_exonerados: 1,
      nota: 'Cortesía cliente VIP',
    };
    const mockRes = { orden_id: 'ord-1', cobrar: false, monto: 0 };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockRes, error: null } as any);

    const res = await parkingService.adjustOrderParking('ord-1', adjustments);
    expect(supabase.rpc).toHaveBeenCalledWith('ajustar_parqueo_orden', {
      p_orden_id: 'ord-1',
      p_ajustes: adjustments,
    });
    expect(res).toEqual(mockRes);
  });
});
