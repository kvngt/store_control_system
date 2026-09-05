import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { supabaseService } from '../services/supabaseService';
import { getErrorMessage } from '../lib/errors';
import { Search, Plus, Edit3, Trash2, X, Wand2, Loader2, ScanLine } from 'lucide-react';
import {
  VEHICLE_BRANDS,
  VEHICLE_COLORS,
  US_STATES,
  checkUsPlate,
  checkVin,
  decodeVin,
  fetchModelsForMake,
  localModelsForMake,
  normalizeVin,
  vinModelYear,
  yearOptions,
} from '../lib/vin';
import type { DecodedVin } from '../lib/vin';
import Combobox from '../components/Combobox';
import CustomerPicker from '../components/CustomerPicker';
import type { NewCustomerDraft } from '../components/CustomerPicker';
import type { Vehicle, Customer } from '../types/database';

const EMPTY_FORM = {
  cliente_id: '', marca: '', modelo: '', anio: '', vin: '', placa: '', placa_estado: '', color: '',
  // Auction units arrive with no plate at all. Kept as an explicit flag rather
  // than inferred from an empty field, so "not filled in yet" and "this vehicle
  // genuinely has no plate" stay distinguishable while the form is open.
  sin_placa: false,
};

export default function Vehicles() {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const isAdmin = user?.rol === 'admin';
  // Strict isolation: only ever the active sede's vehicles and customers.
  const sedeId = isAdmin ? currentSede?.id : user?.sede_id;
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [decodingVin, setDecodingVin] = useState(false);
  const [vinMessage, setVinMessage] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [decoded, setDecoded] = useState<DecodedVin | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // VINs already looked up in this modal, so re-renders and edits of unrelated
  // fields don't fire the same request again.
  const decodedVinRef = useRef('');

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([supabaseService.getVehicles(sedeId), supabaseService.getCustomers(sedeId)])
      .then(([v, c]) => {
        setVehicles(v);
        setCustomers(c);
      })
      .catch((err) => setError(getErrorMessage(err, language)))
      .finally(() => setLoading(false));
  }, [language, sedeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    if (!search) return vehicles;

    // Bolt: Skip expensive string checks if search is empty
    const searchLower = search.toLowerCase();
    return vehicles.filter(
      (v) =>
        v.marca.toLowerCase().includes(searchLower) ||
        v.modelo.toLowerCase().includes(searchLower) ||
        v.vin.toLowerCase().includes(searchLower) ||
        (v.placa || '').toLowerCase().includes(searchLower) ||
        (v.cliente_nombre || '').toLowerCase().includes(searchLower)
    );
  }, [vehicles, search]);

  const resetModalState = () => {
    setVinMessage(null);
    setDecoded(null);
    setModelOptions([]);
    setTouched(false);
    decodedVinRef.current = '';
  };

  const openCreateModal = () => {
    setSelected(null);
    setForm(EMPTY_FORM);
    resetModalState();
    setShowModal(true);
  };

  const openEditModal = (v: Vehicle) => {
    setSelected(v);
    setForm({
      cliente_id: v.cliente_id,
      marca: v.marca,
      modelo: v.modelo,
      anio: String(v.anio),
      vin: v.vin,
      placa: v.placa || '',
      placa_estado: v.placa_estado || '',
      color: v.color,
      sin_placa: !v.placa,
    });
    resetModalState();
    // The stored VIN is already decoded data — don't re-fetch and overwrite
    // corrections the shop made by hand.
    decodedVinRef.current = normalizeVin(v.vin);
    setShowModal(true);
  };

  // ===== VIN =====
  const vinCheck = checkVin(form.vin);
  const vinLooksComplete = vinCheck.level !== 'error';

  const runDecode = useCallback(async (vin: string, signal?: AbortSignal) => {
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
      setForm((prev) => ({
        ...prev,
        marca: result.marca || prev.marca,
        modelo: result.modelo || prev.modelo,
        anio: result.anio || prev.anio,
      }));
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
      // is never replaced (the user deleted a character) would otherwise leave
      // the button stuck on "looking up".
      setDecodingVin(false);
    }
  }, [t]);

  // Decode as soon as a full VIN is on screen — scanning or typing the VIN is
  // the fastest path to a complete record, so it shouldn't need a second click.
  useEffect(() => {
    if (!showModal) return;
    const clean = normalizeVin(form.vin);
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
  }, [form.vin, showModal, runDecode]);

  // Year the VIN itself encodes; shown when it contradicts what's in the form.
  const vinYear = useMemo(
    () => (normalizeVin(form.vin).length === 17 ? vinModelYear(form.vin) : null),
    [form.vin]
  );

  // ===== Model suggestions for the chosen brand =====
  useEffect(() => {
    const make = form.marca.trim();
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
  }, [form.marca]);

  // ===== Plate =====
  const plateCheck = checkUsPlate(form.placa, form.placa_estado || undefined);
  const plateMessage = form.sin_placa ? null : form.placa.trim()
    ? plateCheck.problem === 'CHARSET' ? { kind: 'err' as const, text: t('vehicles.plateCharset') }
      : plateCheck.problem === 'LENGTH' ? { kind: 'err' as const, text: t('vehicles.plateLength') }
      : plateCheck.problem === 'UNUSUAL' ? { kind: 'warn' as const, text: t('vehicles.plateUnusual') }
      : { kind: 'ok' as const, text: t('vehicles.plateOk') }
    : null;

  const colorOptions = VEHICLE_COLORS[language] || VEHICLE_COLORS.en;

  // ===== Save =====
  const invalid = {
    cliente_id: !form.cliente_id,
    marca: !form.marca.trim(),
    modelo: !form.modelo.trim(),
    anio: !form.anio,
    vin: vinCheck.level === 'error',
    placa: !form.sin_placa && (!form.placa.trim() || plateCheck.level === 'error'),
  };
  const hasErrors = Object.values(invalid).some(Boolean);

  const handleCreateCustomer = async (draft: NewCustomerDraft): Promise<Customer> => {
    const created = await supabaseService.createCustomer({
      ...draft,
      direccion: '',
      notas_crm: '',
      sede_id: sedeId || currentSede?.id || '',
    });
    // Make it selectable straight away instead of waiting for a full reload.
    setCustomers((prev) => [created, ...prev]);
    return created;
  };

  const handleSave = async () => {
    setTouched(true);
    if (hasErrors) return;
    setSaving(true);
    try {
      const payload = {
        cliente_id: form.cliente_id,
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        anio: parseInt(form.anio, 10) || new Date().getFullYear(),
        vin: vinCheck.normalized,
        // NULL, never "SIN PLACA" or an empty string: a placeholder would show
        // up in search and print on the work order as if it were a real plate.
        placa: form.sin_placa ? null : plateCheck.normalized,
        placa_estado: form.sin_placa ? null : form.placa_estado || null,
        color: form.color.trim(),
      };
      if (selected) {
        await supabaseService.updateVehicle(selected.id, payload);
      } else {
        await supabaseService.createVehicle(payload);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  // Deleting a vehicle destroys its service history, so it is reserved for
  // admins. The `vehiculos_delete` RLS policy is the boundary that actually
  // holds; this check only keeps the UI honest about it.
  const handleDelete = async (v: Vehicle) => {
    if (!isAdmin) {
      setError(t('common.adminOnly'));
      return;
    }
    if (!confirm(`${t('common.delete')}: ${v.marca} ${v.modelo}?`)) return;
    try {
      await supabaseService.deleteVehicle(v.id);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('vehicles.title')}</h1>
          <p className="page-subtitle">{filtered.length} {t('common.results')}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal} id="new-vehicle-btn">
          <Plus size={18} /> {t('vehicles.newVehicle')}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div style={{ marginBottom: 'var(--space-4)', position: 'relative', maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
        <input className="form-input" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : (
        <div className="table-container cards-on-mobile animate-fade-in">
          <table className="table">
            <thead>
              <tr>
                <th>{t('vehicles.brand')} / {t('vehicles.model')}</th>
                <th>{t('vehicles.year')}</th>
                <th>{t('vehicles.vin')}</th>
                <th>{t('vehicles.plate')}</th>
                <th>{t('vehicles.color')}</th>
                <th>{t('vehicles.owner')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td data-label={t('vehicles.brand')} style={{ fontWeight: 600 }}>{v.marca} {v.modelo}</td>
                  <td data-label={t('vehicles.year')}>{v.anio}</td>
                  <td data-label={t('vehicles.vin')} style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>{v.vin}</td>
                  <td data-label={t('vehicles.plate')}>
                    {v.placa ? (
                      <span className="badge badge-en_proceso">
                        {v.placa_estado ? `${v.placa_estado} · ${v.placa}` : v.placa}
                      </span>
                    ) : (
                      <span className="badge" style={{ color: 'var(--color-text-tertiary)' }}>
                        {t('vehicles.noPlate')}
                      </span>
                    )}
                  </td>
                  <td data-label={t('vehicles.color')}>{v.color}</td>
                  <td data-label={t('vehicles.owner')} style={{ color: 'var(--color-text-secondary)' }}>{v.cliente_nombre}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEditModal(v)}><Edit3 size={16} /></button>
                      {isAdmin && (
                        <button className="btn btn-ghost btn-sm btn-icon" title={t('common.delete')} style={{ color: 'var(--color-danger)' }} onClick={() => handleDelete(v)}><Trash2 size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{selected ? t('vehicles.editVehicle') : t('vehicles.newVehicle')}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {/* 1 — Owner: pick from the customers on file, or add one here. */}
              <div className="form-section">
                <div className="form-section-title">{t('vehicles.owner')}</div>
                <CustomerPicker
                  customers={customers}
                  value={form.cliente_id}
                  onChange={(id) => setForm((prev) => ({ ...prev, cliente_id: id }))}
                  onCreate={handleCreateCustomer}
                  invalid={touched && invalid.cliente_id}
                />
                {touched && invalid.cliente_id && (
                  <p className="field-hint field-hint-error">{t('vehicles.ownerRequired')}</p>
                )}
              </div>

              {/* 2 — VIN: fills in everything else it can. */}
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
                    value={form.vin}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, vin: normalizeVin(e.target.value) }));
                      setVinMessage(null);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => runDecode(vinCheck.normalized)}
                    disabled={decodingVin || !vinLooksComplete}
                    style={{ flexShrink: 0 }}
                  >
                    {decodingVin ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
                    {decodingVin ? t('vehicles.vinDecoding') : t('vehicles.decodeVin')}
                  </button>
                </div>

                {!form.vin.trim() && <p className="field-hint">{t('vehicles.vinHelp')}</p>}
                {form.vin.trim() && vinCheck.problem === 'LENGTH' && (
                  <p className={`field-hint${touched ? ' field-hint-error' : ''}`}>
                    {t('vehicles.vinLength')} ({normalizeVin(form.vin).length}/17)
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

              {/* 3 — What the VIN filled in, still editable by hand. */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="vehicle-brand">{t('vehicles.brand')}</label>
                  <Combobox
                    inputId="vehicle-brand"
                    value={form.marca}
                    onChange={(marca) => setForm((prev) => ({ ...prev, marca }))}
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
                    value={form.modelo}
                    onChange={(modelo) => setForm((prev) => ({ ...prev, modelo }))}
                    options={modelOptions}
                    loading={loadingModels}
                    placeholder={form.marca ? t('vehicles.modelFor').replace('{brand}', form.marca) : 'Camry, Civic, F-150...'}
                    emptyLabel={form.marca ? t('vehicles.freeTextHint') : t('vehicles.pickBrandFirst')}
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
                    value={form.anio}
                    onChange={(e) => setForm((prev) => ({ ...prev, anio: e.target.value }))}
                  >
                    <option value="">{t('vehicles.selectYear')}</option>
                    {yearOptions().map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  {vinYear && String(vinYear) !== form.anio && (
                    <button
                      type="button"
                      className="field-hint field-hint-link"
                      onClick={() => setForm((prev) => ({ ...prev, anio: String(vinYear) }))}
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
                    value={form.color}
                    onChange={(color) => setForm((prev) => ({ ...prev, color }))}
                    options={colorOptions}
                    placeholder={colorOptions.slice(0, 3).join(', ')}
                    emptyLabel={t('vehicles.freeTextHint')}
                  />
                  <p className="field-hint">{t('vehicles.colorNotInVin')}</p>
                </div>
              </div>

              {/* 4 — Plate, checked against the issuing state. Auction units
                     have none, so the whole block can be switched off. */}
              <label className="checkbox-row" htmlFor="vehicle-no-plate">
                <input
                  type="checkbox"
                  id="vehicle-no-plate"
                  checked={form.sin_placa}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      sin_placa: e.target.checked,
                      // Drop whatever was typed, so an unchecked-then-rechecked
                      // box can't leave a stale plate behind on save.
                      placa: e.target.checked ? '' : prev.placa,
                      placa_estado: e.target.checked ? '' : prev.placa_estado,
                    }))
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
                    disabled={form.sin_placa}
                    value={form.placa_estado}
                    onChange={(e) => setForm((prev) => ({ ...prev, placa_estado: e.target.value }))}
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
                    placeholder={form.sin_placa ? t('vehicles.noPlate') : 'ABC1234'}
                    maxLength={10}
                    autoComplete="off"
                    disabled={form.sin_placa}
                    value={form.placa}
                    onChange={(e) => setForm((prev) => ({ ...prev, placa: e.target.value.toUpperCase() }))}
                  />
                  {plateMessage && (
                    <p className={`field-hint field-hint-${plateMessage.kind === 'ok' ? 'ok' : plateMessage.kind === 'warn' ? 'warn' : 'error'}`}>
                      {plateMessage.text}
                    </p>
                  )}
                  {touched && !form.sin_placa && !form.placa.trim() && (
                    <p className="field-hint field-hint-error">{t('vehicles.plateRequired')}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} id="vehicle-save">
                {saving ? t('common.loading') : selected ? t('common.update') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
