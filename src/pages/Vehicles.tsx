import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { mockVehicles, mockCustomers } from '../services/mockData';
import { Search, Plus, Eye, Edit3, X } from 'lucide-react';

export default function Vehicles() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const filtered = mockVehicles.filter(
    (v) =>
      v.marca.toLowerCase().includes(search.toLowerCase()) ||
      v.modelo.toLowerCase().includes(search.toLowerCase()) ||
      v.vin.toLowerCase().includes(search.toLowerCase()) ||
      v.placa.toLowerCase().includes(search.toLowerCase()) ||
      (v.cliente_nombre || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('vehicles.title')}</h1>
          <p className="page-subtitle">{filtered.length} {t('common.results')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} id="new-vehicle-btn">
          <Plus size={18} /> {t('vehicles.newVehicle')}
        </button>
      </div>

      <div style={{ marginBottom: 'var(--space-4)', position: 'relative', maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
        <input className="form-input" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>

      <div className="table-container animate-fade-in">
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
                <td style={{ fontWeight: 600 }}>{v.marca} {v.modelo}</td>
                <td>{v.anio}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>{v.vin}</td>
                <td><span className="badge badge-en_proceso">{v.placa}</span></td>
                <td>{v.color}</td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{v.cliente_nombre}</td>
                <td>
                  <div className="table-actions">
                    <button className="btn btn-ghost btn-sm btn-icon"><Eye size={16} /></button>
                    <button className="btn btn-ghost btn-sm btn-icon"><Edit3 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('vehicles.newVehicle')}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('vehicles.owner')}</label>
                <select className="form-input form-select">
                  <option value="">-- {t('common.search')} --</option>
                  {mockCustomers.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('vehicles.brand')}</label>
                  <input className="form-input" placeholder="Toyota, Honda, Ford..." />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('vehicles.model')}</label>
                  <input className="form-input" placeholder="Camry, Civic, F-150..." />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('vehicles.year')}</label>
                  <input className="form-input" type="number" placeholder="2024" />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('vehicles.color')}</label>
                  <input className="form-input" placeholder="Blanco, Negro, Azul..." />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('vehicles.vin')}</label>
                  <input className="form-input" placeholder="17 caracteres" maxLength={17} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('vehicles.plate')}</label>
                  <input className="form-input" placeholder="MD-XXX0000" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={() => setShowModal(false)}>{t('common.create')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
