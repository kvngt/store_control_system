// Commission payroll: what each technician has earned on delivered orders,
// and the settlements that clear it.
//
// Accruals are written by database triggers when an order reaches `entregado`
// (see the 20260912000000 migration), so nothing here creates a commission —
// this module reads balances and records payments.
import { supabase } from '../lib/supabase';
import type { Commission, CommissionBalance, CommissionEstimate, CommissionPayment, MyCommissionsSummary } from '../types/database';
import { fetchAll } from './support';

const COMMISSION_SELECT = `
  *,
  usuario:perfiles!usuario_id(*),
  orden:ordenes_trabajo!orden_id(id, numero_orden, fecha_finalizacion, total_labor),
  labor:orden_labor!labor_id(descripcion)
`;

export const commissionsService = {
  /**
   * "Mis comisiones" del técnico (pedido del taller del 06/10/2026). La política de
   * `comisiones` ya le deja leer solo lo suyo aceptado o pagado: lo sugerido no le llega.
   */
  getMyCommissions: async (userId: string) =>
    fetchAll<Commission>((from, to) =>
      supabase
        .from('comisiones')
        .select(`*, orden:ordenes_trabajo!orden_id(id, numero_orden, fecha_finalizacion), labor:orden_labor!labor_id(descripcion)`)
        .eq('usuario_id', userId)
        .order('creado_en', { ascending: false })
        .order('id')
        .range(from, to)
    ),

  /** Sus pagos, el más nuevo primero. La política de `comision_pagos` le deja ver solo los suyos. */
  getMyPayments: async (userId: string) =>
    fetchAll<CommissionPayment>((from, to) =>
      supabase
        .from('comision_pagos')
        .select('*')
        .eq('usuario_id', userId)
        .order('fecha_pago', { ascending: false })
        .order('id')
        .range(from, to)
    ),

  /** Por cobrar y pagado: lo suma la base (`resumen_mis_comisiones`), nunca el navegador. */
  getMySummary: async () => {
    const { data, error } = await supabase.rpc('resumen_mis_comisiones');
    if (error) throw error;
    return data as MyCommissionsSummary;
  },

  /**
   * El reparto estimado de una orden (`comisiones_estimadas`): la misma cuenta que hace la
   * base al entregar. Administración recibe a todos; un técnico asignado, lo suyo.
   */
  getEstimate: async (orderId: string) => {
    const { data, error } = await supabase.rpc('comisiones_estimadas', { p_orden_id: orderId });
    if (error) throw error;
    return data as CommissionEstimate;
  },

  /** Every accrual for a sede, newest first. */
  getCommissions: async (sedeId?: string) =>
    fetchAll<Commission>((from, to) => {
      let query = supabase
        .from('comisiones')
        .select(COMMISSION_SELECT)
        .order('creado_en', { ascending: false })
        .order('id');
      if (sedeId) query = query.eq('sede_id', sedeId);
      return query.range(from, to);
    }),

  /** Only what is still owed. */
  getPendingCommissions: async (sedeId?: string) =>
    fetchAll<Commission>((from, to) => {
      let query = supabase
        .from('comisiones')
        .select(COMMISSION_SELECT)
        .is('pago_id', null)
        .order('creado_en', { ascending: false })
        .order('id');
      if (sedeId) query = query.eq('sede_id', sedeId);
      return query.range(from, to);
    }),

  getPayments: async (sedeId?: string) =>
    fetchAll<CommissionPayment>((from, to) => {
      let query = supabase
        .from('comision_pagos')
        .select('*, usuario:perfiles!usuario_id(*)')
        .order('fecha_pago', { ascending: false })
        .order('id');
      if (sedeId) query = query.eq('sede_id', sedeId);
      return query.range(from, to);
    }),

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
      const accepted = c.estado === 'aceptada';
      let balance = byUser.get(c.usuario_id);
      if (!balance) {
        balance = { usuario_id: c.usuario_id, usuario: c.usuario, total: 0, aceptado: 0, porRevisar: 0, items: [] };
        byUser.set(c.usuario_id, balance);
      }
      balance.total += Number(c.monto);
      if (accepted) balance.aceptado += Number(c.monto);
      else balance.porRevisar += 1;
      balance.items.push(c);
    }
    return [...byUser.values()].sort((a, b) => b.total - a.total);
  },

  /**
   * Acepta tal cual las comisiones elegidas que sigan sugeridas (`aprobar_comisiones`). Un
   * solo aviso por técnico y orden. Devuelve cuántas aceptó.
   */
  approveMany: async (ids: string[]) => {
    const { data, error } = await supabase.rpc('aprobar_comisiones', { p_ids: ids });
    if (error) throw error;
    return (data ?? 0) as number;
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
