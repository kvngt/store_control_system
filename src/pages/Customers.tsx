import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customersService } from '../services/supabaseService';
import { queryKeys } from '../lib/queryClient';
import { emptyList } from '../lib/emptyList';
import { getErrorMessage } from '../lib/errors';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  X,
  Car,
  ClipboardList,
  Phone,
  Mail,
  MapPin,
  StickyNote,
  ChevronLeft,
} from 'lucide-react';
import type { Customer, Vehicle, WorkOrder } from '../types/database';

export default function Customers() {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [viewProfile, setViewProfile] = useState<Customer | null>(null);
  const [profileData, setProfileData] = useState<{ vehicles: Vehicle[]; orders: WorkOrder[] } | null>(null);

  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', direccion: '', notas_crm: '' });

  const isAdmin = user?.rol === 'admin';
  const sedeId = isAdmin ? currentSede?.id : user?.sede_id;

  const queryClient = useQueryClient();

  const { data: customers = emptyList<Customer>(), isPending: loading, error: loadError } = useQuery({
    queryKey: queryKeys.customers(sedeId),
    queryFn: () => customersService.getCustomers(sedeId),
  });

  const loadCustomers = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.customers(sedeId) });
    // The counts on each row come from vehicles and orders, so a customer
    // going away changes what those screens show too.
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(sedeId) });
  };

  // Deep link from the global header search: /customers?open=<id>
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      customersService
        .getCustomerDetail(openId)
        .then((data) => {
          setViewProfile(data.customer);
          setProfileData({ vehicles: data.vehicles, orders: data.orders });
        })
        .catch((err) => setActionError(getErrorMessage(err, language)));
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keyed on the id rather than the object: `viewProfile` is replaced by a new
  // object on every list reload, and keying on it re-fetched the profile each
  // time. `enabled` keeps the query idle while no profile is open.
  const viewProfileId = viewProfile?.id;
  const profileQuery = useQuery({
    queryKey: queryKeys.customerDetail(viewProfileId ?? ''),
    queryFn: () => customersService.getCustomerDetail(viewProfileId as string),
    enabled: !!viewProfileId,
  });

  useEffect(() => {
    if (!viewProfileId) {
      setProfileData(null);
      return;
    }
    if (profileQuery.data) {
      setProfileData({ vehicles: profileQuery.data.vehicles, orders: profileQuery.data.orders });
    }
  }, [viewProfileId, profileQuery.data]);

  // Both failure sources rendered through one box, translated at render time —
  // holding the load error raw is what stops a language toggle from re-querying.
  const error =
    actionError ||
    (loadError ? getErrorMessage(loadError, language) : '') ||
    (profileQuery.error ? getErrorMessage(profileQuery.error, language) : '');

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.nombre.toLowerCase().includes(searchLower) ||
        c.telefono.includes(search) ||
        c.email.toLowerCase().includes(searchLower)
    );
  }, [customers, search]);

  const openCreateModal = () => {
    setSelectedCustomer(null);
    setForm({ nombre: '', telefono: '', email: '', direccion: '', notas_crm: '' });
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setForm({
      nombre: customer.nombre,
      telefono: customer.telefono,
      email: customer.email,
      direccion: customer.direccion,
      notas_crm: customer.notas_crm || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.telefono.trim()) return;
    setSaving(true);
    try {
      if (selectedCustomer) {
        await customersService.updateCustomer(selectedCustomer.id, form);
      } else {
        await customersService.createCustomer({ ...form, sede_id: sedeId || currentSede?.id || '' });
      }
      setShowModal(false);
      loadCustomers();
    } catch (err) {
      setActionError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  // Admin-only: removing a customer cascades to every vehicle they own, so a
  // single click can erase years of history. The `clientes_delete` RLS policy
  // is what enforces it; this check keeps the UI from promising otherwise.
  const handleDelete = async (customer: Customer) => {
    if (!isAdmin) {
      setActionError(t('common.adminOnly'));
      return;
    }
    if (!confirm(`${t('common.delete')}: ${customer.nombre}?`)) return;
    try {
      await customersService.deleteCustomer(customer.id);
      loadCustomers();
    } catch (err) {
      setActionError(getErrorMessage(err, language));
    }
  };

  const statusLabels: Record<string, string> = {
    recepcion: t('workOrders.intake'),
    en_proceso: t('workOrders.inProgress'),
    espera_repuestos: t('workOrders.waitingParts'),
    finalizado: t('workOrders.completed'),
    entregado: t('workOrders.delivered'),
  };

  // Profile view
  if (viewProfile) {
    const vehicles = profileData?.vehicles || [];
    const orders = profileData?.orders || [];

    return (
      <div className="animate-fade-in">
        <button
          className="btn btn-ghost"
          onClick={() => setViewProfile(null)}
          style={{ marginBottom: 'var(--space-4)' }}
        >
          <ChevronLeft size={18} /> {t('common.back')}
        </button>

        {error && <div className="alert-error">{error}</div>}

        <div className="responsive-grid-sidebar">
          {/* Customer Info Card */}
          <div className="card">
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: 'var(--gradient-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto var(--space-3)',
                  fontSize: 'var(--font-size-2xl)',
                  fontWeight: 700,
                  color: 'var(--color-text-inverse)',
                }}
              >
                {viewProfile.nombre.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
                {viewProfile.nombre}
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
                {t('customers.customerProfile')}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
                <Phone size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                <span>{viewProfile.telefono}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
                <Mail size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                <span>{viewProfile.email}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
                <MapPin size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                <span>{viewProfile.direccion}</span>
              </div>
            </div>

            {viewProfile.notas_crm && (
              <div style={{ marginTop: 'var(--space-6)', padding: 'var(--space-4)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  <StickyNote size={14} />
                  {t('customers.crmNotes')}
                </div>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  {viewProfile.notas_crm}
                </p>
              </div>
            )}
          </div>

          {/* Right side */}
          <div>
            {/* Vehicles */}
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
              <div className="card-header">
                <h3 className="card-title">
                  <Car size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                  {t('customers.registeredVehicles')} ({vehicles.length})
                </h3>
              </div>
              {vehicles.length === 0 ? (
                <p style={{ color: 'var(--color-text-tertiary)' }}>{t('customers.noVehicles')}</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
                  {vehicles.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        padding: 'var(--space-4)',
                        background: 'var(--color-bg-tertiary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-surface-border)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        {v.anio} {v.marca} {v.modelo}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        {v.color} · {v.placa}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                        VIN: {v.vin.slice(0, 11)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Service History */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <ClipboardList size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                  {t('customers.serviceHistory')} ({orders.length})
                </h3>
              </div>
              <div className="table-container cards-on-mobile" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('workOrders.orderNumber')}</th>
                      <th>{t('common.type')}</th>
                      <th>{t('common.status')}</th>
                      <th>{t('common.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td data-label={t('workOrders.orderNumber')} style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>{o.numero_orden}</td>
                        <td data-label={t('common.type')}><span className={`badge badge-${o.tipo_trabajo}`}>{o.tipo_trabajo}</span></td>
                        <td data-label={t('common.status')}><span className={`badge badge-${o.estatus}`}>{statusLabels[o.estatus]}</span></td>
                        <td data-label={t('common.total')} style={{ fontWeight: 600 }}>${o.total_general.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('customers.title')}</h1>
          <p className="page-subtitle">{filtered.length} {t('common.results')}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal} id="new-customer-btn">
          <Plus size={18} /> {t('customers.newCustomer')}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Search */}
      <div style={{ marginBottom: 'var(--space-4)', position: 'relative', maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
        <input
          className="form-input"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 36 }}
          id="customer-search"
        />
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : (
        <div className="table-container cards-on-mobile animate-fade-in">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.phone')}</th>
                <th>{t('common.email')}</th>
                <th>{t('customers.vehicles')}</th>
                <th>{t('workOrders.title')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id}>
                  <td data-label={t('common.name')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'var(--color-bg-hover)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 700,
                          color: 'var(--color-primary-light)',
                          flexShrink: 0,
                        }}
                      >
                        {customer.nombre.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <span style={{ fontWeight: 500 }}>{customer.nombre}</span>
                    </div>
                  </td>
                  <td data-label={t('common.phone')}>{customer.telefono}</td>
                  <td data-label={t('common.email')} style={{ color: 'var(--color-text-secondary)' }}>{customer.email}</td>
                  <td>
                    <span className="badge badge-en_proceso">{customer.vehiculos_count || 0}</span>
                  </td>
                  <td>
                    <span className="badge badge-finalizado">{customer.ordenes_count || 0}</span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" title={t('common.view')} onClick={() => setViewProfile(customer)}>
                        <Eye size={16} />
                      </button>
                      <button className="btn btn-ghost btn-sm btn-icon" title={t('common.edit')} onClick={() => openEditModal(customer)}>
                        <Edit3 size={16} />
                      </button>
                      {isAdmin && (
                        <button className="btn btn-ghost btn-sm btn-icon" title={t('common.delete')} style={{ color: 'var(--color-danger)' }} onClick={() => handleDelete(customer)}>
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
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedCustomer ? t('customers.editCustomer') : t('customers.newCustomer')}
              </h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('common.name')}</label>
                  <input className="form-input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} id="customer-name" />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.phone')}</label>
                  <input className="form-input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} id="customer-phone" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('common.email')}</label>
                  <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} id="customer-email" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.address')}</label>
                <input className="form-input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} id="customer-address" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('customers.crmNotes')}</label>
                <textarea className="form-input form-textarea" value={form.notas_crm} onChange={(e) => setForm({ ...form, notas_crm: e.target.value })} id="customer-notes" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} id="customer-save">
                {saving ? t('common.loading') : selectedCustomer ? t('common.update') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
