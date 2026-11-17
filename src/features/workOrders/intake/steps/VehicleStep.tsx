import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Car, CheckCircle2, ChevronLeft, Plus, Search, X } from 'lucide-react';
import { useLanguage } from '../../../../context/language.context';
import { useToast } from '../../../../context/toast.context';
import { isMediaError } from '../../../../lib/media/errors';
import type { Vehicle } from '../../../../types/database';
import VehicleFields from '../../../vehicles/VehicleFields';
import MediaCaptureBar from '../../../media/MediaCaptureBar';
import DraftMediaStrip from '../../../media/DraftMediaStrip';
import { ZONES } from '../../useIntakePhotos';
import type { WorkOrderFormApi } from '../../useWorkOrderForm';
import DamageDiagramEditor from '../../DamageDiagramEditor';
import FieldError from '../FieldError';
import { blockNegativeKeys } from '../intakeUtils';

interface VehicleStepProps {
  form: WorkOrderFormApi;
  vehiclesForCustomer: Vehicle[];
  saving: boolean;
  damageDiagramOpen: boolean;
  onOpenDamageDiagram: () => void;
  onCaptureBusyChange: (busy: boolean) => void;
}

export default function VehicleStep({
  form,
  vehiclesForCustomer,
  saving,
  damageDiagramOpen,
  onOpenDamageDiagram,
  onCaptureBusyChange,
}: VehicleStepProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { register, formState, watch, setValue } = form.form;
  const { errors } = formState;
  const photos = form.photos;
  const damageMarks = watch('damageMarks') ?? [];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const vehiclePickerRef = useRef<HTMLDivElement>(null);

  const selectedVehicleId = watch('selectedVehicle');
  const selectedVehicleObj = useMemo(
    () => vehiclesForCustomer.find((v) => v.id === selectedVehicleId) ?? null,
    [vehiclesForCustomer, selectedVehicleId]
  );

  const useSearchableVehicle = vehiclesForCustomer.length > 8;

  const vehicleMatches = useMemo(() => {
    const needle = vehicleQuery.trim().toLowerCase();
    if (!needle) return vehiclesForCustomer.slice(0, 8);
    return vehiclesForCustomer
      .filter((v) => {
        const text = `${v.anio ?? ''} ${v.marca} ${v.modelo} ${v.placa ?? ''} ${v.vin ?? ''}`.toLowerCase();
        return text.includes(needle);
      })
      .slice(0, 8);
  }, [vehiclesForCustomer, vehicleQuery]);

  useEffect(() => {
    if (!vehicleMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (!vehiclePickerRef.current?.contains(e.target as Node)) setVehicleMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [vehicleMenuOpen]);

  const handleZoneClick = (zoneKey: string) => {
    setActiveZone(zoneKey);
    fileInputRef.current?.click();
  };

  // Una foto que no se pudo leer (un HEIC en un navegador que no lo decodifica)
  // se dice en el momento, en vez de desaparecer sin rastro.
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

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
        <label
          className="form-label"
          htmlFor={
            form.vehicleMode === 'existing'
              ? useSearchableVehicle
                ? 'intake-vehicle-search'
                : 'intake-vehicle'
              : undefined
          }
        >
          {t('vehicles.title')}
        </label>
        {form.vehicleMode === 'existing' ? (
          useSearchableVehicle ? (
            <>
              <div className="intake-picker-row">
                <div className="intake-picker-field">
                  {selectedVehicleObj ? (
                    <div className={`owner-card${errors.selectedVehicle ? ' is-invalid' : ''}`}>
                      <div className="owner-card-avatar" aria-hidden="true">
                        <Car size={16} />
                      </div>
                      <div className="owner-card-body">
                        <div className="owner-card-name">
                          {selectedVehicleObj.anio ? `${selectedVehicleObj.anio} ` : ''}
                          {selectedVehicleObj.marca} {selectedVehicleObj.modelo}
                        </div>
                        <div className="owner-card-meta">
                          <span>{selectedVehicleObj.placa || t('vehicles.noPlate')}</span>
                          {selectedVehicleObj.vin && <span>{selectedVehicleObj.vin}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          form.selectVehicle('');
                          setVehicleQuery('');
                          setVehicleMenuOpen(true);
                        }}
                      >
                        {t('vehicles.changeOwner')}
                      </button>
                    </div>
                  ) : (
                    <div className="combo" ref={vehiclePickerRef}>
                      <div className="combo-search">
                        <Search size={16} className="combo-search-icon" />
                        <input
                          id="intake-vehicle-search"
                          className={`form-input${errors.selectedVehicle ? ' is-invalid' : ''}`}
                          autoComplete="off"
                          aria-invalid={!!errors.selectedVehicle || undefined}
                          placeholder={t('intake.searchVehicle')}
                          value={vehicleQuery}
                          onChange={(e) => {
                            setVehicleQuery(e.target.value);
                            setVehicleMenuOpen(true);
                          }}
                          onFocus={() => setVehicleMenuOpen(true)}
                          disabled={!form.selectedCustomer}
                        />
                      </div>
                      {vehicleMenuOpen && (
                        <div className="combo-menu" role="listbox">
                          {vehicleMatches.map((v) => (
                            <button
                              type="button"
                              role="option"
                              aria-selected={false}
                              key={v.id}
                              className="combo-option"
                              onClick={() => {
                                form.selectVehicle(v.id);
                                setVehicleMenuOpen(false);
                              }}
                            >
                              <span className="combo-option-main">
                                {v.anio ? `${v.anio} ` : ''}
                                {v.marca} {v.modelo}
                              </span>
                              <span className="combo-option-sub">
                                {v.placa || t('vehicles.noPlate')}
                              </span>
                            </button>
                          ))}
                          {vehicleMatches.length === 0 && (
                            <div className="combo-empty">{t('intake.noVehicleMatches')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  id="intake-new-vehicle"
                  className="btn btn-secondary"
                  onClick={() => form.selectVehicle('__new__')}
                  disabled={!form.selectedCustomer}
                >
                  <Plus size={16} /> {t('vehicles.newVehicle')}
                </button>
              </div>
              <FieldError messageKey={errors.selectedVehicle?.message} />
            </>
          ) : (
            <>
              <select
                id="intake-vehicle"
                className="form-input form-select"
                value={selectedVehicleId}
                aria-invalid={!!errors.selectedVehicle}
                onChange={(e) => form.selectVehicle(e.target.value)}
                disabled={!form.selectedCustomer}
              >
                <option value="">{t('intake.selectVehicle')}</option>
                <option value="__new__">+ {t('vehicles.newVehicle')}</option>
                {vehiclesForCustomer.map((v) => (
                  <option key={v.id} value={v.id}>{v.marca} {v.modelo} ({v.placa})</option>
                ))}
              </select>
              <FieldError messageKey={errors.selectedVehicle?.message} />
            </>
          )
        ) : (
          /* The same VIN-first form the Vehiculos screen uses: VIN lookup, plate
             check and brand/model suggestions, with the customer standing there. */
          <div className="intake-inline-panel">
            <VehicleFields
              value={form.newVehicle}
              onChange={form.setNewVehicle}
              touched={formState.isSubmitted || !!errors.newVehicle}
              requirePlate={false}
              disabled={saving}
              plateError={errors.newVehicle?.placa?.message}
              vinError={errors.newVehicle?.vin?.message}
            />
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
          <label className="form-label" htmlFor="order-fuel">{t('workOrders.fuelLevel')}</label>
          <select id="order-fuel" className="form-input form-select" {...register('fuelLevel')}>
            <option value="E (Vacio)">E (Vacío / Empty)</option>
            <option value="1/4">1/4</option>
            <option value="1/2">1/2</option>
            <option value="3/4">3/4</option>
            <option value="F (Lleno)">F (Lleno / Full)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="order-miles-in">{t('workOrders.milesIn')}</label>
          {/* An odometer reading below zero is meaningless and it corrupts the
              printed report, so the minus key is refused outright rather than
              accepted and then complained about. */}
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
        {/* Lo mismo que la tarjeta de la orden ya creada: más fotos, un video de
            recorrido o una nota de voz sobre cómo llegó el vehículo (pedido del taller,
            octubre 2026). Queda en el navegador y entra a la cola de subida al crear la
            orden, con las fotos. */}
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <DraftMediaStrip items={photos.extraMedia} onRemove={photos.removeMedia} />
          <MediaCaptureBar onAdd={photos.addMedia} disabled={saving} onBusyChange={onCaptureBusyChange} />
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

      <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
        {damageDiagramOpen ? (
          <DamageDiagramEditor
            marks={damageMarks}
            onChange={(marks) => setValue('damageMarks', marks, { shouldDirty: true })}
            editable={!saving}
          />
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            style={{
              width: '100%',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-2)',
            }}
            onClick={onOpenDamageDiagram}
          >
            <span>{t('damage.open')}</span>
            {damageMarks.length > 0 && (
              <span className="badge badge-subtle" style={{ fontSize: 'var(--font-size-xs)' }}>
                {t('damage.count').replace('{n}', String(damageMarks.length))}
              </span>
            )}
          </button>
        )}
      </div>

      <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
        <label className="form-label" htmlFor="order-inspection-notes">{t('intake.inspectionNotes')}</label>
        <textarea
          id="order-inspection-notes"
          className="form-input form-textarea"
          placeholder={t('intake.inspectionNotesPlaceholder')}
          rows={2}
          {...register('inspectionNotes')}
        />
      </div>
    </>
  );
}
