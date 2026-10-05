import { useState } from 'react';
import { Check, Paintbrush, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { PartOrderState, WorkOrderPart } from '../../types/database';
import LineStateBadge from './LineStateBadge';
import { isApproved } from './lineState';
import { money } from '../../lib/money';

export interface PartInput {
  descripcion: string;
  cantidad: number;
  precio_venta_unitario: number;
  /** Nulo: no se tocó (al crear, la base usa el precio; al editar, lo deja como estaba). */
  costo_unitario?: number | null;
}

interface PartsTableProps {
  items: WorkOrderPart[];
  canEdit: boolean;
  busy: boolean;
  onAdd: (item: PartInput) => Promise<void>;
  onUpdate: (id: string, item: PartInput) => Promise<void>;
  onRemove: (id: string, descripcion: string) => Promise<void>;
  /** Pedido → llegó. Sin la función, la tabla no lo ofrece. */
  onSetOrderState?: (id: string, estado: PartOrderState | null) => Promise<void>;
}

const EMPTY_DRAFT = { descripcion: '', cantidad: '1', precio_venta_unitario: '', costo_unitario: '' };

/**
 * The parts of an order, editable in place.
 *
 * El precio es lo que se le cobra al cliente. El costo (lo que pagó el taller) es opcional:
 * se deja vacío y la base usa el precio, y administración lo escribe cuando lo sabe para que
 * el margen y el egreso de repuestos digan lo real (decisión del taller, 05/10/2026). Antes la
 * base copiaba siempre el precio en el costo y la ganancia de las piezas no aparecía.
 *
 * Cada pieza puede marcarse "Pedido" y luego "Llegó": la orden aparece esperando repuestos en
 * la lista, en el tablero y en el enlace del cliente, y al llegar se avisa al técnico.
 */
export default function PartsTable({ items, canEdit, busy, onAdd, onUpdate, onRemove, onSetOrderState }: PartsTableProps) {
  const { t } = useLanguage();
  const [newDraft, setNewDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);

  const totalSale = items.filter(isApproved).reduce((sum, p) => sum + p.subtotal, 0);
  const unauthorized = items
    .filter((p) => p.estado === 'borrador' || p.estado === 'pendiente')
    .reduce((sum, p) => sum + p.subtotal, 0);

  const toInput = (draft: typeof EMPTY_DRAFT): PartInput => {
    const cost = parseFloat(draft.costo_unitario);
    return {
      descripcion: draft.descripcion,
      cantidad: Math.max(1, parseInt(draft.cantidad, 10) || 1),
      precio_venta_unitario: Math.max(0, parseFloat(draft.precio_venta_unitario) || 0),
      costo_unitario: draft.costo_unitario.trim() !== '' && Number.isFinite(cost) ? Math.max(0, cost) : null,
    };
  };

  // Un costo igual al precio es "no lo sé": el campo queda vacío y sigue al precio.
  const hasOwnCost = (part: WorkOrderPart) => Number(part.costo_unitario) !== Number(part.precio_venta_unitario);

  const startEdit = (part: WorkOrderPart) => {
    setEditingId(part.id);
    setEditDraft({
      descripcion: part.descripcion,
      cantidad: String(part.cantidad),
      precio_venta_unitario: String(part.precio_venta_unitario),
      costo_unitario: hasOwnCost(part) ? String(part.costo_unitario) : '',
    });
  };

  const orderStateControl = (part: WorkOrderPart) =>
    onSetOrderState && part.estado !== 'rechazado' ? (
      <select
        className={`form-input form-select form-input-sm part-order-state${part.estado_pedido ? ` is-${part.estado_pedido}` : ''}`}
        aria-label={t('parts.orderState')}
        value={part.estado_pedido ?? ''}
        disabled={!canEdit || busy}
        onChange={(e) => void onSetOrderState(part.id, (e.target.value || null) as PartOrderState | null)}
      >
        <option value="">{t('parts.notTracked')}</option>
        <option value="pedido">{t('parts.ordered')}</option>
        <option value="recibido">{t('parts.received')}</option>
      </select>
    ) : null;

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
      {/* `cards-on-mobile`: mismo motivo que en la tabla de labor — es la tabla
          que se edita junto al carro, y con cinco columnas de inputs no cabe. */}
      <div className="table-container cards-on-mobile" style={{ border: 'none' }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.description')}</th>
              <th>{t('common.quantity')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.price')}</th>
              <th style={{ textAlign: 'right' }} title={t('parts.costHint')}>{t('parts.cost')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.subtotal')}</th>
              <th style={{ width: 64 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((part) =>
              editingId === part.id ? (
                <tr key={part.id}>
                  <td data-label={t('common.description')}>
                    <input
                      className="form-input"
                      value={editDraft.descripcion}
                      onChange={(e) => setEditDraft({ ...editDraft, descripcion: e.target.value })}
                    />
                  </td>
                  <td data-label={t('common.quantity')}>
                    <input
                      className="form-input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step="1"
                      style={{ width: 70 }}
                      value={editDraft.cantidad}
                      onChange={(e) => setEditDraft({ ...editDraft, cantidad: e.target.value })}
                    />
                  </td>
                  <td data-label={t('common.price')}>
                    <input
                      className="form-input"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      style={{ width: 110, textAlign: 'right' }}
                      value={editDraft.precio_venta_unitario}
                      onChange={(e) => setEditDraft({ ...editDraft, precio_venta_unitario: e.target.value })}
                    />
                  </td>
                  <td data-label={t('parts.cost')}>
                    <input
                      className="form-input"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      style={{ width: 110, textAlign: 'right' }}
                      placeholder={editDraft.precio_venta_unitario || t('parts.costPlaceholder')}
                      aria-label={t('parts.cost')}
                      title={t('parts.costHint')}
                      value={editDraft.costo_unitario}
                      onChange={(e) => setEditDraft({ ...editDraft, costo_unitario: e.target.value })}
                    />
                  </td>
                  {/* La vista previa se calcula con el mismo `toInput` que se
                      guarda. Antes usaba `parseFloat(cantidad)` mientras el
                      guardado usaba `Math.max(1, parseInt(...))`, así que
                      escribir cantidad 0 mostraba $0.00 y grababa 1. */}
                  <td data-label={t('common.subtotal')} style={{ textAlign: 'right', fontWeight: 600 }}>
                    {(() => {
                      const draft = toInput(editDraft);
                      return money(draft.cantidad * draft.precio_venta_unitario);
                    })()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={saveEdit} disabled={busy} aria-label={t('common.save')} title={t('common.save')}>
                        <Check size={14} style={{ color: 'var(--color-success)' }} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingId(null)} aria-label={t('common.cancel')} title={t('common.cancel')}>
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={part.id} className={part.estado === 'rechazado' ? 'line-rejected' : undefined}>
                  <td data-label={t('common.description')}>
                    <span className="line-desc">{part.descripcion}</span> <LineStateBadge state={part.estado} />
                    {orderStateControl(part)}
                  </td>
                  <td data-label={t('common.quantity')}>{part.cantidad}</td>
                  <td data-label={t('common.price')} style={{ textAlign: 'right' }}>{money(part.precio_venta_unitario)}</td>
                  <td
                    data-label={t('parts.cost')}
                    style={{ textAlign: 'right' }}
                    className={hasOwnCost(part) ? undefined : 'part-cost-default'}
                    title={hasOwnCost(part) ? undefined : t('parts.costSameAsPrice')}
                  >
                    {money(part.costo_unitario)}
                  </td>
                  <td data-label={t('common.subtotal')} style={{ textAlign: 'right', fontWeight: 600 }}>{money(part.subtotal)}</td>
                  <td>
                    {part.estado === 'pendiente' ? (
                      <span className="field-hint" title={t('quotes.lockedHint')}>🔒</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => startEdit(part)}
                          disabled={!canEdit}
                          title={part.estado === 'rechazado' ? t('quotes.rejectedHint') : t('common.edit')}
                          aria-label={t('common.edit')}
                        >
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(part.id, part.descripcion)} disabled={!canEdit} aria-label={t('common.delete')} title={t('common.delete')}>
                          <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            )}
            <tr>
              <td className="desktop-only" colSpan={4} style={{ fontWeight: 700 }}>
                Total {t('workOrders.parts')}
              </td>
              <td
                data-label={`Total ${t('workOrders.parts')}`}
                style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}
              >
                {money(totalSale)}
              </td>
              <td className="desktop-only"></td>
            </tr>
            {unauthorized > 0 && (
              <tr>
                <td className="desktop-only" colSpan={4} style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('quotes.unauthorizedTotal')}
                </td>
                <td data-label={t('quotes.unauthorizedTotal')} style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                  {money(unauthorized)}
                </td>
                <td className="desktop-only"></td>
              </tr>
            )}
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
          inputMode="numeric"
          min={1}
          step="1"
          placeholder={t('common.quantity')}
          style={{ flex: '1 1 70px' }}
          value={newDraft.cantidad}
          onChange={(e) => setNewDraft({ ...newDraft, cantidad: e.target.value })}
        />
        <input
          className="form-input"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder={t('common.price')}
          style={{ flex: '1 1 110px' }}
          value={newDraft.precio_venta_unitario}
          onChange={(e) => setNewDraft({ ...newDraft, precio_venta_unitario: e.target.value })}
        />
        <input
          className="form-input"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder={t('parts.costPlaceholder')}
          aria-label={t('parts.cost')}
          title={t('parts.costHint')}
          style={{ flex: '1 1 110px' }}
          value={newDraft.costo_unitario}
          onChange={(e) => setNewDraft({ ...newDraft, costo_unitario: e.target.value })}
        />
        {/* Verde y con su nombre, igual que el de la mano de obra (03/10/2026). */}
        <button
          type="button"
          className="btn btn-success"
          aria-label={t('common.add')}
          title={t('common.add')}
          onClick={add}
          disabled={!canEdit || busy || !newDraft.descripcion.trim()}
        >
          <Plus size={16} /> {t('common.add')}
        </button>
      </div>
    </div>
  );
}
