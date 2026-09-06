import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '../context/language.context';
import { useTheme } from '../context/theme.context';
import { useAuth } from '../context/auth.context';
import { useToast } from '../context/toast.context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sedesService, usersService } from '../services/supabaseService';
import { queryKeys } from '../lib/queryClient';
import { emptyList } from '../lib/emptyList';
import { getErrorMessage } from '../lib/errors';
import type { SedeDeleteImpact } from '../services/sedes.service';
import UsersCard from '../features/settings/UsersCard';
import type { Sede, UserProfile } from '../types/database';
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
  Camera,
  Palette,
  Percent,
  Trash2,
  Plus,
  X,
  LogIn,
  Check,
  AlertTriangle,
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
      const url = await usersService.uploadAvatar(user.id, file);
      await usersService.updateProfile(user.id, { avatar_url: url });
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
        const taken = await usersService.isEmailTaken(email, user.id);
        if (taken) {
          setProfileError(t('settings.emailTaken'));
          return;
        }
      }
      await usersService.updateProfile(user.id, { nombre_completo: nombre, email });
      await refreshUser();
      showToast('success', t('settings.profileUpdated'));
    } catch (err) {
      setProfileError(getErrorMessage(err, language));
    } finally {
      setSavingProfile(false);
    }
  };
  const queryClient = useQueryClient();

  // Not sede-scoped: this screen manages every workshop and everyone in them.
  const sedesQuery = useQuery({ queryKey: queryKeys.sedes(), queryFn: () => sedesService.getSedes() });
  const usersQuery = useQuery({
    queryKey: queryKeys.users(undefined),
    queryFn: () => usersService.getUsers(),
  });

  const sedes = sedesQuery.data ?? emptyList<Sede>();
  const users = usersQuery.data ?? emptyList<UserProfile>();
  const loading = sedesQuery.isPending || usersQuery.isPending;
  const loadError = sedesQuery.error ?? usersQuery.error;

  const loadData = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sedes() });
    queryClient.invalidateQueries({ queryKey: queryKeys.users(undefined) });
  };

  const [actionError, setActionError] = useState('');
  // Translated here rather than at fetch time, so switching the UI language
  // no longer re-reads every sede and every staff profile.
  const error = actionError || (loadError ? getErrorMessage(loadError, language) : '');

  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({});
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [savingSedeId, setSavingSedeId] = useState<string | null>(null);


  // The capacity and branding inputs are drafts seeded from whatever the last
  // load returned — including the reload that follows each save, so a saved
  // value becomes the new baseline.
  useEffect(() => {
    setCapacityDrafts(Object.fromEntries(sedes.map((sede) => [sede.id, String(sede.capacidad)])));
    setRateDrafts(
      Object.fromEntries(sedes.map((sede) => [sede.id, String(sede.comision_porcentaje ?? 35)]))
    );
    seedBrandDrafts(sedes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedes]);

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
      await sedesService.updateSede(sedeId, {
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
      const url = await sedesService.uploadSedeLogo(logoTargetSede, file);
      await sedesService.updateSede(logoTargetSede, { logo_url: url });
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
      await sedesService.createSede({
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

  // Deleting a workshop takes its whole history with it, so it is a two-step
  // dialog rather than a browser confirm: the admin is shown exactly what will
  // be destroyed, and then has to type the sede's name to say they meant it.
  // Reported from the shop as an outright bug — the plain delete always failed
  // with "this record is linked to other data" and there was no way through.
  const [deleteTarget, setDeleteTarget] = useState<Sede | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<SedeDeleteImpact | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingSede, setDeletingSede] = useState(false);

  const openDeleteSede = async (sede: Sede) => {
    setDeleteTarget(sede);
    setDeleteImpact(null);
    setDeleteConfirmName('');
    setDeleteError('');
    try {
      setDeleteImpact(await sedesService.getDeleteImpact(sede.id));
    } catch (err) {
      setDeleteError(getErrorMessage(err, language));
    }
  };

  const confirmDeleteSede = async () => {
    if (!deleteTarget) return;
    setDeletingSede(true);
    setDeleteError('');
    try {
      await sedesService.deleteSedeCascade(deleteTarget.id);
      await refreshSedes();
      loadData();
      setDeleteTarget(null);
      showToast('success', t('settings.sedeDeleted'));
    } catch (err) {
      setDeleteError(getErrorMessage(err, language));
    } finally {
      setDeletingSede(false);
    }
  };

  const handleSaveOperations = async (sedeId: string) => {
    const capacity = parseInt(capacityDrafts[sedeId], 10);
    const rate = parseFloat(rateDrafts[sedeId]);
    if (!capacity || capacity <= 0) {
      setActionError(t('settings.capacityInvalid'));
      return;
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setActionError(t('payroll.rateInvalid'));
      return;
    }
    setSavingSedeId(sedeId);
    setActionError('');
    try {
      // One update for both: they sit in the same row of the card, and saving
      // them separately meant two round trips and two chances to forget one.
      await sedesService.updateSede(sedeId, { capacidad: capacity, comision_porcentaje: rate });
      await refreshSedes();
      loadData();
      showToast('success', t('settings.sedeUpdated'));
    } catch (err) {
      setActionError(getErrorMessage(err, language));
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
      await usersService.moveUserToSede(user.id, sede.id);
      await refreshUser();
      loadData();
      showToast('success', `${t('settings.joinedSede')} ${sede.nombre}`);
    } catch (err) {
      showToast('error', t('settings.joinSedeError'), getErrorMessage(err, language));
    } finally {
      setJoiningSedeId(null);
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
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowSedeModal(true); setNewSedeName(''); }} disabled={creatingSede}>
              <Plus size={16} /> {t('settings.newWorkshop')}
            </button>
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
                        onClick={() => openDeleteSede(sede)}
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
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
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
                        </div>
                        {/* The commission rate decides what every technician in
                            this workshop is paid, so it lives with the other
                            things only an admin can set. */}
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                            <Percent size={12} /> {t('payroll.commissionRate')}
                          </label>
                          <input
                            className="form-input"
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            style={{ width: 90 }}
                            value={rateDrafts[sede.id] ?? ''}
                            onChange={(e) => setRateDrafts((prev) => ({ ...prev, [sede.id]: e.target.value }))}
                          />
                        </div>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleSaveOperations(sede.id)}
                          disabled={
                            savingSedeId === sede.id ||
                            (capacityDrafts[sede.id] === String(sede.capacidad) &&
                              rateDrafts[sede.id] === String(sede.comision_porcentaje ?? 35))
                          }
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
                            padding: '4px 10px',
                            background: 'var(--color-bg-hover)',
                            borderRadius: 'var(--radius-full)',
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {u.nombre_completo.split(' ')[0]} · <span style={{ textTransform: 'capitalize' }}>{u.rol}</span>
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

        {/* Staff. Its own section rather than a button inside the Talleres
            card: that is where it used to live, and it read as part of editing
            a workshop — the admin never found it and assumed accounts had to be
            created straight in the database. */}
        {user?.rol === 'admin' && (
          <UsersCard
            users={users}
            sedes={sedes}
            currentUserId={user?.id}
            loading={loading}
            onChanged={loadData}
          />
        )}
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <AlertTriangle size={18} style={{ color: 'var(--color-danger)' }} />
                {t('settings.deleteSedeTitle')}
              </h3>
              <button className="modal-close" onClick={() => setDeleteTarget(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {deleteError && <div className="alert-error" role="alert">{deleteError}</div>}

              <p style={{ marginBottom: 'var(--space-3)' }}>
                {t('settings.deleteSedeWarning').replace('{sede}', deleteTarget.nombre)}
              </p>

              {deleteImpact ? (
                <>
                  <div className="table-container" style={{ border: 'none' }}>
                    <table className="table">
                      <tbody>
                        {([
                          [t('workOrders.title'), deleteImpact.ordenes],
                          [t('customers.title'), deleteImpact.clientes],
                          [t('vehicles.title'), deleteImpact.vehiculos],
                          [t('finance.title'), deleteImpact.movimientos],
                        ] as [string, number][]).map(([labelText, count]) => (
                          <tr key={labelText}>
                            <td>{labelText}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: count > 0 ? 'var(--color-danger)' : undefined }}>
                              {count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* People are moved, not deleted — a profile is somebody's
                      login, and wiping a workshop should not close accounts. */}
                  {deleteImpact.empleados > 0 && (
                    <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
                      {t('settings.deleteSedeStaff').replace('{count}', String(deleteImpact.empleados))}
                    </p>
                  )}
                  {deleteImpact.otras_sedes === 0 && (
                    <div className="alert-error" style={{ marginTop: 'var(--space-3)' }}>
                      {t('settings.deleteSedeLastOne')}
                    </div>
                  )}
                </>
              ) : (
                !deleteError && <div className="loading-state"><div className="spinner" /></div>
              )}

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label" htmlFor="delete-sede-confirm">
                  {t('settings.deleteSedeConfirmLabel').replace('{sede}', deleteTarget.nombre)}
                </label>
                <input
                  className="form-input"
                  id="delete-sede-confirm"
                  autoComplete="off"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={deleteTarget.nombre}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</button>
              <button
                className="btn btn-danger"
                onClick={confirmDeleteSede}
                disabled={
                  deletingSede ||
                  deleteConfirmName.trim().toLowerCase() !== deleteTarget.nombre.trim().toLowerCase() ||
                  deleteImpact?.otras_sedes === 0
                }
              >
                {deletingSede ? t('common.loading') : t('settings.deleteSedeConfirm')}
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
