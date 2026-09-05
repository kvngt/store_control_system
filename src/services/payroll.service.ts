// Payroll runs.
import { supabase } from '../lib/supabase';
import type { PayrollEntry } from '../types/database';

export const payrollService = {
  getPayroll: async (sedeId?: string) => {
    let query = supabase.from('nomina_pagos').select(`
      *,
      usuario:perfiles!usuario_id(*)
    `).order('fecha_pago', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as PayrollEntry[];
  },

  createPayroll: async (input: Omit<PayrollEntry, 'id' | 'total_pagado' | 'usuario'>) => {
    const total_pagado = input.salario_base + input.bonos - input.deducciones;
    const { data, error } = await supabase
      .from('nomina_pagos')
      .insert({ ...input, total_pagado })
      .select()
      .single();
    if (error) throw error;
    return data as PayrollEntry;
  },
};
