import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabaseService } from '../services/supabaseService';
import { getErrorMessage } from '../lib/errors';
import type { Sede, UserProfile, UserRole } from '../types/database';
import {
  Building2,
  Phone,
  MapPin,
  Users,
  Globe,
  User,
  Shield,
  Sun,
  Moon,
  UserPlus,
  Camera,
  Palette,
  Trash2,
  Plus,
  X,
  LogIn,
  Check,
} from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Settings() {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const { user, refreshUser, refreshSedes } = useAuth();

  // --- own profile ---
  const [profileForm, setProfileForm] = useState({ nombre_completo: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const profileDirty =
    !!user &&
    (profileForm.nombre_completo.trim() !== user.nombre_completo ||
      profileForm.email.trim().toLowerCase() !== (user.email || '').toLowerCase());

  useEffect(() => {
    if (user) {
      setProfileForm({ nombre_completo: user.nombre_completo, email: user.email || '' });
    }
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const url = await supabaseService.uploadAvatar(user.id, file);
      await supabaseService.updateProfile(user.id, { avatar_url: url });
      await refreshUser();
      showToast('success', t('settings.photoUpdated'));
    } catch (err) {
      showToast('error', t('settings.photoError'), getErrorMessage(err, language));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    const nombre = profileForm.nombre_completo.trim();
    const email = profileForm.email.trim();
    setProfileError('');

    if (!nombre) {
      setProfileError(t('settings.nameRequired'));
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setProfileError(t('settings.invalidEmail'));
      return;
    }

    setSavingProfile(true);
    try {
      if (email.toLowerCase() !== (user.email || '').toLowerCase()) {
        const taken = await supabaseService.isEmailTaken(email, user.id);
        if (taken) {
          setProfileError(t('settings.emailTaken'));
          return;
        }
      }
      await supabaseService.updateProfile(user.id, { nombre_completo: nombre, email });
      await refreshUser();
      showToast('success', t('settings.profileUpdated'));
    } catch (err) {
      setProfileError(getErrorMessage(err, language));
    } finally {
      setSavingProfile(false);
    }
  };
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({});
  const [savingSedeId, setSavingSedeId] = useState<string | null>(null);

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  // Separate from the page-level `error`, which renders at the top of the page
  // and is therefore hidden behind this dialog's full-screen overlay.
  const [employeeError, setEmployeeError] = useState('');
  const [employeeForm, setEmployeeForm] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    telefono: '',
    rol: 'mecanico' as UserRole,
    sede_id: '',
  });

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([supabaseService.getSedes(), supabaseService.getUsers()])
      .then(([s, u]) => {
        setSedes(s);
        setUsers(u);
        setCapacityDrafts(Object.fromEntries(s.map((sede) => [sede.id, String(sede.capacidad)])));
        seedBrandDrafts(s);
      })
      .catch((err) => setError(getErrorMessage(err, language)))
      .finally(() => setLoading(false));
  }, [language]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- sede branding / CRUD (admin only) ---
  const [brandDrafts, setBrandDrafts] = useState<Record<string, { nombre: string; direccion: string; color_tema: string }>>({});
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoTargetSede, setLogoTargetSede] = useState<string | null>(null);
  const [creatingSede, setCreatingSede] = useState(false);
  const [showSedeModal, setShowSedeModal] = useState(false);
  const [newSedeName, setNewSedeName] = useState('');

  const seedBrandDrafts = (list: Sede[]) =>
    setBrandDrafts(
      Object.fromEntries(
        list.map((s) => [s.id, { nombre: s.nombre, direccion: s.direccion, color_tema: s.color_tema || '#D4A017' }])
      )
    );

  const handleSaveBranding = async (sedeId: string) => {
    const draft = brandDrafts[sedeId];
    if (!draft || !draft.nombre.trim()) return;
    setSavingSedeId(sedeId);
    try {
      await supabaseService.updateSede(sedeId, {
        nombre: draft.nombre.trim(),
        direccion: draft.direccion.trim(),
        color_tema: draft.color_tema,
      });
      await refreshSedes();
      loadData();
      showToast('success', t('settings.sedeUpdated'));
    } catch (err) {
      showToast('error', t('settings.sedeError'), getErrorMessage(err, language));
    } finally {
      setSavingSedeId(null);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !logoTargetSede) return;
    setUploadingLogoId(logoTargetSede);
    try {
      const url = await supabaseService.uploadSedeLogo(logoTargetSede, file);
      await supabaseService.updateSede(logoTargetSede, { logo_url: url });
      await refreshSedes();
      loadData();
      showToast('success', t('settings.logoUpdated'));
    } catch (err) {
      showToast('error', t('settings.logoError'), getErrorMessage(err, language));
    } finally {
      setUploadingLogoId(null);
      setLogoTargetSede(null);
    }
  };

  const handleCreateSede = async () => {
    if (!newSedeName.trim()) return;
    setCreatingSede(true);
    try {
      await supabaseService.createSede({
        nombre: newSedeName.trim(),
        direccion: '',
        telefono: '',
        capacidad: 10,
        color_tema: null,
        logo_url: null,
      });
      await refreshSedes();
      loadData();
      showToast('success', t('settings.sedeCreated'));
      setShowSedeModal(false);
      setNewSedeName('');
    } catch (err) {
      showToast('error', t('settings.sedeError'), getErrorMessage(err, language));
    } finally {
      setCreatingSede(false);
    }
  };

  const handleDeleteSede = async (sede: Sede) => {
    if (!confirm(`${t('settings.confirmDeleteSede')} "${sede.nombre}"?`)) return;
    try {
      await supabaseService.deleteSede(sede.id);
      await refreshSedes();
      loadData();
      showToast('success', t('settings.sedeDeleted'));
    } catch (err) {
      showToast('error', t('settings.sedeError'), getErrorMessage(err, language));
    }
  };

  const handleDeleteEmployee = async (employee: UserProfile) => {
    if (!confirm(`${t('settings.confirmDeleteEmployee')} ${employee.nombre_completo}?`)) return;
    try {
      await supabaseService.deleteEmployee(employee.id);
      loadData();
      showToast('success', t('settings.employeeDeleted'));
    } catch (err) {
      showToast('error', t('settings.employeeError'), getErrorMessage(err, language));
    }
  };

  const handleSaveCapacity = async (sedeId: string) => {
    const value = parseInt(capacityDrafts[sedeId], 10);
    if (!value || value <= 0) return;
    setSavingSedeId(sedeId);
    try {
      await supabaseService.updateSede(sedeId, { capacidad: value });
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSavingSedeId(null);
    }
  };

  const [joiningSedeId, setJoiningSedeId] = useState<string | null>(null);

  // Moves the signed-in admin's own membership to this sede. Joining one sede
  // is the same action as leaving the previous one, because a profile can only
  // belong to a single workshop.
  const handleJoinSede = async (sede: Sede) => {
    if (!user || user.sede_id === sede.id) return;
    setJoiningSedeId(sede.id);
    try {
      await supabaseService.moveUserToSede(user.id, sede.id);
      await refreshUser();
      loadData();
      showToast('success', `${t('settings.joinedSede')} ${sede.nombre}`);
    } catch (err) {
      showToast('error', t('settings.joinSedeError'), getErrorMessage(err, language));
    } finally {
      setJoiningSedeId(null);
    }
  };

  const openEmployeeModal = () => {
    setEmployeeForm({ nombre_completo: '', email: '', password: '', telefono: '', rol: 'mecanico', sede_id: sedes[0]?.id || '' });
    setError('');
    setEmployeeError('');
    setShowEmployeeModal(true);
  };

  // Every exit from this function has to say something out loud. The inputs
  // carry `required`, but they aren't wrapped in a <form> and the button is a
  // plain onClick, so the browser never validates them — a bare `return` here
  // reads to the admin as a dead button, which is exactly how this was
  // reported from the shop.
  const handleCreateEmployee = async () => {
    const { nombre_completo, email, password, sede_id } = employeeForm;

    if (!nombre_completo.trim() || !email.trim() || !password) {
      setEmployeeError(t('settings.employeeMissingFields'));
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmployeeError(t('settings.employeeInvalidEmail'));
      return;
    }
    // Mirrors the check inside the create-employee edge function, so the admin
    // finds out before the round trip instead of after it.
    if (password.length < 6) {
      setEmployeeError(t('settings.employeeShortPassword'));
      return;
    }
    if (!sede_id) {
      setEmployeeError(
        sedes.length === 0 ? t('settings.employeeNoSede') : t('settings.employeeSedeRequired')
      );
      return;
    }

    setSavingEmployee(true);
    setEmployeeError('');
    try {
      await supabaseService.createEmployee({
        ...employeeForm,
        nombre_completo: nombre_completo.trim(),
        email: email.trim(),
        telefono: employeeForm.telefono.trim() || undefined,
      });
      setShowEmployeeModal(false);
      showToast('success', t('settings.employeeCreated'));
      loadData();
    } catch (err) {
      setEmployeeError(getErrorMessage(err, language));
    } finally {
      setSavingEmployee(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="responsive-grid-2">
        {/* Profile — editable by the signed-in user, whatever their role */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <User size={18} /> {t('settings.profile')}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <button
              type="button"
              className="profile-avatar"
              onClick={() => avatarInputRef.current?.click()}
              title={t('settings.changePhoto')}
              disabled={uploadingAvatar}
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.nombre_completo} />
              ) : (
                <span>{user?.nombre_completo?.split(' ').map((n) => n[0]).slice(0, 2).join('')}</span>
              )}
              <span className="profile-avatar-overlay">
                {uploadingAvatar ? '…' : <Camera size={16} />}
              </span>
            </button>
            <input
              type="file"
              ref={avatarInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Shield size={14} style={{ color: 'var(--color-primary-light)' }} />
                <span style={{ color: 'var(--color-primary-light)', fontWeight: 500, textTransform: 'capitalize' }}>{user?.rol}</span>
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                {t('settings.changePhoto')}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('common.name')}</label>
            <input
              className="form-input"
              value={profileForm.nombre_completo}
              onChange={(e) => setProfileForm({ ...profileForm, nombre_completo: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('common.email')}</label>
            <input
              className="form-input"
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
            />
          </div>
          {profileError && <div className="alert-error">{profileError}</div>}
          <button
            className="btn btn-primary"
            onClick={handleSaveProfile}
            disabled={savingProfile || !profileDirty}
          >
            {savingProfile ? t('common.loading') : t('common.save')}
          </button>
        </div>

        {/* Language */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Globe size={18} /> {t('settings.language')}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              className={`btn ${language === 'es' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setLanguage('es')}
              style={{ flex: 1 }}
            >
              🇪🇸 {t('settings.spanish')}
            </button>
            <button
              className={`btn ${language === 'en' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setLanguage('en')}
              style={{ flex: 1 }}
            >
              🇺🇸 {t('settings.english')}
            </button>
          </div>
        </div>

        {/* Theme */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Sun size={18} /> {t('settings.theme')}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTheme('dark')}
              style={{ flex: 1 }}
            >
              <Moon size={16} /> {t('settings.themeDark')}
            </button>
            <button
              className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTheme('light')}
              style={{ flex: 1 }}
            >
              <Sun size={16} /> {t('settings.themeLight')}
            </button>
          </div>
        </div>

        {/* Workshops — sede and staff management is admin-only. Everyone else
            still reaches /settings for their own profile, language and theme. */}
        {user?.rol === 'admin' && (
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Building2 size={18} /> {t('settings.workshops')}
            </h3>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowSedeModal(true); setNewSedeName(''); }} disabled={creatingSede}>
                <Plus size={16} /> {t('settings.newWorkshop')}
              </button>
              <button className="btn btn-primary btn-sm" onClick={openEmployeeModal}>
                <UserPlus size={16} /> {t('settings.newEmployee')}
              </button>
            </div>
          </div>

          {/* Shared hidden picker for sede logos */}
          <input
            type="file"
            ref={logoInputRef}
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleLogoChange}
          />
          {loading ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
              {sedes.map((sede) => {
                const sedeUsers = users.filter((u) => u.sede_id === sede.id);
                return (
                  <div
                    key={sede.id}
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
                        onClick={() => { setLogoTargetSede(sede.id); logoInputRef.current?.click(); }}
                        title={t('settings.changeLogo')}
                        disabled={uploadingLogoId === sede.id}
                      >
                        {sede.logo_url ? (
                          <img src={sede.logo_url} alt={sede.nombre} />
                        ) : (
                          <Building2 size={20} style={{ color: 'var(--color-text-tertiary)' }} />
                        )}
                        <span className="sede-logo-overlay">
                          {uploadingLogoId === sede.id ? '…' : <Camera size={14} />}
                        </span>
                      </button>
                      <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, flex: 1, minWidth: 0 }}>
                        {sede.nombre}
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon"
                        title={t('common.delete')}
                        onClick={() => handleDeleteSede(sede)}
                      >
                        <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        <Phone size={14} /> {sede.telefono || '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        <Users size={14} /> {sedeUsers.length} {language === 'es' ? 'empleados' : 'employees'}
                      </div>
                    </div>

                    {/* Branding: name, address and accent colour */}
                    <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <input
                        className="form-input"
                        placeholder={t('common.name')}
                        value={brandDrafts[sede.id]?.nombre ?? ''}
                        onChange={(e) => setBrandDrafts((p) => ({ ...p, [sede.id]: { ...p[sede.id], nombre: e.target.value } }))}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <MapPin size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                        <input
                          className="form-input"
                          placeholder={t('common.address')}
                          value={brandDrafts[sede.id]?.direccion ?? ''}
                          onChange={(e) => setBrandDrafts((p) => ({ ...p, [sede.id]: { ...p[sede.id], direccion: e.target.value } }))}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <Palette size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                        <input
                          type="color"
                          className="color-input"
                          value={brandDrafts[sede.id]?.color_tema ?? '#D4A017'}
                          onChange={(e) => setBrandDrafts((p) => ({ ...p, [sede.id]: { ...p[sede.id], color_tema: e.target.value } }))}
                          title={t('settings.themeColor')}
                        />
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                          {brandDrafts[sede.id]?.color_tema}
                        </span>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => handleSaveBranding(sede.id)}
                          disabled={savingSedeId === sede.id}
                        >
                          {savingSedeId === sede.id ? t('common.loading') : t('common.save')}
                        </button>
                      </div>
                    </div>

                    {user?.rol === 'admin' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                        <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                          {t('settings.capacity')}
                        </label>
                        <input
                          className="form-input"
                          type="number"
                          min={1}
                          style={{ width: 80 }}
                          value={capacityDrafts[sede.id] ?? ''}
                          onChange={(e) => setCapacityDrafts((prev) => ({ ...prev, [sede.id]: e.target.value }))}
                        />
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleSaveCapacity(sede.id)}
                          disabled={savingSedeId === sede.id || capacityDrafts[sede.id] === String(sede.capacidad)}
                        >
                          {savingSedeId === sede.id ? t('common.loading') : t('common.update')}
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
                            padding: '4px 6px 4px 10px',
                            background: 'var(--color-bg-hover)',
                            borderRadius: 'var(--radius-full)',
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {u.nombre_completo.split(' ')[0]} · <span style={{ textTransform: 'capitalize' }}>{u.rol}</span>
                          {u.id !== user?.id && (
                            <button
                              type="button"
                              onClick={() => handleDeleteEmployee(u)}
                              title={t('settings.removeEmployee')}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 18, height: 18, borderRadius: '50%',
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* The admin's own membership: which roster they appear on. */}
                    {user?.sede_id === sede.id ? (
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
                        onClick={() => handleJoinSede(sede)}
                        disabled={joiningSedeId === sede.id}
                        title={t('settings.joinSedeHint')}
                      >
                        <LogIn size={14} />
                        {joiningSedeId === sede.id ? t('common.loading') : t('settings.joinSede')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {showEmployeeModal && (
        <div className="modal-overlay" onClick={() => setShowEmployeeModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('settings.newEmployee')}</h3>
              <button className="modal-close" onClick={() => setShowEmployeeModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {employeeError && (
                <div className="alert-error" role="alert">{employeeError}</div>
              )}
              <div className="form-group">
                <label className="form-label" htmlFor="employee-name">{t('common.name')}</label>
                <input
                  className="form-input"
                  id="employee-name"
                  value={employeeForm.nombre_completo}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, nombre_completo: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="employee-email">{t('common.email')}</label>
                  <input
                    className="form-input"
                    id="employee-email"
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="employee-phone">{t('common.phone')}</label>
                  <input
                    className="form-input"
                    id="employee-phone"
                    value={employeeForm.telefono}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, telefono: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="employee-password">{t('settings.temporaryPassword')}</label>
                <input
                  className="form-input"
                  id="employee-password"
                  type="text"
                  minLength={6}
                  value={employeeForm.password}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="employee-role">{t('settings.role')}</label>
                  <select
                    className="form-input form-select"
                    id="employee-role"
                    value={employeeForm.rol}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, rol: e.target.value as UserRole })}
                  >
                    <option value="mecanico">{t('settings.roleMecanico')}</option>
                    <option value="pintor">{t('settings.rolePintor')}</option>
                    <option value="admin">{t('settings.roleAdmin')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="employee-sede">{t('settings.workshops')}</label>
                  <select
                    className="form-input form-select"
                    id="employee-sede"
                    value={employeeForm.sede_id}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, sede_id: e.target.value })}
                    required
                  >
                    <option value="">-- {t('settings.workshops')} --</option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={sede.id}>{sede.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEmployeeModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleCreateEmployee} disabled={savingEmployee}>
                {savingEmployee ? t('common.loading') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSedeModal && (
        <div className="modal-overlay" onClick={() => setShowSedeModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('settings.newWorkshop')}</h3>
              <button className="modal-close" onClick={() => setShowSedeModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('settings.newSedeName')}</label>
                <input
                  className="form-input"
                  value={newSedeName}
                  onChange={(e) => setNewSedeName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSedeModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleCreateSede} disabled={creatingSede || !newSedeName.trim()}>
                {creatingSede ? t('common.loading') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
