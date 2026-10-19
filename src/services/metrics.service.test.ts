import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metricsService } from './metrics.service';
import { supabase } from '../lib/supabase';
import type { WorkshopMetrics } from '../types/database';

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('metricsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getWorkshopMetrics llama a la RPC indicadores_taller con los parámetros correctos', async () => {
    const mockMetrics: WorkshopMetrics = {
      carros_recibidos: 5,
      carros_entregados: 4,
      ventas_mano_obra: 1200,
      ventas_repuestos: 800,
      costo_repuestos: 500,
      descuentos: 50,
      ticket_promedio: 500,
      comisiones: 300,
      margen_mano_obra: 0.75,
      margen_repuestos: 0.375,
      horas_facturadas: 16,
      tarifa_efectiva: 75,
      horas_por_orden: 4,
      tarifa_hora_sede: 80,
      aprobacion_presupuestos: 0.85,
      dias_promedio_en_taller: 3.5,
      por_tecnico: [
        {
          usuario_id: 'tech-1',
          nombre: 'Mario Mecánico',
          horas_facturadas: 12,
          horas_reloj: 10,
          eficiencia: 1.2,
          tareas_completadas: 5,
        },
      ],
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockMetrics, error: null } as any);

    const result = await metricsService.getWorkshopMetrics('sede-123', '2026-10-01', '2026-10-31');

    expect(supabase.rpc).toHaveBeenCalledWith('indicadores_taller', {
      p_sede_id: 'sede-123',
      p_desde: '2026-10-01',
      p_hasta: '2026-10-31',
    });
    expect(result).toEqual(mockMetrics);
  });

  it('getWorkshopMetrics lanza el error si la RPC falla', async () => {
    const mockError = { message: 'Permiso denegado', code: '42501' };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: mockError } as any);

    await expect(
      metricsService.getWorkshopMetrics('sede-123', '2026-10-01', '2026-10-31')
    ).rejects.toEqual(mockError);
  });
});
