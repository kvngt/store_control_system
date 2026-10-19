import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inspectionService } from './inspection.service';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('inspectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getForOrder', () => {
    it('obtiene la inspección con puntos ordenados por posición', async () => {
      const mockPoints = [
        { id: 'p-2', posicion: 2, nombre: 'Pastillas traseras', seccion: 'Frenos', estado: 'pendiente' },
        { id: 'p-1', posicion: 1, nombre: 'Pastillas delanteras', seccion: 'Frenos', estado: 'bien' },
      ];
      const mockData = {
        id: 'insp-1',
        orden_id: 'ord-123',
        nombre: 'Inspección multipunto',
        puntos: mockPoints,
      };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const result = await inspectionService.getForOrder('ord-123');

      expect(supabase.from).toHaveBeenCalledWith('orden_inspecciones');
      expect(mockQuery.select).toHaveBeenCalledWith('*, puntos:orden_inspeccion_puntos(*)');
      expect(mockQuery.eq).toHaveBeenCalledWith('orden_id', 'ord-123');
      expect(result).not.toBeNull();
      expect(result?.puntos?.[0].id).toBe('p-1');
      expect(result?.puntos?.[1].id).toBe('p-2');
    });

    it('devuelve null si no existe inspección para la orden', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const result = await inspectionService.getForOrder('ord-none');
      expect(result).toBeNull();
    });

    it('propaga el error si falla la consulta', async () => {
      const mockError = new Error('Database error');
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      await expect(inspectionService.getForOrder('ord-err')).rejects.toThrow('Database error');
    });
  });

  describe('start', () => {
    it('llama a iniciar_inspeccion con orderId y templateId', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'new-insp-uuid', error: null } as any);

      const result = await inspectionService.start('ord-1', 'tpl-1');

      expect(supabase.rpc).toHaveBeenCalledWith('iniciar_inspeccion', {
        p_orden_id: 'ord-1',
        p_plantilla_id: 'tpl-1',
      });
      expect(result).toBe('new-insp-uuid');
    });

    it('llama a iniciar_inspeccion con null si no se especifica templateId', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'new-insp-uuid', error: null } as any);

      const result = await inspectionService.start('ord-1');

      expect(supabase.rpc).toHaveBeenCalledWith('iniciar_inspeccion', {
        p_orden_id: 'ord-1',
        p_plantilla_id: null,
      });
      expect(result).toBe('new-insp-uuid');
    });
  });

  describe('markPoint', () => {
    it('llama a marcar_punto_inspeccion con los parámetros correctos', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      await inspectionService.markPoint('pt-1', 'urgente', 'Desgaste crítico');

      expect(supabase.rpc).toHaveBeenCalledWith('marcar_punto_inspeccion', {
        p_punto_id: 'pt-1',
        p_estado: 'urgente',
        p_nota: 'Desgaste crítico',
      });
    });
  });

  describe('complete', () => {
    it('llama a completar_inspeccion con el id de inspección', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      await inspectionService.complete('insp-1');

      expect(supabase.rpc).toHaveBeenCalledWith('completar_inspeccion', {
        p_inspeccion_id: 'insp-1',
      });
    });
  });

  describe('publish', () => {
    it('llama a publicar_inspeccion con publicar = true', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      await inspectionService.publish('insp-1', true);

      expect(supabase.rpc).toHaveBeenCalledWith('publicar_inspeccion', {
        p_inspeccion_id: 'insp-1',
        p_publicar: true,
      });
    });

    it('llama a publicar_inspeccion con publicar = false', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      await inspectionService.publish('insp-1', false);

      expect(supabase.rpc).toHaveBeenCalledWith('publicar_inspeccion', {
        p_inspeccion_id: 'insp-1',
        p_publicar: false,
      });
    });
  });

  describe('listTemplates', () => {
    it('llama a plantillas_inspeccion con la sede', async () => {
      const mockTemplates = [
        { id: 'tpl-1', nombre: 'General', puntos: [] },
      ];
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: mockTemplates, error: null } as any);

      const result = await inspectionService.listTemplates('sede-1');

      expect(supabase.rpc).toHaveBeenCalledWith('plantillas_inspeccion', {
        p_sede_id: 'sede-1',
      });
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('saveTemplate', () => {
    it('llama a guardar_plantilla_inspeccion formateando puntos con posición', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'tpl-saved-id', error: null } as any);

      const result = await inspectionService.saveTemplate({
        id: 'tpl-1',
        sede_id: 'sede-1',
        nombre: '  Inspección Rápida  ',
        activo: true,
        predeterminada: true,
        puntos: [
          { seccion: 'Frenos', nombre: 'Pastillas' },
          { seccion: 'Llantas', nombre: 'Presión', posicion: 10 },
        ],
      });

      expect(supabase.rpc).toHaveBeenCalledWith('guardar_plantilla_inspeccion', {
        p_id: 'tpl-1',
        p_sede_id: 'sede-1',
        p_nombre: 'Inspección Rápida',
        p_activo: true,
        p_predeterminada: true,
        p_puntos: [
          { seccion: 'Frenos', nombre: 'Pastillas', posicion: 1 },
          { seccion: 'Llantas', nombre: 'Presión', posicion: 10 },
        ],
      });
      expect(result).toBe('tpl-saved-id');
    });
  });

  describe('deleteTemplate', () => {
    it('llama a borrar_plantilla_inspeccion', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      await inspectionService.deleteTemplate('tpl-1');

      expect(supabase.rpc).toHaveBeenCalledWith('borrar_plantilla_inspeccion', {
        p_id: 'tpl-1',
      });
    });
  });
});
