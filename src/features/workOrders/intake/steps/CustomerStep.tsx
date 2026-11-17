import { useMemo } from 'react';
import { ChevronLeft, UserPlus } from 'lucide-react';
import { useLanguage } from '../../../../context/language.context';
import CustomerPicker from '../../../../components/CustomerPicker';
import PhoneInput from '../../../../components/PhoneInput';
import type { Customer } from '../../../../types/database';
import type { WorkOrderFormApi } from '../../useWorkOrderForm';
import FieldError from '../FieldError';
import { findDuplicateCustomerByPhone } from '../intakeUtils';

interface CustomerStepProps {
  form: WorkOrderFormApi;
  customers: Customer[];
  sedeId?: string;
}

export default function CustomerStep({ form, customers, sedeId }: CustomerStepProps) {
  const { t, language } = useLanguage();
  const { register, formState, watch, setValue } = form.form;
  const { errors } = formState;

  // Los clientes en orden alfabético: al abrir el buscador sin escribir aparecen ordenados A-Z.
  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.nombre.localeCompare(b.nombre, language, { sensitivity: 'base' })),
    [customers, language]
  );

  const phoneValue = watch('newCustomer.telefono');
  const customerLang = watch('newCustomer.idioma') || 'en';
  const duplicateCustomer = useMemo(
    () => (form.customerMode === 'new' ? findDuplicateCustomerByPhone(customers, phoneValue, sedeId) : null),
    [customers, form.customerMode, phoneValue, sedeId]
  );

  return (
    <div className="form-group">
      <label
        className="form-label"
        htmlFor={form.customerMode === 'existing' ? 'intake-customer-search' : undefined}
      >
        {t('customers.customerProfile')}
      </label>
      {form.customerMode === 'existing' ? (
        <>
          <div className="intake-picker-row">
            <div className="intake-picker-field">
              <CustomerPicker
                customers={sortedCustomers}
                value={form.selectedCustomer}
                onChange={(id) => form.selectCustomer(id)}
                invalid={!!errors.selectedCustomer}
                hideInlineCreate
                inputId="intake-customer-search"
                placeholder={t('intake.searchCustomerPlaceholder')}
              />
            </div>
            <button
              type="button"
              id="intake-new-customer"
              className="btn btn-secondary"
              onClick={() => form.selectCustomer('__new__')}
            >
              <UserPlus size={16} /> {t('customers.newCustomer')}
            </button>
          </div>
          <FieldError messageKey={errors.selectedCustomer?.message} />
        </>
      ) : (
        <div className="intake-inline-panel">
          <div className="form-row">
            <div style={{ flex: 1 }}>
              <input
                className={`form-input${errors.newCustomer?.nombre ? ' is-invalid' : ''}`}
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
                id="intake-new-customer-phone"
                value={phoneValue}
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
          {duplicateCustomer && (
            <div className="intake-duplicate-notice" role="status">
              <span>{t('intake.duplicatePhoneNotice').replace('{name}', duplicateCustomer.nombre)}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  form.selectCustomer(duplicateCustomer.id);
                  form.backToExistingCustomer();
                }}
              >
                {t('intake.useExistingCustomer')}
              </button>
            </div>
          )}
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
          <div className="form-group" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
            <span className="form-label" id="intake-customer-lang-label">{t('intake.customerLanguage')}</span>
            <div className="intake-lang-toggle" role="group" aria-labelledby="intake-customer-lang-label">
              {(['en', 'es'] as const).map((langOption) => {
                const active = customerLang === langOption;
                return (
                  <button
                    key={langOption}
                    type="button"
                    className={`intake-lang-btn${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setValue('newCustomer.idioma', langOption, { shouldDirty: true })}
                  >
                    {langOption === 'en' ? 'English' : 'Español'}
                  </button>
                );
              })}
            </div>
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
