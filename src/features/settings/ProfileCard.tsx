import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Camera, Shield, User } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useToast } from '../../context/toast.context';
import { usersService } from '../../services/users.service';
import { getErrorMessage } from '../../lib/errors';

export default function ProfileCard() {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const { user, refreshUser } = useAuth();

  // --- own profile ---
  const [profileForm, setProfileForm] = useState({ nombre_completo: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // El correo no se edita aquí: es el del acceso (Auth) y solo lo cambia update-employee, desde
  // Empleados. Antes este formulario lo guardaba solo en `perfiles` y la persona seguía entrando
  // con el correo viejo.
  const profileDirty = !!user && profileForm.nombre_completo.trim() !== user.nombre_completo;

  useEffect(() => {
    if (user) {
      setProfileForm({ nombre_completo: user.nombre_completo, email: user.email || '' });
    }
  }, [user]);

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
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
    setProfileError('');

    if (!nombre) {
      setProfileError(t('settings.nameRequired'));
      return;
    }

    setSavingProfile(true);
    try {
      await usersService.updateProfile(user.id, { nombre_completo: nombre });
      await refreshUser();
      showToast('success', t('settings.profileUpdated'));
    } catch (err) {
      setProfileError(getErrorMessage(err, language));
    } finally {
      setSavingProfile(false);
    }
  };

  return (
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
            <span style={{ color: 'var(--color-primary-light)', fontWeight: 500, }}>{user?.rol ? t(`employees.roles.${user.rol}`) : ''}</span>
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {t('settings.changePhoto')}
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="profile-name">{t('common.name')}</label>
        <input
          id="profile-name"
          className="form-input"
          value={profileForm.nombre_completo}
          onChange={(e) => setProfileForm({ ...profileForm, nombre_completo: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="profile-email">{t('common.email')}</label>
        <input
          id="profile-email"
          className="form-input"
          type="email"
          value={profileForm.email}
          readOnly
          aria-describedby="profile-email-hint"
        />
        <p id="profile-email-hint" className="field-hint">
          {t(user?.rol === 'admin' ? 'settings.emailChangeAdmin' : 'settings.emailChangeStaff')}
        </p>
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
  );
}
