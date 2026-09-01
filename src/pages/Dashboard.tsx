import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { supabaseService } from '../services/supabaseService';
import { getErrorMessage } from '../lib/errors';
import type { DashboardStats, WorkOrder } from '../types/database';
import {
  ClipboardList,
  DollarSign,
  Gauge,
  UserPlus,
  AlertTriangle,
  Clock,
  Car,
  ChevronRight,
} from 'lucide-react';

const EMPTY_STATS: DashboardStats = {
  ordenes_activas: 0,
  ordenes_finalizadas_mes: 0,
  ingresos_mes: 0,
  egresos_mes: 0,
  clientes_nuevos_mes: 0,
  tasa_ocupacion: 0,
  ordenes_por_estatus: { recepcion: 0, en_proceso: 0, espera_repuestos: 0, finalizado: 0, entregado: 0 },
  ingresos_por_mes: [],
};

export default function Dashboard() {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.rol === 'admin';
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [recentOrders, setRecentOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const sedeId = user?.rol === 'admin' ? currentSede?.id : user?.sede_id;

    Promise.all([
      supabaseService.getDashboardStats(sedeId, currentSede?.capacidad),
      supabaseService.getWorkOrders(sedeId),
    ])
      .then(([statsData, orders]) => {
        if (!active) return;
        setStats(statsData);
        setRecentOrders(orders.slice(0, 5));
      })
      .catch((err) => active && setError(getErrorMessage(err, language)))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [user, currentSede, language]);

  const maxRevenue = Math.max(1, ...stats.ingresos_por_mes.map((m) => Math.max(m.ingresos, m.egresos)));

  const statusLabels: Record<string, string> = {
    recepcion: t('workOrders.intake'),
    en_proceso: t('workOrders.inProgress'),
    espera_repuestos: t('workOrders.waitingParts'),
    finalizado: t('workOrders.completed'),
    entregado: t('workOrders.delivered'),
  };

  const waitingOrders = recentOrders.filter((o) => o.estatus === 'espera_repuestos');
  const laggingOrders = recentOrders.filter((o) => o.estatus === 'en_proceso' && o.porcentaje_avance < 30);

  if (loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  return (
    <div>
      {error && <div className="alert-error">{error}</div>}

      {/* Welcome */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-subtitle">
            {t('dashboard.welcomeBack')}, {user?.nombre_completo?.split(' ')[0]} 👋
          </p>
        </div>
      </div>

      {/* KPI Stats — each card is a shortcut into the section it summarises.
          Money-related KPIs are admin-only. */}
      <div className="stats-grid">
        <button
          type="button"
          className="stat-card stat-card-link stagger-1 animate-fade-in-up"
          onClick={() => navigate('/work-orders')}
        >
          <div className="stat-icon primary">
            <ClipboardList size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-label">{t('dashboard.activeOrders')}</div>
            <div className="stat-value">{stats.ordenes_activas}</div>
            <div className="stat-change positive">
              +{stats.ordenes_finalizadas_mes} {t('dashboard.completedThisMonth')}
            </div>
          </div>
          <ChevronRight size={18} className="stat-card-arrow" />
        </button>

        {isAdmin && (
          <button
            type="button"
            className="stat-card stat-card-link stagger-2 animate-fade-in-up"
            onClick={() => navigate('/finance')}
          >
            <div className="stat-icon success">
              <DollarSign size={24} />
            </div>
            <div className="stat-content">
              <div className="stat-label">{t('dashboard.monthlyRevenue')}</div>
              <div className="stat-value">${stats.ingresos_mes.toLocaleString()}</div>
            </div>
            <ChevronRight size={18} className="stat-card-arrow" />
          </button>
        )}

        <button
          type="button"
          className="stat-card stat-card-link stagger-3 animate-fade-in-up"
          onClick={() => navigate('/kanban')}
        >
          <div className="stat-icon warning">
            <Gauge size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-label">{t('dashboard.occupancyRate')}</div>
            <div className="stat-value">{stats.tasa_ocupacion}%</div>
            <div style={{ marginTop: 'var(--space-2)' }}>
              <div className="progress-bar" style={{ height: '6px' }}>
                <div className="progress-fill" style={{ width: `${stats.tasa_ocupacion}%` }}></div>
              </div>
            </div>
            <div className="stat-change" style={{ color: 'var(--color-text-tertiary)' }}>
              {stats.ordenes_activas}/{currentSede?.capacidad ?? 10} {t('dashboard.spacesInUse')}
            </div>
          </div>
          <ChevronRight size={18} className="stat-card-arrow" />
        </button>

        {isAdmin && (
          <button
            type="button"
            className="stat-card stat-card-link stagger-4 animate-fade-in-up"
            onClick={() => navigate('/customers')}
          >
            <div className="stat-icon info">
              <UserPlus size={24} />
            </div>
            <div className="stat-content">
              <div className="stat-label">{t('dashboard.newCustomers')}</div>
              <div className="stat-value">{stats.clientes_nuevos_mes}</div>
            </div>
            <ChevronRight size={18} className="stat-card-arrow" />
          </button>
        )}
      </div>

      {/* Main content grid. Non-admins get alerts only — no revenue chart. */}
      <div className={isAdmin ? 'responsive-grid-2' : ''}>
        {/* Revenue Chart — admin only, taps through to Finanzas */}
        {isAdmin && (
        <div
          className="card card-link"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/finance')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/finance'); } }}
        >
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.revenueVsExpenses')}</h3>
            <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 'var(--font-size-xs)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-primary-light)' }}></span>
                {t('finance.income')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#9CA3AF' }}></span>
                {t('finance.expense')}
              </span>
            </div>
          </div>
          <div className="chart-bars">
            {stats.ingresos_por_mes.map((month, i) => (
              <div key={i} className="chart-bar-group">
                <div className="chart-bar-pair">
                  <div
                    className="chart-bar income"
                    style={{ height: `${(month.ingresos / maxRevenue) * 160}px` }}
                    title={`$${month.ingresos.toLocaleString()}`}
                  ></div>
                  <div
                    className="chart-bar expense"
                    style={{ height: `${(month.egresos / maxRevenue) * 160}px` }}
                    title={`$${month.egresos.toLocaleString()}`}
                  ></div>
                </div>
                <span className="chart-bar-label">{month.mes}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Alerts */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.alerts')}</h3>
            <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {waitingOrders.length === 0 && laggingOrders.length === 0 && (
              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                {t('common.noResults')}
              </p>
            )}
            {waitingOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                className="alert-row alert-row-warning"
                onClick={() => navigate(`/work-orders?open=${order.id}`)}
              >
                <Clock size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    {order.numero_orden} · {t('dashboard.alertWaitingParts')}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    {order.cliente?.nombre} — {order.vehiculo?.anio} {order.vehiculo?.marca} {order.vehiculo?.modelo}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {t('workOrders.estimatedDelivery')}: {order.fecha_estimada_entrega}
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              </button>
            ))}
            {laggingOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                className="alert-row alert-row-info"
                onClick={() => navigate(`/work-orders?open=${order.id}`)}
              >
                <Gauge size={16} style={{ color: 'var(--color-info)', flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    {order.numero_orden} · {t('dashboard.alertLowProgress')}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    {order.cliente?.nombre} — {order.vehiculo?.anio} {order.vehiculo?.marca} {order.vehiculo?.modelo}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 4 }}>
                    <div className="progress-bar" style={{ flex: 1, height: '4px' }}>
                      <div className="progress-fill" style={{ width: `${order.porcentaje_avance}%` }}></div>
                    </div>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                      {order.porcentaje_avance}%
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div className="card-header">
          <h3 className="card-title">{t('dashboard.recentOrders')}</h3>
        </div>
        <div className="table-container" style={{ border: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('workOrders.orderNumber')}</th>
                <th>{t('common.name')}</th>
                <th>{t('vehicles.title')}</th>
                <th>{t('common.type')}</th>
                <th>{t('common.status')}</th>
                <th>{t('workOrders.progress')}</th>
                <th>{t('common.total')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <span style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>
                      {order.numero_orden}
                    </span>
                  </td>
                  <td>{order.cliente?.nombre}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Car size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                      {order.vehiculo?.anio} {order.vehiculo?.marca} {order.vehiculo?.modelo}
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-${order.tipo_trabajo}`}>
                      {order.tipo_trabajo === 'mecanica'
                        ? t('workOrders.mechanical')
                        : order.tipo_trabajo === 'pintura'
                        ? t('workOrders.painting')
                        : t('workOrders.combined')}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${order.estatus}`}>
                      {statusLabels[order.estatus]}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 120 }}>
                      <div className="progress-bar" style={{ flex: 1, height: '6px' }}>
                        <div
                          className={`progress-fill ${order.porcentaje_avance === 100 ? 'success' : ''}`}
                          style={{ width: `${order.porcentaje_avance}%` }}
                        ></div>
                      </div>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', minWidth: 30 }}>
                        {order.porcentaje_avance}%
                      </span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    ${order.total_general.toLocaleString()}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/work-orders?open=${order.id}`)}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {t('dashboard.viewOrder')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
