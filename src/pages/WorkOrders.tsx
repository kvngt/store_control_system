import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { useToast } from '../context/toast.context';
import { useUnsavedChanges } from '../context/unsavedChanges.context';
import {
  customersService,
  usersService,
  vehiclesService,
  workOrdersService,
} from '../services/supabaseService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { emptyList } from '../lib/emptyList';
import { useWorkOrderForm } from '../features/workOrders/useWorkOrderForm';
import { useWorkOrderDetail } from '../features/workOrders/useWorkOrderDetail';
import WorkOrderCreateModal from '../features/workOrders/WorkOrderCreateModal';
import WorkOrderDetail from '../features/workOrders/WorkOrderDetail';
import { getErrorMessage } from '../lib/errors';
import type { WorkOrder, Customer, Vehicle, UserProfile } from '../types/database';
import { Plus, Search, Eye, Car, Calendar, Trash2, ChevronRight, ChevronDown, Wrench } from 'lucide-react';

export default function WorkOrders() {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const { showToast } = useToast();
  const { setGuard } = useUnsavedChanges();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.rol === 'admin';
  const sedeId = isAdmin ? currentSede?.id : user?.sede_id;

  const form = useWorkOrderForm();
  const detail = useWorkOrderDetail({ onBoardChanged: () => loadOrders() });

  const queryClient = useQueryClient();

  const { data: orders = emptyList<WorkOrder>(), isPending: loading, error: loadError } = useQuery({
    queryKey: queryKeys.workOrders(sedeId),
    queryFn: () => workOrdersService.getWorkOrders(sedeId),
  });

  // The pickers behind the create dialog, each its own cache entry so a
  // failure to load one never blanks the board — and so Clientes and Vehículos
  // reuse them rather than asking again.
  const customersQuery = useQuery({
    queryKey: queryKeys.customers(sedeId),
    queryFn: () => customersService.getCustomers(sedeId),
  });
  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles(sedeId),
    queryFn: () => vehiclesService.getVehicles(sedeId),
  });
  const operatorsQuery = useQuery({
    queryKey: queryKeys.operators(sedeId),
    queryFn: () => usersService.getOperators(sedeId),
  });

  const customers = customersQuery.data ?? emptyList<Customer>();
  const vehicles = vehiclesQuery.data ?? emptyList<Vehicle>();
  const operators = operatorsQuery.data ?? emptyList<UserProfile>();

  const loadOrders = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workOrders(sedeId) });
  };
  const reloadPickers = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.customers(sedeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(sedeId) });
  };

  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  // Held raw by the hook until here: an error translated at fetch time forces
  // `language` into the loader's dependencies, and every language toggle then
  // re-queries the whole board.
  const error = actionError || (loadError ? getErrorMessage(loadError, language) : '');

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showOtherOrders, setShowOtherOrders] = useState(false);
  // Every field of the create dialog lives in `useWorkOrderForm`; everything
  // about the open order lives in `useWorkOrderDetail`. What is left here is
  // the board itself.
  const [showCreateModal, setShowCreateModal] = useState(false);

  const statusLabels: Record<string, string> = {
    recepcion: t('workOrders.intake'),
    en_proceso: t('workOrders.inProgress'),
    espera_repuestos: t('workOrders.waitingParts'),
    finalizado: t('workOrders.completed'),
    entregado: t('workOrders.delivered'),
  };

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return orders.filter((o) => {
      const matchSearch =
        o.numero_orden.toLowerCase().includes(searchLower) ||
        (o.cliente?.nombre || '').toLowerCase().includes(searchLower);
      const matchStatus = filterStatus === 'all' || o.estatus === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [orders, search, filterStatus]);

  // A mechanic/painter opens this screen to work, not to browse: their own
  // orders come first, and the rest of the sede's board is a second section
  // they can expand when they need it. Admins keep the single combined list.
  const isMine = useCallback(
    (order: WorkOrder) => (order.asignaciones || []).some((a) => a.usuario_id === user?.id),
    [user?.id]
  );

  const myOrders = useMemo(() => filtered.filter(isMine), [filtered, isMine]);
  const otherOrders = useMemo(() => filtered.filter((o) => !isMine(o)), [filtered, isMine]);

  const vehiclesForCustomer = useMemo(
    () => vehicles.filter((v) => v.cliente_id === form.selectedCustomer),
    [vehicles, form.selectedCustomer]
  );

  const handleCloseCreateModal = () => {
    if (form.isDirty && !confirm(t('workOrders.confirmDiscard'))) {
      return;
    }
    setShowCreateModal(false);
    form.reset();
  };

  // Register a navigation guard for as long as the create-order modal has
  // unsaved data, so the sidebar/global search can't silently navigate away
  // and lose it.
  useEffect(() => {
    if (showCreateModal) {
      setGuard(() => !form.isDirty || confirm(t('workOrders.confirmDiscard')));
    } else {
      setGuard(null);
    }
    return () => setGuard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateModal, form.isDirty]);

  // Runs only after the Zod schema has passed, so `values` is already known to
  // carry a customer, a vehicle and a non-negative odometer. What is left here
  // is the ordering the database imposes: a new customer before the vehicle
  // that belongs to them, both before the order, the order before its photos.
  const submitOrder = form.form.handleSubmit(async (values) => {
    if (!user) return;

    setSaving(true);
    setActionError('');
    try {
      const targetSedeId = sedeId || currentSede?.id || '';

      let customerId = values.selectedCustomer;
      if (values.customerMode === 'new') {
        const created = await customersService.createCustomer({
          nombre: values.newCustomer.nombre,
          telefono: values.newCustomer.telefono,
          email: values.newCustomer.email,
          direccion: values.newCustomer.direccion,
          notas_crm: '',
          sede_id: targetSedeId,
        });
        customerId = created.id;
        form.markCustomerCreated(created.id);
      }

      let vehicleId = values.selectedVehicle;
      if (values.vehicleMode === 'new') {
        const plate = values.newVehicle.placa.trim().toUpperCase();
        const createdVehicle = await vehiclesService.createVehicle({
          cliente_id: customerId,
          marca: values.newVehicle.marca,
          modelo: values.newVehicle.modelo,
          anio: parseInt(values.newVehicle.anio, 10) || new Date().getFullYear(),
          vin: values.newVehicle.vin,
          // NULL, never an empty string: `placa` is nullable precisely so a
          // unit with no plate reads as "no plate" everywhere. Quick-create
          // used to write '' here, which is neither a plate nor the absence
          // of one, and which the Vehículos screen is careful never to store.
          placa: plate || null,
          color: values.newVehicle.color,
        });
        vehicleId = createdVehicle.id;
        form.markVehicleCreated(createdVehicle.id);
      }

      // Admins pick who works the order; a mechanic/painter creating one is
      // always assigned to themselves (they can't assign colleagues — those
      // join the order themselves from the order detail).
      const asignaciones = isAdmin
        ? values.selectedOperators.map((id) => {
            const op = operators.find((o) => o.id === id);
            return { usuario_id: id, tipo_tarea: (op?.rol === 'pintor' ? 'pintura' : 'mecanica') as 'mecanica' | 'pintura' };
          })
        : [{ usuario_id: user.id, tipo_tarea: (user.rol === 'pintor' ? 'pintura' : 'mecanica') as 'mecanica' | 'pintura' }];

      const order = await workOrdersService.createWorkOrder({
        sede_id: targetSedeId,
        cliente_id: customerId,
        vehiculo_id: vehicleId,
        tipo_trabajo: values.workType,
        millas_ingreso: Math.max(0, parseInt(values.milesIn, 10) || 0),
        nivel_gasolina: values.fuelLevel,
        deposito_inicial: parseFloat(values.deposit) || 0,
        inspeccion_360_notas: values.inspectionNotes,
        fecha_estimada_entrega: values.estimatedDate || new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        labor_items: values.laborItems.map((l) => ({
          descripcion: l.descripcion,
          costo: parseFloat(l.costo) || 0,
        })),
        repuestos: values.parts.map((p) => ({
          descripcion: p.descripcion,
          cantidad: parseInt(p.cantidad, 10) || 1,
          costo_unitario: parseFloat(p.costo_unitario) || 0,
          precio_venta_unitario: parseFloat(p.precio_venta_unitario) || 0,
        })),
        asignaciones,
        creado_por: user.id,
      });

      const photoFiles = form.photos.toUploads();
      if (photoFiles.length) {
        await workOrdersService.uploadOrderPhotos(order.id, photoFiles);
      }

      const createdNewRecords = values.customerMode === 'new' || values.vehicleMode === 'new';
      setShowCreateModal(false);
      form.reset();
      loadOrders();
      if (createdNewRecords) reloadPickers();
      detail.open(order.id);
      showToast('success', `${t('workOrders.orderCreatedSuccess')} (${order.numero_orden})`);
    } catch (err) {
      const message = getErrorMessage(err, language);
      setActionError(message);
      showToast('error', t('workOrders.orderCreatedError'), message);
    } finally {
      setSaving(false);
    }
  });

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

  // Deep link from the global header search: /work-orders?open=<id>
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      detail.open(openId);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Order Detail View
  if (detail.order) {
    return (
      <WorkOrderDetail
        detail={detail}
        operators={operators}
        statusLabels={statusLabels}
        onBack={detail.close}
      />
    );
  }


  // One list of orders, drawn as a table on desktop and as cards on mobile.
  // Extracted so the technician view can render it twice — once for the
  // orders assigned to them, once for the rest of the sede's board.
  const renderOrderList = (list: WorkOrder[]) => (
    <>
      {/* Desktop table */}
      <div className="table-container animate-fade-in desktop-only">
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
              <th>{t('common.total')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((order) => (
              <tr key={order.id}>
                <td style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>{order.numero_orden}</td>
                <td>{order.cliente?.nombre}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Car size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    {order.vehiculo?.anio} {order.vehiculo?.marca} {order.vehiculo?.modelo}
                  </div>
                </td>
                <td><span className={`badge badge-${order.tipo_trabajo}`}>{order.tipo_trabajo}</span></td>
                <td><span className={`badge badge-${order.estatus}`}>{statusLabels[order.estatus]}</span></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 100 }}>
                    <div className="progress-bar" style={{ flex: 1, height: '6px' }}>
                      <div className={`progress-fill ${order.porcentaje_avance === 100 ? 'success' : ''}`} style={{ width: `${order.porcentaje_avance}%` }}></div>
                    </div>
                    <span style={{ fontSize: 'var(--font-size-xs)', minWidth: 28 }}>{order.porcentaje_avance}%</span>
                  </div>
                </td>
                <td style={{ fontSize: 'var(--font-size-sm)' }}>
                  <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: 'var(--color-text-tertiary)' }} />
                  {order.fecha_estimada_entrega}
                </td>
                <td style={{ fontWeight: 600 }}>${order.total_general.toLocaleString()}</td>
                <td>
                  <div className="table-actions">
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => detail.open(order.id)}>
                      <Eye size={16} />
                    </button>
                    {user?.rol === 'admin' && (
                      <button className="btn btn-ghost btn-sm btn-icon" title={t('common.delete')} style={{ color: 'var(--color-danger)' }} onClick={(e) => handleDeleteOrder(order, e)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — easier to tap through on a phone than a table */}
      <div className="workorder-card-list mobile-only animate-fade-in">
        {list.map((order) => (
          <div key={order.id} className="workorder-card" onClick={() => detail.open(order.id)}>
            <div className="workorder-card-top">
              <span className="workorder-card-number">{order.numero_orden}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                {user?.rol === 'admin' && (
                  <button className="btn btn-ghost btn-sm btn-icon" title={t('common.delete')} style={{ color: 'var(--color-danger)' }} onClick={(e) => handleDeleteOrder(order, e)}>
                    <Trash2 size={16} />
                  </button>
                )}
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
              <span className={`badge badge-${order.tipo_trabajo}`}>{order.tipo_trabajo}</span>
              <span className={`badge badge-${order.estatus}`}>{statusLabels[order.estatus]}</span>
            </div>
            <div className="workorder-card-progress">
              <div className="progress-bar" style={{ flex: 1, height: '6px' }}>
                <div className={`progress-fill ${order.porcentaje_avance === 100 ? 'success' : ''}`} style={{ width: `${order.porcentaje_avance}%` }}></div>
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)', minWidth: 28 }}>{order.porcentaje_avance}%</span>
            </div>
            <div className="workorder-card-footer">
              <span>
                <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {order.fecha_estimada_entrega}
              </span>
              <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>${order.total_general.toLocaleString()}</span>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 'var(--space-6) 0' }}>
            {t('common.noResults')}
          </p>
        )}
      </div>
    </>
  );

  // List view
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('workOrders.title')}</h1>
          <p className="page-subtitle">{filtered.length} {t('common.results')}</p>
        </div>
        <button className="btn btn-primary" id="new-order-btn" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} /> {t('workOrders.newOrder')}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
          <input className="form-input" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
          {['all', 'recepcion', 'en_proceso', 'espera_repuestos', 'finalizado', 'entregado'].map((status) => (
            <button
              key={status}
              className={`tab ${filterStatus === status ? 'active' : ''}`}
              onClick={() => setFilterStatus(status)}
              style={{ borderBottom: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', flexShrink: 0 }}
            >
              {status === 'all' ? t('common.all') : statusLabels[status]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : isAdmin ? (
        renderOrderList(filtered)
      ) : (
        <>
          {/* A technician lands on their own work first. */}
          <section className="orders-section">
            <h2 className="orders-section-title">
              <Wrench size={18} />
              {t('workOrders.myOrders')}
              <span className="orders-section-count">{myOrders.length}</span>
            </h2>
            {myOrders.length === 0 ? (
              <p className="orders-section-empty">{t('workOrders.myOrdersEmpty')}</p>
            ) : (
              renderOrderList(myOrders)
            )}
          </section>

          {/* The rest of the board stays one click away, never in the way. */}
          <section className="orders-section">
            <button
              type="button"
              className="orders-section-toggle"
              onClick={() => setShowOtherOrders((v) => !v)}
              aria-expanded={showOtherOrders}
            >
              {showOtherOrders ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <span className="orders-section-title">
                {t('workOrders.otherOrders')}
                <span className="orders-section-count">{otherOrders.length}</span>
              </span>
            </button>
            {showOtherOrders && (
              <>
                <p className="orders-section-hint">{t('workOrders.otherOrdersHint')}</p>
                {otherOrders.length === 0 ? (
                  <p className="orders-section-empty">{t('common.noResults')}</p>
                ) : (
                  renderOrderList(otherOrders)
                )}
              </>
            )}
          </section>
        </>
      )}

      {showCreateModal && (
        <WorkOrderCreateModal
          form={form}
          customers={customers}
          vehiclesForCustomer={vehiclesForCustomer}
          operators={operators}
          isAdmin={isAdmin}
          saving={saving}
          error={error}
          onSubmit={submitOrder}
          onClose={handleCloseCreateModal}
        />
      )}
    </div>
  );
}
