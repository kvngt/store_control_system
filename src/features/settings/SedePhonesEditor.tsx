import { Phone, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { SedeTelefono } from '../../types/database';
import { EMPTY_PHONE } from './sedePhones';

/**
 * Los teléfonos de contacto de la sede, cada uno con la descripción que el taller quiere que lea
 * el cliente ("English", "Spanish", "Office"). Al crear la sede y en su tarjeta de Configuración.
 */
export default function SedePhonesEditor({
  value,
  onChange,
}: {
  value: SedeTelefono[];
  onChange: (phones: SedeTelefono[]) => void;
}) {
  const { t } = useLanguage();

  const update = (index: number, field: keyof SedeTelefono, text: string) =>
    onChange(value.map((phone, i) => (i === index ? { ...phone, [field]: text } : phone)));

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
          <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <input
              className="form-input"
              style={{ width: '40%', minWidth: 90 }}
              placeholder={t('settings.phoneLabelPlaceholder')}
              aria-label={t('settings.phoneLabelPlaceholder')}
              value={phone.label}
              onChange={(e) => update(i, 'label', e.target.value)}
            />
            <input
              className="form-input"
              style={{ flex: 1, minWidth: 110 }}
              type="tel"
              placeholder={t('settings.phonePlaceholder')}
              aria-label={t('settings.phonePlaceholder')}
              value={phone.numero}
              onChange={(e) => update(i, 'numero', e.target.value)}
            />
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
        ))
      )}
    </div>
  );
}
