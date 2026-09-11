import React, { useState } from 'react';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { useToast } from '../context/toast.context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workOrdersService } from '../services/supabaseService';
import { queryKeys } from '../lib/queryClient';
import { emptyList } from '../lib/emptyList';
import { getErrorMessage } from '../lib/errors';
import type { OrderStatus, WorkOrder } from '../types/database';
import { Calendar, Gauge } from 'lucide-react';

const COLUMNS: { status: OrderStatus; emoji: string }[] = [
  { status: 'recepcion', emoji: '📥' },
  { status: 'en_proceso', emoji: '⚙️' },
  { status: 'espera_repuestos', emoji: '⏳' },
  { status: 'finalizado', emoji: '✅' },
  { status: 'entregado', emoji: '🚗' },
];

export default function KanbanBoard() {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const { showToast } = useToast();
  const sedeId = user?.rol === 'admin' ? currentSede?.id : user?.sede_id;

  const queryClient = useQueryClient();
  const boardKey = queryKeys.workOrders(sedeId);

  const { data: orders = emptyList<WorkOrder>(), isPending: loading, error: loadError } = useQuery({
    queryKey: boardKey,
    queryFn: () => workOrdersService.getWorkOrders(sedeId),
  });

  // ⚡ Bolt Performance Optimization:
  // Prevents re-filtering the entire list 5 times for the columns and 1 time for the total capacity calculation on every render.
  // We use `useMemo` to iterate over the `orders` array exactly once (O(N) instead of O(N * 6)) and group them by status.
  const ordersByStatus = React.useMemo(() => {
    const grouped: Record<OrderStatus, WorkOrder[]> = {
      recepcion: [],
      en_proceso: [],
      espera_repuestos: [],
      finalizado: [],
      entregado: [],
    };
    for (const order of orders) {
      if (grouped[order.estatus]) {
        grouped[order.estatus].push(order);
      }
    }
    return grouped;
  }, [orders]);

  // The card moves the moment it is dropped and snaps back if the server
  // refuses, so a drag on shop wifi feels immediate. React Query holds the
  // pre-move list in `context` for exactly that rollback.
  const move = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      workOrdersService.updateWorkOrderStatus(orderId, status),
    onMutate: async ({ orderId, status }) => {
      // Stop an in-flight refetch from landing on top of the optimistic write.
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<WorkOrder[]>(boardKey);
      queryClient.setQueryData<WorkOrder[]>(boardKey, (prev) =>
        (prev || []).map((o) => (o.id === orderId ? { ...o, estatus: status } : o))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey, context.previous);
    },
    onSettled: () => {
      // Delivering an order books money and stamps a completion date by
      // trigger, so the row the board shows is not what the client guessed.
      queryClient.invalidateQueries({ queryKey: boardKey });
    },
  });

  const [draggedOrder, setDraggedOrder] = useState<string | null>(null);
  // Se incrementa cuando un movimiento se descarta sin llegar al servidor, y se
  // usa como `key` del <select> de cada tarjeta. Cancelar el confirm no cambiaba
  // ningún estado, así que React no re-renderizaba y el desplegable se quedaba
  // mostrando "Entregado" sobre una orden que seguía en su columna. En un
  // teléfono ese desplegable es la única forma de mover una tarjeta — el
  // arrastre de HTML5 no existe en táctil — así que era la ruta normal.
  const [moveEpoch, setMoveEpoch] = useState(0);

  // Both errors are held raw and translated here, never at fetch time: that is
  // what keeps switching the UI language from re-querying the whole board.
  const error =
    (move.error ? getErrorMessage(move.error, language) : '') ||
    (loadError ? getErrorMessage(loadError, language) : '');

  const statusLabels: Record<OrderStatus, string> = {
    recepcion: t('workOrders.intake'),
    en_proceso: t('workOrders.inProgress'),
    espera_repuestos: t('workOrders.waitingParts'),
    finalizado: t('workOrders.completed'),
    entregado: t('workOrders.delivered'),
  };

  const isAdmin = user?.rol === 'admin';

  // A technician can only move cards for orders they're assigned to.
  const canMove = (order: WorkOrder) =>
    isAdmin || (order.asignaciones || []).some((a) => a.usuario_id === user?.id);

  const handleDragStart = (order: WorkOrder, e: React.DragEvent) => {
    if (!canMove(order)) {
      e.preventDefault();
      return;
    }
    setDraggedOrder(order.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Entregar asienta el ingreso del trabajo y devenga las comisiones: es una
  // decisión de administración, no un paso del taller. Un técnico asignado podía
  // arrastrar su propia orden a "Entregado" y con eso acreditarse su comisión.
  const canDeliver = isAdmin;

  // Shared by dragging (desktop) and by the per-card selector (touch), so both
  // routes get the same delivery confirmation and the same optimistic update.
  const moveOrder = (orderId: string, status: OrderStatus) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.estatus === status) return;

    // Cada salida temprana repone el <select>, o queda desincronizado del tablero.
    const discard = () => setMoveEpoch((n) => n + 1);

    if (status === 'entregado' && !canDeliver) {
      discard();
      showToast('error', t('workOrders.deliverAdminOnly'));
      return;
    }
    if (status === 'entregado' && !confirm(t('workOrders.confirmDeliver'))) {
      discard();
      return;
    }
    if (order.estatus === 'entregado' && !confirm(t('workOrders.confirmUndeliver'))) {
      discard();
      return;
    }

    move.mutate({ orderId, status });
  };

  const handleDrop = (status: OrderStatus) => {
    if (!draggedOrder) return;
    const orderId = draggedOrder;
    setDraggedOrder(null);
    moveOrder(orderId, status);
  };

  const capacity = currentSede?.capacidad ?? 10;
  const totalActive =
    ordersByStatus.recepcion.length +
    ordersByStatus.en_proceso.length +
    ordersByStatus.espera_repuestos.length;
  const occupancy = Math.min(100, Math.round((totalActive / capacity) * 100));

  if (loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('kanban.title')}</h1>
          <p className="page-subtitle">
            {t('kanban.occupancy')}: {totalActive}/{capacity} ({occupancy}%)
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
          const columnOrders = ordersByStatus[status];
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
                      className={`kanban-card ${canMove(order) ? '' : 'kanban-card-locked'}`}
                      draggable={canMove(order)}
                      title={canMove(order) ? undefined : t('workOrders.readOnlyNotice')}
                      onDragStart={(e) => handleDragStart(order, e)}
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
                        <span style={{
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: order.porcentaje_avance === 100 ? 700 : 400,
                          color: order.porcentaje_avance === 100 ? 'var(--color-success)' : 'var(--color-text-secondary)',
                        }}>
                          {order.porcentaje_avance}%
                        </span>
                      </div>

                      {/* Touch devices get no HTML5 drag events at all, so on a
                          phone the board was read-only. This selector is the
                          same action by another route; hidden on desktop, where
                          dragging is the nicer gesture. */}
                      {canMove(order) && (
                        <label className="kanban-card-move mobile-flex">
                          <span className="kanban-card-move-label">{t('kanban.moveTo')}</span>
                          <select
                            key={moveEpoch}
                            className="form-input form-select"
                            value={order.estatus}
                            aria-label={`${t('kanban.moveTo')} — ${order.numero_orden}`}
                            onChange={(e) => moveOrder(order.id, e.target.value as OrderStatus)}
                          >
                            {COLUMNS
                              // Si la orden ya está entregada la opción se deja,
                              // o el <select> no podría mostrar su propio valor.
                              .filter((c) => c.status !== 'entregado' || canDeliver || order.estatus === 'entregado')
                              .map((c) => (
                                <option key={c.status} value={c.status}>
                                  {statusLabels[c.status]}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}

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
                    {t('kanban.emptyColumn')}
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
