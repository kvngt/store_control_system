import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, X, Check, Phone, Mail } from 'lucide-react';
import { useLanguage } from '../context/language.context';
import type { Customer } from '../types/database';

export interface NewCustomerDraft {
  nombre: string;
  telefono: string;
  email: string;
}

interface CustomerPickerProps {
  customers: Customer[];
  /** Selected `cliente_id`, or '' when nobody is picked yet. */
  value: string;
  onChange: (customerId: string) => void;
  /** Creates the customer and resolves with the stored row (id included). */
  onCreate: (draft: NewCustomerDraft) => Promise<Customer>;
  invalid?: boolean;
}

/**
 * Owner field for the vehicle form: search the customers already on file, or
 * add the customer right here. A car often arrives with someone who has never
 * been to the shop, and making the user abandon a half-typed vehicle to go
 * register the owner elsewhere is how intake data gets lost.
 */
export default function CustomerPicker({
  customers,
  value,
  onChange,
  onCreate,
  invalid = false,
}: CustomerPickerProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [draft, setDraft] = useState<NewCustomerDraft>({ nombre: '', telefono: '', email: '' });
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = customers.find((c) => c.id === value) || null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(needle) ||
          c.telefono.replace(/\D/g, '').includes(needle.replace(/\D/g, '')) ||
          c.email.toLowerCase().includes(needle)
      )
      .slice(0, 8);
  }, [customers, query]);

  useEffect(() => {
    if (!open || creating) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open, creating]);

  const startCreate = () => {
    // Whatever was typed to search is almost always the customer's name.
    setDraft({ nombre: query.trim(), telefono: '', email: '' });
    setCreateError('');
    setCreating(true);
    setOpen(true);
  };

  const cancelCreate = () => {
    setCreating(false);
    setCreateError('');
  };

  const submitCreate = async () => {
    if (!draft.nombre.trim() || !draft.telefono.trim()) {
      setCreateError(t('vehicles.ownerNameRequired'));
      return;
    }
    setSaving(true);
    setCreateError('');
    try {
      const created = await onCreate({
        nombre: draft.nombre.trim(),
        telefono: draft.telefono.trim(),
        email: draft.email.trim(),
      });
      onChange(created.id);
      setCreating(false);
      setOpen(false);
      setQuery('');
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (selected && !creating) {
    return (
      <div className={`owner-card${invalid ? ' is-invalid' : ''}`}>
        <div className="owner-card-avatar">
          {selected.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
        </div>
        <div className="owner-card-body">
          <div className="owner-card-name">{selected.nombre}</div>
          <div className="owner-card-meta">
            {selected.telefono && (
              <span><Phone size={12} /> {selected.telefono}</span>
            )}
            {selected.email && (
              <span><Mail size={12} /> {selected.email}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            onChange('');
            setQuery('');
            setOpen(true);
          }}
          id="vehicle-owner-change"
        >
          {t('vehicles.changeOwner')}
        </button>
      </div>
    );
  }

  return (
    <div className="combo" ref={wrapRef}>
      <div className="combo-search">
        <Search size={16} className="combo-search-icon" />
        <input
          className={`form-input${invalid ? ' is-invalid' : ''}`}
          id="vehicle-owner-search"
          autoComplete="off"
          placeholder={t('vehicles.searchOwner')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={creating}
        />
      </div>

      {open && !creating && (
        <div className="combo-menu" role="listbox">
          {matches.map((c) => (
            <button
              type="button"
              role="option"
              aria-selected={false}
              key={c.id}
              className="combo-option"
              onClick={() => {
                onChange(c.id);
                setOpen(false);
              }}
            >
              <span className="combo-option-main">{c.nombre}</span>
              <span className="combo-option-sub">{c.telefono}</span>
            </button>
          ))}
          {matches.length === 0 && (
            <div className="combo-empty">{t('vehicles.noOwnerMatches')}</div>
          )}
          <button type="button" className="combo-footer-action" onClick={startCreate} id="vehicle-owner-new">
            <UserPlus size={16} />
            {query.trim()
              ? `${t('vehicles.newOwner')}: "${query.trim()}"`
              : t('vehicles.newOwner')}
          </button>
        </div>
      )}

      {creating && (
        <div className="inline-create">
          <div className="inline-create-header">
            <span>{t('customers.newCustomer')}</span>
            <button type="button" className="modal-close" onClick={cancelCreate} aria-label={t('common.cancel')}>
              <X size={16} />
            </button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="owner-new-name">{t('common.name')}</label>
              <input
                className="form-input"
                id="owner-new-name"
                value={draft.nombre}
                onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="owner-new-phone">{t('common.phone')}</label>
              <input
                className="form-input"
                id="owner-new-phone"
                value={draft.telefono}
                onChange={(e) => setDraft({ ...draft, telefono: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="owner-new-email">{t('common.email')}</label>
            <input
              className="form-input"
              id="owner-new-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>
          {createError && <p className="field-hint field-hint-error">{createError}</p>}
          <div className="inline-create-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancelCreate}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={submitCreate} disabled={saving} id="owner-new-save">
              <Check size={16} /> {saving ? t('common.loading') : t('vehicles.saveOwner')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
