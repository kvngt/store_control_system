import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Menu, Building2, ClipboardList, Users, Car, Clock, AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useUnsavedChanges } from '../../context/UnsavedChangesContext';
import { supabaseService } from '../../services/supabaseService';
import type { WorkOrder } from '../../types/database';

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
  const sedeId = user?.rol === 'admin' ? currentSede?.id : user?.sede_id;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [attentionOrders, setAttentionOrders] = useState<WorkOrder[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

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

  // Notifications: orders that need attention (waiting on parts or stalled)
  const loadAttention = useCallback(() => {
    supabaseService
      .getWorkOrders(sedeId)
      .then((orders) => {
        const flagged = orders.filter(
          (o) => o.estatus === 'espera_repuestos' || (o.estatus === 'en_proceso' && o.porcentaje_avance < 20)
        );
        setAttentionOrders(flagged.slice(0, 8));
      })
      .catch(() => {});
  }, [sedeId]);

  useEffect(() => {
    loadAttention();
    const interval = setInterval(loadAttention, 60000);
    return () => clearInterval(interval);
  }, [loadAttention]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    setResults(EMPTY_RESULTS);
  };

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
        <div className="header-search" ref={searchBoxRef}>
          <Search className="header-search-icon" size={16} />
          <input
            type="text"
            placeholder={t('common.search')}
            id="global-search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
          />
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

        {/* Notifications */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button className="header-notification" id="notifications-btn" onClick={() => setNotifOpen((v) => !v)}>
            <Bell size={20} />
            {attentionOrders.length > 0 && <span className="header-notification-badge"></span>}
          </button>
          {notifOpen && (
            <div className="notif-dropdown">
              <div className="notif-dropdown-header">
                <span>{t('dashboard.alerts')}</span>
                <button className="modal-close" onClick={() => setNotifOpen(false)}><X size={16} /></button>
              </div>
              {attentionOrders.length === 0 ? (
                <div className="search-dropdown-empty">{t('common.noResults')}</div>
              ) : (
                attentionOrders.map((o) => (
                  <button key={o.id} className="notif-dropdown-item" onClick={() => { if (!confirmNavigation()) return; navigate(`/work-orders?open=${o.id}`); setNotifOpen(false); }}>
                    {o.estatus === 'espera_repuestos' ? (
                      <Clock size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                    ) : (
                      <AlertTriangle size={16} style={{ color: 'var(--color-info)', flexShrink: 0 }} />
                    )}
                    <div>
                      <div className="notif-dropdown-item-title">{o.numero_orden}</div>
                      <div className="notif-dropdown-item-sub">
                        {o.estatus === 'espera_repuestos' ? t('workOrders.waitingParts') : `${t('workOrders.progress')}: ${o.porcentaje_avance}%`}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Avatar */}
        <div className="header-avatar" title={user?.nombre_completo} id="user-avatar">
          {initials}
        </div>
      </div>
    </header>
  );
}
