import { useMemo, useState } from 'react';
import { KeyRound, Pencil, Search, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { usersService } from '../../services/supabaseService';
import { getErrorMessage } from '../../lib/errors';
import type { Sede, UserProfile, UserRole } from '../../types/database';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface UsersCardProps {
  users: UserProfile[];
  sedes: Sede[];
  currentUserId?: string;
  loading: boolean;
  onChanged: () => void;
}

type Draft = {
  nombre_completo: string;
  email: string;
  telefono: string;
  rol: UserRole;
  sede_id: string;
  password: string;
};

const emptyDraft = (sedeId = ''): Draft => ({
  nombre_completo: '',
  email: '',
  telefono: '',
  rol: 'mecanico',
  sede_id: sedeId,
  password: '',
});

/**
 * Managing the people who can sign in.
 *
 * Two things were reported from the shop about this. First, nobody could find
 * how to create a user: the "Nuevo Empleado" button lived inside the Talleres
 * card, next to sede branding, so it read as part of editing a workshop rather
 * than as staff administration — the admin assumed accounts had to be made in
 * the database by hand. Second, once created there was no way to change
 * anything about a person at all; a mistyped email meant deleting them and
 * starting over, which is not something you can do to somebody who already has
 * work assigned.
 *
 * So this is its own section, with its own roster, and every field is editable
 * — including the password, because "I forgot mine" is a thing an admin should
 * be able to fix without a password-reset email round trip.
 */
export default function UsersCard({ users, sedes, currentUserId, loading, onChanged }: UsersCardProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  // `null` = closed, `'new'` = create, otherwise the user being edited.
  const [editing, setEditing] = useState<UserProfile | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const sedeName = useMemo(
    () => Object.fromEntries(sedes.map((s) => [s.id, s.nombre])) as Record<string, string>,
    [sedes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesRole = roleFilter === 'all' || u.rol === roleFilter;
      const matchesSearch =
        !q ||
        u.nombre_completo.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.telefono || '').toLowerCase().includes(q);
      return matchesRole && matchesSearch;
    });
  }, [users, search, roleFilter]);

  const openCreate = () => {
    setDraft(emptyDraft(sedes[0]?.id || ''));
    setModalError('');
    setEditing('new');
  };

  const openEdit = (u: UserProfile) => {
    setDraft({
      nombre_completo: u.nombre_completo,
      email: u.email || '',
      telefono: u.telefono || '',
      rol: u.rol,
      sede_id: u.sede_id,
      // Always blank: an admin sets a new password, they never read the old one.
      password: '',
    });
    setModalError('');
    setEditing(u);
  };

  // Every exit from here has to say something out loud. The inputs are not
  // inside a <form> and the button is a plain onClick, so the browser never
  // validates them — a bare `return` reads to the admin as a dead button.
  const save = async () => {
    const nombre = draft.nombre_completo.trim();
    const email = draft.email.trim();

    if (!nombre) {
      setModalError(t('settings.employeeMissingFields'));
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setModalError(t('settings.employeeInvalidEmail'));
      return;
    }
    if (!draft.sede_id) {
      setModalError(
        sedes.length === 0 ? t('settings.employeeNoSede') : t('settings.employeeSedeRequired')
      );
      return;
    }
    // Mirrors the check inside the edge functions, so the admin finds out
    // before the round trip instead of after it.
    const creating = editing === 'new';
    if (creating && draft.password.length < 6) {
      setModalError(t('settings.employeeShortPassword'));
      return;
    }
    if (!creating && draft.password && draft.password.length < 6) {
      setModalError(t('settings.employeeShortPassword'));
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      if (creating) {
        await usersService.createEmployee({
          nombre_completo: nombre,
          email,
          password: draft.password,
          telefono: draft.telefono.trim() || undefined,
          rol: draft.rol,
          sede_id: draft.sede_id,
        });
        showToast('success', t('settings.employeeCreated'));
      } else {
        await usersService.updateEmployee({
          usuario_id: (editing as UserProfile).id,
          nombre_completo: nombre,
          email,
          telefono: draft.telefono.trim(),
          rol: draft.rol,
          sede_id: draft.sede_id,
          // Omitted entirely when blank, so saving a name change never
          // silently resets somebody's password.
          ...(draft.password ? { password: draft.password } : {}),
        });
        showToast('success', t('settings.userUpdated'));
      }
      setEditing(null);
      onChanged();
    } catch (err) {
      setModalError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: UserProfile) => {
    if (!confirm(`${t('settings.confirmDeleteEmployee')} ${u.nombre_completo}?`)) return;
    try {
      await usersService.deleteEmployee(u.id);
      onChanged();
      showToast('success', t('settings.employeeDeleted'));
    } catch (err) {
      showToast('error', t('settings.employeeError'), getErrorMessage(err, language));
    }
  };

  const roleLabel: Record<UserRole, string> = {
    admin: t('settings.roleAdmin'),
    mecanico: t('settings.roleMecanico'),
    pintor: t('settings.rolePintor'),
  };

  return (
    <div className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="card-header">
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Users size={18} /> {t('settings.users')}
          <span className="orders-section-count">{users.length}</span>
        </h3>
        <button className="btn btn-primary btn-sm" onClick={openCreate} id="new-user-btn">
          <UserPlus size={16} /> {t('settings.newUser')}
        </button>
      </div>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
        {t('settings.usersHint')}
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
          <input
            className="form-input"
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          {(['all', 'admin', 'mecanico', 'pintor'] as const).map((r) => (
            <button
              key={r}
              className={`tab ${roleFilter === r ? 'active' : ''}`}
              onClick={() => setRoleFilter(r)}
              style={{ borderBottom: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)' }}
            >
              {r === 'all' ? t('common.all') : roleLabel[r]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : (
        <div className="table-container cards-on-mobile" style={{ border: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.email')}</th>
                <th>{t('common.phone')}</th>
                <th>{t('settings.role')}</th>
                <th>{t('settings.workshops')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td data-label={t('common.name')} style={{ fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      {u.nombre_completo}
                      {u.id === currentUserId && (
                        <span className="badge" style={{ fontSize: 'var(--font-size-xs)' }}>{t('settings.you')}</span>
                      )}
                    </div>
                  </td>
                  <td data-label={t('common.email')} style={{ color: 'var(--color-text-secondary)' }}>{u.email}</td>
                  <td data-label={t('common.phone')} style={{ color: 'var(--color-text-secondary)' }}>{u.telefono || '—'}</td>
                  <td data-label={t('settings.role')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {u.rol === 'admin' && <Shield size={13} style={{ color: 'var(--color-primary-light)' }} />}
                      {roleLabel[u.rol]}
                    </span>
                  </td>
                  <td data-label={t('settings.workshops')} style={{ color: 'var(--color-text-secondary)' }}>
                    {sedeName[u.sede_id] || '—'}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title={t('settings.editUser')}
                        onClick={() => openEdit(u)}
                      >
                        <Pencil size={16} />
                      </button>
                      {/* Deleting yourself would lock the shop out of its own
                          settings, which the edge function also refuses. */}
                      {u.id !== currentUserId && (
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title={t('settings.removeEmployee')}
                          style={{ color: 'var(--color-danger)' }}
                          onClick={() => remove(u)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                    {t('common.noResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editing === 'new' ? t('settings.newUser') : t('settings.editUser')}
              </h3>
              <button className="modal-close" onClick={() => setEditing(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {modalError && <div className="alert-error" role="alert">{modalError}</div>}

              <div className="form-group">
                <label className="form-label" htmlFor="user-name">{t('common.name')}</label>
                <input
                  className="form-input"
                  id="user-name"
                  value={draft.nombre_completo}
                  onChange={(e) => setDraft({ ...draft, nombre_completo: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="user-email">{t('common.email')}</label>
                  <input
                    className="form-input"
                    id="user-email"
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="user-phone">{t('common.phone')}</label>
                  <input
                    className="form-input"
                    id="user-phone"
                    value={draft.telefono}
                    onChange={(e) => setDraft({ ...draft, telefono: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="user-role">{t('settings.role')}</label>
                  <select
                    className="form-input form-select"
                    id="user-role"
                    value={draft.rol}
                    onChange={(e) => setDraft({ ...draft, rol: e.target.value as UserRole })}
                  >
                    <option value="mecanico">{t('settings.roleMecanico')}</option>
                    <option value="pintor">{t('settings.rolePintor')}</option>
                    <option value="admin">{t('settings.roleAdmin')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="user-sede">{t('settings.workshops')}</label>
                  <select
                    className="form-input form-select"
                    id="user-sede"
                    value={draft.sede_id}
                    onChange={(e) => setDraft({ ...draft, sede_id: e.target.value })}
                  >
                    <option value="">-- {t('settings.workshops')} --</option>
                    {sedes.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="user-password">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <KeyRound size={14} />
                    {editing === 'new' ? t('settings.temporaryPassword') : t('settings.newPasswordOptional')}
                  </span>
                </label>
                <input
                  className="form-input"
                  id="user-password"
                  type="text"
                  autoComplete="new-password"
                  minLength={6}
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  placeholder={editing === 'new' ? '' : t('settings.leaveBlankToKeep')}
                />
                <p className="field-hint">
                  {editing === 'new' ? t('settings.temporaryPasswordHint') : t('settings.newPasswordHint')}
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={save} disabled={saving} id="user-save">
                {saving ? t('common.loading') : editing === 'new' ? t('common.create') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
