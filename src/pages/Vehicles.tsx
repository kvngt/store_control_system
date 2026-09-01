import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { supabaseService } from '../services/supabaseService';
import { getErrorMessage } from '../lib/errors';
import { Search, Plus, Edit3, Trash2, X } from 'lucide-react';
import type { Vehicle, Customer } from '../types/database';

export default function Vehicles() {
  const { t, language } = useLanguage();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [form, setForm] = useState({
    cliente_id: '', marca: '', modelo: '', anio: '', vin: '', placa: '', color: '',
  });

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([supabaseService.getVehicles(), supabaseService.getCustomers()])
      .then(([v, c]) => {
        setVehicles(v);
        setCustomers(c);
      })
      .catch((err) => setError(getErrorMessage(err, language)))
      .finally(() => setLoading(false));
  }, [language]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = vehicles.filter(
    (v) =>
      v.marca.toLowerCase().includes(search.toLowerCase()) ||
      v.modelo.toLowerCase().includes(search.toLowerCase()) ||
      v.vin.toLowerCase().includes(search.toLowerCase()) ||
      v.placa.toLowerCase().includes(search.toLowerCase()) ||
      (v.cliente_nombre || '').toLowerCase().includes(search.toLowerCase())
  );

  const openCreateModal = () => {
    setSelected(null);
    setForm({ cliente_id: '', marca: '', modelo: '', anio: '', vin: '', placa: '', color: '' });
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
      placa: v.placa,
      color: v.color,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.cliente_id || !form.marca.trim() || !form.vin.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, anio: parseInt(form.anio) || new Date().getFullYear() };
      if (selected) {
        await supabaseService.updateVehicle(selected.id, payload);
      } else {
        await supabaseService.createVehicle(payload);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v: Vehicle) => {
    if (!confirm(`${t('common.delete')}: ${v.marca} ${v.modelo}?`)) return;
    try {
      await supabaseService.deleteVehicle(v.id);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

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
                  <td data-label={t('vehicles.plate')}><span className="badge badge-en_proceso">{v.placa}</span></td>
                  <td data-label={t('vehicles.color')}>{v.color}</td>
                  <td data-label={t('vehicles.owner')} style={{ color: 'var(--color-text-secondary)' }}>{v.cliente_nombre}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEditModal(v)}><Edit3 size={16} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-danger)' }} onClick={() => handleDelete(v)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{selected ? t('common.edit') : t('vehicles.newVehicle')}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('vehicles.owner')}</label>
                <select
                  className="form-input form-select"
                  value={form.cliente_id}
                  onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
                >
                  <option value="">-- {t('common.search')} --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('vehicles.brand')}</label>
                  <input className="form-input" placeholder="Toyota, Honda, Ford..." value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('vehicles.model')}</label>
                  <input className="form-input" placeholder="Camry, Civic, F-150..." value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('vehicles.year')}</label>
                  <input className="form-input" type="number" placeholder="2024" value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('vehicles.color')}</label>
                  <input className="form-input" placeholder="Blanco, Negro, Azul..." value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('vehicles.vin')}</label>
                  <input className="form-input" placeholder="17 caracteres" maxLength={17} value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('vehicles.plate')}</label>
                  <input className="form-input" placeholder="MD-XXX0000" value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? t('common.loading') : selected ? t('common.update') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
