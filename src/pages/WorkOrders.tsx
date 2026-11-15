import { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { useToast } from '../context/toast.context';
import { workOrdersService } from '../services/workOrders.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { emptyList } from '../lib/emptyList';
import { useIsMobile } from '../lib/useMediaQuery';
import { useWorkOrderDetail } from '../features/workOrders/useWorkOrderDetail';
import { getErrorMessage } from '../lib/errors';
import ArchivedOrders from '../features/workOrders/ArchivedOrders';
import FindingsAlert from '../features/workOrders/FindingsAlert';
import { matchesOrderSearch } from '../features/workOrders/orderSearch';
import { ORDER_STATUSES, orderStatusKey } from '../lib/workType';
import { useIntake } from '../features/workOrders/intake/useIntake';
import IntakeFlow from '../features/workOrders/intake/IntakeFlow';
import OrderList from '../features/workOrders/list/OrderList';
import type { WorkOrder } from '../types/database';
import { Plus, Search, Wrench, List, Kanban } from 'lucide-react';

const WorkOrderDetail = lazy(() => import('../features/workOrders/WorkOrderDetail'));
const KanbanBoard = lazy(() => import('./KanbanBoard'));

/** El archivo no es un estatus: es otra vista de la misma pantalla. */
const ARCHIVED = 'archivadas';

/**
 * Lista y tablero son dos vistas de esta página (F7, reunión con el taller del 03/10/2026).
 * La vista va en la URL (`?vista=tablero`, a donde redirige `/kanban`) y se recuerda en el
 * navegador: quien vive en el tablero vuelve al tablero. Es una comodidad de cada quien, así
 * que si el navegador no deja guardar, simplemente se abre la lista.
 */
type OrdersView = 'lista' | 'tablero';
const VIEW_KEY = 'restorify_orders_view';

function savedView(): OrdersView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'tablero' ? 'tablero' : 'lista';
  } catch {
    return 'lista';
  }
}

function saveView(view: OrdersView) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Sin almacenamiento (modo privado, datos bloqueados): la próxima vez abre la lista.
  }
}

export default function WorkOrders() {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.rol === 'admin';
  const sedeId = isAdmin ? currentSede?.id : user?.sede_id;

  // Se renderiza una sola versión de la lista, no las dos escondiéndose con
  // CSS: el teléfono cargaba dos copias del marcado para mostrar una.
  const isMobile = useIsMobile();

  const detail = useWorkOrderDetail({ onBoardChanged: () => loadOrders() });

  const queryClient = useQueryClient();

  const { data: orders = emptyList<WorkOrder>(), isPending: loading, error: loadError } = useQuery({
    queryKey: queryKeys.workOrders(sedeId),
    queryFn: () => workOrdersService.getWorkOrders(sedeId),
  });

  const loadOrders = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workOrders(sedeId) });
  };

  const intake = useIntake({
    onOrderCreated: (orderId) => {
      loadOrders();
      detail.open(orderId);
    },
  });

  const [actionError, setActionError] = useState('');
  // Held raw by the hook until here: an error translated at fetch time forces
  // `language` into the loader's dependencies, and every language toggle then
  // re-queries the whole board.
  // Una orden que no se pudo abrir (un enlace o un aviso viejos) se decía solo dentro del
  // detalle, que no llega a pintarse: la pantalla volvía a la lista sin explicar nada.
  const openError = !detail.order && !detail.notFound ? detail.loadError : '';
  const error = actionError || (loadError ? getErrorMessage(loadError, language) : '') || openError;

  // "No existe" se avisa una vez y se suelta la orden pedida. A un técnico la base le contesta
  // lo mismo cuando la orden es de otra persona (20261007000000), así que a él se le dice eso.
  useEffect(() => {
    if (!detail.notFound) return;
    showToast('error', t(isAdmin ? 'workOrders.orderNotFound' : 'workOrders.notYourOrder'));
    detail.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.notFound]);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  // La vista de la URL manda (un enlace, la redirección de /kanban); si no trae, la última usada.
  const urlView = searchParams.get('vista');
  const [view, setView] = useState<OrdersView>(() =>
    urlView === 'tablero' || urlView === 'lista' ? urlView : savedView()
  );
  useEffect(() => {
    if (urlView === 'tablero' || urlView === 'lista') {
      setView(urlView);
      saveView(urlView);
    }
  }, [urlView]);
  const changeView = (next: OrdersView) => {
    setView(next);
    saveView(next);
    // El archivo no está en el tablero: con él elegido, el tablero filtraría todo.
    if (next === 'tablero' && filterStatus === ARCHIVED) setFilterStatus('all');
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('vista', next);
        return params;
      },
      { replace: true }
    );
  };

  const statusLabels = useMemo(
    () => Object.fromEntries(ORDER_STATUSES.map((s) => [s, t(orderStatusKey(s))])),
    [t]
  );

  const filtered = useMemo(
    () =>
      orders.filter(
        (o) => matchesOrderSearch(o, search) && (filterStatus === 'all' || o.estatus === filterStatus)
      ),
    [orders, search, filterStatus]
  );

  // Un técnico solo recibe sus órdenes (la RLS le esconde las de sus compañeros desde
  // 20261007000000), así que su lista ya no se parte en "mis órdenes" y "otras".

  const handleDeleteOrder = async (order: WorkOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`${t('workOrders.confirmDelete')} ${order.numero_orden}?`)) return;
    try {
      await workOrdersService.deleteWorkOrder(order.id);
      loadOrders();
    } catch (err) {
      setActionError(getErrorMessage(err, language));
    }
  };

  // Una orden entregada no se borra, se archiva (decisión del dueño, 20261010000041): lleva el
  // cobro, el costo de los repuestos y las comisiones. Archivada sale de la lista y vuelve desde
  // Archivadas cuando se quiera.
  const handleArchiveOrder = async (order: WorkOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t('workOrders.archiveConfirm'))) return;
    try {
      await workOrdersService.setArchived(order.id, true);
      showToast('success', t('workOrders.archivedToast'));
      loadOrders();
    } catch (err) {
      setActionError(getErrorMessage(err, language));
    }
  };

  // Deep link from the global header search and from notifications:
  // /work-orders?open=<id>[&tab=<pestaña>]
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      detail.open(openId, searchParams.get('tab'));
      // Se quitan solo los de la orden: la vista se queda en la URL.
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.delete('open');
          params.delete('tab');
          return params;
        },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Order Detail View
  if (detail.order) {
    // `key` por orden: abrir otra orden (un aviso, un enlace) sin pasar por la lista no desmontaba
    // el detalle si la nueva ya estaba en caché, y en el teléfono las secciones siguen montadas.
    // El editor de tareas se quedaba abierto con lo escrito y el técnico de la orden anterior, y
    // la tarea nueva le tocaba a esa persona (o la base la rechazaba si era de otra sede).
    return (
      <Suspense fallback={<div className="loading-state"><div className="spinner" /></div>}>
        <WorkOrderDetail
          key={detail.order.id}
          detail={detail}
          statusLabels={statusLabels}
          onBack={detail.close}
        />
      </Suspense>
    );
  }

  const orderList = (
    <OrderList
      orders={filtered}
      isAdmin={isAdmin}
      isMobile={isMobile}
      onOpen={detail.open}
      onDelete={handleDeleteOrder}
      onArchive={handleArchiveOrder}
    />
  );

  // List view
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('workOrders.title')}</h1>
          {/* En el archivo el conteo de la lista activa no significa nada: diría 0 aunque
              hubiera cincuenta archivadas. Esa sección lleva su propio conteo. El tablero
              lleva la ocupación. */}
          {view === 'lista' && filterStatus !== ARCHIVED && (
            <p className="page-subtitle">{filtered.length} {t('common.results')}</p>
          )}
        </div>
        <div className="view-switch" role="group" aria-label={t('ordersView.label')}>
          <button
            type="button"
            className={`view-switch-option ${view === 'lista' ? 'active' : ''}`}
            aria-pressed={view === 'lista'}
            onClick={() => changeView('lista')}
          >
            <List size={16} aria-hidden="true" /> {t('ordersView.list')}
          </button>
          <button
            type="button"
            className={`view-switch-option ${view === 'tablero' ? 'active' : ''}`}
            aria-pressed={view === 'tablero'}
            onClick={() => changeView('tablero')}
          >
            <Kanban size={16} aria-hidden="true" /> {t('ordersView.board')}
          </button>
        </div>
        {/* Abrir una orden es recibir un vehículo y comprometer al taller: es de
            administración. La base lo impone con `ordenes_trabajo_insert`; esconder el
            botón solo evita que un técnico se lleve un error. */}
        {isAdmin && (
          <button className="btn btn-primary" id="new-order-btn" onClick={intake.open}>
            <Plus size={18} /> {t('workOrders.newOrder')}
          </button>
        )}
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Findings Alert */}
      {/* En el tablero no hay filtro de estado: el aviso mira todas las órdenes. */}
      {isAdmin && filterStatus !== ARCHIVED && <FindingsAlert orders={view === 'tablero' ? orders : filtered} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div className="combo-search" style={{ flex: 1, maxWidth: 320 }}>
          <Search size={16} className="combo-search-icon" aria-hidden />
          <input className="form-input" placeholder={t('common.search')} aria-label={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {/* En el tablero las columnas ya son los estados, y el archivo no va en el tablero. */}
        {view === 'lista' && (
          <div style={{ display: 'flex', gap: 'var(--space-1)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
            {['all', ...ORDER_STATUSES, ARCHIVED].map((status) => (
              <button
                key={status}
                className={`tab tab-pill ${filterStatus === status ? 'active' : ''}`}
                onClick={() => setFilterStatus(status)}
              >
                {status === 'all' ? t('common.all') : status === ARCHIVED ? t('workOrders.archived') : t(orderStatusKey(status))}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'tablero' ? (
        <Suspense fallback={<div className="loading-state"><div className="spinner" /></div>}>
          <KanbanBoard embedded search={search} onOpen={detail.open} />
        </Suspense>
      ) : filterStatus === ARCHIVED ? (
        <>
          <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>{t('workOrders.archivedHint')}</p>
          <ArchivedOrders sedeId={sedeId} isAdmin={isAdmin} onOpen={detail.open} />
        </>
      ) : loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : isAdmin ? (
        orderList
      ) : (
        <section className="orders-section">
          <h2 className="orders-section-title">
            <Wrench size={18} />
            {t('workOrders.myOrders')}
            <span className="orders-section-count">{filtered.length}</span>
          </h2>
          {filtered.length === 0 ? (
            <p className="orders-section-empty">
              {orders.length === 0 ? t('workOrders.myOrdersEmpty') : t('common.noResults')}
            </p>
          ) : (
            orderList
          )}
        </section>
      )}

      <IntakeFlow intake={intake} />
    </div>
  );
}
