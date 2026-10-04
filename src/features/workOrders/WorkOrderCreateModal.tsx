import { useRef, useState } from 'react';
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { isMediaError } from '../../lib/media/errors';
import type { Customer, UserProfile, Vehicle, PaymentMethod } from '../../types/database';
import VehicleFields from '../vehicles/VehicleFields';
import MediaCaptureBar from '../media/MediaCaptureBar';
import DraftMediaStrip from '../media/DraftMediaStrip';
import { ZONES } from './useIntakePhotos';
import type { WorkOrderFormApi } from './useWorkOrderForm';
import { AlertError } from '../../components/AlertError';
import PhoneInput from '../../components/PhoneInput';
import PaymentFields from './PaymentFields';
import TaskEditor from './TaskEditor';

const blockNegativeKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
};

interface WorkOrderCreateModalProps {
  form: WorkOrderFormApi;
  customers: Customer[];
  vehiclesForCustomer: Vehicle[];
  operators: UserProfile[];
  isAdmin: boolean;
  saving: boolean;
  error: string;
  onSubmit: () => void;
  onClose: () => void;
}

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
  const { showToast } = useToast();
  const { register, formState, watch, setValue } = form.form;
  const { errors } = formState;
  const photos = form.photos;
  const newVehicle = form.newVehicle;
  
  const { step, nextStep, prevStep, setReceiptFile } = form;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const preparing = photos.processing > 0 || captureBusy;

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

  const reportPhotoError = (err: unknown) => {
    const detail = isMediaError(err) ? t('media.errors.' + err.code) : t('media.errors.unsupported-image');
    showToast('error', t('media.addError'), detail);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeZone) photos.setZonePhoto(activeZone, file).catch(reportPhotoError);
    e.target.value = '';
  };

  const removePhoto = (zoneKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    photos.removePhoto(zoneKey);
  };

  const renderStep1 = () => (
    <div className="form-group" style={{ minHeight: 300 }}>
      <h4 style={{ marginBottom: 'var(--space-3)' }}>1. {t('customers.customerProfile')}</h4>
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
              <PhoneInput
                value={watch('newCustomer.telefono')}
                onChange={(telefono) =>
                  setValue('newCustomer.telefono', telefono, {
                    shouldDirty: true,
                    shouldValidate: formState.isSubmitted,
                  })
                }
                invalid={!!errors.newCustomer?.telefono}
                placeholder={t('common.phone')}
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
  );

  const renderStep2 = () => (
    <div style={{ minHeight: 300 }}>
      <h4 style={{ marginBottom: 'var(--space-3)' }}>2. {t('vehicles.title')}</h4>
      <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
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
            <VehicleFields
              value={newVehicle}
              onChange={form.setNewVehicle}
              touched={formState.isSubmitted}
              requirePlate={false}
              disabled={saving}
            />
            <FieldError messageKey={errors.newVehicle?.vin?.message} />
            <FieldError messageKey={errors.newVehicle?.marca?.message} />
            <FieldError messageKey={errors.newVehicle?.modelo?.message} />
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

      <div className="form-row">
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
            onKeyDown={blockNegativeKeys}
            {...register('milesIn')}
          />
          <FieldError messageKey={errors.milesIn?.message} />
        </div>
      </div>

      <div className="form-group" style={{ marginTop: 'var(--space-2)' }}>
        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('workOrders.inspection360')}</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: photos.zonesCovered === ZONES.length ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: 600 }}>
            {photos.zonesCovered}/{ZONES.length}
            {photos.extraMedia.length > 0 && ` +${photos.extraMedia.length}`}
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
        </div>
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <DraftMediaStrip items={photos.extraMedia} onRemove={photos.removeMedia} />
          <MediaCaptureBar onAdd={photos.addMedia} disabled={saving} onBusyChange={setCaptureBusy} />
        </div>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)' }}>
          {photos.processing > 0 ? (
            <>
              <span className="spinner-small media-capture-spinner" /> {t('media.processing')}
            </>
          ) : (
            t('workOrders.tapToCapture')
          )}
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
    </div>
  );

  const renderStep3 = () => (
    <div style={{ minHeight: 300 }}>
      <h4 style={{ marginBottom: 'var(--space-3)' }}>3. {t('workOrders.deposit')}</h4>
      {isAdmin ? (
        <>
          <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
            <label className="form-label">{t('workOrders.deposit')} ($)</label>
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
            <PaymentFields
              metodo={watch('paymentMethod') as PaymentMethod | ''}
              onChangeMetodo={(val) => setValue('paymentMethod', val, { shouldValidate: true })}
              numeroCheque={watch('checkNumber')}
              onChangeNumeroCheque={(val) => setValue('checkNumber', val, { shouldValidate: true })}
              onChangeFile={setReceiptFile}
              disabled={saving}
            />
          )}
          <FieldError messageKey={errors.paymentMethod?.message} />
          <FieldError messageKey={errors.checkNumber?.message} />
        </>
      ) : (
        <p className="field-hint">Solo administración puede registrar cobros.</p>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div style={{ minHeight: 300 }}>
      <h4 style={{ marginBottom: 'var(--space-3)' }}>4. Trabajos</h4>
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
          <label className="form-label">{t('workOrders.estimatedDelivery')}</label>
          <input className="form-input" type="date" {...register('estimatedDate')} />
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
            <div className="form-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <span>{t('workOrders.laborDescription')}</span>
            </div>
            
            {form.labor.fields.map((field, i) => {
              const assignedTo = operators.find(o => o.id === field.asignado_a);
              return (
                <div key={field.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{field.descripcion}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                      ${field.costo} • {assignedTo?.nombre_completo || t('tasks.unassigned')}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => form.labor.remove(i)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            
            <TaskEditor
              workType={watch('workType')}
              technicians={operators}
              defaultTechnicianId={form.labor.fields.find(f => f.asignado_a)?.asignado_a || null}
              onAdd={(task) => {
                form.labor.append({
                  descripcion: task.descripcion,
                  costo: task.costo.toString(),
                  especialidad: task.especialidad,
                  asignado_a: task.asignado_a || ''
                });
              }}
              idPrefix="create-order"
            />
          </div>

          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('workOrders.partsDescription')}</span>
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={() => form.parts.append({ descripcion: '', cantidad: '1', precio_venta_unitario: '' })}
              >
                <Plus size={14} /> {t('common.add')}
              </button>
            </div>
            {form.parts.fields.map((field, i) => (
              <div key={field.id} style={{ marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input
                    className="form-input"
                    placeholder={t('common.description')}
                    aria-invalid={!!errors.parts?.[i]?.descripcion}
                    {...register(`parts.${i}.descripcion`)}
                  />
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    placeholder={t('common.quantity')}
                    style={{ maxWidth: 80 }}
                    onKeyDown={blockNegativeKeys}
                    {...register(`parts.${i}.cantidad`)}
                  />
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={t('common.price')}
                    style={{ maxWidth: 120 }}
                    onKeyDown={blockNegativeKeys}
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
        </>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('workOrders.newOrder')} - Paso {step} de 4</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          style={{ display: 'contents' }}
        >
          <div className="modal-body">
            <AlertError message={error} />
            <input type="file" ref={fileInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
            
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              {step > 1 && (
                <button type="button" className="btn btn-secondary" onClick={prevStep} disabled={saving}>
                  <ChevronLeft size={16} style={{ marginRight: 4 }} /> Anterior
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
                {t('common.cancel')}
              </button>
              
              {step < 4 ? (
                <button type="button" className="btn btn-primary" onClick={nextStep} disabled={saving || preparing}>
                  Siguiente <ChevronRight size={16} style={{ marginLeft: 4 }} />
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={saving || preparing}>
                  {saving ? t('common.loading') : preparing ? t('media.processing') : t('common.create')}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
