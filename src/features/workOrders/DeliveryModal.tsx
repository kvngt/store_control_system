import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { workOrdersService } from '../../services/supabaseService';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import { money } from '../../lib/money';
import { PAYMENT_METHODS, type PaymentMethod, type WorkOrder } from '../../types/database';

interface DeliveryModalProps {
  order: Pick<WorkOrder, 'id' | 'numero_orden' | 'sede_id'>;
  onCancel: () => void;
  /** La orden ya quedó entregada: quien abrió el diálogo vuelve a leer lo suyo. */
  onDelivered: () => void | Promise<void>;
}

/** Menos de un centavo es cero: la misma tolerancia que usa la base. */
const CENT = 0.01;

/**
 * Entregar una orden: cuánto falta cobrar (o devolver), cómo pagó el cliente y el
 * comprobante.
 *
 * Reemplaza el `confirm` que decía "el saldo se registrará como pagado" (reunión con el
 * taller, sept. 2026): el pago final quedaba en Finanzas sin método, sin la foto del
 * cheque, y la devolución de un depósito de más no quedaba en ningún lado. La cuenta la
 * hace la base (`saldo_orden`) y la entrega es una sola transacción (`entregar_orden`).
 */
export default function DeliveryModal({ order, onCancel, onDelivered }: DeliveryModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const [metodo, setMetodo] = useState<PaymentMethod | ''>('');
  const [numeroCheque, setNumeroCheque] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const balanceQuery = useQuery({
    queryKey: queryKeys.orderBalance(order.id),
    queryFn: () => workOrdersService.getBalance(order.id),
    // Lo cobrado cambia con cada movimiento en Finanzas: siempre la cuenta de este momento.
    staleTime: 0,
  });
  const balance = balanceQuery.data;
  const saldo = balance?.saldo ?? 0;
  const collects = saldo > CENT;
  const refunds = saldo < -CENT;
  const needsMethod = collects || refunds;

  const submit = async () => {
    if (!balance) return;
    if (needsMethod && !metodo) {
      setError(t('delivery.methodRequired'));
      return;
    }
    if (metodo === 'cheque' && !numeroCheque.trim() && !file) {
      setError(t('delivery.checkRequired'));
      return;
    }
    setError('');
    setSaving(true);
    let uploaded: string | null = null;
    try {
      if (needsMethod && file) {
        uploaded = await workOrdersService.uploadDeliveryReceipt(order.sede_id, order.numero_orden, file);
      }
      await workOrdersService.deliver({
        orderId: order.id,
        metodo: needsMethod ? (metodo as PaymentMethod) : null,
        numeroCheque: needsMethod && metodo === 'cheque' ? numeroCheque.trim() || null : null,
        comprobanteRuta: uploaded,
      });
      showToast('success', t('delivery.done'));
      await onDelivered();
    } catch (err) {
      // Sin entrega no hay a qué colgar el comprobante: se borra en vez de dejarlo huérfano.
      if (uploaded) void workOrdersService.removeDeliveryReceipt(uploaded).catch(() => {});
      setError(getErrorMessage(err, language));
      setSaving(false);
    }
  };

  const confirmLabel = collects
    ? t('delivery.collect').replace('{monto}', money(saldo))
    : refunds
      ? t('delivery.refund').replace('{monto}', money(-saldo))
      : t('delivery.confirm');

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('delivery.title').replace('{numero}', order.numero_orden)}
      >
        <div className="modal-header">
          <h2 className="modal-title">
            <PackageCheck size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('delivery.title').replace('{numero}', order.numero_orden)}
          </h2>
        </div>

        <div className="modal-body">
          <AlertError message={error} />

          {balanceQuery.isPending ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : balanceQuery.error || !balance ? (
            <AlertError message={t('delivery.balanceError')} />
          ) : (
            <>
              <dl className="delivery-balance">
                <div className="delivery-balance-row">
                  <dt>{t('delivery.total')}</dt>
                  <dd>{money(balance.total)}</dd>
                </div>
                <div className="delivery-balance-row">
                  <dt>{t('delivery.paid')}</dt>
                  <dd>{money(balance.cobrado)}</dd>
                </div>
                <div className={'delivery-balance-row is-result' + (refunds ? ' is-refund' : '')}>
                  <dt>{collects ? t('delivery.toCollect') : refunds ? t('delivery.toRefund') : t('delivery.nothingDue')}</dt>
                  {needsMethod && <dd>{money(Math.abs(saldo))}</dd>}
                </div>
              </dl>

              {needsMethod && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="delivery-method">
                      {refunds ? t('delivery.refundMethod') : t('delivery.method')}
                    </label>
                    <select
                      className="form-input form-select"
                      id="delivery-method"
                      value={metodo}
                      onChange={(e) => setMetodo(e.target.value as PaymentMethod | '')}
                      disabled={saving}
                    >
                      <option value="">{t('delivery.choose')}</option>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>{t('delivery.methods.' + m)}</option>
                      ))}
                    </select>
                  </div>

                  {metodo === 'cheque' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="delivery-check">{t('delivery.checkNumber')}</label>
                      <input
                        className="form-input"
                        id="delivery-check"
                        inputMode="numeric"
                        value={numeroCheque}
                        onChange={(e) => setNumeroCheque(e.target.value)}
                        placeholder="1042"
                        disabled={saving}
                      />
                    </div>
                  )}

                  {metodo && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="delivery-receipt">{t('delivery.receipt')}</label>
                      <input
                        className="form-input"
                        id="delivery-receipt"
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        disabled={saving}
                      />
                      <p className="field-hint">{t('delivery.receiptHint')}</p>
                    </div>
                  )}
                </>
              )}

              <p className="field-hint">{t('delivery.hint')}</p>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            id="delivery-submit"
            onClick={() => void submit()}
            disabled={saving || !balance}
          >
            {saving ? t('common.loading') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
