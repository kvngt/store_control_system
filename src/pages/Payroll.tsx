import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { supabaseService } from '../services/supabaseService';
import type { PayrollEntry, UserProfile } from '../types/database';
import { Plus, Calendar, X } from 'lucide-react';

export default function Payroll() {
  const { t } = useLanguage();
  const { user, currentSede } = useAuth();
  const sedeId = user?.rol === 'admin' ? currentSede?.id : user?.sede_id;

  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    usuario_id: '',
    periodo_inicio: '',
    periodo_fin: '',
    salario_base: '',
    bonos: '0',
    deducciones: '0',
    fecha_pago: new Date().toISOString().split('T')[0],
  });

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      supabaseService.getPayroll(sedeId),
      supabaseService.getUsers(sedeId),
    ])
      .then(([payroll, u]) => {
        setEntries(payroll);
        setUsers(u);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sedeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!form.usuario_id || !form.periodo_inicio || !form.periodo_fin || !form.salario_base) return;
    setSaving(true);
    try {
      await supabaseService.createPayroll({
        sede_id: sedeId || currentSede?.id || '',
        usuario_id: form.usuario_id,
        periodo_inicio: form.periodo_inicio,
        periodo_fin: form.periodo_fin,
        salario_base: parseFloat(form.salario_base) || 0,
        bonos: parseFloat(form.bonos) || 0,
        deducciones: parseFloat(form.deducciones) || 0,
        fecha_pago: form.fecha_pago,
      });
      setShowModal(false);
      setForm({ usuario_id: '', periodo_inicio: '', periodo_fin: '', salario_base: '', bonos: '0', deducciones: '0', fecha_pago: new Date().toISOString().split('T')[0] });
      loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('payroll.title')}</h1>
          <p className="page-subtitle">{entries.length} {t('common.results')}</p>
        </div>
        <button className="btn btn-primary" id="new-payroll-btn" onClick={() => setShowModal(true)}>
          <Plus size={18} /> {t('payroll.newEntry')}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="table-container animate-fade-in">
        <table className="table">
          <thead>
            <tr>
              <th>{t('payroll.employee')}</th>
              <th>{t('payroll.periodStart')}</th>
              <th>{t('payroll.periodEnd')}</th>
              <th style={{ textAlign: 'right' }}>{t('payroll.baseSalary')}</th>
              <th style={{ textAlign: 'right' }}>{t('payroll.bonuses')}</th>
              <th style={{ textAlign: 'right' }}>{t('payroll.deductions')}</th>
              <th style={{ textAlign: 'right' }}>{t('payroll.totalPaid')}</th>
              <th>{t('payroll.payDate')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'var(--color-bg-hover)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 'var(--font-size-xs)', fontWeight: 700,
                      color: 'var(--color-primary-light)',
                    }}>
                      {entry.usuario?.nombre_completo.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{entry.usuario?.nombre_completo}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                        {entry.usuario?.rol}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 'var(--font-size-sm)' }}>{entry.periodo_inicio}</td>
                <td style={{ fontSize: 'var(--font-size-sm)' }}>{entry.periodo_fin}</td>
                <td style={{ textAlign: 'right' }}>${entry.salario_base.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>+${entry.bonos.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>-${entry.deducciones.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                  ${entry.total_pagado.toLocaleString()}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                    <Calendar size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                    {entry.fecha_pago}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-8)' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Total {t('payroll.baseSalary')}
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
              ${entries.reduce((s, e) => s + e.salario_base, 0).toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Total {t('payroll.totalPaid')}
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary-light)' }}>
              ${entries.reduce((s, e) => s + e.total_pagado, 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('payroll.newEntry')}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('payroll.employee')}</label>
                <select className="form-input form-select" value={form.usuario_id} onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}>
                  <option value="">-- {t('common.search')} --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre_completo} ({u.rol})</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('payroll.periodStart')}</label>
                  <input className="form-input" type="date" value={form.periodo_inicio} onChange={(e) => setForm({ ...form, periodo_inicio: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.periodEnd')}</label>
                  <input className="form-input" type="date" value={form.periodo_fin} onChange={(e) => setForm({ ...form, periodo_fin: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('payroll.baseSalary')}</label>
                  <input className="form-input" type="number" value={form.salario_base} onChange={(e) => setForm({ ...form, salario_base: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.bonuses')}</label>
                  <input className="form-input" type="number" value={form.bonos} onChange={(e) => setForm({ ...form, bonos: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('payroll.deductions')}</label>
                  <input className="form-input" type="number" value={form.deducciones} onChange={(e) => setForm({ ...form, deducciones: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('payroll.payDate')}</label>
                <input className="form-input" type="date" value={form.fecha_pago} onChange={(e) => setForm({ ...form, fecha_pago: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? t('common.loading') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
