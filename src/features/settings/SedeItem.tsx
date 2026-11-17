import {
  Building2,
  Camera,
  Check,
  LogIn,
  Mail,
  MapPin,
  Palette,
  Percent,
  Phone,
  Trash2,
  Users,
} from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { sedePhoneLine } from '../../lib/phone';
import type { Sede, SedeTelefono, UserProfile } from '../../types/database';
import SedePhonesEditor from './SedePhonesEditor';

export interface SedeBrandDraft {
  nombre: string;
  direccion: string;
  color_tema: string;
  email_contacto: string;
  telefonos: SedeTelefono[];
}

interface SedeItemProps {
  sede: Sede;
  sedeUsers: UserProfile[];
  currentUserSedeId?: string;
  isAdmin: boolean;
  brandDraft: SedeBrandDraft | undefined;
  capacityDraft: string | undefined;
  rateDraft: string | undefined;
  ratePerHourDraft: string | undefined;
  invalidName: boolean;
  uploadingLogo: boolean;
  saving: boolean;
  joining: boolean;
  onLogoClick: (sedeId: string) => void;
  onDeleteClick: (sede: Sede) => void;
  onBrandChange: (sedeId: string, patch: Partial<SedeBrandDraft>) => void;
  onSaveBranding: (sedeId: string) => void;
  onCapacityChange: (sedeId: string, value: string) => void;
  onRateChange: (sedeId: string, value: string) => void;
  onRatePerHourChange: (sedeId: string, value: string) => void;
  onSaveOperations: (sedeId: string) => void;
  onJoinSede: (sede: Sede) => void;
}

export default function SedeItem({
  sede,
  sedeUsers,
  currentUserSedeId,
  isAdmin,
  brandDraft,
  capacityDraft,
  rateDraft,
  ratePerHourDraft,
  invalidName,
  uploadingLogo,
  saving,
  joining,
  onLogoClick,
  onDeleteClick,
  onBrandChange,
  onSaveBranding,
  onCapacityChange,
  onRateChange,
  onRatePerHourChange,
  onSaveOperations,
  onJoinSede,
}: SedeItemProps) {
  const { t } = useLanguage();

  return (
    <div
      style={{
        padding: 'var(--space-5)',
        background: 'var(--color-bg-tertiary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <button
          type="button"
          className="sede-logo-btn"
          onClick={() => onLogoClick(sede.id)}
          title={t('settings.changeLogo')}
          disabled={uploadingLogo}
        >
          {sede.logo_url ? (
            <img src={sede.logo_url} alt={sede.nombre} />
          ) : (
            <Building2 size={20} style={{ color: 'var(--color-text-tertiary)' }} />
          )}
          <span className="sede-logo-overlay">
            {uploadingLogo ? '…' : <Camera size={14} />}
          </span>
        </button>
        <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, flex: 1, minWidth: 0 }}>
          {sede.nombre}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          title={t('common.delete')}
          onClick={() => onDeleteClick(sede)}
        >
          <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
          <Phone size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            {sede.telefonos && sede.telefonos.length > 0
              ? sede.telefonos
                  .map((p) =>
                    sedePhoneLine(
                      p,
                      p.tipo === 'celular' ? t('settings.phoneTypeMobile') : t('settings.phoneTypeOffice')
                    )
                  )
                  .join(' · ')
              : (sede.telefono || '—')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          <Users size={14} /> {t('settings.employeesCount').replace('{n}', String(sedeUsers.length))}
        </div>
      </div>

      {/* Branding: name, address, contact info and accent colour */}
      <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <input
          className="form-input"
          placeholder={t('common.name')}
          aria-invalid={invalidName || undefined}
          value={brandDraft?.nombre ?? ''}
          onChange={(e) => onBrandChange(sede.id, { nombre: e.target.value })}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <MapPin size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <input
            className="form-input"
            placeholder={t('common.address')}
            value={brandDraft?.direccion ?? ''}
            onChange={(e) => onBrandChange(sede.id, { direccion: e.target.value })}
          />
        </div>
        {/* Contacto que usan los correos y el reporte del cliente. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Mail size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <input
            className="form-input"
            type="email"
            placeholder={t('settings.contactEmail')}
            aria-label={t('settings.contactEmail')}
            value={brandDraft?.email_contacto ?? ''}
            onChange={(e) => onBrandChange(sede.id, { email_contacto: e.target.value })}
          />
        </div>

        <SedePhonesEditor
          value={brandDraft?.telefonos ?? []}
          onChange={(telefonos) => onBrandChange(sede.id, { telefonos })}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Palette size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <input
            type="color"
            className="color-input"
            value={brandDraft?.color_tema ?? '#EBC334'}
            onChange={(e) => onBrandChange(sede.id, { color_tema: e.target.value })}
            title={t('settings.themeColor')}
            aria-label={t('settings.themeColor')}
          />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
            {brandDraft?.color_tema}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => onSaveBranding(sede.id)}
            disabled={saving}
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <label htmlFor={`sede-capacity-${sede.id}`} style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
              {t('settings.capacity')}
            </label>
            <input
              id={`sede-capacity-${sede.id}`}
              className="form-input"
              type="number"
              min={1}
              style={{ width: 80 }}
              value={capacityDraft ?? ''}
              onChange={(e) => onCapacityChange(sede.id, e.target.value)}
            />
          </div>
          {/* The commission rate decides what every technician in
              this workshop is paid, so it lives with the other
              things only an admin can set. */}
          <div>
            <label htmlFor={`sede-rate-${sede.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
              <Percent size={12} /> {t('payroll.commissionRate')}
            </label>
            <input
              id={`sede-rate-${sede.id}`}
              className="form-input"
              type="number"
              min={0}
              max={100}
              step="0.5"
              style={{ width: 90 }}
              value={rateDraft ?? ''}
              onChange={(e) => onRateChange(sede.id, e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`sede-hourly-${sede.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
              {t('settings.hourlyRateReference')}
            </label>
            <input
              id={`sede-hourly-${sede.id}`}
              className="form-input"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              style={{ width: 100 }}
              value={ratePerHourDraft ?? ''}
              onChange={(e) => onRatePerHourChange(sede.id, e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onSaveOperations(sede.id)}
            disabled={
              saving ||
              (capacityDraft === String(sede.capacidad) &&
                rateDraft === String(sede.comision_porcentaje ?? 35) &&
                (ratePerHourDraft ?? '') === (sede.tarifa_hora != null ? String(sede.tarifa_hora) : ''))
            }
          >
            {saving ? t('common.loading') : t('common.update')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
        {sedeUsers.map((u) => (
          <div
            key={u.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              background: 'var(--color-bg-hover)',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {u.nombre_completo.split(' ')[0]} · <span>{t(`employees.roles.${u.rol}`)}</span>
          </div>
        ))}
      </div>

      {/* The admin's own membership: which roster they appear on. */}
      {currentUserSedeId === sede.id ? (
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 'var(--space-3)', fontSize: 'var(--font-size-xs)',
            color: 'var(--color-success)', fontWeight: 600,
          }}
        >
          <Check size={14} /> {t('settings.mySede')}
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => onJoinSede(sede)}
          disabled={joining}
          title={t('settings.joinSedeHint')}
        >
          <LogIn size={14} />
          {joining ? t('common.loading') : t('settings.joinSede')}
        </button>
      )}
    </div>
  );
}
