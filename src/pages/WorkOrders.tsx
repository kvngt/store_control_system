import { useState, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { mockWorkOrders, mockCustomers, mockVehicles, mockUsers, mockAssignments, mockLaborItems, mockWorkOrderParts } from '../services/mockData';
import type { WorkOrder } from '../types/database';
import {
  Plus,
  Search,
  Eye,
  Car,
  ChevronLeft,
  Calendar,
  Fuel,
  Gauge,
  DollarSign,
  User,
  Wrench,
  Paintbrush,
  Camera,
  X,
  Upload,
  CheckCircle2,
} from 'lucide-react';

interface Photos360 {
  front?: string;
  rear?: string;
  left?: string;
  right?: string;
  interior?: string;
  fuel?: string;
}

export default function WorkOrders() {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<WorkOrder[]>([...mockWorkOrders]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewOrder, setViewOrder] = useState<WorkOrder | null>(null);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [workType, setWorkType] = useState<'mecanica' | 'pintura' | 'combinado'>('mecanica');
  const [fuelLevel, setFuelLevel] = useState('1/2');
  const [milesIn, setMilesIn] = useState('45000');
  const [deposit, setDeposit] = useState('500');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [photos, setPhotos] = useState<Photos360>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeZone, setActiveZone] = useState<keyof Photos360 | null>(null);

  const statusLabels: Record<string, string> = {
    recepcion: t('workOrders.intake'),
    en_proceso: t('workOrders.inProgress'),
    espera_repuestos: t('workOrders.waitingParts'),
    finalizado: t('workOrders.completed'),
    entregado: t('workOrders.delivered'),
  };

  const filtered = orders.filter((o) => {
    const customer = mockCustomers.find((c) => c.id === o.cliente_id);
    const matchSearch =
      o.numero_orden.toLowerCase().includes(search.toLowerCase()) ||
      customer?.nombre.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || o.estatus === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleZoneClick = (zoneKey: keyof Photos360) => {
    setActiveZone(zoneKey);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeZone) {
      const imageUrl = URL.createObjectURL(file);
      setPhotos((prev) => ({ ...prev, [activeZone]: imageUrl }));
    }
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const customerObj = mockCustomers.find(c => c.id === selectedCustomer) || mockCustomers[0];
    const vehicleObj = mockVehicles.find(v => v.id === selectedVehicle) || mockVehicles[0];

    const newOrder: WorkOrder = {
      id: `ord-${Date.now()}`,
      sede_id: 'sede-1',
      numero_orden: `ORD-${new Date().getFullYear()}-00${orders.length + 1}`,
      cliente_id: customerObj.id,
      vehiculo_id: vehicleObj.id,
      tipo_trabajo: workType,
      estatus: 'recepcion',
      porcentaje_avance: 0,
      inspeccion_360_notas: inspectionNotes || 'Inspección de recepción realizada.',
      inspeccion_360_fotos: Object.values(photos),
      nivel_gasolina: fuelLevel,
      millas_ingreso: parseInt(milesIn) || 0,
      deposito_inicial: parseFloat(deposit) || 0,
      subtotal: 0,
      descuento: 0,
      impuestos: 0,
      total_general: parseFloat(deposit) || 0,
      fecha_estimada_entrega: new Date(Date.now() + 864000000).toISOString().split('T')[0],
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    };

    setOrders([newOrder, ...orders]);
    setShowCreateModal(false);
    setViewOrder(newOrder); // Open detail of newly created order
    setPhotos({});
    setInspectionNotes('');
  };

  // Order Detail View
  if (viewOrder) {
    const customer = mockCustomers.find((c) => c.id === viewOrder.cliente_id);
    const vehicle = mockVehicles.find((v) => v.id === viewOrder.vehiculo_id);
    const assignments = mockAssignments.filter((a) => a.orden_id === viewOrder.id);
    const laborItems = mockLaborItems.filter((l) => l.orden_id === viewOrder.id);
    const parts = mockWorkOrderParts.filter((p) => p.orden_id === viewOrder.id);
    const totalLabor = laborItems.reduce((sum, l) => sum + l.costo, 0);
    const totalParts = parts.reduce((sum, p) => sum + p.subtotal, 0);

    const zones: { key: keyof Photos360; label: string }[] = [
      { key: 'front', label: 'Frontal / Front' },
      { key: 'rear', label: 'Trasera / Rear' },
      { key: 'left', label: 'Izquierda / Left' },
      { key: 'right', label: 'Derecha / Right' },
      { key: 'interior', label: 'Interior' },
      { key: 'fuel', label: 'Tablero / Fuel' },
    ];

    return (
      <div className="animate-fade-in">
        <button className="btn btn-ghost" onClick={() => setViewOrder(null)} style={{ marginBottom: 'var(--space-4)' }}>
          <ChevronLeft size={18} /> {t('common.back')}
        </button>

        {/* Hidden File Input for Camera/File upload */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Order Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              {viewOrder.numero_orden}
              <span className={`badge badge-${viewOrder.estatus}`}>{statusLabels[viewOrder.estatus]}</span>
              <span className={`badge badge-${viewOrder.tipo_trabajo}`}>{viewOrder.tipo_trabajo}</span>
            </h1>
            <p className="page-subtitle">{customer?.nombre} — {vehicle?.anio} {vehicle?.marca} {vehicle?.modelo}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{t('workOrders.progress')}</div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-light)' }}>{viewOrder.porcentaje_avance}%</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          {/* Vehicle Info */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              <Car size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.vehicleServiceRepair')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {[
                [t('vehicles.brand'), `${vehicle?.marca} ${vehicle?.modelo}`],
                [t('vehicles.year'), vehicle?.anio],
                [t('vehicles.vin'), vehicle?.vin],
                [t('vehicles.plate'), vehicle?.placa],
                [t('vehicles.color'), vehicle?.color],
                [t('workOrders.milesIn'), viewOrder.millas_ingreso.toLocaleString()],
              ].map(([label, value], i) => (
                <div key={i} style={{ padding: 'var(--space-2) 0' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
            {/* Fuel + Deposit */}
            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Fuel size={16} style={{ color: 'var(--color-warning)' }} />
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('workOrders.fuelLevel')}</div>
                  <div style={{ fontWeight: 600 }}>{viewOrder.nivel_gasolina}</div>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <DollarSign size={16} style={{ color: 'var(--color-success)' }} />
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('workOrders.deposit')}</div>
                  <div style={{ fontWeight: 600 }}>${viewOrder.deposito_inicial.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Inspection 360 */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <Camera size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                {t('workOrders.inspection360')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-primary-light)', fontWeight: 500 }}>
                Haz clic en una zona para tomar/subir foto 📷
              </span>
            </h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
              {viewOrder.inspeccion_360_notas}
            </p>

            {/* Photo Upload & Capture Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
              {zones.map(({ key, label }) => {
                const imgUrl = photos[key];
                return (
                  <div
                    key={key}
                    onClick={() => handleZoneClick(key)}
                    style={{
                      height: 100,
                      background: imgUrl ? `url(${imgUrl}) center/cover no-repeat` : 'var(--color-bg-tertiary)',
                      border: imgUrl ? '2px solid var(--color-primary)' : '2px dashed var(--color-surface-border)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    {!imgUrl ? (
                      <>
                        <Camera size={20} style={{ color: 'var(--color-primary-light)' }} />
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{label}</span>
                      </>
                    ) : (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: 'rgba(10, 10, 15, 0.75)',
                          padding: '4px',
                          textAlign: 'center',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'var(--color-success)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <CheckCircle2 size={12} /> {label}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Labor */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              <Wrench size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.laborDescription')}
            </h3>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.description')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {laborItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.descripcion}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>${item.costo.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700 }}>Total Labor</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                      ${totalLabor.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Parts */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              <Paintbrush size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.partsDescription')}
            </h3>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.description')}</th>
                    <th>{t('common.quantity')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.price')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.subtotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part) => (
                    <tr key={part.id}>
                      <td>{part.descripcion}</td>
                      <td>{part.cantidad}</td>
                      <td style={{ textAlign: 'right' }}>${part.precio_venta_unitario.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>${part.subtotal.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} style={{ fontWeight: 700 }}>Total {t('workOrders.parts')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                      ${totalParts.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Totals Summary */}
        <div className="card" style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
            {[
              [t('workOrders.parts'), totalParts],
              [t('workOrders.labor'), totalLabor],
              [t('common.subtotal'), totalParts + totalLabor],
              [t('workOrders.deposit'), -viewOrder.deposito_inicial],
            ].map(([label, value], i) => (
              <div key={i} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{label as string}</div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                  {(value as number) < 0 ? '-' : ''}${Math.abs(value as number).toFixed(2)}
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'right', borderLeft: '2px solid var(--color-primary)', paddingLeft: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{t('common.total')}</div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                ${(totalParts + totalLabor - viewOrder.deposito_inicial).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Technicians */}
        <div className="card" style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
            <User size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.assignedTechnician')}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {assignments.map((a) => {
              const user = mockUsers.find((u) => u.id === a.usuario_id);
              return (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-surface-border)',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: a.tipo_tarea === 'mecanica'
                      ? 'var(--color-info-bg)' : 'rgba(236, 72, 153, 0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: a.tipo_tarea === 'mecanica' ? 'var(--color-info)' : '#F472B6',
                  }}>
                    {a.tipo_tarea === 'mecanica' ? <Wrench size={16} /> : <Paintbrush size={16} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{user?.nombre_completo}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                      {a.tipo_tarea === 'mecanica' ? t('workOrders.mechanical') : t('workOrders.painting')} · {a.estatus_tarea}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      {/* Hidden File Input for Camera/File upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">{t('workOrders.title')}</h1>
          <p className="page-subtitle">{filtered.length} {t('common.results')}</p>
        </div>
        <button
          className="btn btn-primary"
          id="new-order-btn"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={18} /> {t('workOrders.newOrder')}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
          <input className="form-input" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {['all', 'recepcion', 'en_proceso', 'espera_repuestos', 'finalizado', 'entregado'].map((status) => (
            <button
              key={status}
              className={`tab ${filterStatus === status ? 'active' : ''}`}
              onClick={() => setFilterStatus(status)}
              style={{ borderBottom: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)' }}
            >
              {status === 'all' ? t('common.all') : statusLabels[status]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
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
              <th>{t('common.total')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => {
              const customer = mockCustomers.find((c) => c.id === order.cliente_id);
              const vehicle = mockVehicles.find((v) => v.id === order.vehiculo_id);
              return (
                <tr key={order.id}>
                  <td style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>{order.numero_orden}</td>
                  <td>{customer?.nombre}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Car size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                      {vehicle?.anio} {vehicle?.marca} {vehicle?.modelo}
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
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setViewOrder(order)}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* CREATE WORK ORDER MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('workOrders.newOrder')}</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateOrder}>
              <div className="modal-body">
                {/* Customer & Vehicle Select */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('customers.customerProfile')}</label>
                    <select
                      className="form-input form-select"
                      value={selectedCustomer}
                      onChange={(e) => setSelectedCustomer(e.target.value)}
                      required
                    >
                      <option value="">-- Seleccionar Cliente --</option>
                      {mockCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('vehicles.title')}</label>
                    <select
                      className="form-input form-select"
                      value={selectedVehicle}
                      onChange={(e) => setSelectedVehicle(e.target.value)}
                      required
                    >
                      <option value="">-- Seleccionar Vehículo --</option>
                      {mockVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.marca} {v.modelo} ({v.placa})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Work Type & Fuel */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('common.type')}</label>
                    <select
                      className="form-input form-select"
                      value={workType}
                      onChange={(e) => setWorkType(e.target.value as any)}
                    >
                      <option value="mecanica">{t('workOrders.mechanical')}</option>
                      <option value="pintura">{t('workOrders.painting')}</option>
                      <option value="combinado">{t('workOrders.combined')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('workOrders.fuelLevel')}</label>
                    <select
                      className="form-input form-select"
                      value={fuelLevel}
                      onChange={(e) => setFuelLevel(e.target.value)}
                    >
                      <option value="E (Vacio)">E (Vacío / Empty)</option>
                      <option value="1/4">1/4</option>
                      <option value="1/2">1/2</option>
                      <option value="3/4">3/4</option>
                      <option value="F (Lleno)">F (Lleno / Full)</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('workOrders.milesIn')}</label>
                    <input
                      className="form-input"
                      type="number"
                      value={milesIn}
                      onChange={(e) => setMilesIn(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('workOrders.deposit')} ($)</label>
                    <input
                      className="form-input"
                      type="number"
                      value={deposit}
                      onChange={(e) => setDeposit(e.target.value)}
                    />
                  </div>
                </div>

                {/* 360 Photos upload */}
                <div className="form-group" style={{ marginTop: 'var(--space-2)' }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t('workOrders.inspection360')} (Fotos) 📷</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-primary-light)' }}>
                      Toca un cuadro para tomar foto o seleccionar archivo
                    </span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                    {[
                      { key: 'front', label: 'Frente' },
                      { key: 'rear', label: 'Atrás' },
                      { key: 'left', label: 'Izquierda' },
                      { key: 'right', label: 'Derecha' },
                      { key: 'interior', label: 'Interior' },
                      { key: 'fuel', label: 'Tablero' },
                    ].map(({ key, label }) => {
                      const imgUrl = photos[key as keyof Photos360];
                      return (
                        <div
                          key={key}
                          onClick={() => handleZoneClick(key as keyof Photos360)}
                          style={{
                            height: 75,
                            background: imgUrl ? `url(${imgUrl}) center/cover no-repeat` : 'var(--color-bg-tertiary)',
                            border: imgUrl ? '2px solid var(--color-success)' : '1px dashed var(--color-surface-border)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 2,
                            cursor: 'pointer',
                            transition: 'all var(--transition-fast)',
                          }}
                        >
                          {!imgUrl ? (
                            <>
                              <Camera size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{label}</span>
                            </>
                          ) : (
                            <div style={{ background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4, fontSize: '10px', color: '#fff' }}>
                              ✓ {label}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
                  <label className="form-label">Notas de la Inspección 360°</label>
                  <textarea
                    className="form-input form-textarea"
                    placeholder="Detalles sobre rayones, abolladuras previas o estado general del auto..."
                    value={inspectionNotes}
                    onChange={(e) => setInspectionNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
