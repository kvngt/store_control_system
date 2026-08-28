import { NavLink, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
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
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const location = useLocation();

  const isAdmin = user?.rol === 'admin';

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

  const settingsLinks = isAdmin
    ? [{ to: '/settings', icon: Settings, label: t('nav.settings') }]
    : [];

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="modal-overlay"
          style={{ zIndex: 'var(--z-overlay)' }}
          onClick={onMobileClose}
        />
      )}

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <div
            style={{
              width: 36,
              height: 36,
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Wrench size={20} color="#0A0A0F" />
          </div>
          <span className="logo-text">RESTORIFY</span>
        </div>

        <nav className="sidebar-nav">
          <div className="desktop-only">
            <div className="sidebar-section-label">MENU</div>
            {mainLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `sidebar-link ${isActive && (link.to === '/' ? location.pathname === '/' : true) ? 'active' : ''}`
                }
                end={link.to === '/'}
                onClick={onMobileClose}
              >
                <link.icon className="sidebar-link-icon" size={20} />
                <span className="sidebar-link-label">{link.label}</span>
              </NavLink>
            ))}
          </div>

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
                  onClick={onMobileClose}
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
                  onClick={onMobileClose}
                >
                  <link.icon className="sidebar-link-icon" size={20} />
                  <span className="sidebar-link-label">{link.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={logout} style={{ width: '100%' }}>
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
