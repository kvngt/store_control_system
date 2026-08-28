import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { supabaseService } from '../services/supabaseService';
import type { OrderStatus, WorkOrder } from '../types/database';
import { Calendar, Gauge } from 'lucide-react';

const COLUMNS: { status: OrderStatus; emoji: string }[] = [
  { status: 'recepcion', emoji: '📥' },
  { status: 'en_proceso', emoji: '⚙️' },
  { status: 'espera_repuestos', emoji: '⏳' },
  { status: 'finalizado', emoji: '✅' },
  { status: 'entregado', emoji: '🚗' },
];

const CAPACITY = 10;

export default function KanbanBoard() {
  const { t } = useLanguage();
  const { user, currentSede } = useAuth();
  const sedeId = user?.rol === 'admin' ? currentSede?.id : user?.sede_id;

  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draggedOrder, setDraggedOrder] = useState<string | null>(null);

  const loadOrders = useCallback(() => {
    setLoading(true);
    setError('');
    supabaseService
      .getWorkOrders(sedeId)
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sedeId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const statusLabels: Record<OrderStatus, string> = {
    recepcion: t('workOrders.intake'),
    en_proceso: t('workOrders.inProgress'),
    espera_repuestos: t('workOrders.waitingParts'),
    finalizado: t('workOrders.completed'),
    entregado: t('workOrders.delivered'),
  };

  const getOrdersByStatus = (status: OrderStatus) => orders.filter((o) => o.estatus === status);

  const handleDragStart = (orderId: string) => {
    setDraggedOrder(orderId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (status: OrderStatus) => {
    if (!draggedOrder) return;
    const orderId = draggedOrder;
    setDraggedOrder(null);

    const previous = orders;
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, estatus: status } : o)));

    try {
      await supabaseService.updateWorkOrderStatus(orderId, status);
    } catch (err) {
      setError((err as Error).message);
      setOrders(previous);
    }
  };

  const totalActive = orders.filter((o) => !['finalizado', 'entregado'].includes(o.estatus)).length;
  const occupancy = Math.min(100, Math.round((totalActive / CAPACITY) * 100));

  if (loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('kanban.title')}</h1>
          <p className="page-subtitle">
            {t('kanban.occupancy')}: {totalActive}/{CAPACITY} ({occupancy}%)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Gauge size={18} style={{ color: occupancy > 80 ? 'var(--color-danger)' : 'var(--color-primary-light)' }} />
          <div className="progress-bar" style={{ width: 120, height: 8 }}>
            <div
              style={{
                width: `${occupancy}%`,
                height: '100%',
                borderRadius: 'inherit',
                background: occupancy > 80
                  ? 'linear-gradient(90deg, #EF4444, #F87171)'
                  : undefined,
              }}
              className={occupancy > 80 ? '' : 'progress-fill'}
            ></div>
          </div>
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{occupancy}%</span>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="kanban-board">
        {COLUMNS.map(({ status, emoji }) => {
          const columnOrders = getOrdersByStatus(status);
          return (
            <div key={status} className="kanban-column">
              <div className={`kanban-column-header ${status}`}>
                <div className="kanban-column-title">
                  <span>{emoji}</span>
                  <span>{statusLabels[status]}</span>
                </div>
                <span className="kanban-column-count">{columnOrders.length}</span>
              </div>
              <div
                className="kanban-column-body"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(status)}
              >
                {columnOrders.map((order) => {
                  const assignees = (order.asignaciones || []).map((a) => a.usuario).filter(Boolean);

                  return (
                    <div
                      key={order.id}
                      className="kanban-card"
                      draggable
                      onDragStart={() => handleDragStart(order.id)}
                      style={{
                        opacity: draggedOrder === order.id ? 0.5 : 1,
                      }}
                    >
                      <div className="kanban-card-header">
                        <span className="kanban-card-order">{order.numero_orden}</span>
                        <span className={`badge badge-${order.tipo_trabajo}`} style={{ fontSize: '10px' }}>
                          {order.tipo_trabajo === 'mecanica'
                            ? t('workOrders.mechanical')
                            : order.tipo_trabajo === 'pintura'
                            ? t('workOrders.painting')
                            : t('workOrders.combined')}
                        </span>
                      </div>

                      <div className="kanban-card-customer">{order.cliente?.nombre}</div>
                      <div className="kanban-card-vehicle">
                        {order.vehiculo?.anio} {order.vehiculo?.marca} {order.vehiculo?.modelo} · {order.vehiculo?.color}
                      </div>

                      {/* Progress */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <div className="progress-bar" style={{ flex: 1, height: '4px' }}>
                          <div
                            className={`progress-fill ${order.porcentaje_avance === 100 ? 'success' : ''}`}
                            style={{ width: `${order.porcentaje_avance}%` }}
                          ></div>
                        </div>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                          {order.porcentaje_avance}%
                        </span>
                      </div>

                      <div className="kanban-card-footer">
                        <div className="kanban-card-assignee">
                          {assignees.length > 0 && (
                            <>
                              <div style={{ display: 'flex' }}>
                                {assignees.slice(0, 2).map((u, i) => (
                                  <div
                                    key={u!.id}
                                    className="kanban-card-assignee-avatar"
                                    style={{ marginLeft: i > 0 ? '-6px' : 0, zIndex: 2 - i }}
                                    title={u!.nombre_completo}
                                  >
                                    {u!.nombre_completo.split(' ').map(n => n[0]).slice(0, 2).join('')}
                                  </div>
                                ))}
                              </div>
                              <span>{assignees[0]!.nombre_completo.split(' ')[0]}</span>
                            </>
                          )}
                        </div>
                        <div className="kanban-card-date">
                          <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                          {order.fecha_estimada_entrega}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {columnOrders.length === 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 80,
                      color: 'var(--color-text-tertiary)',
                      fontSize: 'var(--font-size-sm)',
                      border: '2px dashed var(--color-surface-border)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    {t('kanban.dragToMove')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
