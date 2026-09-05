// Financial movements and the bank-statement import pipeline.
import { supabase } from '../lib/supabase';
import type {
  BankStatementImport,
  CategorizationRule,
  FinancialTransaction,
  ParsedStatementTransaction,
  TransactionType,
} from '../types/database';

export const financeService = {
  getTransactions: async (sedeId?: string) => {
    let query = supabase.from('finanzas_movimientos').select('*').order('fecha', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as FinancialTransaction[];
  },

  createTransaction: async (input: Omit<FinancialTransaction, 'id' | 'creado_en'>) => {
    const { data, error } = await supabase.from('finanzas_movimientos').insert(input).select().single();
    if (error) throw error;
    return data as FinancialTransaction;
  },

  deleteTransaction: async (id: string) => {
    const { error } = await supabase.from('finanzas_movimientos').delete().eq('id', id);
    if (error) throw error;
  },

  // ===== Bank statement import =====
  getCategorizationRules: async () => {
    const { data, error } = await supabase
      .from('finanzas_reglas_categorizacion')
      .select('*')
      .eq('activo', true)
      .order('creado_en');
    if (error) throw error;

    // Most specific rule first. Priority is explicit because length alone gets
    // it wrong: the memo keyword "tire" is shorter than "zelle to" but is the
    // far better signal. Length only breaks ties within the same priority, so
    // "zelle to dnd towing" still beats "zelle to".
    return (data as CategorizationRule[]).sort(
      (a, b) => (b.prioridad ?? 0) - (a.prioridad ?? 0) || b.patron.length - a.patron.length
    );
  },

  uploadStatement: async (file: File, sedeId: string) => {
    const path = `${sedeId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('estados_cuenta_bancarios').upload(path, file);
    if (error) throw error;
    return path;
  },

  // SHA-256 of the file, computed in the browser. Survives a rename, which
  // filename matching does not — the same statement saved twice under
  // different names is the case that slipped through.
  fileFingerprint: async (file: File) => {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /** Batches for this sede that were fed the exact same file, newest first. */
  findImportsByFingerprint: async (sedeId: string, hash: string) => {
    const { data, error } = await supabase
      .from('finanzas_importaciones')
      .select('*')
      .eq('sede_id', sedeId)
      .eq('hash_archivo', hash)
      .order('fecha_importacion', { ascending: false });
    if (error) throw error;
    return (data || []) as BankStatementImport[];
  },

  /** Every import for a sede, so an admin can review and undo one. */
  getImportBatches: async (sedeId?: string) => {
    let query = supabase
      .from('finanzas_importaciones')
      .select('*')
      .order('fecha_importacion', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as BankStatementImport[];
  },

  createImportBatch: async (input: {
    sede_id: string;
    nombre_archivo: string;
    ruta_archivo: string;
    importado_por: string;
    total_transacciones: number;
    hash_archivo?: string;
  }) => {
    const { data, error } = await supabase.from('finanzas_importaciones').insert(input).select().single();
    if (error) throw error;
    return data as BankStatementImport;
  },

  // Flags parsed transactions that likely already exist in finanzas_movimientos
  // (same sede, same amount, date within 2 days) — e.g. a client payment the
  // order-delivery trigger already recorded — so they default to excluded in
  // the review table instead of getting double-counted.
  findPossibleDuplicates: async (sedeId: string, transactions: ParsedStatementTransaction[]) => {
    if (transactions.length === 0) return new Map<number, string>();
    const dates = transactions.map((t) => t.fecha).sort();
    const rangeStart = new Date(dates[0]);
    rangeStart.setDate(rangeStart.getDate() - 2);
    const rangeEnd = new Date(dates[dates.length - 1]);
    rangeEnd.setDate(rangeEnd.getDate() + 2);

    const { data, error } = await supabase
      .from('finanzas_movimientos')
      .select('tipo, monto, fecha, descripcion')
      .eq('sede_id', sedeId)
      .gte('fecha', rangeStart.toISOString().split('T')[0])
      .lte('fecha', rangeEnd.toISOString().split('T')[0]);
    if (error) throw error;

    const existing = (data || []) as {
      tipo: TransactionType;
      monto: number;
      fecha: string;
      descripcion: string;
    }[];
    const matches = new Map<number, string>();
    transactions.forEach((tx, idx) => {
      const txDate = new Date(tx.fecha).getTime();
      const match = existing.find((m) => {
        // Direction has to agree. Matching on amount and date alone flagged a
        // $600 check written on 6/30 as a duplicate of a $600 card deposit
        // received on 7/1 — money going out is never a repeat of money coming in.
        if (m.tipo !== tx.tipo) return false;
        if (Math.abs(Number(m.monto) - tx.monto) > 0.01) return false;
        const diffDays = Math.abs(new Date(m.fecha).getTime() - txDate) / 86400000;
        return diffDays <= 2;
      });
      if (match) matches.set(idx, match.descripcion);
    });
    return matches;
  },

  bulkInsertTransactions: async (rows: Omit<FinancialTransaction, 'id' | 'creado_en'>[]) => {
    if (rows.length === 0) return;
    const { error } = await supabase.from('finanzas_movimientos').insert(rows);
    if (error) throw error;
  },

  // Deletes every finanzas_movimientos row from a batch, then the batch
  // itself — used to fully undo an import if something was miscategorized.
  deleteImportBatch: async (importacionId: string) => {
    const { error: rowsError } = await supabase
      .from('finanzas_movimientos')
      .delete()
      .eq('importacion_id', importacionId);
    if (rowsError) throw rowsError;
    const { error } = await supabase.from('finanzas_importaciones').delete().eq('id', importacionId);
    if (error) throw error;
  },
};
