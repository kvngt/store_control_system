import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HandCoins, Percent, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { workOrdersService } from '../../services/supabaseService';
import { queryKeys } from '../../lib/queryClient';
import { money } from '../../lib/money';
import type { OrderAmounts, WorkOrder } from '../../types/database';

export type DiscountValue = { monto?: number; porcentaje?: number };

interface OrderTotalsCardProps {
  order: Pick<WorkOrder, 'id' | 'total_labor' | 'estatus' | 'retirada_sin_reparar'>;
  amounts: OrderAmounts;
  /** Administración aplica o quita el descuento. */
  canDiscount: boolean;
  onApplyDiscount: (value: DiscountValue, motivo: string | null) => Promise<void>;
  /** Administración registra un anticipo (orden sin entregar). Sin la función, no se ofrece. */
  onRegisterAdvance?: () => void;
}

/** Menos de un centavo es cero: la misma tolerancia que usa la base. */
const CENT = 0.01;

/**
 * Los totales de la orden, todos como los cuenta la base: mano de obra y repuestos autorizados,
 * el descuento, el total, lo pagado por adelantado (depósito y anticipos), lo recibido
 * (`saldo_orden`) y lo que falta cobrar o devolver.
 *
 * Antes la tarjeta sumaba las líneas en el navegador y restaba el depósito, y a eso le decía
 * "Total": no conocía los pagos hechos después del depósito ni el descuento.
 *
 * El descuento lo absorbe el taller (decisión del 05/10/2026): baja lo que paga el cliente, no
 * la mano de obra de la que salen las comisiones. Va en dólares o en porcentaje de lo autorizado
 * (como en los programas comerciales); el porcentaje lo convierte la base (`aplicar_descuento`),
 * que tampoco deja pasar de lo autorizado.
 */
export default function OrderTotalsCard({ order, amounts, canDiscount, onApplyDiscount, onRegisterAdvance }: OrderTotalsCardProps) {
  const { t } = useLanguage();
  const descuento = Number(amounts.descuento ?? 0);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'monto' | 'porcentaje'>('monto');
  const [draft, setDraft] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Lo recibido cambia con cada movimiento en Finanzas: la cuenta de este momento.
  const balanceQuery = useQuery({
    queryKey: queryKeys.orderBalance(order.id),
    queryFn: () => workOrdersService.getBalance(order.id),
    staleTime: 0,
  });
  const balance = balanceQuery.data;
  const saldo = balance?.saldo ?? null;

  const openEditor = () => {
    setMode('monto');
    setDraft(descuento > 0 ? String(descuento) : '');
    setReason(amounts.descuento_motivo ?? '');
    setEditing(true);
  };

  const save = async (value: DiscountValue) => {
    setSaving(true);
    try {
      await onApplyDiscount(value, reason.trim() || null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const parsed = parseFloat(draft);
  const valid =
    draft.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && (mode === 'monto' || parsed <= 100);

  return (
    <div className="card order-totals">
      <div className="order-totals-grid">
        <div>
          <div className="order-totals-label">{t('workOrders.labor')}</div>
          <div className="order-totals-value">{money(Number(order.total_labor))}</div>
        </div>
        <div>
          <div className="order-totals-label">{t('workOrders.parts')}</div>
          <div className="order-totals-value">{money(Number(amounts.total_repuestos))}</div>
        </div>
        {descuento > 0 && (
          <div>
            <div className="order-totals-label">{t('discount.label')}</div>
            <div className="order-totals-value">−{money(descuento)}</div>
            {amounts.descuento_motivo && <div className="field-hint">{amounts.descuento_motivo}</div>}
          </div>
        )}
        <div className="order-totals-total">
          <div className="order-totals-label">{t('common.total')}</div>
          <div className="order-totals-value is-total">{money(Number(amounts.total_general))}</div>
        </div>
        <div>
          <div className="order-totals-label">{t('totals.paidInAdvance')}</div>
          <div className="order-totals-value">{money(Number(amounts.deposito_inicial))}</div>
        </div>
        {balance && Math.abs(balance.cobrado - Number(amounts.deposito_inicial)) > CENT && (
          <div>
            <div className="order-totals-label">{t('totals.received')}</div>
            <div className="order-totals-value">{money(balance.cobrado)}</div>
          </div>
        )}
        {saldo !== null && (
          <div>
            <div className="order-totals-label">
              {saldo < -CENT ? t('totals.creditToCustomer') : t('totals.balanceDue')}
            </div>
            <div className={`order-totals-value${saldo > CENT ? ' is-due' : ''}`}>{money(Math.abs(saldo))}</div>
          </div>
        )}
      </div>

      {(onRegisterAdvance || (canDiscount && !order.retirada_sin_reparar)) && !editing && (
        <div className="order-totals-actions">
          {onRegisterAdvance && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRegisterAdvance}>
              <HandCoins size={14} /> {t('advance.action')}
            </button>
          )}
          {canDiscount && !order.retirada_sin_reparar && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={openEditor}>
              <Percent size={14} /> {descuento > 0 ? t('discount.change') : t('discount.add')}
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="order-totals-discount">
          <div className="order-totals-discount-form">
            <div className="view-switch" role="radiogroup" aria-label={t('discount.kind')}>
              {(['monto', 'porcentaje'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  className={`view-switch-option${mode === m ? ' active' : ''}`}
                  onClick={() => {
                    setMode(m);
                    setDraft('');
                  }}
                >
                  {m === 'monto' ? t('discount.inDollars') : t('discount.inPercent')}
                </button>
              ))}
            </div>
            <label className="form-label" htmlFor="discount-amount">
              {mode === 'monto' ? t('discount.amount') : t('discount.percent')}
            </label>
            <input
              id="discount-amount"
              className="form-input"
              type="number"
              inputMode="decimal"
              min={0}
              max={mode === 'porcentaje' ? 100 : undefined}
              step="0.01"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <label className="form-label" htmlFor="discount-reason">{t('discount.reason')}</label>
            <input
              id="discount-reason"
              className="form-input"
              value={reason}
              placeholder={t('discount.reasonPlaceholder')}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="field-hint">{t('discount.hint')}</p>
            <div className="order-totals-discount-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving || !valid}
                onClick={() => void save(mode === 'monto' ? { monto: parsed } : { porcentaje: parsed })}
              >
                {saving ? t('common.loading') : t('discount.apply')}
              </button>
              {descuento > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void save({ monto: 0 })}>
                  {t('discount.remove')}
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={t('common.cancel')} onClick={() => setEditing(false)}>
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
