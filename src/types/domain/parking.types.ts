export interface ParkingTier {
  id?: string;
  perfil_id?: string;
  desde_dia: number;
  tarifa_diaria: number;
}

export interface ParkingProfile {
  id?: string;
  sede_id?: string;
  tipo?: 'seguro' | 'particular';
  habilitado: boolean;
  evento_inicio: 'ingreso' | 'lista_para_entregar';
  cobra_dia_evento: boolean;
  dias_gracia: number;
  gracia_dias_habiles: boolean;
  tope_dias: number | null;
  tope_monto: number | null;
  tramos: ParkingTier[];
}

export interface ParkingConfig {
  sede_id?: string;
  habilitado: boolean;
  vigente_desde: string | null;
  incluir_ordenes_previas: boolean;
  avisar_cliente: boolean;
  politica_es: string | null;
  politica_en: string | null;
  actualizado_en?: string;
  actualizado_por?: string | null;
  perfiles: {
    seguro: ParkingProfile;
    particular: ParkingProfile;
  };
}

export interface ParkingTierDetail {
  desde_dia: number;
  hasta_dia: number;
  dias: number;
  tarifa: number;
  subtotal: number;
}

export interface ParkingPreview {
  inicio: string | null;
  dias: number;
  monto: number;
  detalle: ParkingTierDetail[];
  tope_aplicado: boolean;
}

export type ParkingState =
  | 'inactivo'
  | 'esperando'
  | 'por_empezar'
  | 'orden_previa'
  | 'sin_cobro'
  | 'acumulando'
  | 'cerrado';

export interface OrderParking {
  id?: string;
  orden_id: string;
  cobrar: boolean;
  tarifa_manual: number | null;
  inicio_manual: string | null;
  dias_exonerados: number;
  nota: string | null;
  perfil: 'seguro' | 'particular' | null;
  estado: ParkingState;
  inicio_cobro: string | null;
  fin_congelado: string | null;
  dias_cobrados: number;
  monto: number;
  detalle: ParkingTierDetail[];
  tope_aplicado: boolean;
  calculado_hasta: string | null;
  calculado_en: string | null;
  tarifa_inicial?: number;
  dias_gracia?: number;
  evento_inicio?: 'ingreso' | 'lista_para_entregar';
}

export interface OrderParkingAdjustments {
  cobrar?: boolean;
  tarifa_manual?: number | null;
  inicio_manual?: string | null;
  dias_exonerados?: number;
  nota?: string | null;
}
