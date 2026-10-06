import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/auth.context';
import { useLanguage } from '../../context/language.context';
import { useUnsavedChanges } from '../../context/unsavedChanges.context';
import { LayoutDashboard, Users, Car, ClipboardList, Wallet } from 'lucide-react';

export default function BottomNav() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { confirmNavigation } = useUnsavedChanges();
  const isAdmin = user?.rol === 'admin';

  // La barra lateral y el encabezado ya preguntaban antes de salir de un
  // formulario a medias; esta barra no, y es la navegación real del teléfono.
  // Un avance con nota y video se perdía con un toque, sin aviso.
  const handleNavClick = (e: React.MouseEvent) => {
    if (!confirmNavigation()) e.preventDefault();
  };

  // Short labels: a bottom tab has room for one word, so these are their own
  // keys rather than the full menu names ("Órdenes de Trabajo" wraps and
  // "Panel Principal" doesn't fit either). El tablero ya no tiene pestaña propia: desde F7
  // es una vista de Órdenes, que abre la que cada quien usó la última vez.
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboardShort') },
    { to: '/work-orders', icon: ClipboardList, label: t('nav.workOrdersShort') },
    // Mecánicos y pintores: sus comisiones (06/10/2026).
    ...(isAdmin ? [] : [{ to: '/mis-comisiones', icon: Wallet, label: t('nav.myCommissionsShort') }]),
    // Solo administración: un técnico ve el cliente y el vehículo dentro de sus órdenes.
    ...(isAdmin
      ? [
          { to: '/customers', icon: Users, label: t('nav.customers') },
          { to: '/vehicles', icon: Car, label: t('nav.vehicles') },
        ]
      : []),
  ];

  return (
    <div className="bottom-nav">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          end={item.to === '/'}
          onClick={handleNavClick}
        >
          <item.icon className="bottom-nav-icon" size={24} />
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}
