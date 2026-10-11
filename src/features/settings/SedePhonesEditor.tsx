import { Building2, MessageCircle, Phone, Plus, Smartphone, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { SedeTelefono, SedeTelefonoTipo } from '../../types/database';
import { EMPTY_PHONE } from './sedePhones';

/**
 * Los teléfonos de contacto de la sede, cada uno con su tipo (oficina o celular),
 * descripción que el taller quiere que lea el cliente ("English", "Spanish", "Office"),
 * y si atiende WhatsApp. Al crear la sede y en su tarjeta de Configuración.
 */
export default function SedePhonesEditor({
  value,
  onChange,
}: {
  value: SedeTelefono[];
  onChange: (phones: SedeTelefono[]) => void;
}) {
  const { t } = useLanguage();

  const update = <K extends keyof SedeTelefono>(index: number, field: K, val: SedeTelefono[K]) =>
    onChange(value.map((phone, i) => (i === index ? { ...phone, [field]: val } : phone)));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        background: 'var(--color-bg-secondary)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
          <Phone size={12} /> {t('settings.phones')}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...value, EMPTY_PHONE])}>
          <Plus size={14} /> {t('settings.addPhone')}
        </button>
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('settings.phonesHint')}</div>

      {value.length === 0 ? (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
          {t('settings.noPhones')}
        </div>
      ) : (
        value.map((phone, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              padding: 'var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-surface-border)',
              background: 'var(--color-bg-primary)',
            }}
          >
            {/* Renglón 1: tipo (con ícono) y descripción */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {phone.tipo === 'oficina' ? (
                  <Building2 size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                ) : (
                  <Smartphone size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                )}
                <select
                  className="form-select"
                  aria-label={t('settings.phoneType')}
                  value={phone.tipo}
                  onChange={(e) => update(i, 'tipo', e.target.value as SedeTelefonoTipo)}
                  style={{ width: 'auto', minWidth: 100 }}
                >
                  <option value="celular">{t('settings.phoneTypeMobile')}</option>
                  <option value="oficina">{t('settings.phoneTypeOffice')}</option>
                </select>
              </div>
              <input
                className="form-input"
                style={{ flex: 1, minWidth: 140 }}
                placeholder={t('settings.phoneLabelPlaceholder')}
                aria-label={t('settings.phoneLabelPlaceholder')}
                value={phone.label}
                onChange={(e) => update(i, 'label', e.target.value)}
              />
            </div>

            {/* Renglón 2: número (type="tel"), checkbox WhatsApp, botón borrar */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="form-input"
                style={{ flex: 1, minWidth: 140 }}
                type="tel"
                placeholder={t('settings.phonePlaceholder')}
                aria-label={t('settings.phonePlaceholder')}
                value={phone.numero}
                onChange={(e) => update(i, 'numero', e.target.value)}
              />
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  type="checkbox"
                  checked={phone.whatsapp}
                  onChange={(e) => update(i, 'whatsapp', e.target.checked)}
                />
                <MessageCircle size={14} style={{ color: 'var(--color-success)' }} />
                {t('settings.phoneWhatsapp')}
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                title={t('common.delete')}
                aria-label={t('common.delete')}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                style={{ color: 'var(--color-danger)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
