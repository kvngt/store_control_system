import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { supabaseService } from '../services/supabaseService';
import type { FinancialTransaction, TransactionType, TransactionCategory, DashboardStats } from '../types/database';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Download,
  X,
} from 'lucide-react';

export default function Finance() {
  const { t } = useLanguage();
  const { user, currentSede } = useAuth();
  const sedeId = user?.rol === 'admin' ? currentSede?.id : user?.sede_id;

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [filterType, setFilterType] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    tipo: 'ingreso' as TransactionType,
    categoria: 'pago_cliente' as TransactionCategory,
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
  });

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      supabaseService.getTransactions(sedeId),
      supabaseService.getDashboardStats(sedeId),
    ])
      .then(([txns, statsData]) => {
        setTransactions(txns);
        setStats(statsData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sedeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = transactions.filter((txn) => filterType === 'all' || txn.tipo === filterType);

  const totalIncome = transactions.filter((t) => t.tipo === 'ingreso').reduce((sum, t) => sum + Number(t.monto), 0);
  const totalExpense = transactions.filter((t) => t.tipo === 'egreso').reduce((sum, t) => sum + Number(t.monto), 0);
  const balance = totalIncome - totalExpense;

  const categoryLabels: Record<string, string> = {
    pago_cliente: t('finance.clientPayment'),
    compra_repuesto: t('finance.partsPurchase'),
    planilla: t('finance.payroll'),
    gasto_operativo: t('finance.operatingExpense'),
  };

  const handleSave = async () => {
    const monto = parseFloat(form.monto);
    if (!monto || monto <= 0 || !form.descripcion.trim() || !user) return;
    setSaving(true);
    try {
      await supabaseService.createTransaction({
        sede_id: sedeId || currentSede?.id || '',
        tipo: form.tipo,
        categoria: form.categoria,
        monto,
        descripcion: form.descripcion,
        fecha: form.fecha,
        registrado_por: user.id,
      });
      setShowModal(false);
      setForm({ tipo: 'ingreso', categoria: 'pago_cliente', monto: '', fecha: new Date().toISOString().split('T')[0], descripcion: '' });
      loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = () => {
    const headers = [t('common.date'), t('common.type'), t('common.category'), t('common.description'), t('common.amount')];
    const rows = filtered.map((txn) => [
      txn.fecha,
      txn.tipo,
      categoryLabels[txn.categoria] || txn.categoria,
      txn.descripcion.replace(/"/g, '""'),
      txn.tipo === 'ingreso' ? txn.monto : -txn.monto,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restorify-finanzas-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('finance.title')}</h1>
          <p className="page-subtitle">{filtered.length} {t('finance.transactions').toLowerCase()}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" id="export-excel-btn" onClick={handleExportExcel}>
            <Download size={18} /> {t('finance.exportExcel')}
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} id="new-transaction-btn">
            <Plus size={18} /> {t('finance.newTransaction')}
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Financial KPIs */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card stagger-1 animate-fade-in-up">
          <div className="stat-icon success">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-label">{t('finance.income')}</div>
            <div className="stat-value" style={{ color: 'var(--color-success)' }}>
              ${totalIncome.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="stat-card stagger-2 animate-fade-in-up">
          <div className="stat-icon" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
            <TrendingDown size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-label">{t('finance.expense')}</div>
            <div className="stat-value" style={{ color: 'var(--color-danger)' }}>
              ${totalExpense.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="stat-card stagger-3 animate-fade-in-up">
          <div className="stat-icon primary">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-label">{t('finance.balance')}</div>
            <div className="stat-value" style={{ color: balance >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {balance >= 0 ? '+' : '-'}${Math.abs(balance).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      {stats && (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="card-header">
            <h3 className="card-title">{t('finance.monthlySummary')}</h3>
          </div>
          <div className="chart-bars" style={{ height: 180 }}>
            {stats.ingresos_por_mes.map((month, i) => {
              const maxVal = Math.max(1, ...stats.ingresos_por_mes.map((m) => Math.max(m.ingresos, m.egresos)));
              return (
                <div key={i} className="chart-bar-group">
                  <div className="chart-bar-pair">
                    <div className="chart-bar income" style={{ height: `${(month.ingresos / maxVal) * 140}px` }} title={`${t('finance.income')}: $${month.ingresos.toLocaleString()}`}></div>
                    <div className="chart-bar expense" style={{ height: `${(month.egresos / maxVal) * 140}px` }} title={`${t('finance.expense')}: $${month.egresos.toLocaleString()}`}></div>
                  </div>
                  <span className="chart-bar-label">{month.mes}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {(['all', 'ingreso', 'egreso'] as const).map((type) => (
          <button
            key={type}
            className={`tab ${filterType === type ? 'active' : ''}`}
            onClick={() => setFilterType(type)}
            style={{ borderBottom: 'none', padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)' }}
          >
            {type === 'all' ? t('common.all') : type === 'ingreso' ? t('finance.income') : t('finance.expense')}
          </button>
        ))}
      </div>

      {/* Transactions Table */}
      <div className="table-container animate-fade-in">
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('common.type')}</th>
              <th>{t('common.category')}</th>
              <th>{t('common.description')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {[...filtered].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).map((txn) => (
              <tr key={txn.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{txn.fecha}</td>
                <td>
                  <span className={`badge badge-${txn.tipo}`}>
                    {txn.tipo === 'ingreso' ? (
                      <><ArrowUpRight size={12} /> {t('finance.income')}</>
                    ) : (
                      <><ArrowDownRight size={12} /> {t('finance.expense')}</>
                    )}
                  </span>
                </td>
                <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  {categoryLabels[txn.categoria]}
                </td>
                <td>{txn.descripcion}</td>
                <td style={{
                  textAlign: 'right',
                  fontWeight: 600,
                  color: txn.tipo === 'ingreso' ? 'var(--color-success)' : 'var(--color-danger)',
                }}>
                  {txn.tipo === 'ingreso' ? '+' : '-'}${Number(txn.monto).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Transaction Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('finance.newTransaction')}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('common.type')}</label>
                  <select
                    className="form-input form-select"
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value as TransactionType })}
                  >
                    <option value="ingreso">{t('finance.income')}</option>
                    <option value="egreso">{t('finance.expense')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.category')}</label>
                  <select
                    className="form-input form-select"
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value as TransactionCategory })}
                  >
                    <option value="pago_cliente">{t('finance.clientPayment')}</option>
                    <option value="compra_repuesto">{t('finance.partsPurchase')}</option>
                    <option value="planilla">{t('finance.payroll')}</option>
                    <option value="gasto_operativo">{t('finance.operatingExpense')}</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('common.amount')}</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.date')}</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder={t('common.description')}
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                />
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
