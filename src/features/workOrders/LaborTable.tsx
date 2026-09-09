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

  // Se recorta a cero igual que en la tabla de repuestos. La labor era la única
  // cifra de dinero de la app que aceptaba un negativo, y sobre una orden ya
  // entregada un total que baja se asienta en Finanzas como un reembolso al
  // cliente — un reembolso emitido desde aquí, sin decir que lo era.
  const toCost = (raw: string) => Math.max(0, parseFloat(raw) || 0);

  const startEdit = (item: LaborItem) => {
    setEditingId(item.id);
    setEditDraft({ descripcion: item.descripcion, costo: String(item.costo) });
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft.descripcion.trim()) return;
    await onUpdate(editingId, {
      descripcion: editDraft.descripcion,
      costo: toCost(editDraft.costo),
    });
    setEditingId(null);
  };

  const add = async () => {
    if (!newDraft.descripcion.trim()) return;
    await onAdd({ descripcion: newDraft.descripcion, costo: toCost(newDraft.costo) });
    setNewDraft({ descripcion: '', costo: '' });
  };

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
        <Wrench size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('workOrders.laborDescription')}
      </h3>
      {/* `cards-on-mobile`: en el teléfono la tabla se apila en tarjetas en vez
          de hacer scroll horizontal. Es la tabla que un mecánico edita de pie
          junto al carro, y los inputs de ancho fijo no caben de otra forma. */}
      <div className="table-container cards-on-mobile" style={{ border: 'none' }}>
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
                      inputMode="decimal"
                      min={0}
                      step="0.01"
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
                  <td data-label={t('common.description')}>{item.descripcion}</td>
                  <td data-label={t('common.total')} style={{ textAlign: 'right', fontWeight: 600 }}>${item.costo.toFixed(2)}</td>
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
              {/* En tarjetas el rótulo lo pone `data-label` de la celda del
                  monto, así que la celda del rótulo sólo estorbaría: se queda
                  para la tabla de escritorio. */}
              <td className="desktop-only" style={{ fontWeight: 700 }}>{t('workOrders.totalLabor')}</td>
              <td
                data-label={t('workOrders.totalLabor')}
                style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}
              >
                ${total.toFixed(2)}
              </td>
              <td className="desktop-only"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          placeholder={t('common.description')}
          style={{ flex: '2 1 140px' }}
          value={newDraft.descripcion}
          onChange={(e) => setNewDraft({ ...newDraft, descripcion: e.target.value })}
        />
        <input
          className="form-input"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
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
