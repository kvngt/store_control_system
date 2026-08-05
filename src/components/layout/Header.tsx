import { Search, Bell, Menu, Building2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  sidebarCollapsed: boolean;
  onMobileMenuToggle: () => void;
}

export default function Header({ sidebarCollapsed, onMobileMenuToggle }: HeaderProps) {
  const { language, setLanguage, t } = useLanguage();
  const { user, currentSede, allSedes, setCurrentSede } = useAuth();

  const initials = user?.nombre_completo
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  return (
    <header className={`header ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="header-left">
        <button
          className="btn btn-ghost btn-icon"
          onClick={onMobileMenuToggle}
          style={{ display: 'none' }}
          id="mobile-menu-btn"
        >
          <Menu size={20} />
        </button>
        <div className="header-search">
          <Search className="header-search-icon" size={16} />
          <input type="text" placeholder={t('common.search')} id="global-search" />
        </div>
      </div>

      <div className="header-right">
        {/* Sede Selector */}
        {user?.rol === 'admin' && (
          <div className="header-sede-selector">
            <Building2 size={14} />
            <select
              value={currentSede?.id || ''}
              onChange={(e) => {
                const sede = allSedes.find((s) => s.id === e.target.value);
                if (sede) setCurrentSede(sede);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-sm)',
                outline: 'none',
                cursor: 'pointer',
              }}
              id="sede-selector"
            >
              {allSedes.map((sede) => (
                <option key={sede.id} value={sede.id} style={{ background: 'var(--color-bg-elevated)' }}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Language Toggle */}
        <div className="header-lang-toggle">
          <button
            className={`header-lang-btn ${language === 'es' ? 'active' : ''}`}
            onClick={() => setLanguage('es')}
            id="lang-es"
          >
            ES
          </button>
          <button
            className={`header-lang-btn ${language === 'en' ? 'active' : ''}`}
            onClick={() => setLanguage('en')}
            id="lang-en"
          >
            EN
          </button>
        </div>

        {/* Notifications */}
        <button className="header-notification" id="notifications-btn">
          <Bell size={20} />
          <span className="header-notification-badge"></span>
        </button>

        {/* Avatar */}
        <div className="header-avatar" title={user?.nombre_completo} id="user-avatar">
          {initials}
        </div>
      </div>
    </header>
  );
}
