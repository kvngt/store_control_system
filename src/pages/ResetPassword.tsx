import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MIN_PASSWORD_LENGTH } from '../lib/password';
import { Hexagon, Wrench } from 'lucide-react';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { supabaseService } from '../services/supabaseService';
import { getAuthErrorMessage } from '../lib/errors';
import loginBg from '../assets/login-bg.webp';

/**
 * Shown when the session came from a password-recovery email link.
 *
 * The link signs the user in, so without this screen they would land on the
 * dashboard with a temporary session and never be asked to choose a password —
 * and the next time they tried the old one it still wouldn't work.
 */
/** Supabase escribe el motivo en el fragmento cuando el enlace no sirve (#error_code=otp_expired). */
function linkErrorInUrl(): boolean {
  return /(^#|&)error(_code)?=/.test(window.location.hash);
}

export default function ResetPassword() {
  const { t, language } = useLanguage();
  const { endPasswordRecovery, logout, passwordRecovery, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  // Un enlace vencido o ya usado llegaba igual a este formulario, sin sesión, y al
  // guardar decía "Revisa tu conexión". Se decide al abrir: la sesión ya está
  // resuelta (App no muestra rutas mientras carga).
  const [linkInvalid] = useState(() => linkErrorInUrl() || (!passwordRecovery && !isAuthenticated));

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      await supabaseService.updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(getAuthErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-image-side">
        <div className="login-image-bg" style={{ backgroundImage: `url(${loginBg})` }} />
        <div className="login-image-overlay" />
        <div className="login-image-content">
          <h2 className="login-image-title">{t('auth.heroTitle')}</h2>
          <p className="login-image-subtitle">{t('auth.heroSubtitle')}</p>
        </div>
      </div>

      <div className="login-form-side">
        <div className="login-card">
          <div className="login-logo">
            <div className="login-logo-icon" style={{ boxShadow: 'var(--shadow-glow)', position: 'relative' }}>
              <Hexagon size={48} color="#0A0A0F" strokeWidth={1.5} style={{ position: 'absolute' }} />
              <Wrench size={24} color="#0A0A0F" style={{ position: 'relative', zIndex: 1 }} />
            </div>
            <h1 className="login-title">{t('auth.newPasswordTitle')}</h1>
            <p className="login-subtitle">{t('auth.newPasswordSubtitle')}</p>
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          {linkInvalid && !done ? (
            <>
              <div className="login-error" role="alert">
                {getAuthErrorMessage({ code: 'recovery_link_invalid' }, language)}
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                id="reset-request-new"
                onClick={() => navigate('/login', { replace: true })}
              >
                {t('auth.backToLogin')}
              </button>
            </>
          ) : done ? (
            <>
              <div className="login-notice" role="status">{t('auth.passwordChanged')}</div>
              {/* Sin navegar, "Entrar" dejaba a la persona en /reset-password con el
                  formulario otra vez: esa ruta existe fuera de la recuperación. */}
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                id="reset-continue"
                onClick={() => {
                  endPasswordRecovery();
                  navigate('/', { replace: true });
                }}
              >
                {t('auth.continueToApp')}
              </button>
            </>
          ) : (
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="new-password">{t('auth.newPassword')}</label>
                <input
                  className="form-input"
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">{t('auth.confirmPassword')}</label>
                <input
                  className="form-input"
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving} id="reset-submit">
                {saving ? t('common.loading') : t('auth.savePassword')}
              </button>
              <button
                type="button"
                className="login-link"
                onClick={async () => {
                  endPasswordRecovery();
                  await logout();
                  navigate('/login', { replace: true });
                }}
              >
                {t('common.cancel')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
