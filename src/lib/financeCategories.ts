import { moduloActivo } from '../config/modulos';
import type { TransactionCategory } from '../types/database';

const CATEGORY_KEYS: Record<TransactionCategory, string> = {
  pago_cliente: 'finance.clientPayment',
  compra_repuesto: 'finance.partsPurchase',
  planilla: 'finance.payroll',
  gasto_operativo: 'finance.operatingExpense',
  comision_bancaria: 'finance.bankFees',
};

export const ALL_FINANCE_CATEGORIES = Object.keys(CATEGORY_KEYS) as TransactionCategory[];

/**
 * Nombre visible de una categoría de Finanzas. Con el módulo de comisiones apagado, `planilla`
 * pasa a leerse como «Pagos al personal» para no hablar de comisiones que no existen en el taller.
 */
export function financeCategoryLabel(category: string, t: (key: string) => string): string {
  if (category === 'planilla' && !moduloActivo('comisiones')) {
    return t('finance.staffPayments');
  }
  const key = CATEGORY_KEYS[category as TransactionCategory];
  return key ? t(key) : category;
}
