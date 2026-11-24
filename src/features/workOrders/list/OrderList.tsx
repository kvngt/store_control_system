import { Archive, Calendar, Car, ChevronRight, Eye, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../context/language.context';
import { formatDay } from '../../../lib/dates';
import { money } from '../../../lib/money';
import { orderDueState, type DueState } from '../../../lib/orderDue';
import { orderStatusKey, workTypeKey } from '../../../lib/workType';
import type { WorkOrder } from '../../../types/database';

interface OrderListProps {
  orders: WorkOrder[];
  isAdmin: boolean;
  isMobile: boolean;
  onOpen: (orderId: string) => void;
  onDelete: (order: WorkOrder, e: React.MouseEvent) => void;
  onArchive: (order: WorkOrder, e: React.MouseEvent) => void;
}

/**
 * One list of orders, drawn as a table on desktop and as cards on mobile.
 *
 * `isMobile` elige cuál de las dos se monta. Antes se emitían ambas y el CSS
 * escondía una: dos copias del marcado en el DOM del teléfono — con sus iconos
 * y sus barras de avance — para mostrar una.
 */
export default function OrderList({
  orders,
  isAdmin,
  isMobile,
  onOpen,
  onDelete,
  onArchive,
}: OrderListProps) {
  const { t, language } = useLanguage();

  // Un rótulo accesible además del color: el color solo no es información.
  const dueLabel = (state: DueState) =>
    state === 'vencida' ? t('workOrders.dueOverdue') : state === 'hoy' ? t('workOrders.dueToday') : t('workOrders.dueSoon');
  const dueClass = (o: WorkOrder) => {
    const state = orderDueState(o);
    return state ? `due-${state}` : undefined;
  };
  const dueTitle = (o: WorkOrder) => {
    const state = orderDueState(o);
    return state ? dueLabel(state) : undefined;
  };

  /** Borrar una orden, o archivarla si ya se entregó. */
  const removeButton = (order: WorkOrder) =>
    order.estatus === 'entregado' ? (
      <button
        className="btn btn-ghost btn-sm btn-icon"
        title={t('workOrders.archive')}
        aria-label={`${t('workOrders.archive')} ${order.numero_orden}`}
        onClick={(e) => onArchive(order, e)}
      >
        <Archive size={16} />
      </button>
    ) : (
      <button
        className="btn btn-ghost btn-sm btn-icon"
        title={t('common.delete')}
        aria-label={`${t('common.delete')} ${order.numero_orden}`}
        style={{ color: 'var(--color-danger)' }}
        onClick={(e) => onDelete(order, e)}
      >
        <Trash2 size={16} />
      </button>
    );

  if (isMobile) {
    return (
      <div className="workorder-card-list animate-fade-in">
        {orders.map((order) => (
          <div key={order.id} className="workorder-card" onClick={() => onOpen(order.id)}>
            <div className="workorder-card-top">
              <span className="workorder-card-number">{order.numero_orden}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                {isAdmin && removeButton(order)}
                <ChevronRight size={18} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              </div>
            </div>
            <div className="workorder-card-meta">
              {order.cliente?.nombre}
            </div>
            <div className="workorder-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Car size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              {order.vehiculo?.anio} {order.vehiculo?.marca} {order.vehiculo?.modelo}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span className={`badge badge-${order.tipo_trabajo}`}>{t(workTypeKey(order.tipo_trabajo))}</span>
              {order.con_seguro && (
                <span className="badge badge-insurance">{t('workOrders.insuranceBadge')}</span>
              )}
              {order.retirada_sin_reparar ? (
                <span className="badge badge-retirada">{t('withdrawal.status')}</span>
              ) : (
                <span className={`badge badge-${order.estatus}`}>{t(orderStatusKey(order.estatus))}</span>
              )}
              {order.esperando_autorizacion && <span className="badge badge-waiting-auth">{t('quotes.waitingBadge')}</span>}
              {order.esperando_repuestos && <span className="badge badge-waiting-parts">{t('parts.waitingBadge')}</span>}
              {order.estatus === 'finalizado' && !order.retirada_sin_reparar && (
                order.lista_para_entregar_en
                  ? <span className="badge badge-success">{t('workOrders.readyForPickup')}</span>
                  : <span className="badge badge-waiting-auth">{t('workOrders.pendingReview')}</span>
              )}
            </div>
            <div className="workorder-card-progress">
              <div className="progress-bar" style={{ flex: 1, height: '6px' }}>
                <div className={`progress-fill ${order.porcentaje_avance === 100 ? 'success' : ''}`} style={{ width: `${order.porcentaje_avance}%` }}></div>
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)', minWidth: 28 }}>{order.porcentaje_avance}%</span>
            </div>
            <div className="workorder-card-footer">
              <span className={dueClass(order)} title={dueTitle(order)}>
                <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {formatDay(order.fecha_estimada_entrega, language)}
              </span>
              {/* `montos` es null para un técnico: la base no se lo devuelve. */}
              {isAdmin && order.por_autorizar ? (
                <span className="badge badge-waiting-auth">{t('workOrders.toAuthorizeBadge')}</span>
              ) : order.montos ? (
                <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {money(order.montos.total_general)}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 'var(--space-6) 0' }}>
            {t('common.noResults')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="table-container animate-fade-in">
      <table className="table">
        <thead>
          <tr>
            <th>{t('workOrders.orderNumber')}</th>
            <th>{t('common.name')}</th>
            <th>{t('vehicles.title')}</th>
            <th>{t('common.type')}</th>
            <th>{t('common.status')}</th>
            <th>{t('workOrders.progress')}</th>
            <th>{t('workOrders.estimatedDelivery')}</th>
            {isAdmin && <th>{t('common.total')}</th>}
            <th>{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="row-clickable" onClick={() => onOpen(order.id)}>
              <td>
                {/* The order number is the thing people point at, so it is
                    the link. The eye icon stays, but it is no longer the only
                    way in — which is how this was reported from the shop. */}
                <button
                  type="button"
                  className="link-button"
                  onClick={(e) => { e.stopPropagation(); onOpen(order.id); }}
                  title={t('workOrders.openOrder')}
                >
                  {order.numero_orden}
                </button>
              </td>
              <td>{order.cliente?.nombre}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Car size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                  {order.vehiculo?.anio} {order.vehiculo?.marca} {order.vehiculo?.modelo}
                </div>
              </td>
              <td>
                <span className={`badge badge-${order.tipo_trabajo}`}>{t(workTypeKey(order.tipo_trabajo))}</span>
                {order.con_seguro && (
                  <span className="badge badge-insurance" style={{ marginLeft: 4 }}>{t('workOrders.insuranceBadge')}</span>
                )}
              </td>
              <td>
                {order.retirada_sin_reparar ? (
                  <span className="badge badge-retirada">{t('withdrawal.status')}</span>
                ) : (
                  <span className={`badge badge-${order.estatus}`}>{t(orderStatusKey(order.estatus))}</span>
                )}
                {order.esperando_autorizacion && (
                  <span className="badge badge-waiting-auth" style={{ marginLeft: 4 }}>{t('quotes.waitingBadge')}</span>
                )}
                {order.esperando_repuestos && (
                  <span className="badge badge-waiting-parts" style={{ marginLeft: 4 }}>{t('parts.waitingBadge')}</span>
                )}
                {order.estatus === 'finalizado' && !order.retirada_sin_reparar && (
                  order.lista_para_entregar_en
                    ? <span className="badge badge-success" style={{ marginLeft: 4 }}>{t('workOrders.readyForPickup')}</span>
                    : <span className="badge badge-waiting-auth" style={{ marginLeft: 4 }}>{t('workOrders.pendingReview')}</span>
                )}
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 100 }}>
                  <div className="progress-bar" style={{ flex: 1, height: '6px' }}>
                    <div className={`progress-fill ${order.porcentaje_avance === 100 ? 'success' : ''}`} style={{ width: `${order.porcentaje_avance}%` }}></div>
                  </div>
                  <span style={{ fontSize: 'var(--font-size-xs)', minWidth: 28 }}>{order.porcentaje_avance}%</span>
                </div>
              </td>
              <td style={{ fontSize: 'var(--font-size-sm)' }} className={dueClass(order)} title={dueTitle(order)}>
                <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {formatDay(order.fecha_estimada_entrega, language)}
              </td>
              {isAdmin && (
                <td style={{ fontWeight: 600 }}>
                  {order.por_autorizar ? (
                    <span className="badge badge-waiting-auth">{t('workOrders.toAuthorizeBadge')}</span>
                  ) : (
                    money(order.montos?.total_general)
                  )}
                </td>
              )}
              <td>
                <div className="table-actions">
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    title={t('workOrders.openOrder')}
                    aria-label={t('workOrders.openOrder')}
                    onClick={(e) => { e.stopPropagation(); onOpen(order.id); }}
                  >
                    <Eye size={16} />
                  </button>
                  {isAdmin && removeButton(order)}
                </div>
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 9 : 8} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 'var(--space-6) 0' }}>
                {t('common.noResults')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
