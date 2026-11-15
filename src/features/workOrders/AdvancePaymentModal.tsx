import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import Modal from '../../components/Modal';
import { workOrdersService } from '../../services/workOrders.service';
import { getErrorMessage } from '../../lib/errors';
import { money } from '../../lib/money';
import type { PaymentMethod, WorkOrder } from '../../types/database';
import PaymentFields from './PaymentFields';
import { paymentFields, paymentProblem, withReceipt } from './paymentReceipt';

interface AdvancePaymentModalProps {
  order: Pick<WorkOrder, 'id' | 'numero_orden' | 'sede_id'>;
  onCancel: () => void;
  onDone: () => void | Promise<void>;
}

/**
 * Un anticipo: el cliente paga una parte antes de llevarse el vehículo (la pieza por Zelle, la
 * mitad al autorizar). Los programas comerciales dejan registrar pagos en cualquier momento de
 * la orden; aquí solo existía el depósito del alta y el cobro al entregar.
 *
 * Suma a lo pagado por adelantado (`registrar_anticipo`): la entrega cobra solo lo que falte, y
 * sacar la orden de Entregado vuelve a ese monto. Se registra con su método y su comprobante,
 * igual que un cobro al entregar.
 */
export default function AdvancePaymentModal({ order, onCancel, onDone }: AdvancePaymentModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const [amount, setAmount] = useState('');
  const [metodo, setMetodo] = useState<PaymentMethod | ''>('');
  const [numeroCheque, setNumeroCheque] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parsed = parseFloat(amount);
  const monto = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;

  const submit = async () => {
    if (monto <= 0) {
      setError(t('advance.amountRequired'));
      return;
    }
    const problem = paymentProblem({ needsMethod: true, metodo, numeroCheque, file });
    if (problem) {
      setError(t(problem));
      return;
    }
    const payment = paymentFields({ needsMethod: true, metodo, numeroCheque });
    if (!payment.metodo) return;
    const paymentMethod = payment.metodo;
    setError('');
    setSaving(true);
    try {
      await withReceipt(
        { needsMethod: true, file, sedeId: order.sede_id, numeroOrden: order.numero_orden },
        (comprobanteRuta) =>
          workOrdersService.registerAdvance({
            orderId: order.id,
            monto,
            metodo: paymentMethod,
            numeroCheque: payment.numeroCheque,
            comprobanteRuta,
          })
      );
      showToast('success', t('advance.done').replace('{monto}', money(monto)));
      await onDone();
    } catch (err) {
      setError(getErrorMessage(err, language));
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onCancel}
      closeDisabled={saving}
      style={{ maxWidth: 480 }}
      title={
        <>
          <HandCoins size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
          {t('advance.title').replace('{numero}', order.numero_orden)}
        </>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" id="advance-submit" onClick={() => void submit()} disabled={saving}>
            {saving ? t('common.loading') : monto > 0 ? t('advance.submit').replace('{monto}', money(monto)) : t('advance.action')}
          </button>
        </>
      }
    >
      <AlertError message={error} />
          <p className="field-hint" style={{ marginTop: 0 }}>{t('advance.explain')}</p>
          <div className="form-group">
            <label className="form-label" htmlFor="advance-amount">{t('advance.amount')}</label>
            <input
              id="advance-amount"
              className="form-input"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
            />
          </div>
          <PaymentFields
            metodo={metodo}
            onChangeMetodo={setMetodo}
            numeroCheque={numeroCheque}
            onChangeNumeroCheque={setNumeroCheque}
            onChangeFile={setFile}
            disabled={saving}
          />
    </Modal>
  );
}
