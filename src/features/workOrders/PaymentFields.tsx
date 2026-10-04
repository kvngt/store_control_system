import { useLanguage } from '../../context/language.context';
import { PAYMENT_METHODS, type PaymentMethod } from '../../types/database';

interface PaymentFieldsProps {
  metodo: PaymentMethod | '';
  onChangeMetodo: (metodo: PaymentMethod | '') => void;
  numeroCheque: string;
  onChangeNumeroCheque: (numero: string) => void;
  onChangeFile: (file: File | null) => void;
  disabled?: boolean;
  refunds?: boolean;
}

export default function PaymentFields({
  metodo,
  onChangeMetodo,
  numeroCheque,
  onChangeNumeroCheque,
  onChangeFile,
  disabled,
  refunds,
}: PaymentFieldsProps) {
  const { t } = useLanguage();

  return (
    <>
      <div className="form-group">
        <label className="form-label" htmlFor="payment-method">
          {refunds ? t('delivery.refundMethod') : t('delivery.method')}
        </label>
        <select
          className="form-input form-select"
          id="payment-method"
          value={metodo}
          onChange={(e) => onChangeMetodo(e.target.value as PaymentMethod | '')}
          disabled={disabled}
        >
          <option value="">{t('delivery.choose')}</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{t('delivery.methods.' + m)}</option>
          ))}
        </select>
      </div>

      {metodo === 'cheque' && (
        <div className="form-group">
          <label className="form-label" htmlFor="payment-check">{t('delivery.checkNumber')}</label>
          <input
            className="form-input"
            id="payment-check"
            inputMode="numeric"
            value={numeroCheque}
            onChange={(e) => onChangeNumeroCheque(e.target.value)}
            placeholder="1042"
            disabled={disabled}
          />
        </div>
      )}

      {metodo && (
        <div className="form-group">
          <label className="form-label" htmlFor="payment-receipt">{t('delivery.receipt')}</label>
          <input
            className="form-input"
            id="payment-receipt"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => onChangeFile(e.target.files?.[0] ?? null)}
            disabled={disabled}
          />
          <p className="field-hint">{t('delivery.receiptHint')}</p>
        </div>
      )}
    </>
  );
}
