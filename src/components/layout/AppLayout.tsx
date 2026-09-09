import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import { useAuth } from '../../context/auth.context';
import { useTheme } from '../../context/theme.context';
import { applySedeBranding, clearSedeBranding } from '../../lib/branding';
import SchemaDriftBanner from '../SchemaDriftBanner';

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { currentSede } = useAuth();
  const { theme } = useTheme();

  // Re-theme the whole app whenever the active sede (or the light/dark mode)
  // changes. Employees never switch sede, so they simply always see their own
  // workshop's colours.
  useEffect(() => {
    applySedeBranding(currentSede?.color_tema, theme);
    return () => clearSedeBranding();
  }, [currentSede?.color_tema, theme]);

  // Con el cajón abierto, el overlay `position: fixed` tapa la página pero no la
  // inmoviliza: un dedo sobre él seguía desplazando el contenido de atrás, así
  // que al cerrar el menú uno aparecía en otra parte de la lista. Congelar el
  // <body> mientras está abierto es la mitad; la otra es Escape, que era la
  // única salida que no existía.
  useEffect(() => {
    if (!mobileOpen) return;

    document.body.classList.add('drawer-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.classList.remove('drawer-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  return (
    <div className="app-layout">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={`main-area ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Header
          sidebarCollapsed={sidebarCollapsed}
          onMobileMenuToggle={() => setMobileOpen(!mobileOpen)}
        />
        <main className="page-content">
          {/* Above the routed page, so it is the first thing seen on whichever
              screen the drift happens to break. */}
          <SchemaDriftBanner />
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
