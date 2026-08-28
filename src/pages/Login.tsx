import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Wrench } from 'lucide-react';
import loginBg from '../assets/login-bg.jpg';

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

    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || t('auth.loginError'));
    }
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
          <h2 className="login-image-title">Premium Auto Repair & Restoration</h2>
          <p className="login-image-subtitle">Manage your shop with precision and style.</p>
        </div>
      </div>

      <div className="login-form-side">
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
                className="form-input login-input"
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
                className="form-input login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary login-btn" disabled={loading} id="login-submit">
              {loading ? <div className="spinner-small" /> : t('auth.loginButton')}
            </button>
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
