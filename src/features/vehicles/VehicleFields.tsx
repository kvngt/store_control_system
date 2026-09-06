import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ScanLine, Wand2 } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import Combobox from '../../components/Combobox';
import {
  US_STATES,
  VEHICLE_BRANDS,
  VEHICLE_COLORS,
  checkUsPlate,
  checkVin,
  decodeVin,
  fetchModelsForMake,
  localModelsForMake,
  normalizeVin,
  vinModelYear,
  yearOptions,
} from '../../lib/vin';
import type { DecodedVin } from '../../lib/vin';
import { validateVehicleFields } from './vehicleForm';
import type { VehicleFieldValues } from './vehicleForm';

interface VehicleFieldsProps {
  value: VehicleFieldValues;
  onChange: (next: VehicleFieldValues) => void;
  /** Show validation messages. Set once the user has tried to submit. */
  touched?: boolean;
  /**
   * Whether the year and plate are required. The Vehículos screen insists on
   * both; the order intake is more forgiving, because a car on a lift is worth
   * registering even if nobody has walked out to read the plate yet.
   */
  requirePlate?: boolean;
  /** Set true while the form is inside a modal that is being submitted. */
  disabled?: boolean;
  /** Rendered under the whole block; used for the "back to existing" link. */
  footer?: React.ReactNode;
}

/**
 * The VIN-first vehicle form.
 *
 * Extracted from the Vehículos screen because the "nueva orden" dialog had
 * grown its own, much poorer copy: four bare text inputs, no VIN lookup, no
 * plate checking, no brand/model suggestions. Registering a car during intake —
 * which is when it actually happens, with the customer standing there — was
 * therefore strictly worse than registering it later from the fleet screen.
 * One component, so the two can no longer drift apart.
 *
 * Controlled: the parent owns the values, because in one case they live in a
 * `useState` object and in the other inside React Hook Form.
 */
export default function VehicleFields({
  value,
  onChange,
  touched = false,
  requirePlate = true,
  disabled = false,
  footer,
}: VehicleFieldsProps) {
  const { t, language } = useLanguage();

  const [decodingVin, setDecodingVin] = useState(false);
  const [vinMessage, setVinMessage] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [decoded, setDecoded] = useState<DecodedVin | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // VINs already looked up, so re-renders and edits of unrelated fields don't
  // fire the same request again — and so an edit of a saved vehicle doesn't
  // overwrite corrections the shop made by hand.
  const decodedVinRef = useRef('');

  // `onChange` is usually an inline arrow, so depending on it directly would
  // re-run the decode effect on every keystroke anywhere in the parent.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  const set = useCallback((patch: Partial<VehicleFieldValues>) => {
    onChangeRef.current({ ...valueRef.current, ...patch });
  }, []);

  const vinCheck = checkVin(value.vin);
  const vinLooksComplete = vinCheck.level !== 'error';
  const invalid = validateVehicleFields(value, { requirePlate });

  const runDecode = useCallback(
    async (vin: string, signal?: AbortSignal) => {
      setDecodingVin(true);
      setVinMessage(null);
      try {
        const result = await decodeVin(vin, signal);
        if (signal?.aborted) return;
        if (!result) {
          setDecoded(null);
          setVinMessage({ kind: 'err', text: t('vehicles.vinNotFound') });
          return;
        }
        setDecoded(result);
        // Only fills gaps and corrects blanks — never clobbers a field the
        // decode has nothing to say about.
        set({
          marca: result.marca || valueRef.current.marca,
          modelo: result.modelo || valueRef.current.modelo,
          anio: result.anio || valueRef.current.anio,
        });
        setVinMessage({ kind: 'ok', text: t('vehicles.vinDecoded') });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const code = (err as Error).message;
        setDecoded(null);
        setVinMessage({
          kind: 'err',
          text:
            code === 'LENGTH' ? t('vehicles.vinLength')
            : code === 'CHARSET' ? t('vehicles.vinCharset')
            : t('vehicles.vinError'),
        });
      } finally {
        // Always clear the spinner, even on an abort: a superseded lookup that
        // is never replaced (the user deleted a character) would otherwise
        // leave the button stuck on "looking up".
        setDecodingVin(false);
      }
    },
    [set, t]
  );

  // Decode as soon as a full VIN is on screen — scanning or typing the VIN is
  // the fastest path to a complete record, so it shouldn't need a second click.
  useEffect(() => {
    const clean = normalizeVin(value.vin);
    if (clean.length !== 17 || checkVin(clean).level === 'error') return;
    if (decodedVinRef.current === clean) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      decodedVinRef.current = clean;
      runDecode(clean, controller.signal);
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value.vin, runDecode]);

  // Year the VIN itself encodes; offered when it contradicts the form.
  const vinYear = useMemo(
    () => (normalizeVin(value.vin).length === 17 ? vinModelYear(value.vin) : null),
    [value.vin]
  );

  // ===== Model suggestions for the chosen brand =====
  useEffect(() => {
    const make = value.marca.trim();
    if (!make) {
      setModelOptions([]);
      return;
    }
    // Show what we know offline immediately; the API only ever adds to it.
    setModelOptions(localModelsForMake(make));

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoadingModels(true);
      fetchModelsForMake(make, controller.signal)
        .then((models) => {
          if (!controller.signal.aborted) setModelOptions(models);
        })
        .catch(() => { /* offline: the local list stands */ })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingModels(false);
        });
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
      setLoadingModels(false);
    };
  }, [value.marca]);

  const plateCheck = checkUsPlate(value.placa, value.placa_estado || undefined);
  const plateMessage = value.sin_placa
    ? null
    : value.placa.trim()
      ? plateCheck.problem === 'CHARSET' ? { kind: 'err' as const, text: t('vehicles.plateCharset') }
        : plateCheck.problem === 'LENGTH' ? { kind: 'err' as const, text: t('vehicles.plateLength') }
        : plateCheck.problem === 'UNUSUAL' ? { kind: 'warn' as const, text: t('vehicles.plateUnusual') }
        : { kind: 'ok' as const, text: t('vehicles.plateOk') }
      : null;

  const colorOptions = VEHICLE_COLORS[language] || VEHICLE_COLORS.en;

  return (
    <>
      {/* VIN first: it fills in everything else it can. */}
      <div className="form-section">
        <div className="form-section-title">
          <ScanLine size={15} /> {t('vehicles.vin')}
        </div>
        <div className="vin-row">
          <input
            className={`form-input vin-input${touched && invalid.vin ? ' is-invalid' : ''}`}
            id="vehicle-vin"
            placeholder="1HGCM82633A004352"
            maxLength={17}
            autoComplete="off"
            disabled={disabled}
            value={value.vin}
            onChange={(e) => {
              set({ vin: normalizeVin(e.target.value) });
              setVinMessage(null);
            }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => runDecode(vinCheck.normalized)}
            disabled={disabled || decodingVin || !vinLooksComplete}
            style={{ flexShrink: 0 }}
          >
            {decodingVin ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
            {decodingVin ? t('vehicles.vinDecoding') : t('vehicles.decodeVin')}
          </button>
        </div>

        {!value.vin.trim() && <p className="field-hint">{t('vehicles.vinHelp')}</p>}
        {value.vin.trim() && vinCheck.problem === 'LENGTH' && (
          <p className={`field-hint${touched ? ' field-hint-error' : ''}`}>
            {t('vehicles.vinLength')} ({normalizeVin(value.vin).length}/17)
          </p>
        )}
        {vinCheck.problem === 'CHARSET' && (
          <p className="field-hint field-hint-error">{t('vehicles.vinCharset')}</p>
        )}
        {vinCheck.problem === 'CHECKSUM' && (
          <p className="field-hint field-hint-warn">{t('vehicles.vinChecksum')}</p>
        )}
        {vinMessage && (
          <p className={`field-hint field-hint-${vinMessage.kind === 'ok' ? 'ok' : vinMessage.kind === 'warn' ? 'warn' : 'error'}`}>
            {vinMessage.text}
          </p>
        )}

        {decoded && decoded.detalles.length > 0 && (
          <div className="vin-details">
            {decoded.detalles.map((d) => (
              <span className="vin-chip" key={d.etiqueta}>
                <strong>{t(`vehicles.vinFields.${d.etiqueta}`)}</strong> {d.valor}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* What the VIN filled in, still editable by hand. */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="vehicle-brand">{t('vehicles.brand')}</label>
          <Combobox
            inputId="vehicle-brand"
            value={value.marca}
            onChange={(marca) => set({ marca })}
            options={VEHICLE_BRANDS}
            placeholder="Toyota, Honda, Ford..."
            emptyLabel={t('vehicles.freeTextHint')}
          />
          {touched && invalid.marca && (
            <p className="field-hint field-hint-error">{t('vehicles.brandRequired')}</p>
          )}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="vehicle-model">{t('vehicles.model')}</label>
          <Combobox
            inputId="vehicle-model"
            value={value.modelo}
            onChange={(modelo) => set({ modelo })}
            options={modelOptions}
            loading={loadingModels}
            placeholder={value.marca ? t('vehicles.modelFor').replace('{brand}', value.marca) : 'Camry, Civic, F-150...'}
            emptyLabel={value.marca ? t('vehicles.freeTextHint') : t('vehicles.pickBrandFirst')}
          />
          {touched && invalid.modelo && (
            <p className="field-hint field-hint-error">{t('vehicles.modelRequired')}</p>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="vehicle-year">{t('vehicles.year')}</label>
          <select
            className={`form-input form-select${touched && invalid.anio ? ' is-invalid' : ''}`}
            id="vehicle-year"
            disabled={disabled}
            value={value.anio}
            onChange={(e) => set({ anio: e.target.value })}
          >
            <option value="">{t('vehicles.selectYear')}</option>
            {yearOptions().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {vinYear && String(vinYear) !== value.anio && (
            <button
              type="button"
              className="field-hint field-hint-link"
              onClick={() => set({ anio: String(vinYear) })}
            >
              {t('vehicles.vinYearGuess').replace('{year}', String(vinYear))}
            </button>
          )}
          {touched && invalid.anio && (
            <p className="field-hint field-hint-error">{t('vehicles.yearRequired')}</p>
          )}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="vehicle-color">{t('vehicles.color')}</label>
          <Combobox
            inputId="vehicle-color"
            value={value.color}
            onChange={(color) => set({ color })}
            options={colorOptions}
            placeholder={colorOptions.slice(0, 3).join(', ')}
            emptyLabel={t('vehicles.freeTextHint')}
          />
          <p className="field-hint">{t('vehicles.colorNotInVin')}</p>
        </div>
      </div>

      {/* Plate, checked against the issuing state. Auction units have none, so
          the whole block can be switched off. */}
      <label className="checkbox-row" htmlFor="vehicle-no-plate">
        <input
          type="checkbox"
          id="vehicle-no-plate"
          disabled={disabled}
          checked={value.sin_placa}
          onChange={(e) =>
            set({
              sin_placa: e.target.checked,
              // Drop whatever was typed, so an unchecked-then-rechecked box
              // can't leave a stale plate behind on save.
              placa: e.target.checked ? '' : value.placa,
              placa_estado: e.target.checked ? '' : value.placa_estado,
            })
          }
        />
        <span>
          {t('vehicles.noPlate')}
          <span className="field-hint" style={{ display: 'block' }}>{t('vehicles.noPlateHint')}</span>
        </span>
      </label>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="vehicle-plate-state">{t('vehicles.plateState')}</label>
          <select
            className="form-input form-select"
            id="vehicle-plate-state"
            disabled={disabled || value.sin_placa}
            value={value.placa_estado}
            onChange={(e) => set({ placa_estado: e.target.value })}
          >
            <option value="">{t('vehicles.plateStateAny')}</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="vehicle-plate">{t('vehicles.plate')}</label>
          <input
            className={`form-input${touched && invalid.placa ? ' is-invalid' : ''}`}
            id="vehicle-plate"
            placeholder={value.sin_placa ? t('vehicles.noPlate') : 'ABC1234'}
            maxLength={10}
            autoComplete="off"
            disabled={disabled || value.sin_placa}
            value={value.placa}
            onChange={(e) => set({ placa: e.target.value.toUpperCase() })}
          />
          {plateMessage && (
            <p className={`field-hint field-hint-${plateMessage.kind === 'ok' ? 'ok' : plateMessage.kind === 'warn' ? 'warn' : 'error'}`}>
              {plateMessage.text}
            </p>
          )}
          {touched && requirePlate && !value.sin_placa && !value.placa.trim() && (
            <p className="field-hint field-hint-error">{t('vehicles.plateRequired')}</p>
          )}
        </div>
      </div>

      {footer}
    </>
  );
}
