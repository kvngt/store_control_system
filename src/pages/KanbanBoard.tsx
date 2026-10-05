import { useMemo, useState } from 'react';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { useToast } from '../context/toast.context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workOrdersService } from '../services/supabaseService';
import { DEFAULT_CAPACITY } from '../services/dashboard.service';
import { queryKeys } from '../lib/queryClient';
import { emptyList } from '../lib/emptyList';
import { getErrorMessage } from '../lib/errors';
import type { OrderStatus, WorkOrder } from '../types/database';
import DeliveryModal from '../features/workOrders/DeliveryModal';
import { orderDueState, type DueState } from '../lib/orderDue';
import { matchesOrderSearch } from '../features/workOrders/orderSearch';
import { Archive, Calendar, Gauge } from 'lucide-react';

/**
 * Valor del <select> "Mover a" para archivar. No es un estado de la orden — una archivada
 * sigue entregada para el cobro, el portal y las comisiones — así que va aparte de COLUMNS.
 */
const ARCHIVAR = '__archivar__';

const COLUMNS: { status: OrderStatus; emoji: string }[] = [
  { status: 'recepcion', emoji: '📥' },
  { status: 'en_proceso', emoji: '⚙️' },
  { status: 'espera_autorizacion', emoji: '⏳' },
  { status: 'finalizado', emoji: '✅' },
  { status: 'entregado', emoji: '🚗' },
];

interface KanbanBoardProps {
  /**
   * Dentro de la página de órdenes (F7), que ya pone el título, la búsqueda y el botón de
   * nueva orden: el tablero dibuja solo la ocupación y las columnas.
   */
  embedded?: boolean;
  /** La búsqueda de la página: la misma que filtra la lista. */
  search?: string;
  /** Abre la orden en la misma página. Sin esto, el número de la tarjeta es solo texto. */
  onOpen?: (orderId: string) => void;
}

export default function KanbanBoard({ embedded = false, search = '', onOpen }: KanbanBoardProps = {}) {
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
  // La búsqueda solo esconde tarjetas: la ocupación sigue contando todo el taller.
  const shown = useMemo(() => (search ? orders.filter((o) => matchesOrderSearch(o, search)) : orders), [orders, search]);

  // The card moves the moment it is dropped and snaps back if the server
  // refuses, so a drag on shop wifi feels immediate. React Query holds the
  // pre-move list in `context` for exactly that rollback.
  const move = useMutation({
    mutationFn: ({ orderId, status, motivo }: { orderId: string; status: OrderStatus; motivo?: string }) =>
      workOrdersService.updateWorkOrderStatus(orderId, status, motivo),
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

  // Archivar saca una orden entregada del tablero sin esperar los 90 días. La tarjeta se
  // quita al instante y vuelve si la base se niega.
  const archive = useMutation({
    mutationFn: (orderId: string) => workOrdersService.setArchived(orderId, true),
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<WorkOrder[]>(boardKey);
      queryClient.setQueryData<WorkOrder[]>(boardKey, (prev) => (prev || []).filter((o) => o.id !== orderId));
      return { previous };
    },
    onSuccess: () => showToast('success', t('workOrders.archivedToast')),
    onError: (err, _orderId, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey, context.previous);
      showToast('error', t('workOrders.archiveError'), getErrorMessage(err, language));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: boardKey });
      // La lista del archivo tiene su propia clave, por sede, búsqueda y página.
      queryClient.invalidateQueries({ queryKey: ['work-orders-archived'] });
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

  // Entregar abre el diálogo de cobro: método, cheque y comprobante (reunión con el taller).
  const [deliveringOrder, setDeliveringOrder] = useState<WorkOrder | null>(null);
  // Un rótulo accesible además del color: el color solo no es información.
  const dueLabel = (state: DueState) =>
    state === 'vencida' ? t('workOrders.dueOverdue') : state === 'hoy' ? t('workOrders.dueToday') : t('workOrders.dueSoon');

  // Both errors are held raw and translated here, never at fetch time: that is
  // what keeps switching the UI language from re-querying the whole board.
  const error =
    (move.error ? getErrorMessage(move.error, language) : '') ||
    (loadError ? getErrorMessage(loadError, language) : '');

  const statusLabels: Record<OrderStatus, string> = {
    recepcion: t('workOrders.intake'),
    en_proceso: t('workOrders.inProgress'),
    espera_autorizacion: t('workOrders.waitingAuthorization'),
    finalizado: t('workOrders.completed'),
    entregado: t('workOrders.delivered'),
  };

  // Una pasada para las cinco columnas y la ocupación, y solo cuando cambian las órdenes.
  // Antes eran seis `.filter` sobre todo el tablero en cada render (PRs #3, #5–#7, #9, #11).
  const { ordersByStatus, totalActive } = useMemo(() => {
    const grouped: Record<OrderStatus, WorkOrder[]> = {
      recepcion: [],
      en_proceso: [],
      espera_autorizacion: [],
      finalizado: [],
      entregado: [],
    };
    let active = 0;
    for (const order of orders) {
      if (order.estatus !== 'finalizado' && order.estatus !== 'entregado') active += 1;
    }
    for (const order of shown) grouped[order.estatus]?.push(order);
    return { ordersByStatus: grouped, totalActive: active };
  }, [orders, shown]);

  const isAdmin = user?.rol === 'admin';

  // Misma regla que `canEdit` en el detalle y que `trg_order_technician_guard` en
  // la base: un técnico mueve solo sus órdenes, y nunca una ya entregada — sacarla
  // de Entregado revierte el cobro y borra comisiones, y eso es de administración.
  const canMove = (order: WorkOrder) =>
    isAdmin ||
    (order.estatus !== 'entregado' && (order.asignaciones || []).some((a) => a.usuario_id === user?.id));

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

  // Solo lo entregado se archiva (la base lo impone con un CHECK), y solo un admin: un técnico
  // no puede tocar una orden entregada.
  const canArchive = (order: WorkOrder) => isAdmin && order.estatus === 'entregado';

  const archiveOrder = (orderId: string) => {
    if (!confirm(t('workOrders.archiveConfirm'))) {
      // El <select> se quedó mostrando "Archivar": se remonta para que vuelva a "Entregado".
      setMoveEpoch((n) => n + 1);
      return;
    }
    archive.mutate(orderId);
  };

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
    if (status === 'entregado') {
      setDeliveringOrder(order);
      return;
    }
    // F6: la pausa la pone y la quita la oficina; el técnico reporta el trabajo adicional
    // desde la orden.
    if (status === 'espera_autorizacion' && !isAdmin) {
      discard();
      showToast('error', t('findings.pauseFromOrder'));
      return;
    }
    if (order.estatus === 'espera_autorizacion' && !isAdmin) {
      discard();
      showToast('error', t('findings.pausedByOffice'));
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

  const capacity = currentSede?.capacidad ?? DEFAULT_CAPACITY;
  const occupancy = Math.min(100, Math.round((totalActive / capacity) * 100));

  if (loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  const occupancyText = `${t('kanban.occupancy')}: ${totalActive}/${capacity} (${occupancy}%)`;

  return (
    <div>
      <div className={embedded ? 'kanban-occupancy' : 'page-header'}>
        <div>
          {embedded ? (
            <p className="page-subtitle">{occupancyText}</p>
          ) : (
            <>
              <h1 className="page-title">{t('kanban.title')}</h1>
              <p className="page-subtitle">{occupancyText}</p>
            </>
          )}
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
                        {/* El número abre la orden, como en la lista. Un botón y no la tarjeta
                            entera: la tarjeta se arrastra, y en el teléfono lleva su selector. */}
                        {onOpen ? (
                          <button
                            type="button"
                            className="link-button kanban-card-order"
                            onClick={() => onOpen(order.id)}
                            aria-label={t('kanban.openOrder').replace('{numero}', order.numero_orden)}
                          >
                            {order.numero_orden}
                          </button>
                        ) : (
                          <span className="kanban-card-order">{order.numero_orden}</span>
                        )}
                        {order.esperando_autorizacion && (
                          <span className="badge badge-waiting-auth" style={{ fontSize: '10px' }}>{t('quotes.waitingBadge')}</span>
                        )}
                        {order.esperando_repuestos && (
                          <span className="badge badge-waiting-parts" style={{ fontSize: '10px' }}>{t('parts.waitingBadge')}</span>
                        )}
                        {order.retirada_sin_reparar && (
                          <span className="badge badge-retirada" style={{ fontSize: '10px' }}>{t('withdrawal.status')}</span>
                        )}
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
                            onChange={(e) => {
                              if (e.target.value === ARCHIVAR) archiveOrder(order.id);
                              else moveOrder(order.id, e.target.value as OrderStatus);
                            }}
                          >
                            {COLUMNS
                              // Si la orden ya está entregada la opción se deja,
                              // o el <select> no podría mostrar su propio valor.
                              .filter((c) => c.status !== 'entregado' || canDeliver || order.estatus === 'entregado')
                              .filter((c) => c.status !== 'recepcion' || isAdmin || order.estatus === 'recepcion')
                              .filter((c) => c.status !== 'espera_autorizacion' || isAdmin || order.estatus === 'espera_autorizacion')
                              .map((c) => (
                                <option key={c.status} value={c.status}>
                                  {statusLabels[c.status]}
                                </option>
                              ))}
                            {canArchive(order) && <option value={ARCHIVAR}>{t('workOrders.archive')}</option>}
                          </select>
                        </label>
                      )}

                      {/* En escritorio no hay selector — se arrastra —, y archivar no es una
                          columna a la que arrastrar. */}
                      {canArchive(order) && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm desktop-only kanban-card-archive"
                          onClick={() => archiveOrder(order.id)}
                          disabled={archive.isPending}
                        >
                          <Archive size={14} /> {t('workOrders.archive')}
                        </button>
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
                        <div
                          className={['kanban-card-date', orderDueState(order) ? `due-${orderDueState(order)}` : ''].filter(Boolean).join(' ')}
                          title={orderDueState(order) ? dueLabel(orderDueState(order)!) : undefined}
                        >
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
      {deliveringOrder && (
        <DeliveryModal
          order={deliveringOrder}
          onCancel={() => {
            setDeliveringOrder(null);
            setMoveEpoch((n) => n + 1);
          }}
          onDelivered={() => {
            setDeliveringOrder(null);
            void queryClient.invalidateQueries({ queryKey: boardKey });
          }}
        />
      )}

    </div>
  );
}
