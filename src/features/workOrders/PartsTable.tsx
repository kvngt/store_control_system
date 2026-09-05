import { useState } from 'react';
import { Check, Paintbrush, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { WorkOrderPart } from '../../types/database';

export interface PartInput {
  descripcion: string;
  cantidad: number;
  costo_unitario?: number;
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

const EMPTY_DRAFT = { descripcion: '', cantidad: '1', costo_unitario: '', precio_venta_unitario: '' };

/**
 * The parts of an order, editable in place.
 *
 * Two money columns on purpose: `costo_unitario` is what the shop paid and is
 * what gets booked as an expense in Finanzas when the order is delivered;
 * `precio_venta_unitario` is what the customer is charged. Leaving the cost
 * blank silently overstates the shop's profit, which is why it is a visible
 * column here rather than a hidden default.
 */
export default function PartsTable({ items, canEdit, busy, onAdd, onUpdate, onRemove }: PartsTableProps) {
  const { t } = useLanguage();
  const [newDraft, setNewDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);

  const totalSale = items.reduce((sum, p) => sum + p.subtotal, 0);
  // What the shop paid, as opposed to what it charges.
  const totalCost = items.reduce((sum, p) => sum + p.cantidad * (p.costo_unitario ?? 0), 0);

  const toInput = (draft: typeof EMPTY_DRAFT): PartInput => ({
    descripcion: draft.descripcion,
    cantidad: parseInt(draft.cantidad, 10) || 1,
    costo_unitario: parseFloat(draft.costo_unitario) || 0,
    precio_venta_unitario: parseFloat(draft.precio_venta_unitario) || 0,
  });

  const startEdit = (part: WorkOrderPart) => {
    setEditingId(part.id);
    setEditDraft({
      descripcion: part.descripcion,
      cantidad: String(part.cantidad),
      costo_unitario: String(part.costo_unitario ?? 0),
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
              <th style={{ textAlign: 'right' }}>{t('workOrders.unitCost')}</th>
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
                      style={{ width: 90, textAlign: 'right' }}
                      value={editDraft.costo_unitario}
                      onChange={(e) => setEditDraft({ ...editDraft, costo_unitario: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      style={{ width: 90, textAlign: 'right' }}
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
                  <td style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                    ${(part.costo_unitario ?? 0).toFixed(2)}
                  </td>
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
              <td colSpan={2} style={{ fontWeight: 700 }}>Total {t('workOrders.parts')}</td>
              <td style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                ${totalCost.toFixed(2)}
              </td>
              <td></td>
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
          placeholder={t('common.quantity')}
          style={{ flex: '1 1 70px' }}
          value={newDraft.cantidad}
          onChange={(e) => setNewDraft({ ...newDraft, cantidad: e.target.value })}
        />
        <input
          className="form-input"
          type="number"
          min={0}
          placeholder={t('workOrders.unitCost')}
          title={t('workOrders.unitCostHint')}
          style={{ flex: '1 1 90px' }}
          value={newDraft.costo_unitario}
          onChange={(e) => setNewDraft({ ...newDraft, costo_unitario: e.target.value })}
        />
        <input
          className="form-input"
          type="number"
          min={0}
          placeholder={t('common.price')}
          style={{ flex: '1 1 90px' }}
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
