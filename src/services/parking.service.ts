import { supabase } from '../lib/supabase';
import type {
  ParkingConfig,
  ParkingPreview,
  ParkingProfile,
  OrderParking,
  OrderParkingAdjustments,
} from '../types/domain/parking.types';

export const parkingService = {
  /**
   * Obtiene la configuración de parqueo de una sede con sus perfiles y tramos.
   * Si la sede no tiene fila en `parqueo_config`, la RPC devuelve los valores por defecto.
   */
  getConfig: async (sedeId: string): Promise<ParkingConfig> => {
    const { data, error } = await supabase.rpc('parqueo_config_sede', {
      p_sede_id: sedeId,
    });
    if (error) throw error;
    return data as ParkingConfig;
  },

  /**
   * Guarda la configuración de parqueo de una sede y sus perfiles/tramos de forma atómica.
   * La base valida la configuración y recalcula todas las órdenes abiertas de la sede.
   */
  saveConfig: async (sedeId: string, config: ParkingConfig): Promise<ParkingConfig> => {
    const { data, error } = await supabase.rpc('guardar_config_parqueo', {
      p_sede_id: sedeId,
      p_config: config,
    });
    if (error) throw error;
    return data as ParkingConfig;
  },

  /**
   * Calcula una vista previa en vivo sin guardar cambios en la base de datos.
   */
  getPreview: async (
    perfil: ParkingProfile,
    fechaEvento: string | null,
    hasta: string
  ): Promise<ParkingPreview> => {
    const { data, error } = await supabase.rpc('vista_previa_parqueo', {
      p_perfil: perfil,
      p_fecha_evento: fechaEvento,
      p_hasta: hasta,
    });
    if (error) throw error;
    return data as ParkingPreview;
  },

  /**
   * Obtiene el estado y cálculo de parqueo de una orden de trabajo.
   */
  getOrderParking: async (orderId: string): Promise<OrderParking> => {
    const { data, error } = await supabase.rpc('parqueo_de_orden', {
      p_orden_id: orderId,
    });
    if (error) throw error;
    return data as OrderParking;
  },

  /**
   * Aplica ajustes administrativos al cobro de parqueo de una orden (cobrar, tarifa manual, días exonerados, nota).
   */
  adjustOrderParking: async (
    orderId: string,
    adjustments: OrderParkingAdjustments
  ): Promise<OrderParking> => {
    const { data, error } = await supabase.rpc('ajustar_parqueo_orden', {
      p_orden_id: orderId,
      p_ajustes: adjustments,
    });
    if (error) throw error;
    return data as OrderParking;
  },
};
