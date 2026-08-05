import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Wrench } from 'lucide-react';

export default function Login() {
  const { t, language, setLanguage } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await login(email, password);
    setLoading(false);

    if (success) {
      navigate('/');
    } else {
      setError(t('auth.loginError'));
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-gradient login-bg-gradient-1"></div>
      <div className="login-bg-gradient login-bg-gradient-2"></div>

      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <Wrench size={32} color="#0A0A0F" />
          </div>
          <h1 className="login-title">{t('auth.welcomeTitle')}</h1>
          <p className="login-subtitle">{t('auth.welcomeSubtitle')}</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              {t('auth.email')}
            </label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="admin@restorify.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              {t('auth.password')}
            </label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} id="login-submit">
            {loading ? t('common.loading') : t('auth.loginButton')}
          </button>
        </form>

        <div className="login-demo-hint">
          <p style={{ marginBottom: '8px' }}>
            <strong>Demo Mode</strong> — {language === 'es' ? 'Usa estos correos para probar' : 'Use these emails to test'}:
          </p>
          <p><code>admin@restorify.com</code> → Admin</p>
          <p><code>miguel@restorify.com</code> → {language === 'es' ? 'Mecánico' : 'Mechanic'}</p>
          <p><code>david@restorify.com</code> → {language === 'es' ? 'Pintor' : 'Painter'}</p>
          <p style={{ marginTop: '8px', fontSize: '11px', opacity: 0.7 }}>
            {language === 'es' ? 'Cualquier contraseña funciona en modo demo' : 'Any password works in demo mode'}
          </p>
        </div>

        {/* Language toggle at bottom */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-4)', gap: 'var(--space-2)' }}>
          <button
            className={`header-lang-btn ${language === 'es' ? 'active' : ''}`}
            onClick={() => setLanguage('es')}
            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}
          >
            Español
          </button>
          <button
            className={`header-lang-btn ${language === 'en' ? 'active' : ''}`}
            onClick={() => setLanguage('en')}
            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}
          >
            English
          </button>
        </div>
      </div>
    </div>
  );
}
