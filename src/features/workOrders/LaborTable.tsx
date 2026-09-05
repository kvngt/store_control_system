import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, Wrench, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { LaborItem } from '../../types/database';

interface LaborTableProps {
  items: LaborItem[];
  canEdit: boolean;
  busy: boolean;
  onAdd: (item: { descripcion: string; costo: number }) => Promise<void>;
  onUpdate: (id: string, item: { descripcion: string; costo: number }) => Promise<void>;
  onRemove: (id: string, descripcion: string) => Promise<void>;
}

/**
 * The labor lines of an order, editable in place.
 *
 * The row drafts live here rather than on the page: they are keystrokes in one
 * card, and nothing outside it ever needs to read them.
 */
export default function LaborTable({ items, canEdit, busy, onAdd, onUpdate, onRemove }: LaborTableProps) {
  const { t } = useLanguage();
  const [newDraft, setNewDraft] = useState({ descripcion: '', costo: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ descripcion: '', costo: '' });

  const total = items.reduce((sum, l) => sum + l.costo, 0);

  const startEdit = (item: LaborItem) => {
    setEditingId(item.id);
    setEditDraft({ descripcion: item.descripcion, costo: String(item.costo) });
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft.descripcion.trim()) return;
    await onUpdate(editingId, {
      descripcion: editDraft.descripcion,
      costo: parseFloat(editDraft.costo) || 0,
    });
    setEditingId(null);
  };

  const add = async () => {
    if (!newDraft.descripcion.trim()) return;
    await onAdd({ descripcion: newDraft.descripcion, costo: parseFloat(newDraft.costo) || 0 });
    setNewDraft({ descripcion: '', costo: '' });
  };

  return (
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
              <th style={{ width: 64 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) =>
              editingId === item.id ? (
                <tr key={item.id}>
                  <td>
                    <input
                      className="form-input"
                      value={editDraft.descripcion}
                      onChange={(e) => setEditDraft({ ...editDraft, descripcion: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      type="number"
                      style={{ textAlign: 'right' }}
                      value={editDraft.costo}
                      onChange={(e) => setEditDraft({ ...editDraft, costo: e.target.value })}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={saveEdit} disabled={busy}>
                        <Check size={14} style={{ color: 'var(--color-success)' }} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingId(null)}>
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={item.id}>
                  <td>{item.descripcion}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>${item.costo.toFixed(2)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => startEdit(item)} disabled={!canEdit}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(item.id, item.descripcion)} disabled={!canEdit}>
                        <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            <tr>
              <td style={{ fontWeight: 700 }}>{t('workOrders.totalLabor')}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                ${total.toFixed(2)}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <input
          className="form-input"
          placeholder={t('common.description')}
          value={newDraft.descripcion}
          onChange={(e) => setNewDraft({ ...newDraft, descripcion: e.target.value })}
        />
        <input
          className="form-input"
          type="number"
          placeholder="$"
          style={{ maxWidth: 100 }}
          value={newDraft.costo}
          onChange={(e) => setNewDraft({ ...newDraft, costo: e.target.value })}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={add}
          disabled={!canEdit || busy || !newDraft.descripcion.trim()}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
