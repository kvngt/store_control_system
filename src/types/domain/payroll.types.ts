import type { UserProfile } from './auth.types';

export interface PayrollEntry {
  id: string;
  sede_id: string;
  usuario_id: string;
  periodo_inicio: string;
  periodo_fin: string;
  salario_base: number;
  bonos: number;
  deducciones: number;
  total_pagado: number;
  fecha_pago: string;
  // Virtual
  usuario?: UserProfile;
}
