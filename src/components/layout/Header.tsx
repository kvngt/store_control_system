import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Menu, Building2, ClipboardList, Users, Car, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useUnsavedChanges } from '../../context/unsavedChanges.context';
import { supabaseService } from '../../services/supabaseService';
import NotificationBell from '../../features/notifications/NotificationBell';

interface HeaderProps {
  sidebarCollapsed: boolean;
  onMobileMenuToggle: () => void;
}

interface SearchResults {
  customers: { id: string; nombre: string; telefono: string }[];
  vehicles: { id: string; marca: string; modelo: string; placa: string; vin: string; cliente?: { nombre: string } }[];
  orders: { id: string; numero_orden: string; estatus: string; cliente?: { nombre: string } }[];
}

const EMPTY_RESULTS: SearchResults = { customers: [], vehicles: [], orders: [] };

export default function Header({ sidebarCollapsed, onMobileMenuToggle }: HeaderProps) {
  const { language, setLanguage, t } = useLanguage();
  const { user, currentSede, allSedes, setCurrentSede } = useAuth();
  const navigate = useNavigate();
  const { confirmNavigation } = useUnsavedChanges();
  const isAdmin = user?.rol === 'admin';
  const sedeId = isAdmin ? currentSede?.id : user?.sede_id;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // M5 — en el teléfono la caja de búsqueda del encabezado estaba en
  // `display: none`, así que la única forma de encontrar una orden o una placa
  // desde cualquier pantalla desaparecía justo en el dispositivo donde se
  // pregunta "¿de quién es este carro?". Ahora colapsa a un botón de lupa que
  // abre la búsqueda a pantalla completa.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);


  const initials = user?.nombre_completo
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  // Debounced global search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY_RESULTS);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      supabaseService
        .globalSearch(query, sedeId)
        .then(setResults)
        .catch(() => setResults(EMPTY_RESULTS))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, sedeId]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setMobileSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setMobileSearchOpen(false);
    setQuery('');
    setResults(EMPTY_RESULTS);
  }, []);

  const openMobileSearch = () => {
    setMobileSearchOpen(true);
    setSearchOpen(true);
    // El foco va después del repintado: el campo está en `display: none` hasta
    // que la clase entra, y un elemento oculto no puede recibir foco.
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  // Escape cierra la búsqueda a pantalla completa. Sin esto la única salida en
  // el teléfono era el botón de cerrar, y en un navegador de escritorio angosto
  // no había ninguna.
  useEffect(() => {
    if (!mobileSearchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileSearchOpen, closeSearch]);

  const goToOrder = (id: string) => {
    if (!confirmNavigation()) return;
    navigate(`/work-orders?open=${id}`);
    closeSearch();
  };

  const goToCustomer = (id: string) => {
    if (!confirmNavigation()) return;
    navigate(`/customers?open=${id}`);
    closeSearch();
  };

  const goToVehicles = () => {
    if (!confirmNavigation()) return;
    navigate('/vehicles');
    closeSearch();
  };

  const hasResults = results.customers.length > 0 || results.vehicles.length > 0 || results.orders.length > 0;

  return (
    <header className={`header ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="header-left">
        <button
          className="btn btn-ghost btn-icon mobile-menu-btn"
          onClick={onMobileMenuToggle}
          id="mobile-menu-btn"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>
        <button
          className="btn btn-ghost btn-icon mobile-search-btn"
          onClick={openMobileSearch}
          aria-label={t('common.search')}
        >
          <Search size={20} />
        </button>
        <div
          className={`header-search ${mobileSearchOpen ? 'mobile-search-open' : ''}`}
          ref={searchBoxRef}
        >
          <Search className="header-search-icon" size={16} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('common.search')}
            id="global-search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
          />
          {mobileSearchOpen && (
            <button
              type="button"
              className="btn btn-ghost btn-icon header-search-close"
              onClick={closeSearch}
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          )}
          {searchOpen && query.trim().length >= 2 && (
            <div className="search-dropdown">
              {searching && <div className="search-dropdown-empty">{t('common.loading')}</div>}
              {!searching && !hasResults && <div className="search-dropdown-empty">{t('common.noResults')}</div>}
              {!searching && results.orders.length > 0 && (
                <div className="search-dropdown-group">
                  <div className="search-dropdown-label">{t('workOrders.title')}</div>
                  {results.orders.map((o) => (
                    <button key={o.id} className="search-dropdown-item" onClick={() => goToOrder(o.id)}>
                      <ClipboardList size={14} />
                      <span className="search-dropdown-item-title">{o.numero_orden}</span>
                      <span className="search-dropdown-item-sub">{o.cliente?.nombre}</span>
                    </button>
                  ))}
                </div>
              )}
              {!searching && results.customers.length > 0 && (
                <div className="search-dropdown-group">
                  <div className="search-dropdown-label">{t('customers.title')}</div>
                  {results.customers.map((c) => (
                    <button key={c.id} className="search-dropdown-item" onClick={() => goToCustomer(c.id)}>
                      <Users size={14} />
                      <span className="search-dropdown-item-title">{c.nombre}</span>
                      <span className="search-dropdown-item-sub">{c.telefono}</span>
                    </button>
                  ))}
                </div>
              )}
              {!searching && results.vehicles.length > 0 && (
                <div className="search-dropdown-group">
                  <div className="search-dropdown-label">{t('vehicles.title')}</div>
                  {results.vehicles.map((v) => (
                    <button key={v.id} className="search-dropdown-item" onClick={goToVehicles}>
                      <Car size={14} />
                      <span className="search-dropdown-item-title">{v.marca} {v.modelo} · {v.placa}</span>
                      <span className="search-dropdown-item-sub">{v.cliente?.nombre}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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

        {/* Avisos reales, guardados y en tiempo real (ver NotificationBell). La
            campana anterior re-descargaba todas las órdenes cada 60 s por
            pestaña para deducir alertas que no se guardaban en ningún lado. */}
        <NotificationBell />

        {/* Avatar — opens the settings/profile screen */}
        <button
          type="button"
          className="header-avatar"
          title={`${user?.nombre_completo || ''} — ${t('nav.settings')}`}
          aria-label={t('nav.settings')}
          id="user-avatar"
          onClick={() => {
            if (!confirmNavigation()) return;
            navigate('/settings');
          }}
        >
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.nombre_completo} className="header-avatar-img" />
          ) : (
            initials
          )}
        </button>
      </div>
    </header>
  );
}
