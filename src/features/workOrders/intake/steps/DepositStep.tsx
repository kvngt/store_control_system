import { useLanguage } from '../../../../context/language.context';
import type { WorkOrderFormApi } from '../../useWorkOrderForm';
import PaymentFields from '../../PaymentFields';
import FieldError from '../FieldError';
import { blockNegativeKeys, toPaymentMethod } from '../intakeUtils';

interface DepositStepProps {
  form: WorkOrderFormApi;
  isAdmin: boolean;
  saving: boolean;
}

// Cobrar es de administración, igual que abrir la orden desde 20261004000000. El `isAdmin`
// se queda como red, porque `create_work_order` también ignora el depósito si no lo manda
// un admin.
export default function DepositStep({ form, isAdmin, saving }: DepositStepProps) {
  const { t } = useLanguage();
  const { register, formState, watch, setValue, clearErrors } = form.form;
  const { errors } = formState;

  if (!isAdmin) return null;

  return (
    <>
      <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>{t('intake.depositHint')}</p>
      <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
        <label className="form-label" htmlFor="order-deposit">{t('workOrders.deposit')} ($)</label>
        <input
          id="order-deposit"
          className="form-input"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          aria-invalid={!!errors.deposit}
          onKeyDown={blockNegativeKeys}
          {...register('deposit')}
        />
        <FieldError messageKey={errors.deposit?.message} />
      </div>
      {parseFloat(watch('deposit') || '0') > 0 && (
        <>
          <PaymentFields
            metodo={toPaymentMethod(watch('paymentMethod')) ?? ''}
            onChangeMetodo={(val) => setValue('paymentMethod', val, { shouldDirty: true, shouldValidate: !!errors.paymentMethod })}
            numeroCheque={watch('checkNumber')}
            onChangeNumeroCheque={(val) => {
              setValue('checkNumber', val, { shouldDirty: true });
              if (val.trim()) clearErrors('checkNumber');
            }}
            onChangeFile={(file) => {
              form.setReceiptFile(file);
              // Con la foto, el cheque ya no necesita su número.
              if (file) clearErrors('checkNumber');
            }}
            methodInvalid={!!errors.paymentMethod}
            checkInvalid={!!errors.checkNumber}
            disabled={saving}
          />
          {/* El campo de archivo se vacía al volver a este paso; el comprobante elegido no. */}
          {form.receiptFile && (
            <p className="field-hint">
              {t('intake.receiptChosen').replace('{name}', form.receiptFile.name)}{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => form.setReceiptFile(null)}>
                {t('common.delete')}
              </button>
            </p>
          )}
        </>
      )}
      <FieldError messageKey={errors.paymentMethod?.message} />
      <FieldError messageKey={errors.checkNumber?.message} />
    </>
  );
}
