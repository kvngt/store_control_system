import { supabase } from '../../lib/supabase';
import type {
  OrderBalance,
  PaymentMethod,
  Specialty,
  WithdrawalBalance,
} from '../../types/database';
import { fetchAll } from '../support';

export const orderMoney = {
  // ===== Entregar =====
  // Entregar asienta dinero, así que va por la RPC `entregar_orden` y no por
  // `updateWorkOrderStatus`: en una transacción asienta el pago final con su método (o la
  // devolución) y marca la orden entregada, y rechaza una segunda entrega.

  /** Lo que falta cobrar, o devolver si es negativo. Lo calcula la base (regla 0). */
  getBalance: async (orderId: string) => {
    const { data, error } = await supabase.rpc('saldo_orden', { p_orden_id: orderId });
    if (error) throw error;
    return data as OrderBalance;
  },

  /**
   * Foto del cheque o de la transferencia. Bucket privado `comprobantes`, en la carpeta de la
   * sede de la orden (la RPC lo comprueba). Del nombre original solo se usa la extensión.
   */
  uploadReceipt: async (sedeId: string, numeroOrden: string, file: File) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${sedeId}/comprobante-${numeroOrden}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('comprobantes')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    return path;
  },

  /** Si la entrega falló después de subir el comprobante, que no quede huérfano. */
  removeDeliveryReceipt: async (path: string) => {
    await supabase.storage.from('comprobantes').remove([path]);
  },

  deliver: async (input: {
    orderId: string;
    metodo: PaymentMethod | null;
    numeroCheque?: string | null;
    comprobanteRuta?: string | null;
  }) => {
    const { data, error } = await supabase.rpc('entregar_orden', {
      p_orden_id: input.orderId,
      p_metodo: input.metodo,
      p_numero_cheque: input.numeroCheque ?? null,
      p_comprobante_ruta: input.comprobanteRuta ?? null,
    });
    if (error) throw error;
    return data as { saldo: number; tipo: 'ingreso' | 'egreso' | null; movimiento_id: string | null };
  },

  /**
   * Cuánto se recibió y cuánto se cobraría (o devolvería) al retirar sin reparar, cobrando los
   * trabajos `conservar` (los que sí se hicieron) más `cobro` (la revisión).
   */
  getWithdrawalBalance: async (orderId: string, cobro: number, conservar: string[] = []) => {
    const { data, error } = await supabase.rpc('saldo_retiro', {
      p_orden_id: orderId,
      p_cobro: cobro,
      p_conservar: conservar,
    });
    if (error) throw error;
    return data as WithdrawalBalance;
  },

  /**
   * Cierra la orden sin hacer (todo) el trabajo (`retirar_sin_reparar`): se cobran los trabajos
   * que sí se hicieron (`conservar`, con su comisión) más `cobro` (la revisión), lo demás pasa a
   * no autorizado, y se devuelve o cobra la diferencia con lo recibido, con su método.
   */
  withdrawWithoutRepair: async (input: {
    orderId: string;
    cobro: number;
    concepto?: string | null;
    metodo: PaymentMethod | null;
    numeroCheque?: string | null;
    comprobanteRuta?: string | null;
    /** Las líneas autorizadas que sí se hicieron y se cobran. Vacío: no se hizo nada. */
    conservar?: string[];
  }) => {
    const { data, error } = await supabase.rpc('retirar_sin_reparar', {
      p_orden_id: input.orderId,
      p_cobro: input.cobro,
      p_concepto: input.concepto ?? null,
      p_metodo: input.metodo,
      p_numero_cheque: input.numeroCheque ?? null,
      p_comprobante_ruta: input.comprobanteRuta ?? null,
      p_conservar: input.conservar ?? [],
    });
    if (error) throw error;
    return data as { saldo: number; tipo: 'ingreso' | 'egreso' | null; movimiento_id: string | null };
  },

  /**
   * Qué comisiones de la orden ya se pagaron, para no ofrecer cambiarle el técnico o la bolsa
   * a esas tareas: la base lo rechaza. `labor_id` nulo = la bolsa heredada de esa especialidad.
   * Solo administración lee `comisiones`.
   */
  getPaidCommissionKeys: async (orderId: string) =>
    fetchAll<{ id: string; labor_id: string | null; especialidad: Specialty }>((from, to) =>
      supabase
        .from('comisiones')
        .select('id, labor_id, especialidad')
        .eq('orden_id', orderId)
        .not('pago_id', 'is', null)
        .order('id')
        .range(from, to)
    ),

  /**
   * Descuento al cliente, absorbido por el taller (`aplicar_descuento`), en dólares o en
   * porcentaje de lo autorizado (la base hace la cuenta). 0 lo quita.
   */
  applyDiscount: async (orderId: string, value: { monto?: number; porcentaje?: number }, motivo?: string | null) => {
    const { data, error } = await supabase.rpc('aplicar_descuento', {
      p_orden_id: orderId,
      p_monto: value.porcentaje == null ? value.monto ?? 0 : null,
      p_motivo: motivo ?? null,
      p_porcentaje: value.porcentaje ?? null,
    });
    if (error) throw error;
    return data as { descuento: number; total: number };
  },

  /**
   * Un pago del cliente antes de entregar, con su método (`registrar_anticipo`). Suma a lo
   * pagado por adelantado: la entrega cobra solo lo que falte.
   */
  registerAdvance: async (input: {
    orderId: string;
    monto: number;
    metodo: PaymentMethod;
    numeroCheque?: string | null;
    comprobanteRuta?: string | null;
  }) => {
    const { data, error } = await supabase.rpc('registrar_anticipo', {
      p_orden_id: input.orderId,
      p_monto: input.monto,
      p_metodo: input.metodo,
      p_numero_cheque: input.numeroCheque ?? null,
      p_comprobante_ruta: input.comprobanteRuta ?? null,
    });
    if (error) throw error;
    return data as { anticipos: number; saldo: number };
  },

  approveCommission: async (comisionId: string, montoNuevo?: number, porcentajeNuevo?: number) => {
    const { error } = await supabase.rpc('aprobar_comision', {
      p_comision_id: comisionId,
      p_monto: montoNuevo ?? null,
      p_porcentaje: porcentajeNuevo ?? null,
    });
    if (error) throw error;
  },
};
