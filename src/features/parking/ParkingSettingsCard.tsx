import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, ShieldCheck, UserCheck, Plus, Trash2, Save, Calculator } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { parkingService } from '../../services/parking.service';
import { sedesService } from '../../services/supabaseService';
import { emptyList } from '../../lib/emptyList';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import { money } from '../../lib/money';
import { daysFromTodayLocal, todayLocal } from '../../lib/dates';
import type { Sede } from '../../types/database';
import type { ParkingConfig, ParkingProfile, ParkingTier, ParkingPreview } from '../../types/domain/parking.types';

const DEFAULT_SEGURO_PROFILE: ParkingProfile = {
  habilitado: true,
  evento_inicio: 'ingreso',
  cobra_dia_evento: true,
  dias_gracia: 0,
  gracia_dias_habiles: false,
  tope_dias: null,
  tope_monto: null,
  tramos: [{ desde_dia: 1, tarifa_diaria: 0 }],
};

const DEFAULT_PARTICULAR_PROFILE: ParkingProfile = {
  habilitado: true,
  evento_inicio: 'lista_para_entregar',
  cobra_dia_evento: false,
  dias_gracia: 2,
  gracia_dias_habiles: false,
  tope_dias: null,
  tope_monto: null,
  tramos: [{ desde_dia: 1, tarifa_diaria: 0 }],
};

export default function ParkingSettingsCard() {
  const { t, language } = useLanguage();
  const { currentSede } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const sedesQuery = useQuery({
    queryKey: queryKeys.sedes(),
    queryFn: () => sedesService.getSedes(),
  });
  const sedes = sedesQuery.data ?? emptyList<Sede>();

  const [selectedSedeId, setSelectedSedeId] = useState<string>(() => currentSede?.id || '');

  // Keep selected sede in sync if sedes list loads later
  useEffect(() => {
    if (!selectedSedeId && (currentSede?.id || sedes[0]?.id)) {
      setSelectedSedeId(currentSede?.id || sedes[0]?.id || '');
    }
  }, [currentSede, sedes, selectedSedeId]);

  const configQuery = useQuery({
    queryKey: queryKeys.parkingConfig(selectedSedeId),
    queryFn: () => parkingService.getConfig(selectedSedeId),
    enabled: !!selectedSedeId,
  });

  // Local form state
  const [habilitado, setHabilitado] = useState(false);
  const [vigenteDesde, setVigenteDesde] = useState('');
  const [incluirOrdenesPrevias, setIncluirOrdenesPrevias] = useState(false);
  const [avisarCliente, setAvisarCliente] = useState(true);
  const [politicaEs, setPoliticaEs] = useState('');
  const [politicaEn, setPoliticaEn] = useState('');

  const [perfilSeguro, setPerfilSeguro] = useState<ParkingProfile>(DEFAULT_SEGURO_PROFILE);
  const [perfilParticular, setPerfilParticular] = useState<ParkingProfile>(DEFAULT_PARTICULAR_PROFILE);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sync form state when query data changes
  useEffect(() => {
    if (configQuery.data) {
      const data = configQuery.data;
      setHabilitado(data.habilitado);
      setVigenteDesde(data.vigente_desde ?? '');
      setIncluirOrdenesPrevias(data.incluir_ordenes_previas);
      setAvisarCliente(data.avisar_cliente);
      setPoliticaEs(data.politica_es ?? '');
      setPoliticaEn(data.politica_en ?? '');
      setPerfilSeguro(data.perfiles?.seguro ?? DEFAULT_SEGURO_PROFILE);
      setPerfilParticular(data.perfiles?.particular ?? DEFAULT_PARTICULAR_PROFILE);
    }
  }, [configQuery.data]);

  // Live preview test parameters
  const [previewTab, setPreviewTab] = useState<'seguro' | 'particular'>('particular');
  // Fechas locales (lib/dates): con toISOString, después de las 8 p. m. de Maryland ya era mañana.
  const todayIso = useMemo(() => todayLocal(), []);
  const tenDaysAgoIso = useMemo(() => daysFromTodayLocal(-10), []);
  // "Vigente desde" no puede ir para atrás (lo rechaza `guardar_config_parqueo`): encendido, la
  // fecha guardada se puede conservar o mover hacia adelante; al encender, desde hoy.
  const storedVigente = configQuery.data?.habilitado ? configQuery.data.vigente_desde : null;
  const minVigente = storedVigente && storedVigente < todayIso ? storedVigente : todayIso;

  const [previewEventDate, setPreviewEventDate] = useState(tenDaysAgoIso);
  const [previewEndDate, setPreviewEndDate] = useState(todayIso);
  const [previewResult, setPreviewResult] = useState<ParkingPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Debounced live preview calculation
  useEffect(() => {
    const activeProfile = previewTab === 'seguro' ? perfilSeguro : perfilParticular;
    if (!activeProfile.habilitado || activeProfile.tramos.length === 0) {
      setPreviewResult(null);
      return;
    }

    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const preview = await parkingService.getPreview(
          activeProfile,
          previewEventDate || null,
          previewEndDate || todayIso
        );
        setPreviewResult(preview);
      } catch {
        setPreviewResult(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [previewTab, perfilSeguro, perfilParticular, previewEventDate, previewEndDate, todayIso]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSedeId) return;
    setError('');
    setSaving(true);

    try {
      // Validations
      if (habilitado) {
        if (perfilSeguro.habilitado && (!perfilSeguro.tramos[0] || perfilSeguro.tramos[0].tarifa_diaria <= 0)) {
          throw new Error(t('parking.errors.firstTierInsurance'));
        }
        if (perfilParticular.habilitado && (!perfilParticular.tramos[0] || perfilParticular.tramos[0].tarifa_diaria <= 0)) {
          throw new Error(t('parking.errors.firstTierPrivate'));
        }
      }

      const payload: ParkingConfig = {
        sede_id: selectedSedeId,
        habilitado,
        vigente_desde: vigenteDesde.trim() || null,
        incluir_ordenes_previas: incluirOrdenesPrevias,
        avisar_cliente: avisarCliente,
        politica_es: politicaEs.trim() || null,
        politica_en: politicaEn.trim() || null,
        perfiles: {
          seguro: perfilSeguro,
          particular: perfilParticular,
        },
      };

      await parkingService.saveConfig(selectedSedeId, payload);
      showToast('success', t('parking.saveSuccess'));
      await queryClient.invalidateQueries({ queryKey: queryKeys.parkingConfig(selectedSedeId) });
    } catch (err) {
      const msg = getErrorMessage(err, language);
      setError(msg);
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const updateProfile = (type: 'seguro' | 'particular', updater: (prev: ParkingProfile) => ParkingProfile) => {
    if (type === 'seguro') setPerfilSeguro(updater);
    else setPerfilParticular(updater);
  };

  const addTier = (type: 'seguro' | 'particular') => {
    updateProfile(type, (prev) => {
      const lastTier = prev.tramos[prev.tramos.length - 1];
      const nextDay = lastTier ? lastTier.desde_dia + 1 : 1;
      return {
        ...prev,
        tramos: [...prev.tramos, { desde_dia: nextDay, tarifa_diaria: 0 }],
      };
    });
  };

  const removeTier = (type: 'seguro' | 'particular', index: number) => {
    updateProfile(type, (prev) => ({
      ...prev,
      tramos: prev.tramos.filter((_, i) => i !== index),
    }));
  };

  const updateTier = (type: 'seguro' | 'particular', index: number, updates: Partial<ParkingTier>) => {
    updateProfile(type, (prev) => {
      const nextTramos = prev.tramos.map((tier, i) => (i === index ? { ...tier, ...updates } : tier));
      return { ...prev, tramos: nextTramos };
    });
  };

  const renderProfileEditor = (type: 'seguro' | 'particular', profile: ParkingProfile) => {
    const isInsurance = type === 'seguro';
    const title = isInsurance ? t('parking.insuranceProfile') : t('parking.privateProfile');
    const Icon = isInsurance ? ShieldCheck : UserCheck;

    return (
      <div
        className="card"
        style={{
          padding: 'var(--space-4)',
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 'var(--radius-lg)',
          marginTop: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
            <Icon size={18} style={{ color: isInsurance ? 'var(--color-primary)' : 'var(--color-info)' }} />
            {title}
          </h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={profile.habilitado}
              onChange={(e) => updateProfile(type, (prev) => ({ ...prev, habilitado: e.target.checked }))}
              disabled={saving || !habilitado}
            />
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{t('parking.enabled')}</span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.startEvent')}</label>
            <select
              className="form-input form-select"
              value={profile.evento_inicio}
              onChange={(e) =>
                updateProfile(type, (prev) => ({
                  ...prev,
                  evento_inicio: e.target.value as 'ingreso' | 'lista_para_entregar',
                }))
              }
              disabled={saving || !profile.habilitado || !habilitado}
            >
              <option value="ingreso">{t('parking.eventIngreso')}</option>
              <option value="lista_para_entregar">{t('parking.eventListaParaEntregar')}</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.graceDays')}</label>
            <input
              type="number"
              min="0"
              max="365"
              className="form-input"
              value={profile.dias_gracia}
              onChange={(e) =>
                updateProfile(type, (prev) => ({
                  ...prev,
                  dias_gracia: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
              disabled={saving || !profile.habilitado || !habilitado}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.maxDays')}</label>
            <input
              type="number"
              min="1"
              placeholder="Sin tope"
              className="form-input"
              value={profile.tope_dias ?? ''}
              onChange={(e) =>
                updateProfile(type, (prev) => ({
                  ...prev,
                  tope_dias: e.target.value ? Math.max(1, parseInt(e.target.value, 10) || 1) : null,
                }))
              }
              disabled={saving || !profile.habilitado || !habilitado}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.maxAmount')}</label>
            <input
              type="number"
              step="0.01"
              min="1"
              placeholder="Sin tope"
              className="form-input"
              value={profile.tope_monto ?? ''}
              onChange={(e) =>
                updateProfile(type, (prev) => ({
                  ...prev,
                  tope_monto: e.target.value ? Math.max(1, parseFloat(e.target.value) || 1) : null,
                }))
              }
              disabled={saving || !profile.habilitado || !habilitado}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={profile.cobra_dia_evento}
              onChange={(e) => updateProfile(type, (prev) => ({ ...prev, cobra_dia_evento: e.target.checked }))}
              disabled={saving || !profile.habilitado || !habilitado}
            />
            <span style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.chargeEventDay')}</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={profile.gracia_dias_habiles}
              onChange={(e) => updateProfile(type, (prev) => ({ ...prev, gracia_dias_habiles: e.target.checked }))}
              disabled={saving || !profile.habilitado || !habilitado}
            />
            <span style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.businessDays')}</span>
          </label>
        </div>

        {/* Tramos de tarifa */}
        <div style={{ marginTop: 'var(--space-3)', borderTop: '1px solid var(--color-surface-border)', paddingTop: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{t('parking.tiers')}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => addTier(type)}
              disabled={saving || !profile.habilitado || !habilitado}
            >
              <Plus size={14} style={{ marginRight: 4 }} />
              {t('parking.addTier')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {profile.tramos.map((tier, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                {idx === 0 ? (
                  <span style={{ width: 140, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    {t('parking.fromDay').replace('{day}', '1')}
                  </span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', width: 140 }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Día:</span>
                    <input
                      type="number"
                      min="2"
                      className="form-input"
                      style={{ width: 80, padding: 'var(--space-1) var(--space-2)' }}
                      value={tier.desde_dia}
                      onChange={(e) => updateTier(type, idx, { desde_dia: Math.max(2, parseInt(e.target.value, 10) || 2) })}
                      disabled={saving || !profile.habilitado || !habilitado}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flex: 1 }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="form-input"
                    style={{ maxWidth: 140, padding: 'var(--space-1) var(--space-2)' }}
                    value={tier.tarifa_diaria}
                    onChange={(e) => updateTier(type, idx, { tarifa_diaria: Math.max(0, parseFloat(e.target.value) || 0) })}
                    disabled={saving || !profile.habilitado || !habilitado}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    {t('parking.perDay')}
                  </span>
                </div>

                {idx > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => removeTier(type, idx)}
                    disabled={saving || !profile.habilitado || !habilitado}
                    title={t('parking.removeTier')}
                  >
                    <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="card-header">
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Car size={18} /> {t('parking.title')}
        </h3>
        {sedes.length > 1 && (
          <select
            className="form-input form-select"
            style={{ maxWidth: 220 }}
            value={selectedSedeId}
            onChange={(e) => setSelectedSedeId(e.target.value)}
            disabled={saving}
          >
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {configQuery.isPending ? (
        <div className="loading-state">
          <div className="spinner" />
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ padding: 'var(--space-4)' }}>
          {error && <AlertError message={error} />}

          {/* Configuración general del módulo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={habilitado}
                onChange={(e) => {
                  setHabilitado(e.target.checked);
                  // Al encender, una fecha pasada la rechazaría la base: pasa a hoy.
                  if (e.target.checked && (!vigenteDesde || vigenteDesde < minVigente)) {
                    setVigenteDesde(todayIso);
                  }
                }}
                disabled={saving}
              />
              <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
                {t('parking.enableInWorkshop')}
              </span>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
                  {t('parking.effectiveFrom')}
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={vigenteDesde}
                  min={minVigente}
                  onChange={(e) => setVigenteDesde(e.target.value)}
                  disabled={saving || !habilitado}
                />
                <span style={{ display: 'block', marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  {t('parking.effectiveFromHint')}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={incluirOrdenesPrevias}
                    onChange={(e) => setIncluirOrdenesPrevias(e.target.checked)}
                    disabled={saving || !habilitado}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.includePrevious')}</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={avisarCliente}
                    onChange={(e) => setAvisarCliente(e.target.checked)}
                    disabled={saving || !habilitado}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.notifyCustomer')}</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
                  {t('parking.policyEs')}
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder={t('parking.policyPlaceholder')}
                  value={politicaEs}
                  onChange={(e) => setPoliticaEs(e.target.value)}
                  disabled={saving || !habilitado}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
                  {t('parking.policyEn')}
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder={t('parking.policyPlaceholder')}
                  value={politicaEn}
                  onChange={(e) => setPoliticaEn(e.target.value)}
                  disabled={saving || !habilitado}
                />
              </div>
            </div>
          </div>

          {/* Dos paneles de perfiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-4)' }}>
            {renderProfileEditor('seguro', perfilSeguro)}
            {renderProfileEditor('particular', perfilParticular)}
          </div>

          {/* Vista previa en vivo */}
          <div
            className="card"
            style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-4)',
              background: 'var(--color-bg-tertiary)',
              border: '1px dashed var(--color-surface-border)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                <Calculator size={16} />
                {t('parking.livePreview')}
              </h4>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${previewTab === 'particular' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPreviewTab('particular')}
                >
                  {t('parking.privateProfile')}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${previewTab === 'seguro' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPreviewTab('seguro')}
                >
                  {t('parking.insuranceProfile')}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.previewEventDate')}</label>
                <input
                  type="date"
                  className="form-input"
                  value={previewEventDate}
                  onChange={(e) => setPreviewEventDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('parking.previewUntil')}</label>
                <input
                  type="date"
                  className="form-input"
                  value={previewEndDate}
                  onChange={(e) => setPreviewEndDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              {previewLoading ? (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  {t('parking.previewCalculating')}
                </span>
              ) : previewResult ? (
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                  {t('parking.previewResult')
                    .replace('{eventDate}', previewEventDate)
                    .replace('{startDate}', previewResult.inicio ?? '—')
                    .replace('{days}', String(previewResult.dias))
                    .replace('{amount}', money(previewResult.monto))}
                  {previewResult.tope_aplicado && (
                    <span className="badge badge-warn" style={{ marginLeft: 'var(--space-2)' }}>
                      {t('parking.orderCard.capApplied')}
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  Sin cálculo disponible para estos parámetros.
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} style={{ marginRight: 'var(--space-2)' }} />
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
