import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import {
  LayoutDashboard,
  Users,
  Car,
  ClipboardList,
} from 'lucide-react';

export default function BottomNav() {
  const { t } = useLanguage();

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/work-orders', icon: ClipboardList, label: 'Órdenes' },
    { to: '/customers', icon: Users, label: t('nav.customers') },
    { to: '/vehicles', icon: Car, label: t('nav.vehicles') },
  ];

  return (
    <div className="bottom-nav mobile-only">
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
