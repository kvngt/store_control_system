import { useState } from 'react';
import { Check, CheckCircle2, Circle, Lock, Pencil, Trash2, User, Wrench, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { SPECIALTIES, type LaborItem, type Specialty, type WorkType } from '../../types/database';
import LineStateBadge from './LineStateBadge';
import { isApproved } from './lineState';
import { money } from '../../lib/money';
import TaskEditor from './TaskEditor';
import TechnicianSelect from './TechnicianSelect';
import TradeMismatchDialog from './TradeMismatchDialog';
import { defaultTechnicianId, isTradeMismatch, isUnassignedTask, type TaskDraft, type Technician } from './tasks';

interface LaborTableProps {
  items: LaborItem[];
  canEdit: boolean;
  busy: boolean;
  /** Una tarea nueva, con su tipo y su técnico. `false` = no se guardó. */
  onAdd: (task: TaskDraft) => Promise<boolean | void>;
  onUpdate: (id: string, item: { descripcion: string; costo: number }) => Promise<void>;
  onRemove: (id: string, descripcion: string) => Promise<void>;
  /**
   * Si se ofrece tachar el trabajo hecho. Es del técnico asignado, no solo del admin: por
   * eso va aparte de `canEdit`, que gobierna cotizar. Como función, por línea: una tarea con
   * técnico la marca solo ese técnico (o administración).
   */
  canComplete: boolean | ((item: LaborItem) => boolean);
  onToggleComplete: (item: LaborItem) => void;
  /** "Mano de obra" para administración y el cliente; "Tareas" para el técnico (03/10/2026). */
  title?: string;
  /** El tipo de la orden: el tipo con el que nace cada tarea nueva. */
  workType?: WorkType;
  /** Mecánicos y pintores de la sede de la orden: quienes pueden recibir una tarea. */
  technicians?: Technician[];
  /** Cambiar el técnico de una línea (administración). Sin esto el técnico solo se muestra. */
  onAssign?: (item: LaborItem, asignadoA: string | null) => Promise<void>;
  /** Cambiar el tipo (la bolsa) de una línea. Igual que el técnico, no toca lo cotizado. */
  onChangeSpecialty?: (item: LaborItem, especialidad: Specialty) => Promise<void>;
  /** Líneas con la comisión ya pagada: la base no deja cambiarles técnico ni tipo, ni borrarlas. */
  lockedIds?: ReadonlySet<string>;
  /**
   * Especialidades cuyo reparto heredado ya se pagó: una línea heredada sin técnico no puede
   * pasar a ellas (la base lo rechaza; su comisión no la cobraría nadie).
   */
  paidPools?: ReadonlySet<Specialty>;
  /** Texto para precargar el editor (ej: al cotizar un hallazgo). */
  initialText?: string;
}

const NO_LOCKS: ReadonlySet<string> = new Set();
const NO_POOLS: ReadonlySet<Specialty> = new Set();

/**
 * The labor lines of an order, editable in place.
 *
 * Desde la comisión por tarea (20261010000006) cada línea dice su tipo y su técnico, que es
 * quien cobra su comisión. Administración los cambia en la misma fila; el alta es el editor de
 * tareas (`TaskEditor`), el mismo que usará el alta de la orden.
 *
 * The row drafts live here rather than on the page: they are keystrokes in one
 * card, and nothing outside it ever needs to read them.
 */
export default function LaborTable({
  items,
  canEdit,
  busy,
  onAdd,
  onUpdate,
  onRemove,
  canComplete,
  onToggleComplete,
  title,
  workType = 'mecanica',
  technicians = [],
  onAssign,
  onChangeSpecialty,
  lockedIds = NO_LOCKS,
  paidPools = NO_POOLS,
  initialText,
}: LaborTableProps) {
  const { t } = useLanguage();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ descripcion: string; costo: string }>({ descripcion: '', costo: '' });
  // Un cambio de técnico fuera de oficio espera la respuesta del diálogo.
  const [pendingAssign, setPendingAssign] = useState<{ item: LaborItem; technician: Technician } | null>(null);
  // Lo mismo desde el otro selector: pasar a pintura una tarea de un mecánico es el mismo cruce.
  const [pendingType, setPendingType] = useState<{ item: LaborItem; especialidad: Specialty; technician: Technician } | null>(null);
  // Remonta los selectores al cancelar: sin cambio de estado React no vuelve a pintar el valor
  // real, y el <select> se quedaba mostrando a quien no se asignó.
  const [selectEpoch, setSelectEpoch] = useState(0);
  const specialtyLabel = (s?: Specialty) => (s === 'pintura' ? t('workOrders.painting') : t('workOrders.mechanical'));
  const completable = (item: LaborItem) => (typeof canComplete === 'function' ? canComplete(item) : canComplete);
  const editableRows = canEdit && !!onAssign;

  // Solo lo autorizado se cobra; lo demás se muestra aparte para que se vea cuánto
  // falta que el cliente autorice.
  const total = items.filter(isApproved).reduce((sum, l) => sum + l.costo, 0);
  const unauthorized = items
    .filter((l) => l.estado === 'borrador' || l.estado === 'pendiente')
    .reduce((sum, l) => sum + l.costo, 0);

  // Solo se tacha lo autorizado, así que el conteo se mide contra eso y no contra todas
  // las líneas: si no, el taller vería "2 de 5" con tres cosas que nadie aprobó.
  const aprobadas = items.filter(isApproved);
  const completadas = aprobadas.filter((l) => !!l.completado_en).length;

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
    await onUpdate(editingId, { descripcion: editDraft.descripcion, costo: toCost(editDraft.costo) });
    setEditingId(null);
  };

  const technicianOf = (item: LaborItem): Technician | null =>
    technicians.find((tech) => tech.id === item.asignado_a) ?? item.tecnico ?? null;

  const chooseTechnician = (item: LaborItem, id: string) => {
    if (!onAssign || id === (item.asignado_a ?? '')) return;
    const technician = technicians.find((tech) => tech.id === id);
    if (technician && isTradeMismatch(item.especialidad ?? 'mecanica', technician)) {
      setPendingAssign({ item, technician });
      return;
    }
    void onAssign(item, id || null);
  };

  const chooseSpecialty = (item: LaborItem, especialidad: Specialty) => {
    if (!onChangeSpecialty || especialidad === (item.especialidad ?? 'mecanica')) return;
    const technician = item.asignado_a ? technicianOf(item) : null;
    if (technician && isTradeMismatch(especialidad, technician)) {
      setPendingType({ item, especialidad, technician });
      return;
    }
    void onChangeSpecialty(item, especialidad);
  };

  const closePending = () => {
    setPendingAssign(null);
    setPendingType(null);
    setSelectEpoch((n) => n + 1);
  };

  // Tipo y técnico de una fila. Administración los cambia aquí mismo (en cualquier estado:
  // no son lo cotizado); los demás los leen.
  const assignmentControls = (item: LaborItem) => {
    const locked = lockedIds.has(item.id);
    const inherited = !item.asignado_a && item.reparto_heredado !== false;
    // Una línea heredada autorizada se queda en el reparto al cambiar de tipo: no puede pasar a
    // una especialidad cuyo reparto ya se pagó.
    const blockedType = (s: Specialty) =>
      inherited && isApproved(item) && s !== (item.especialidad ?? 'mecanica') && paidPools.has(s);
    if (editableRows) {
      return (
        <div className="labor-meta">
          <select
            key={`type-${item.id}-${selectEpoch}`}
            id={`labor-type-${item.id}`}
            className="form-input form-select labor-meta-select labor-type-select"
            value={item.especialidad ?? 'mecanica'}
            onChange={(e) => chooseSpecialty(item, e.target.value as Specialty)}
            disabled={busy || locked || !onChangeSpecialty}
            aria-label={t('tasks.type')}
            title={locked ? t('tasks.paidLocked') : t('tasks.type')}
          >
            {SPECIALTIES.map((s) => (
              <option key={s} value={s} disabled={blockedType(s)} title={blockedType(s) ? t('tasks.paidPoolHint') : undefined}>
                {blockedType(s) ? `${specialtyLabel(s)} (${t('tasks.paidPool')})` : specialtyLabel(s)}
              </option>
            ))}
          </select>
          <TechnicianSelect
            key={`tech-${item.id}-${selectEpoch}`}
            id={`labor-tech-${item.id}`}
            className="labor-meta-select labor-tech-select"
            value={item.asignado_a ?? ''}
            onChange={(id) => chooseTechnician(item, id)}
            technicians={technicians}
            current={item.tecnico ?? null}
            emptyLabel={inherited ? t('tasks.inheritedSplit') : t('tasks.unassigned')}
            disabled={busy || locked}
            title={locked ? t('tasks.paidLocked') : inherited ? t('tasks.inheritedHint') : undefined}
          />
          {locked && (
            <span className="labor-meta-lock" title={t('tasks.paidLocked')} aria-label={t('tasks.paidLocked')} role="img">
              <Lock size={14} />
            </span>
          )}
        </div>
      );
    }
    const technician = technicianOf(item);
    return (
      <div className="labor-meta">
        <span className={`labor-specialty-tag labor-specialty-${item.especialidad ?? 'mecanica'}`}>{specialtyLabel(item.especialidad)}</span>
        {technician ? (
          <span className="labor-technician">
            <User size={12} aria-hidden="true" /> {technician.nombre_completo}
          </span>
        ) : isUnassignedTask(item) ? (
          <span className="labor-technician is-empty">{t('tasks.noTechnician')}</span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
        <Wrench size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {title ?? t('workOrders.laborDescription')}
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
              {canEdit && <th style={{ width: 64 }}></th>}
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
                      aria-label={t('common.description')}
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
                      aria-label={t('tasks.price')}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {/* Solo icono: sin `aria-label` un lector de pantalla anuncia "botón" y
                          nada más, y el color del icono no dice nada a quien no lo ve. */}
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
                <tr
                  key={item.id}
                  className={[
                    item.estado === 'rechazado' ? 'line-rejected' : '',
                    item.completado_en ? 'line-done' : '',
                  ].filter(Boolean).join(' ') || undefined}
                >
                  <td data-label={t('common.description')} className="labor-desc-cell">
                    {/* Va en esta celda y no en la de acciones: esa solo existe para un
                        admin, y tachar el trabajo es justamente del técnico. */}
                    {completable(item) && isApproved(item) && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon labor-check"
                        onClick={() => onToggleComplete(item)}
                        disabled={busy}
                        title={item.completado_en ? t('workOrders.unmarkCompleted') : t('workOrders.markCompleted')}
                        aria-label={item.completado_en ? t('workOrders.unmarkCompleted') : t('workOrders.markCompleted')}
                        aria-pressed={!!item.completado_en}
                      >
                        {item.completado_en
                          ? <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
                          : <Circle size={16} />}
                      </button>
                    )}
                    <span className="line-desc">{item.descripcion}</span> <LineStateBadge state={item.estado} />
                    {/* Para administración, a la vista: una tarea sin técnico no le paga
                        comisión a nadie. */}
                    {canEdit && isUnassignedTask(item) && item.estado !== 'rechazado' && (
                      <span className="badge line-state labor-no-tech" title={t('tasks.noTechnicianHint')}>
                        {t('tasks.noTechnician')}
                      </span>
                    )}
                    {assignmentControls(item)}
                  </td>
                  <td data-label={t('common.total')} style={{ textAlign: 'right', fontWeight: 600 }}>{money(item.costo)}</td>
                  {canEdit && (
                    <td>
                      {/* Lo que espera la respuesta del cliente no se toca: él está
                          viendo esos montos. */}
                      {item.estado === 'pendiente' ? (
                        <span className="field-hint" title={t('quotes.lockedHint')}>🔒</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={() => startEdit(item)}
                            title={item.estado === 'rechazado' ? t('quotes.rejectedHint') : t('common.edit')}
                            aria-label={t('common.edit')}
                          >
                            <Pencil size={14} />
                          </button>
                          {/* Con la comisión pagada la base no deja borrarla: se dice aquí en vez de
                              dejar intentarlo. */}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={() => onRemove(item.id, item.descripcion)}
                            disabled={lockedIds.has(item.id)}
                            aria-label={lockedIds.has(item.id) ? `${t('common.delete')}: ${t('tasks.paidLocked')}` : t('common.delete')}
                            title={lockedIds.has(item.id) ? t('tasks.paidLocked') : t('common.delete')}
                          >
                            <Trash2 size={14} style={{ color: lockedIds.has(item.id) ? 'var(--color-text-tertiary)' : 'var(--color-danger)' }} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
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
                {money(total)}
              </td>
              {canEdit && <td className="desktop-only"></td>}
            </tr>
            {aprobadas.length > 0 && (
              <tr>
                <td className="desktop-only" style={{ color: 'var(--color-text-tertiary)' }}>{t('workOrders.laborCompletedCount')}</td>
                <td data-label={t('workOrders.laborCompletedCount')} style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                  {completadas} / {aprobadas.length}
                </td>
                {canEdit && <td className="desktop-only"></td>}
              </tr>
            )}
            {unauthorized > 0 && (
              <tr>
                <td className="desktop-only" style={{ color: 'var(--color-text-tertiary)' }}>{t('quotes.unauthorizedTotal')}</td>
                <td data-label={t('quotes.unauthorizedTotal')} style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                  {money(unauthorized)}
                </td>
                {canEdit && <td className="desktop-only"></td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Cotizar es de administración. Para un técnico el alta no existe, en vez de estar
          ahí deshabilitada sin explicar por qué. */}
      {!canEdit && <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>{t('workOrders.laborReadOnlyHint')}</p>}
      {canEdit && (
        <TaskEditor
          workType={workType}
          technicians={technicians}
          defaultTechnicianId={defaultTechnicianId(items, technicians)}
          busy={busy}
          onAdd={onAdd}
          idPrefix="labor-new"
          initialText={initialText}
        />
      )}

      {pendingAssign && onAssign && (
        <TradeMismatchDialog
          especialidad={pendingAssign.item.especialidad ?? 'mecanica'}
          technician={pendingAssign.technician}
          onAssign={() => {
            const { item, technician } = pendingAssign;
            setPendingAssign(null);
            void onAssign(item, technician.id);
          }}
          onChooseOther={() => {
            const id = `labor-tech-${pendingAssign.item.id}`;
            closePending();
            setTimeout(() => document.getElementById(id)?.focus(), 0);
          }}
          onCancel={closePending}
        />
      )}

      {pendingType && onChangeSpecialty && (
        <TradeMismatchDialog
          especialidad={pendingType.especialidad}
          technician={pendingType.technician}
          title={pendingType.especialidad === 'pintura' ? t('tasks.typeMismatchPaintToMechanic') : t('tasks.typeMismatchMechanicToPainter')}
          confirmLabel={t('tasks.changeAnyway')}
          onAssign={() => {
            const { item, especialidad } = pendingType;
            setPendingType(null);
            void onChangeSpecialty(item, especialidad);
          }}
          onChooseOther={() => {
            const id = `labor-tech-${pendingType.item.id}`;
            closePending();
            setTimeout(() => document.getElementById(id)?.focus(), 0);
          }}
          onCancel={closePending}
        />
      )}
    </div>
  );
}
