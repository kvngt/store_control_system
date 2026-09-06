// Commission payroll: what each technician has earned on delivered orders,
// and the settlements that clear it.
//
// Accruals are written by database triggers when an order reaches `entregado`
// (see the 20260912000000 migration), so nothing here creates a commission —
// this module reads balances and records payments.
import { supabase } from '../lib/supabase';
import type { Commission, CommissionBalance, CommissionPayment } from '../types/database';

const COMMISSION_SELECT = `
  *,
  usuario:perfiles!usuario_id(*),
  orden:ordenes_trabajo!orden_id(id, numero_orden, fecha_finalizacion, total_general, total_repuestos)
`;

export const commissionsService = {
  /** Every accrual for a sede, newest first. */
  getCommissions: async (sedeId?: string) => {
    let query = supabase
      .from('comisiones')
      .select(COMMISSION_SELECT)
      .order('creado_en', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Commission[];
  },

  /** Only what is still owed. */
  getPendingCommissions: async (sedeId?: string) => {
    let query = supabase
      .from('comisiones')
      .select(COMMISSION_SELECT)
      .is('pago_id', null)
      .order('creado_en', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Commission[];
  },

  getPayments: async (sedeId?: string) => {
    let query = supabase
      .from('comision_pagos')
      .select('*, usuario:perfiles!usuario_id(*)')
      .order('fecha_pago', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as CommissionPayment[];
  },

  /**
   * Groups pending accruals into one row per technician — the "wallet" the
   * admin actually settles against.
   *
   * Done here rather than in SQL because the screen needs the individual
   * accruals too (to show which orders make up a balance, and to send their
   * ids to `pay_commissions`), so a second aggregate query would only be
   * asking the server to re-derive what the client already holds.
   */
  buildBalances: (pending: Commission[]): CommissionBalance[] => {
    const byUser = new Map<string, CommissionBalance>();
    for (const c of pending) {
      const existing = byUser.get(c.usuario_id);
      if (existing) {
        existing.total += Number(c.monto);
        existing.items.push(c);
      } else {
        byUser.set(c.usuario_id, {
          usuario_id: c.usuario_id,
          usuario: c.usuario,
          total: Number(c.monto),
          items: [c],
        });
      }
    }
    return [...byUser.values()].sort((a, b) => b.total - a.total);
  },

  /**
   * Uploads a photo of the cheque. The bucket is private — a scanned cheque
   * carries an account number — so the caller gets back the storage path and
   * reads it later through `signComprobante`.
   */
  uploadComprobante: async (sedeId: string, file: File) => {
    const path = `${sedeId}/cheque-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from('comprobantes')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    return path;
  },

  /** A time-limited URL for a stored cheque photo. */
  signComprobante: async (path: string, expiresInSeconds = 300) => {
    const { data, error } = await supabase.storage
      .from('comprobantes')
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  },

  /**
   * Settles a technician's selected accruals with one payment.
   *
   * The amount is not passed in: `pay_commissions` sums the accruals server
   * side, so the cheque is always written for what the shop actually owed and
   * a stale screen cannot under- or over-pay someone.
   */
  payCommissions: async (input: {
    usuario_id: string;
    comision_ids: string[];
    fecha_pago: string;
    metodo: string;
    numero_cheque?: string | null;
    comprobante_url?: string | null;
    notas?: string | null;
  }) => {
    const { data, error } = await supabase.rpc('pay_commissions', {
      p_usuario_id: input.usuario_id,
      p_comision_ids: input.comision_ids,
      p_fecha_pago: input.fecha_pago,
      p_metodo: input.metodo,
      p_numero_cheque: input.numero_cheque ?? null,
      p_comprobante_url: input.comprobante_url ?? null,
      p_notas: input.notas ?? null,
    });
    if (error) throw error;
    return data as CommissionPayment;
  },

  /** Undoes a settlement; its accruals go back to pending. */
  deletePayment: async (paymentId: string) => {
    const { error } = await supabase.from('comision_pagos').delete().eq('id', paymentId);
    if (error) throw error;
  },
};
