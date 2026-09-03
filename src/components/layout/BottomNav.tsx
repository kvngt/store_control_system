import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import {
  LayoutDashboard,
  Users,
  Car,
  ClipboardList,
  Kanban,
} from 'lucide-react';

export default function BottomNav() {
  const { t } = useLanguage();

  // Short labels: a bottom tab has room for one word, so these are their own
  // keys rather than the full menu names ("Órdenes de Trabajo" wraps and
  // "Panel Principal" doesn't fit either). Kanban is here because the board is
  // day-to-day shop-floor navigation and the phone is where it gets used.
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboardShort') },
    { to: '/work-orders', icon: ClipboardList, label: t('nav.workOrdersShort') },
    { to: '/kanban', icon: Kanban, label: t('nav.kanbanShort') },
    { to: '/customers', icon: Users, label: t('nav.customers') },
    { to: '/vehicles', icon: Car, label: t('nav.vehicles') },
  ];

  return (
    <div className="bottom-nav">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          end={item.to === '/'}
        >
          <item.icon className="bottom-nav-icon" size={24} />
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}
