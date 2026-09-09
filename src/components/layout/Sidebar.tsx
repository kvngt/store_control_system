import { NavLink, Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useUnsavedChanges } from '../../context/unsavedChanges.context';
import {
  LayoutDashboard,
  Users,
  Car,
  ClipboardList,
  Kanban,
  DollarSign,
  CreditCard,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Building2,
  Hexagon,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { t } = useLanguage();
  const { user, logout, currentSede, allSedes, setCurrentSede } = useAuth();
  const { confirmNavigation } = useUnsavedChanges();
  const location = useLocation();

  const isAdmin = user?.rol === 'admin';

  const handleNavClick = (e: React.MouseEvent) => {
    if (!confirmNavigation()) {
      e.preventDefault();
      return;
    }
    onMobileClose();
  };

  const handleLogout = () => {
    if (!confirmNavigation()) return;
    logout();
  };

  const mainLinks = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/customers', icon: Users, label: t('nav.customers') },
    { to: '/vehicles', icon: Car, label: t('nav.vehicles') },
    { to: '/work-orders', icon: ClipboardList, label: t('nav.workOrders') },
    { to: '/kanban', icon: Kanban, label: t('nav.kanban') },
  ];

  const financeLinks = isAdmin
    ? [
        { to: '/finance', icon: DollarSign, label: t('nav.finance') },
        { to: '/payroll', icon: CreditCard, label: t('nav.payroll') },
      ]
    : [];

  // Everyone gets Settings now — it holds their own profile, language and
  // theme. The sede/staff management inside it stays admin-only.
  const settingsLinks = [{ to: '/settings', icon: Settings, label: t('nav.settings') }];

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${mobileOpen ? 'mobile-open' : ''}`}
        onClick={onMobileClose}
      />

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <Link to="/" className="sidebar-logo" onClick={handleNavClick} title={t('nav.dashboard')}>
          {currentSede?.logo_url ? (
            <img
              src={currentSede.logo_url}
              alt={currentSede.nombre}
              className="sidebar-logo-img"
            />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                background: 'var(--gradient-primary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: 'var(--shadow-glow-sm)',
                position: 'relative'
              }}
            >
              <Hexagon size={28} color="#0A0A0F" strokeWidth={1.5} style={{ position: 'absolute' }} />
              <Wrench size={14} color="#0A0A0F" style={{ position: 'relative', zIndex: 1 }} />
            </div>
          )}
          <span className="logo-text" style={{ textShadow: '0 0 20px var(--color-primary-glow)' }}>{currentSede?.nombre || 'RESTORIFY'}</span>
        </Link>

        {/* Sede switcher for admins on mobile: the header version is hidden on
            small screens, and an admin still has to be able to change workshop
            from their phone.

            `mobile-flex` y no `mobile-only`: es un contenedor flex (ícono +
            campo en una fila), y `.mobile-only` lo forzaba a `display: block`
            con `!important`, dejando el ícono apilado encima del selector. */}
        {isAdmin && allSedes.length > 1 && (
          <div className="sidebar-sede-switcher mobile-flex">
            <Building2 size={14} />
            <select
              className="form-input form-select"
              value={currentSede?.id || ''}
              onChange={(e) => {
                const sede = allSedes.find((sd) => sd.id === e.target.value);
                if (sede) setCurrentSede(sede);
              }}
              aria-label={t('settings.workshops')}
            >
              {allSedes.map((sede) => (
                <option key={sede.id} value={sede.id}>{sede.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">MENU</div>
          {mainLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `sidebar-link ${isActive && (link.to === '/' ? location.pathname === '/' : true) ? 'active' : ''}`
              }
              end={link.to === '/'}
              onClick={handleNavClick}
            >
              <link.icon className="sidebar-link-icon" size={20} />
              <span className="sidebar-link-label">{link.label}</span>
            </NavLink>
          ))}

          {financeLinks.length > 0 && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: 'var(--space-2)' }}>
                {t('nav.finance').toUpperCase()}
              </div>
              {financeLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={handleNavClick}
                >
                  <link.icon className="sidebar-link-icon" size={20} />
                  <span className="sidebar-link-label">{link.label}</span>
                </NavLink>
              ))}
            </>
          )}

          {settingsLinks.length > 0 && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: 'var(--space-2)' }}>
                SYSTEM
              </div>
              {settingsLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={handleNavClick}
                >
                  <link.icon className="sidebar-link-icon" size={20} />
                  <span className="sidebar-link-label">{link.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={handleLogout} style={{ width: '100%' }}>
            <LogOut className="sidebar-link-icon" size={20} />
            <span className="sidebar-link-label">{t('nav.logout')}</span>
          </button>
          <button className="sidebar-toggle" onClick={onToggle}>
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>
    </>
  );
}
