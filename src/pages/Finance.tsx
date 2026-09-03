import { useEffect, useState, useCallback, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabaseService } from '../services/supabaseService';
import { getErrorMessage } from '../lib/errors';
import type { FinancialTransaction, TransactionType, TransactionCategory, DashboardStats, WorkOrder, BankStatementImport } from '../types/database';

// Lazy-loaded: pulls in pdfjs-dist (~1MB), which shouldn't ship in the main
// bundle for users who never open the import dialog.
const ImportStatementModal = lazy(() => import('./finance/ImportStatementModal'));
import LazyModal from '../components/LazyModal';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Download,
  FileUp,
  X,
  Trash2,
} from 'lucide-react';

export default function Finance() {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const sedeId = user?.rol === 'admin' ? currentSede?.id : user?.sede_id;

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [filterType, setFilterType] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  // Scoped to the dialog: the page-level `error` renders above the table and
  // therefore behind the modal overlay, where nobody can read it.
  const [modalError, setModalError] = useState('');
  // Orders the admin can attach a manual movement to, so a payment or a parts
  // purchase entered by hand is traceable to the job it belongs to.
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  // Imports are listed so a batch brought in by mistake can be undone. Without
  // this, `deleteImportBatch` existed in the service but no screen called it,
  // and a duplicated statement could only be cleaned up from the database.
  const [imports, setImports] = useState<BankStatementImport[]>([]);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    tipo: 'ingreso' as TransactionType,
    categoria: 'pago_cliente' as TransactionCategory,
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
    referencia_orden_id: '',
  });

  const EMPTY_FORM = {
    tipo: 'ingreso' as TransactionType,
    categoria: 'pago_cliente' as TransactionCategory,
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
    referencia_orden_id: '',
  };

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      supabaseService.getTransactions(sedeId),
      supabaseService.getDashboardStats(sedeId),
      supabaseService.getWorkOrders(sedeId),
      supabaseService.getImportBatches(sedeId),
    ])
      .then(([txns, statsData, orderList, importList]) => {
        setTransactions(txns);
        setStats(statsData);
        setOrders(orderList);
        setImports(importList);
      })
      .catch((err) => setError(getErrorMessage(err, language)))
      .finally(() => setLoading(false));
  }, [sedeId, language]);

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

  // Like the other dialogs in the app, every failed path has to say why: this
  // modal covers the page-level error box, so a bare `return` reads as a dead
  // button to whoever pressed it.
  const handleRevertImport = async (batch: BankStatementImport) => {
    const when = new Date(batch.fecha_importacion).toLocaleString('es');
    if (!confirm(`${t('finance.confirmRevertImport')} "${batch.nombre_archivo}" (${when})?`)) return;
    setRevertingId(batch.id);
    try {
      await supabaseService.deleteImportBatch(batch.id);
      showToast('success', t('finance.importReverted'));
      loadData();
    } catch (err) {
      showToast('error', t('finance.importRevertError'), getErrorMessage(err, language));
    } finally {
      setRevertingId(null);
    }
  };

  const handleDeleteTransaction = async (txn: FinancialTransaction) => {
    if (!confirm(`${t('common.deleteConfirm') || '¿Eliminar transacción de'} $${txn.monto}?`)) return;
    try {
      await supabaseService.deleteTransaction(txn.id);
      showToast('success', t('finance.transactionDeleted') || 'Transacción eliminada');
      loadData();
    } catch (err) {
      showToast('error', getErrorMessage(err, language));
    }
  };

  const handleSave = async () => {
    const monto = parseFloat(form.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setModalError(t('finance.amountRequired'));
      return;
    }
    if (!form.descripcion.trim()) {
      setModalError(t('finance.descriptionRequired'));
      return;
    }
    if (!user) return;

    setModalError('');
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
        // Empty select means "not tied to any order" — send null, not ''.
        referencia_orden_id: form.referencia_orden_id || null,
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
      showToast('success', t('finance.transactionCreated'));
      loadData();
    } catch (err) {
      setModalError(getErrorMessage(err, language));
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
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" id="export-excel-btn" onClick={handleExportExcel}>
            <Download size={18} /> {t('finance.exportExcel')}
          </button>
          <button className="btn btn-secondary" id="import-statement-btn" onClick={() => setShowImportModal(true)}>
            <FileUp size={18} /> {t('finance.importStatement')}
          </button>
          <button className="btn btn-primary" onClick={() => { setModalError(''); setForm(EMPTY_FORM); setShowModal(true); }} id="new-transaction-btn">
            <Plus size={18} /> {t('finance.newTransaction')}
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Financial KPIs */}
      {/* No inline grid-template here: it would beat the responsive rules in
          components.css and force 3 columns onto a 390px phone. */}
      <div className="stats-grid">
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

      {/* Imports — listed so a duplicated statement can be undone in one click. */}
      {imports.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <FileUp size={18} /> {t('finance.imports')}
            </h3>
          </div>
          <div className="import-list">
            {imports.map((batch) => (
              <div key={batch.id} className="import-list-row">
                <div className="import-list-main">
                  <span className="import-list-name">{batch.nombre_archivo}</span>
                  <span className="import-list-meta">
                    {t('finance.importedOn')} {new Date(batch.fecha_importacion).toLocaleString('es')}
                    {' · '}
                    {batch.total_transacciones} {t('finance.transactionsCount')}
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => handleRevertImport(batch)}
                  disabled={revertingId === batch.id}
                >
                  {revertingId === batch.id ? t('common.loading') : t('finance.revertImport')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="table-container cards-on-mobile animate-fade-in">
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('common.type')}</th>
              <th>{t('common.category')}</th>
              <th>{t('common.description')}</th>
              <th>{t('finance.linkedOrder')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.amount')}</th>
              {user?.rol === 'admin' && <th style={{ textAlign: 'center', width: 60 }}>{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {[...filtered].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).map((txn) => (
              <tr key={txn.id}>
                <td data-label={t('common.date')} style={{ whiteSpace: 'nowrap' }}>{txn.fecha}</td>
                <td data-label={t('common.type')}>
                  <span className={`badge badge-${txn.tipo}`}>
                    {txn.tipo === 'ingreso' ? (
                      <><ArrowUpRight size={12} /> {t('finance.income')}</>
                    ) : (
                      <><ArrowDownRight size={12} /> {t('finance.expense')}</>
                    )}
                  </span>
                </td>
                <td data-label={t('common.category')} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  {categoryLabels[txn.categoria]}
                </td>
                <td data-label={t('common.description')}>{txn.descripcion}</td>
                <td data-label={t('finance.linkedOrder')}>
                  {txn.referencia_orden_id ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 6px', color: 'var(--color-primary-light)' }}
                      onClick={() => navigate(`/work-orders?open=${txn.referencia_orden_id}`)}
                    >
                      {orders.find((o) => o.id === txn.referencia_orden_id)?.numero_orden || t('common.view')}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                  )}
                </td>
                <td data-label={t('common.amount')} style={{
                  textAlign: 'right',
                  fontWeight: 600,
                  color: txn.tipo === 'ingreso' ? 'var(--color-success)' : 'var(--color-danger)',
                }}>
                  {txn.tipo === 'ingreso' ? '+' : '-'}${Number(txn.monto).toLocaleString()}
                </td>
                {user?.rol === 'admin' && (
                  <td data-label={t('common.actions')} style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => handleDeleteTransaction(txn)}
                      title={t('common.delete')}
                    >
                      <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                    </button>
                  </td>
                )}
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
              {modalError && <div className="alert-error" role="alert">{modalError}</div>}
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
                <label className="form-label" htmlFor="txn-order">{t('finance.linkedOrder')}</label>
                <select
                  className="form-input form-select"
                  id="txn-order"
                  value={form.referencia_orden_id}
                  onChange={(e) => setForm({ ...form, referencia_orden_id: e.target.value })}
                >
                  <option value="">{t('finance.noLinkedOrder')}</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.numero_orden} — {o.cliente?.nombre || ''}
                    </option>
                  ))}
                </select>
                <p className="field-hint">{t('finance.linkedOrderHint')}</p>
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

      {showImportModal && (
        <LazyModal onClose={() => setShowImportModal(false)}>
          <ImportStatementModal
            onClose={() => setShowImportModal(false)}
            onImported={() => {
              setShowImportModal(false);
              loadData();
            }}
          />
        </LazyModal>
      )}
    </div>
  );
}
