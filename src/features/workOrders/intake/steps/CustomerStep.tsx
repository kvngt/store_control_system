import { useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLanguage } from '../../../../context/language.context';
import PhoneInput from '../../../../components/PhoneInput';
import type { Customer } from '../../../../types/database';
import type { WorkOrderFormApi } from '../../useWorkOrderForm';
import FieldError from '../FieldError';

interface CustomerStepProps {
  form: WorkOrderFormApi;
  customers: Customer[];
}

export default function CustomerStep({ form, customers }: CustomerStepProps) {
  const { t, language } = useLanguage();
  const { register, formState, watch, setValue } = form.form;
  const { errors } = formState;

  // Los clientes en orden alfabético: la lista venía por fecha de alta y, con decenas, había que
  // leerla entera para encontrar a alguien (06/11/2026).
  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.nombre.localeCompare(b.nombre, language, { sensitivity: 'base' })),
    [customers, language]
  );

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="intake-customer">{t('customers.customerProfile')}</label>
      {form.customerMode === 'existing' ? (
        <>
          <select
            id="intake-customer"
            className="form-input form-select"
            value={form.selectedCustomer}
            aria-invalid={!!errors.selectedCustomer}
            onChange={(e) => form.selectCustomer(e.target.value)}
          >
            <option value="">{t('intake.selectCustomer')}</option>
            <option value="__new__">+ {t('customers.newCustomer')}</option>
            {sortedCustomers.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <FieldError messageKey={errors.selectedCustomer?.message} />
        </>
      ) : (
        <div className="intake-inline-panel">
          <div className="form-row">
            <div style={{ flex: 1 }}>
              <input
                className="form-input"
                placeholder={t('common.name')}
                aria-label={t('common.name')}
                autoComplete="name"
                aria-invalid={!!errors.newCustomer?.nombre}
                {...register('newCustomer.nombre')}
              />
              <FieldError messageKey={errors.newCustomer?.nombre?.message} />
            </div>
            <div style={{ flex: 1 }}>
              {/* Controlado a mano en vez de `register`: el campo son dos controles
                  (país y número) que juntos dan un solo valor. */}
              <PhoneInput
                value={watch('newCustomer.telefono')}
                onChange={(telefono) =>
                  setValue('newCustomer.telefono', telefono, {
                    shouldDirty: true,
                    shouldValidate: formState.isSubmitted || !!errors.newCustomer?.telefono,
                  })
                }
                invalid={!!errors.newCustomer?.telefono}
                placeholder={t('common.phone')}
              />
              <FieldError messageKey={errors.newCustomer?.telefono?.message} />
            </div>
          </div>
          <div className="form-row" style={{ marginTop: 'var(--space-2)' }}>
            <input
              className="form-input"
              type="email"
              inputMode="email"
              spellCheck={false}
              autoComplete="email"
              placeholder={t('common.email')}
              aria-label={t('common.email')}
              {...register('newCustomer.email')}
            />
            <input
              className="form-input"
              autoComplete="street-address"
              placeholder={t('common.address')}
              aria-label={t('common.address')}
              {...register('newCustomer.direccion')}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 'var(--space-2)' }}
            onClick={form.backToExistingCustomer}
          >
            <ChevronLeft size={14} /> {t('common.back')}
          </button>
        </div>
      )}
    </div>
  );
}
