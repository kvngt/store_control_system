import { useRef, useState } from 'react';
import { Camera, CheckCircle2, ChevronLeft, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { Customer, UserProfile, Vehicle } from '../../types/database';
import { ZONES } from './useIntakePhotos';
import type { WorkOrderFormApi } from './useWorkOrderForm';

interface WorkOrderCreateModalProps {
  form: WorkOrderFormApi;
  customers: Customer[];
  /** Already narrowed to the selected customer by the caller. */
  vehiclesForCustomer: Vehicle[];
  operators: UserProfile[];
  isAdmin: boolean;
  saving: boolean;
  /** Already translated by the caller. */
  error: string;
  onSubmit: () => void;
  onClose: () => void;
}

/**
 * The "nueva orden" dialog: customer, vehicle, intake details, 360-degree
 * photos, labor and parts.
 *
 * Deliberately presentational — every field belongs to `useWorkOrderForm` and
 * submission belongs to the screen — so the dialog can be rendered and
 * exercised on its own, which the 2,000-line page it came out of made
 * impossible. Validation messages arrive as translation keys and are turned
 * into sentences here, at render, so switching language never means
 * revalidating the form.
 */
export default function WorkOrderCreateModal({
  form,
  customers,
  vehiclesForCustomer,
  operators,
  isAdmin,
  saving,
  error,
  onSubmit,
  onClose,
}: WorkOrderCreateModalProps) {
  const { t } = useLanguage();
  const { register, formState, watch } = form.form;
  const { errors } = formState;
  const photos = form.photos;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const [activeZone, setActiveZone] = useState<string | null>(null);

  const FieldError = ({ messageKey }: { messageKey?: string }) =>
    messageKey ? (
      <span role="alert" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
        {t(messageKey)}
      </span>
    ) : null;

  const handleZoneClick = (zoneKey: string) => {
    setActiveZone(zoneKey);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeZone) photos.setZonePhoto(activeZone, file);
    e.target.value = '';
  };

  const handleExtraFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    photos.addExtraPhotos(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const removePhoto = (zoneKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    photos.removePhoto(zoneKey);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('workOrders.newOrder')}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {/* `noValidate`: the schema owns the rules, so the browser's own
            bubbles never fire first with an untranslated message. */}
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          style={{ display: 'contents' }}
        >
          <div className="modal-body">
            {error && <div className="alert-error">{error}</div>}
            <input type="file" ref={fileInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
            {/* No `capture` here: extras are often picked from the gallery. */}
            <input type="file" ref={extraInputRef} accept="image/*" multiple style={{ display: 'none' }} onChange={handleExtraFilesChange} />

            {/* Customer & Vehicle Select */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t('customers.customerProfile')}</label>
                {form.customerMode === 'existing' ? (
                  <>
                    <select
                      className="form-input form-select"
                      value={form.selectedCustomer}
                      onChange={(e) => form.selectCustomer(e.target.value)}
                    >
                      <option value="">-- Seleccionar Cliente --</option>
                      <option value="__new__">+ {t('customers.newCustomer')}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                    <FieldError messageKey={errors.selectedCustomer?.message} />
                  </>
                ) : (
                  <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-surface-border)' }}>
                    <div className="form-row">
                      <div style={{ flex: 1 }}>
                        <input
                          className="form-input"
                          placeholder={t('common.name')}
                          aria-invalid={!!errors.newCustomer?.nombre}
                          {...register('newCustomer.nombre')}
                        />
                        <FieldError messageKey={errors.newCustomer?.nombre?.message} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <input
                          className="form-input"
                          placeholder={t('common.phone')}
                          aria-invalid={!!errors.newCustomer?.telefono}
                          {...register('newCustomer.telefono')}
                        />
                        <FieldError messageKey={errors.newCustomer?.telefono?.message} />
                      </div>
                    </div>
                    <div className="form-row" style={{ marginTop: 'var(--space-2)' }}>
                      <input className="form-input" type="email" placeholder={t('common.email')} {...register('newCustomer.email')} />
                      <input className="form-input" placeholder={t('common.address')} {...register('newCustomer.direccion')} />
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
              <div className="form-group">
                <label className="form-label">{t('vehicles.title')}</label>
                {form.vehicleMode === 'existing' ? (
                  <>
                    <select
                      className="form-input form-select"
                      value={watch('selectedVehicle')}
                      onChange={(e) => form.selectVehicle(e.target.value)}
                      disabled={!form.selectedCustomer}
                    >
                      <option value="">-- Seleccionar Vehículo --</option>
                      <option value="__new__">+ {t('vehicles.newVehicle')}</option>
                      {vehiclesForCustomer.map((v) => (
                        <option key={v.id} value={v.id}>{v.marca} {v.modelo} ({v.placa})</option>
                      ))}
                    </select>
                    <FieldError messageKey={errors.selectedVehicle?.message} />
                  </>
                ) : (
                  <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-surface-border)' }}>
                    <div className="form-row">
                      <div style={{ flex: 1 }}>
                        <input
                          className="form-input"
                          placeholder={t('vehicles.brand')}
                          aria-invalid={!!errors.newVehicle?.marca}
                          {...register('newVehicle.marca')}
                        />
                        <FieldError messageKey={errors.newVehicle?.marca?.message} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <input
                          className="form-input"
                          placeholder={t('vehicles.model')}
                          aria-invalid={!!errors.newVehicle?.modelo}
                          {...register('newVehicle.modelo')}
                        />
                        <FieldError messageKey={errors.newVehicle?.modelo?.message} />
                      </div>
                    </div>
                    <div className="form-row" style={{ marginTop: 'var(--space-2)' }}>
                      <input className="form-input" type="number" placeholder={t('vehicles.year')} {...register('newVehicle.anio')} />
                      <input className="form-input" placeholder={t('vehicles.color')} {...register('newVehicle.color')} />
                    </div>
                    <div className="form-row" style={{ marginTop: 'var(--space-2)' }}>
                      <div style={{ flex: 1 }}>
                        <input
                          className="form-input"
                          placeholder={t('vehicles.vin')}
                          maxLength={17}
                          aria-invalid={!!errors.newVehicle?.vin}
                          {...register('newVehicle.vin')}
                        />
                        <FieldError messageKey={errors.newVehicle?.vin?.message} />
                      </div>
                      <input className="form-input" placeholder={t('vehicles.plate')} {...register('newVehicle.placa')} />
                    </div>
                    {form.customerMode === 'existing' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 'var(--space-2)' }}
                        onClick={form.backToExistingVehicle}
                      >
                        <ChevronLeft size={14} /> {t('common.back')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Work Type & Fuel */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t('common.type')}</label>
                <select className="form-input form-select" {...register('workType')}>
                  <option value="mecanica">{t('workOrders.mechanical')}</option>
                  <option value="pintura">{t('workOrders.painting')}</option>
                  <option value="combinado">{t('workOrders.combined')}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('workOrders.fuelLevel')}</label>
                <select className="form-input form-select" {...register('fuelLevel')}>
                  <option value="E (Vacio)">E (Vacío / Empty)</option>
                  <option value="1/4">1/4</option>
                  <option value="1/2">1/2</option>
                  <option value="3/4">3/4</option>
                  <option value="F (Lleno)">F (Lleno / Full)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t('workOrders.milesIn')}</label>
                <input
                  className="form-input"
                  id="order-miles-in"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  aria-invalid={!!errors.milesIn}
                  {...register('milesIn')}
                />
                <FieldError messageKey={errors.milesIn?.message} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('workOrders.deposit')} ($)</label>
                <input className="form-input" type="number" aria-invalid={!!errors.deposit} {...register('deposit')} />
                <FieldError messageKey={errors.deposit?.message} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('workOrders.estimatedDelivery')}</label>
              <input className="form-input" type="date" {...register('estimatedDate')} />
            </div>

            {/* Operators — only admins choose who works the order. A
                technician creating one is auto-assigned to themselves. */}
            {isAdmin ? (
              <div className="form-group">
                <label className="form-label">{t('workOrders.assignedTechnician')}</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {operators.map((op) => {
                    const picked = form.selectedOperators.includes(op.id);
                    return (
                      <label
                        key={op.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 12px', borderRadius: 'var(--radius-full)',
                          background: picked ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                          color: picked ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                          fontSize: 'var(--font-size-sm)', cursor: 'pointer',
                        }}
                      >
                        <input type="checkbox" checked={picked} onChange={() => form.toggleOperator(op.id)} style={{ display: 'none' }} />
                        {op.nombre_completo} ({op.rol})
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">{t('workOrders.assignedTechnician')}</label>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  {t('workOrders.autoAssigned')}
                </p>
              </div>
            )}

            {/* 360 Photos upload */}
            <div className="form-group" style={{ marginTop: 'var(--space-2)' }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('workOrders.inspection360')}</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: photos.zonesCovered === ZONES.length ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: 600 }}>
                  {photos.zonesCovered}/{ZONES.length}
                  {photos.extraPhotos.length > 0 && ` +${photos.extraPhotos.length}`}
                </span>
              </label>
              <div className="photo-zone-grid">
                {ZONES.map(({ key, label }) => {
                  const photo = photos.photos[key];
                  return (
                    <div key={key} onClick={() => handleZoneClick(key)} className={`photo-zone ${photo ? 'filled' : ''}`}>
                      {photo && (
                        <>
                          <img
                            src={photo.preview}
                            alt={label}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <button
                            type="button"
                            className="photo-zone-remove"
                            onClick={(e) => removePhoto(key, e)}
                            aria-label={`${t('common.delete')} ${label}`}
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                      {!photo ? (
                        <>
                          <Camera size={24} className="photo-zone-icon" />
                          <span className="photo-zone-label">{label}</span>
                        </>
                      ) : (
                        <span className="photo-zone-caption">
                          <CheckCircle2 size={12} /> {label}
                        </span>
                      )}
                    </div>
                  );
                })}

                {photos.extraPhotos.map((photo) => (
                  <div key={photo.key} className="photo-zone filled">
                    <img
                      src={photo.preview}
                      alt={photo.label}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      className="photo-zone-remove"
                      onClick={(e) => removePhoto(photo.key, e)}
                      aria-label={`${t('common.delete')} ${photo.label}`}
                    >
                      <X size={14} />
                    </button>
                    <span className="photo-zone-caption">
                      <CheckCircle2 size={12} /> {photo.label}
                    </span>
                  </div>
                ))}

                <div
                  className="photo-zone photo-zone-add"
                  onClick={() => extraInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') extraInputRef.current?.click();
                  }}
                >
                  <ImagePlus size={24} className="photo-zone-icon" />
                  <span className="photo-zone-label">{t('workOrders.addExtraPhoto')}</span>
                </div>
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)' }}>
                {t('workOrders.tapToCapture')}
              </p>
            </div>

            <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
              <label className="form-label">Notas de la Inspección 360°</label>
              <textarea
                className="form-input form-textarea"
                placeholder="Detalles sobre rayones, abolladuras previas o estado general del auto..."
                rows={2}
                {...register('inspectionNotes')}
              />
            </div>

            {/* Labor Items */}
            <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('workOrders.laborDescription')}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => form.labor.append({ descripcion: '', costo: '' })}>
                  <Plus size={14} /> {t('common.add')}
                </button>
              </label>
              {form.labor.fields.map((field, i) => (
                <div key={field.id} style={{ marginBottom: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <input
                      className="form-input"
                      placeholder={t('common.description')}
                      aria-invalid={!!errors.laborItems?.[i]?.descripcion}
                      {...register(`laborItems.${i}.descripcion`)}
                    />
                    <input className="form-input" type="number" placeholder="$" style={{ maxWidth: 110 }} {...register(`laborItems.${i}.costo`)} />
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => form.labor.remove(i)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <FieldError messageKey={errors.laborItems?.[i]?.descripcion?.message} />
                </div>
              ))}
            </div>

            {/* Parts */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('workOrders.partsDescription')}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => form.parts.append({ descripcion: '', cantidad: '1', costo_unitario: '', precio_venta_unitario: '' })}
                >
                  <Plus size={14} /> {t('common.add')}
                </button>
              </label>
              {form.parts.fields.map((field, i) => (
                <div key={field.id} style={{ marginBottom: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <input
                      className="form-input"
                      placeholder={t('common.description')}
                      aria-invalid={!!errors.parts?.[i]?.descripcion}
                      {...register(`parts.${i}.descripcion`)}
                    />
                    <input className="form-input" type="number" placeholder={t('common.quantity')} style={{ maxWidth: 80 }} {...register(`parts.${i}.cantidad`)} />
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      placeholder={t('workOrders.unitCost')}
                      title={t('workOrders.unitCostHint')}
                      style={{ maxWidth: 100 }}
                      {...register(`parts.${i}.costo_unitario`)}
                    />
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      placeholder={t('common.price')}
                      style={{ maxWidth: 100 }}
                      {...register(`parts.${i}.precio_venta_unitario`)}
                    />
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => form.parts.remove(i)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <FieldError
                    messageKey={
                      errors.parts?.[i]?.descripcion?.message ||
                      errors.parts?.[i]?.cantidad?.message ||
                      errors.parts?.[i]?.precio_venta_unitario?.message
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('common.loading') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
