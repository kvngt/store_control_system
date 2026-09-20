import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customersService, vehiclesService } from '../services/supabaseService';
import { queryKeys } from '../lib/queryClient';
import { emptyList } from '../lib/emptyList';
import { getErrorMessage } from '../lib/errors';
import { Search, Plus, Edit3, Trash2, X, Eye, ChevronLeft, ClipboardList, Car } from 'lucide-react';
import { checkUsPlate, checkVin } from '../lib/vin';
import VehicleFields from '../features/vehicles/VehicleFields';
import { EMPTY_VEHICLE_FIELDS, validateVehicleFields } from '../features/vehicles/vehicleForm';
import CustomerPicker from '../components/CustomerPicker';
import type { NewCustomerDraft } from '../components/CustomerPicker';
import type { Vehicle, Customer } from '../types/database';
import { money } from '../lib/money';

// The vehicle half of the form lives in `VehicleFields`, shared with the order
// intake dialog; this screen adds only the owner.
const EMPTY_FORM = { cliente_id: '', ...EMPTY_VEHICLE_FIELDS };

export default function Vehicles() {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const isAdmin = user?.rol === 'admin';
  // Strict isolation: only ever the active sede's vehicles and customers.
  const sedeId = isAdmin ? currentSede?.id : user?.sede_id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // El historial del vehículo: qué se le hizo y cuándo. Es lo que sirve para responder
  // "qué le hicimos la vez pasada", y hasta ahora solo existía por cliente.
  const [viewId, setViewId] = useState<string | null>(null);

  // Separate queries: the customer list is the same cache entry Clientes and
  // the order intake dialog already use, so opening this screen after one of
  // those costs nothing.
  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles(sedeId),
    queryFn: () => vehiclesService.getVehicles(sedeId),
  });
  const customersQuery = useQuery({
    queryKey: queryKeys.customers(sedeId),
    queryFn: () => customersService.getCustomers(sedeId),
  });
  // Por id y no por objeto: la fila se reemplaza en cada refetch de la lista.
  const detailQuery = useQuery({
    queryKey: queryKeys.vehicleDetail(viewId ?? ''),
    queryFn: () => vehiclesService.getVehicleDetail(viewId ?? ''),
    enabled: !!viewId,
  });

  const vehicles = vehiclesQuery.data ?? emptyList<Vehicle>();
  const customers = customersQuery.data ?? emptyList<Customer>();
  const loading = vehiclesQuery.isPending || customersQuery.isPending;
  const loadError = vehiclesQuery.error ?? customersQuery.error ?? detailQuery.error;

  const loadData = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(sedeId) });
    // A vehicle count hangs off each customer row.
    queryClient.invalidateQueries({ queryKey: queryKeys.customers(sedeId) });
  };

  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  // Kept raw until render so toggling the UI language doesn't re-query the fleet.
  const error = actionError || (loadError ? getErrorMessage(loadError, language) : '');

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return vehicles.filter(
      (v) =>
        v.marca.toLowerCase().includes(searchLower) ||
        v.modelo.toLowerCase().includes(searchLower) ||
        v.vin.toLowerCase().includes(searchLower) ||
        (v.placa || '').toLowerCase().includes(searchLower) ||
        (v.cliente_nombre || '').toLowerCase().includes(searchLower)
    );
  }, [vehicles, search]);

  const openCreateModal = () => {
    setSelected(null);
    setForm(EMPTY_FORM);
    setTouched(false);
    setShowModal(true);
  };

  const openEditModal = (v: Vehicle) => {
    setSelected(v);
    setForm({
      cliente_id: v.cliente_id,
      marca: v.marca,
      modelo: v.modelo,
      anio: String(v.anio),
      vin: v.vin,
      placa: v.placa || '',
      placa_estado: v.placa_estado || '',
      color: v.color,
      sin_placa: !v.placa,
    });
    setTouched(false);
    setShowModal(true);
  };

  // ===== Save =====
  const invalid = {
    cliente_id: !form.cliente_id,
    ...validateVehicleFields(form, { requirePlate: true }),
  };
  const hasErrors = Object.values(invalid).some(Boolean);

  const handleCreateCustomer = async (draft: NewCustomerDraft): Promise<Customer> => {
    const created = await customersService.createCustomer({
      ...draft,
      direccion: '',
      notas_crm: '',
      sede_id: sedeId || currentSede?.id || '',
    });
    // Make it selectable straight away instead of waiting for a refetch.
    queryClient.setQueryData<Customer[]>(queryKeys.customers(sedeId), (prev) => [created, ...(prev ?? [])]);
    return created;
  };

  const handleSave = async () => {
    setTouched(true);
    if (hasErrors) return;
    setSaving(true);
    try {
      const payload = {
        cliente_id: form.cliente_id,
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        anio: parseInt(form.anio, 10) || new Date().getFullYear(),
        vin: checkVin(form.vin).normalized,
        // NULL, never "SIN PLACA" or an empty string: a placeholder would show
        // up in search and print on the work order as if it were a real plate.
        placa: form.sin_placa ? null : checkUsPlate(form.placa, form.placa_estado || undefined).normalized,
        placa_estado: form.sin_placa ? null : form.placa_estado || null,
        color: form.color.trim(),
      };
      if (selected) {
        await vehiclesService.updateVehicle(selected.id, payload);
      } else {
        await vehiclesService.createVehicle(payload);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setActionError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  // Deleting a vehicle destroys its service history, so it is reserved for
  // admins. The `vehiculos_delete` RLS policy is the boundary that actually
  // holds; this check only keeps the UI honest about it.
  const handleDelete = async (v: Vehicle) => {
    if (!isAdmin) {
      setActionError(t('common.adminOnly'));
      return;
    }
    if (!confirm(`${t('common.delete')}: ${v.marca} ${v.modelo}?`)) return;
    try {
      await vehiclesService.deleteVehicle(v.id);
      loadData();
    } catch (err) {
      setActionError(getErrorMessage(err, language));
    }
  };

  // La vista de detalle, igual que el perfil del cliente: la misma pantalla, no una ruta
  // aparte. El número de orden abre la orden con el enlace profundo que ya existe.
  if (viewId) {
    const d = detailQuery.data;
    const orders = d?.orders ?? [];
    const v = d?.vehicle;
    const title = v ? [v.anio, v.marca, v.modelo].filter(Boolean).join(' ') : '';
    return (
      <div className="animate-fade-in">
        <button className="btn btn-ghost" onClick={() => setViewId(null)} style={{ marginBottom: 'var(--space-4)' }}>
          <ChevronLeft size={18} /> {t('common.back')}
        </button>

        {error && <div className="alert-error">{error}</div>}

        {detailQuery.isPending ? (
          <div className="loading-state"><div className="spinner" /></div>
        ) : !v ? (
          // Sin el `!error` esto decía "sin resultados" cuando la consulta se había caído:
          // el vehículo existe y la pantalla afirmaba lo contrario.
          !error && <p className="orders-section-empty">{t('common.noResults')}</p>
        ) : (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">
                  <Car size={22} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                  {title}
                </h1>
                <p className="page-subtitle">
                  {v.placa || t('vehicles.noPlate')} · {t('vehicles.owner')}: {v.cliente_nombre || '—'}
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <ClipboardList size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                  {t('vehicles.serviceHistory')} ({orders.length})
                </h3>
              </div>
              <div className="table-container cards-on-mobile" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('workOrders.orderNumber')}</th>
                      <th>{t('common.type')}</th>
                      <th>{t('common.status')}</th>
                      <th>{t('common.date')}</th>
                      {isAdmin && <th>{t('common.total')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 'var(--space-6) 0' }}>
                          {t('vehicles.noOrders')}
                        </td>
                      </tr>
                    ) : (
                      orders.map((o) => (
                        <tr key={o.id}>
                          <td data-label={t('workOrders.orderNumber')}>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => navigate(`/work-orders?open=${o.id}`)}
                            >
                              {o.numero_orden}
                            </button>
                          </td>
                          <td data-label={t('common.type')}><span className={`badge badge-${o.tipo_trabajo}`}>{o.tipo_trabajo}</span></td>
                          <td data-label={t('common.status')}><span className={`badge badge-${o.estatus}`}>{o.estatus}</span></td>
                          <td data-label={t('common.date')}>{new Date(o.creado_en).toLocaleDateString(language === 'es' ? 'es' : 'en')}</td>
                          {isAdmin && (
                            <td data-label={t('common.total')} style={{ fontWeight: 600 }}>
                              {money(o.montos?.total_general)}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('vehicles.title')}</h1>
          <p className="page-subtitle">{filtered.length} {t('common.results')}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal} id="new-vehicle-btn">
          <Plus size={18} /> {t('vehicles.newVehicle')}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div style={{ marginBottom: 'var(--space-4)', position: 'relative', maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
        <input className="form-input" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : (
        <div className="table-container cards-on-mobile animate-fade-in">
          <table className="table">
            <thead>
              <tr>
                <th>{t('vehicles.brand')} / {t('vehicles.model')}</th>
                <th>{t('vehicles.year')}</th>
                <th>{t('vehicles.vin')}</th>
                <th>{t('vehicles.plate')}</th>
                <th>{t('vehicles.color')}</th>
                <th>{t('vehicles.owner')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td data-label={t('vehicles.brand')} style={{ fontWeight: 600 }}>{v.marca} {v.modelo}</td>
                  <td data-label={t('vehicles.year')}>{v.anio}</td>
                  <td data-label={t('vehicles.vin')} style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>{v.vin}</td>
                  <td data-label={t('vehicles.plate')}>
                    {v.placa ? (
                      <span className="badge badge-en_proceso">
                        {v.placa_estado ? `${v.placa_estado} · ${v.placa}` : v.placa}
                      </span>
                    ) : (
                      <span className="badge" style={{ color: 'var(--color-text-tertiary)' }}>
                        {t('vehicles.noPlate')}
                      </span>
                    )}
                  </td>
                  <td data-label={t('vehicles.color')}>{v.color}</td>
                  <td data-label={t('vehicles.owner')} style={{ color: 'var(--color-text-secondary)' }}>{v.cliente_nombre}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" title={t('common.view')} onClick={() => setViewId(v.id)}><Eye size={16} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title={t('common.edit')} onClick={() => openEditModal(v)}><Edit3 size={16} /></button>
                      {isAdmin && (
                        <button className="btn btn-ghost btn-sm btn-icon" title={t('common.delete')} style={{ color: 'var(--color-danger)' }} onClick={() => handleDelete(v)}><Trash2 size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 'var(--space-6) 0' }}>
                    {t('common.noResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{selected ? t('vehicles.editVehicle') : t('vehicles.newVehicle')}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {/* 1 — Owner: pick from the customers on file, or add one here. */}
              <div className="form-section">
                <div className="form-section-title">{t('vehicles.owner')}</div>
                <CustomerPicker
                  customers={customers}
                  value={form.cliente_id}
                  onChange={(id) => setForm((prev) => ({ ...prev, cliente_id: id }))}
                  onCreate={handleCreateCustomer}
                  invalid={touched && invalid.cliente_id}
                />
                {touched && invalid.cliente_id && (
                  <p className="field-hint field-hint-error">{t('vehicles.ownerRequired')}</p>
                )}
              </div>

              {/* 2 — Vehicle: VIN lookup, brand/model/year/colour, plate.
                   Same component the order-intake dialog uses. */}
              <VehicleFields
                value={form}
                onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
                touched={touched}
                requirePlate
                disabled={saving}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} id="vehicle-save">
                {saving ? t('common.loading') : selected ? t('common.update') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
