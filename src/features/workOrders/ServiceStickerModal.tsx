import { useState } from 'react';
import { Calendar, Printer, Send, Tag, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { AlertError } from '../../components/AlertError';
import { getErrorMessage } from '../../lib/errors';
import { formatDay, todayLocal } from '../../lib/dates';
import type { NextServiceInput, WorkOrder } from '../../types/database';
import { presetsFor, validateNextService, type ServicePreset } from './nextService';

interface ServiceStickerModalProps {
  mode: 'admin' | 'tecnico';
  order: WorkOrder;
  initialData?: {
    fecha?: string | null;
    millas?: number | null;
    nota?: string | null;
    /** El idioma que se eligió al programar (20261010000038). */
    idioma?: 'es' | 'en' | null;
  } | null;
  onSave?: (data: NextServiceInput, language: 'es' | 'en') => Promise<void>;
  onSaveAndPrint?: (data: NextServiceInput, language: 'es' | 'en') => Promise<void>;
  onSuggest?: (data: NextServiceInput) => Promise<void>;
  onClose: () => void;
}

/** Hasta cuántos caracteres de la nota caben en la etiqueta sin achicar la letra. */
const STICKER_NOTE_COMFORT = 64;

export default function ServiceStickerModal({
  mode,
  order,
  initialData,
  onSave,
  onSaveAndPrint,
  onSuggest,
  onClose,
}: ServiceStickerModalProps) {
  const { t, language } = useLanguage();

  const today = todayLocal();

  const defaultLanguage: 'es' | 'en' = (initialData?.idioma ?? order.cliente?.idioma) === 'en' ? 'en' : 'es';
  const [stickerLanguage, setStickerLanguage] = useState<'es' | 'en'>(defaultLanguage);

  const hasIntakeMiles = typeof order.millas_ingreso === 'number' && !Number.isNaN(order.millas_ingreso);
  // es-US, como el dinero (lib/money.ts): 108,000 y no 108.000.
  const numFmt = new Intl.NumberFormat(language === 'es' ? 'es-US' : 'en-US');

  const initialMillas = (): string => {
    if (initialData?.millas !== null && initialData?.millas !== undefined) {
      if (hasIntakeMiles) {
        return String(Math.max(0, initialData.millas - order.millas_ingreso!));
      }
      return String(initialData.millas);
    }
    return '';
  };

  const [fecha, setFecha] = useState(initialData?.fecha || '');
  const [millas, setMillas] = useState(initialMillas);
  const [nota, setNota] = useState(initialData?.nota || '');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fecha?: string; millas?: string; nota?: string }>({});

  const presets = presetsFor(order.millas_ingreso, today, stickerLanguage);

  const applyPreset = (preset: ServicePreset) => {
    setFecha(preset.fecha);
    if (preset.millas !== null) {
      setMillas(hasIntakeMiles ? String(preset.millas - order.millas_ingreso!) : String(preset.millas));
    } else {
      setMillas('');
    }
    setNota(preset.nota);
    setSelectedPreset(preset.id);
    setFieldErrors({});
    setError('');
  };

  const handleInputChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setSelectedPreset(null);
    setFieldErrors({});
    setError('');
  };

  const executeAction = async (andPrint: boolean) => {
    setError('');
    let numMillas: number | null = null;
    if (hasIntakeMiles) {
      if (millas.trim() !== '') {
        const extra = Number(millas.trim());
        if (!Number.isInteger(extra) || extra < 1 || extra > 100000) {
          setFieldErrors({ millas: t('nextService.milesExtraInvalid') });
          return;
        }
        numMillas = order.millas_ingreso! + extra;
      }
    } else {
      numMillas = millas.trim() === '' ? null : parseInt(millas, 10);
    }
    const trimmedNota = nota.trim() || null;
    const finalFecha = fecha.trim() || null;

    const validation = validateNextService(
      { fecha: finalFecha, millas: numMillas, nota: trimmedNota },
      today,
      order.millas_ingreso
    );

    if (Object.keys(validation).length > 0) {
      if (validation.general) setError(t(validation.general));
      setFieldErrors({
        fecha: validation.fecha ? t(validation.fecha) : undefined,
        millas: validation.millas ? t(validation.millas) : undefined,
        nota: validation.nota ? t(validation.nota) : undefined,
      });
      return;
    }

    const payload: NextServiceInput = {
      fecha: finalFecha,
      millas: numMillas,
      nota: trimmedNota,
    };

    setSaving(true);
    try {
      if (mode === 'admin') {
        if (andPrint && onSaveAndPrint) {
          await onSaveAndPrint(payload, stickerLanguage);
        } else if (onSave) {
          await onSave(payload, stickerLanguage);
        }
      } else if (mode === 'tecnico' && onSuggest) {
        await onSuggest(payload);
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  const isTechnician = mode === 'tecnico';

  return (
    // Mientras guarda o traduce no se cierra: el trabajo seguiría en el aire sin que se viera cómo terminó.
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div
        className="modal"
        style={{ maxWidth: '520px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-sticker-modal-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="service-sticker-modal-title">
            <Tag size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {isTechnician ? t('nextService.suggestTitle') : t('nextService.modalTitle')}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void executeAction(false);
          }}
        >
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <AlertError message={error} />

            {/* Presets de un toque */}
            <div>
              <label className="form-label" style={{ marginBottom: 'var(--space-2)' }}>
                {t('nextService.presetsTitle')}
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 'var(--space-2)',
                }}
              >
                {presets.map((preset) => {
                  const isSelected = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '6px 10px' }}
                      onClick={() => applyPreset(preset)}
                      disabled={saving}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{t(preset.labelKey)}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                          {preset.millas !== null ? `${numFmt.format(preset.millas)} mi · ` : ''}
                          {formatDay(preset.fecha, language)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campos manuales */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="sticker-fecha">
                  <Calendar size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {t('nextService.dateLabel')}
                </label>
                <input
                  type="date"
                  id="sticker-fecha"
                  className={`form-input ${fieldErrors.fecha ? 'form-input-error' : ''}`}
                  value={fecha}
                  min={today}
                  onChange={handleInputChange(setFecha)}
                  disabled={saving}
                />
                {fieldErrors.fecha && <span className="field-error">{fieldErrors.fecha}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="sticker-millas">
                  {hasIntakeMiles ? t('nextService.milesExtraLabel') : t('nextService.milesLabel')}
                </label>
                <input
                  type="number"
                  id="sticker-millas"
                  className={`form-input ${fieldErrors.millas ? 'form-input-error' : ''}`}
                  value={millas}
                  min={hasIntakeMiles ? 1 : (order.millas_ingreso ?? 0)}
                  max={hasIntakeMiles ? 100000 : undefined}
                  step={500}
                  placeholder={hasIntakeMiles ? '5000' : (order.millas_ingreso ? `>= ${order.millas_ingreso}` : '65000')}
                  onChange={handleInputChange(setMillas)}
                  disabled={saving}
                />
                {hasIntakeMiles && (() => {
                  const extraVal = Number(millas.trim());
                  if (millas.trim() !== '' && Number.isInteger(extraVal) && extraVal >= 1 && extraVal <= 100000) {
                    const totalVal = order.millas_ingreso! + extraVal;
                    return (
                      <span className="field-hint" style={{ marginTop: 'var(--space-1)', display: 'block' }}>
                        {t('nextService.milesTotal')
                          .replace('{total}', numFmt.format(totalVal))
                          .replace('{actual}', numFmt.format(order.millas_ingreso!))
                          .replace('{extra}', numFmt.format(extraVal))}
                      </span>
                    );
                  }
                  return null;
                })()}
                {fieldErrors.millas && <span className="field-error">{fieldErrors.millas}</span>}
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="sticker-nota">
                  {t('nextService.noteLabel')}
                </label>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{nota.length}/120</span>
              </div>
              <input
                type="text"
                id="sticker-nota"
                className={`form-input ${fieldErrors.nota ? 'form-input-error' : ''}`}
                value={nota}
                maxLength={120}
                placeholder={t('nextService.notePlaceholder')}
                onChange={handleInputChange(setNota)}
                disabled={saving}
              />
              {fieldErrors.nota && <span className="field-error">{fieldErrors.nota}</span>}
              {/* En la etiqueta de 62 mm caben unos 64 caracteres a 6 pt; lo demás se achica o se corta con «…». */}
              {!isTechnician && nota.length > STICKER_NOTE_COMFORT && (
                <span className="field-hint">{t('nextService.noteLongHint')}</span>
              )}
            </div>

            {/* Selector de idioma del sticker (solo modo administración) */}
            {!isTechnician && (
              <div className="form-group">
                <label className="form-label" htmlFor="sticker-language">
                  {t('nextService.stickerLanguageLabel')}
                </label>
                <select
                  id="sticker-language"
                  className="form-input form-select"
                  value={stickerLanguage}
                  onChange={(e) => setStickerLanguage(e.target.value as 'es' | 'en')}
                  disabled={saving}
                >
                  <option value="es">{t('nextService.languageEs')}</option>
                  <option value="en">{t('nextService.languageEn')}</option>
                </select>
                <span className="field-hint">{t('nextService.stickerLanguageHint')}</span>
              </div>
            )}
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>

            {isTechnician ? (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
                id="btn-suggest-service"
              >
                <Send size={14} /> {saving ? t('common.loading') : t('nextService.sendSuggestion')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => void executeAction(false)}
                  id="btn-save-service"
                >
                  {saving ? t('common.loading') : t('common.save')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => void executeAction(true)}
                  id="btn-save-and-print-service"
                >
                  <Printer size={14} /> {saving ? t('common.loading') : t('nextService.saveAndPrint')}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
