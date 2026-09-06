import { useState } from 'react';
import { Check, Paintbrush, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { WorkOrderPart } from '../../types/database';

export interface PartInput {
  descripcion: string;
  cantidad: number;
  precio_venta_unitario: number;
}

interface PartsTableProps {
  items: WorkOrderPart[];
  canEdit: boolean;
  busy: boolean;
  onAdd: (item: PartInput) => Promise<void>;
  onUpdate: (id: string, item: PartInput) => Promise<void>;
  onRemove: (id: string, descripcion: string) => Promise<void>;
}

const EMPTY_DRAFT = { descripcion: '', cantidad: '1', precio_venta_unitario: '' };

/**
 * The parts of an order, editable in place.
 *
 * One money column. This used to show both "costo unitario" (what the shop
 * paid) and "precio" (what the customer is charged), and in practice the shop
 * bills a part on at what it cost — so the first column was a second money
 * field nobody filled in that still had to be tabbed past on every line, on a
 * tablet, on the busiest screen in the building. The database now mirrors the
 * price into `costo_unitario`, so Finanzas still books the parts expense and
 * the commission base still subtracts it, without anybody typing it twice.
 */
export default function PartsTable({ items, canEdit, busy, onAdd, onUpdate, onRemove }: PartsTableProps) {
  const { t } = useLanguage();
  const [newDraft, setNewDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);

  const totalSale = items.reduce((sum, p) => sum + p.subtotal, 0);

  const toInput = (draft: typeof EMPTY_DRAFT): PartInput => ({
    descripcion: draft.descripcion,
    cantidad: Math.max(1, parseInt(draft.cantidad, 10) || 1),
    precio_venta_unitario: Math.max(0, parseFloat(draft.precio_venta_unitario) || 0),
  });

  const startEdit = (part: WorkOrderPart) => {
    setEditingId(part.id);
    setEditDraft({
      descripcion: part.descripcion,
      cantidad: String(part.cantidad),
      precio_venta_unitario: String(part.precio_venta_unitario),
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft.descripcion.trim()) return;
    await onUpdate(editingId, toInput(editDraft));
    setEditingId(null);
  };

  const add = async () => {
    if (!newDraft.descripcion.trim()) return;
    await onAdd(toInput(newDraft));
    setNewDraft(EMPTY_DRAFT);
  };

  return (
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
              <th style={{ width: 64 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((part) =>
              editingId === part.id ? (
                <tr key={part.id}>
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
                      style={{ width: 70 }}
                      value={editDraft.cantidad}
                      onChange={(e) => setEditDraft({ ...editDraft, cantidad: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      step="0.01"
                      style={{ width: 110, textAlign: 'right' }}
                      value={editDraft.precio_venta_unitario}
                      onChange={(e) => setEditDraft({ ...editDraft, precio_venta_unitario: e.target.value })}
                    />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    ${((parseFloat(editDraft.cantidad) || 0) * (parseFloat(editDraft.precio_venta_unitario) || 0)).toFixed(2)}
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
                <tr key={part.id}>
                  <td>{part.descripcion}</td>
                  <td>{part.cantidad}</td>
                  <td style={{ textAlign: 'right' }}>${part.precio_venta_unitario.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>${part.subtotal.toFixed(2)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => startEdit(part)} disabled={!canEdit}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(part.id, part.descripcion)} disabled={!canEdit}>
                        <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            <tr>
              <td colSpan={3} style={{ fontWeight: 700 }}>Total {t('workOrders.parts')}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                ${totalSale.toFixed(2)}
              </td>
              <td></td>
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
          min={1}
          placeholder={t('common.quantity')}
          style={{ flex: '1 1 70px' }}
          value={newDraft.cantidad}
          onChange={(e) => setNewDraft({ ...newDraft, cantidad: e.target.value })}
        />
        <input
          className="form-input"
          type="number"
          min={0}
          step="0.01"
          placeholder={t('common.price')}
          style={{ flex: '1 1 110px' }}
          value={newDraft.precio_venta_unitario}
          onChange={(e) => setNewDraft({ ...newDraft, precio_venta_unitario: e.target.value })}
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
