import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { supabaseService } from '../services/supabaseService';
import { getAuthErrorMessage } from '../lib/errors';
import { Hexagon, Wrench, ArrowLeft } from 'lucide-react';
import loginBg from '../assets/login-bg.jpg';

export default function Login() {
  const { t, language, setLanguage } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // The card doubles as the "email me a reset link" form, rather than sending
  // the user to a separate page and back.
  const [mode, setMode] = useState<'login' | 'recover'>('login');
  const [notice, setNotice] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate('/');
    } else {
      setError(getAuthErrorMessage(result.error, language));
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await supabaseService.requestPasswordReset(email, window.location.origin);
      // Deliberately the same message whether or not the account exists — a
      // different one would let anyone probe which emails are registered.
      setNotice(t('auth.recoverySent'));
    } catch (err) {
      setError(getAuthErrorMessage(err, language));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: 'login' | 'recover') => {
    setMode(next);
    setError('');
    setNotice('');
  };

  return (
    <div className="login-page">
      <div className="login-image-side">
        <div 
          className="login-image-bg" 
          style={{ backgroundImage: `url(${loginBg})` }}
        />
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
            <h1 className="login-title" style={{ textShadow: '0 0 20px var(--color-primary-glow)' }}>
              {mode === 'login' ? t('auth.welcomeTitle') : t('auth.recoverTitle')}
            </h1>
            <p className="login-subtitle">
              {mode === 'login' ? t('auth.welcomeSubtitle') : t('auth.recoverSubtitle')}
            </p>
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}
          {notice && <div className="login-notice" role="status">{notice}</div>}

          <form className="login-form" onSubmit={mode === 'login' ? handleSubmit : handleRecover}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                {t('auth.email')}
              </label>
              <input
                id="login-email"
                type="email"
                className="form-input login-input"
                placeholder="admin@restorify.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {mode === 'login' && (
              <div className="form-group">
                <label className="form-label" htmlFor="login-password">
                  {t('auth.password')}
                </label>
                <input
                  id="login-password"
                  type="password"
                  className="form-input login-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary login-btn" disabled={loading} id="login-submit">
              {loading ? (
                <div className="spinner-small" />
              ) : mode === 'login' ? (
                t('auth.loginButton')
              ) : (
                t('auth.sendRecovery')
              )}
            </button>

            {mode === 'login' ? (
              <button type="button" className="login-link" onClick={() => switchMode('recover')} id="forgot-password">
                {t('auth.forgotPassword')}
              </button>
            ) : (
              <button type="button" className="login-link" onClick={() => switchMode('login')} id="back-to-login">
                <ArrowLeft size={14} /> {t('auth.backToLogin')}
              </button>
            )}
          </form>

          {/* Language toggle at bottom */}
          <div className="login-lang-toggle">
            <button
              className={`header-lang-btn ${language === 'es' ? 'active' : ''}`}
              onClick={() => setLanguage('es')}
            >
              Español
            </button>
            <button
              className={`header-lang-btn ${language === 'en' ? 'active' : ''}`}
              onClick={() => setLanguage('en')}
            >
              English
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
