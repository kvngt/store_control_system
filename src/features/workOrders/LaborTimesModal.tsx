import { useState, useEffect } from 'react';
import { X, Pencil, Trash2, Check, Clock } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { formatDurationMinutes } from '../../lib/dates';
import type { LaborItem, LaborTimeEntry } from '../../types/database';

interface LaborTimesModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: LaborItem | null;
  entries: LaborTimeEntry[];
  onCorrectTime?: (tiempoId: string, inicio: string, fin: string | null) => Promise<void>;
  onDeleteTime?: (tiempoId: string) => Promise<void>;
  isAdmin?: boolean;
}

function toDatetimeLocal(isoStr: string | null): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const H = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D}T${H}:${m}`;
}

function formatTimestamp(isoStr: string, language: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleString(language === 'es' ? 'es-MX' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LaborTimesModal({
  isOpen,
  onClose,
  task,
  entries,
  onCorrectTime,
  onDeleteTime,
  isAdmin = true,
}: LaborTimesModalProps) {
  const { t, language } = useLanguage();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inicioDraft, setInicioDraft] = useState('');
  const [finDraft, setFinDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) {
      setEditingId(null);
      setError('');
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen || !task) return null;

  const taskEntries = entries.filter((e) => e.labor_id === task.id);

  const startEdit = (entry: LaborTimeEntry) => {
    setEditingId(entry.id);
    setInicioDraft(toDatetimeLocal(entry.inicio));
    setFinDraft(toDatetimeLocal(entry.fin));
    setError('');
  };

  const handleSaveEdit = async (tiempoId: string) => {
    if (!onCorrectTime) return;
    if (!inicioDraft.trim()) {
      setError(language === 'es' ? 'La hora de inicio es requerida.' : 'Start time is required.');
      return;
    }
    const inicioDate = new Date(inicioDraft);
    const finDate = finDraft.trim() ? new Date(finDraft) : null;
    if (finDate && finDate.getTime() < inicioDate.getTime()) {
      setError(language === 'es' ? 'El fin no puede ser anterior al inicio.' : 'End time cannot be earlier than start.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onCorrectTime(tiempoId, inicioDate.toISOString(), finDate ? finDate.toISOString() : null);
      setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('tasks.timeError'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (tiempoId: string) => {
    if (!onDeleteTime) return;
    if (!confirm(t('tasks.confirmDeleteTime'))) return;
    setBusy(true);
    setError('');
    try {
      await onDeleteTime(tiempoId);
      if (editingId === tiempoId) setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('tasks.timeError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580, width: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Clock size={18} /> {t('tasks.timesTitle')}
          </h3>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label={t('common.cancel')}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <strong style={{ fontSize: 'var(--font-size-md)', display: 'block' }}>{task.descripcion}</strong>
          </div>

          {error && <div className="alert-error" style={{ marginBottom: 'var(--space-3)' }}>{error}</div>}

          {taskEntries.length === 0 ? (
            <p className="field-hint" style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
              {t('tasks.noTimesRecorded')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {taskEntries.map((entry) => {
                const isEditing = editingId === entry.id;
                const startMs = new Date(entry.inicio).getTime();
                const endMs = entry.fin ? new Date(entry.fin).getTime() : now;
                const durationMinutes = Math.max(0, Math.floor((endMs - startMs) / 60000));
                const isRunning = !entry.fin;

                if (isEditing) {
                  return (
                    <div
                      key={entry.id}
                      style={{
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-primary)',
                        background: 'var(--color-bg-secondary)',
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                            {t('tasks.timeStart')}
                          </label>
                          <input
                            type="datetime-local"
                            className="form-input"
                            value={inicioDraft}
                            onChange={(e) => setInicioDraft(e.target.value)}
                            disabled={busy}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                            {t('tasks.timeEnd')}
                          </label>
                          <input
                            type="datetime-local"
                            className="form-input"
                            value={finDraft}
                            onChange={(e) => setFinDraft(e.target.value)}
                            disabled={busy}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSaveEdit(entry.id)}
                          disabled={busy}
                        >
                          <Check size={14} /> {t('common.save')}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-surface-border)',
                      background: 'var(--color-bg-secondary)',
                      flexWrap: 'wrap',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                        {entry.usuario?.nombre_completo || '—'}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        {formatTimestamp(entry.inicio, language)} –{' '}
                        {entry.fin ? (
                          formatTimestamp(entry.fin, language)
                        ) : (
                          <span className="badge" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', padding: '2px 6px', fontSize: 'var(--font-size-xs)' }}>
                            {t('tasks.timeRunning')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                        {formatDurationMinutes(durationMinutes)}
                        {isRunning ? ` (${t('tasks.timeRunning')})` : ''}
                      </span>

                      {isAdmin && onCorrectTime && onDeleteTime && (
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={() => startEdit(entry)}
                            title={t('common.edit')}
                            aria-label={t('common.edit')}
                            disabled={busy}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={() => handleDelete(entry.id)}
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                            disabled={busy}
                            style={{ color: 'var(--color-danger)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
