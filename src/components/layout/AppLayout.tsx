import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { applySedeBranding, clearSedeBranding } from '../../lib/branding';

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
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
