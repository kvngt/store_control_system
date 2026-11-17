import { useState } from 'react';
import { Paintbrush, Plus, User, Wrench, X } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { moduloActivo } from '../../../../config/modulos';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import { assignmentStatus } from '../../assignmentStatus';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { SectionStateProps } from '../detailTypes';

interface TechniciansSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  isAdmin: boolean;
  sectionProps: SectionStateProps;
}

export default function TechniciansSection({
  order,
  detail,
  isAdmin,
  sectionProps,
}: TechniciansSectionProps) {
  const { t } = useLanguage();
  const [addingOperatorId, setAddingOperatorId] = useState('');

  const assignments = order.asignaciones || [];
  const laborList = order.labor_items || [];
  // Personal de la sede DE LA ORDEN (no de la elegida arriba): lo carga el hook.
  const operators = detail.orderOperators;
  // Trabajos de antes de la comisión por tarea, sin técnico: se reparten por especialidad entre
  // los asignados a mano (origen 'manual'). Solo entonces importa quién está "en el reparto".
  const hasInheritedLines = laborList.some((l) => !l.asignado_a && l.reparto_heredado !== false && l.estado !== 'rechazado');

  const addOperator = async () => {
    const op = operators.find((o) => o.id === addingOperatorId);
    if (!op) return;
    await detail.addAssignment(op);
    setAddingOperatorId('');
  };

  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('workOrders.assignedTechnician')}
      icon={<User size={18} />}
      summary={assignments.length || undefined}
    >
      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
          <User size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
          {t('workOrders.assignedTechnician')}
        </h3>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {assignments.length === 0 && (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('common.noResults')}</p>
          )}
          {assignments.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: a.tipo_tarea === 'mecanica'
                  ? 'var(--color-info-bg)' : 'rgba(236, 72, 153, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: a.tipo_tarea === 'mecanica' ? 'var(--color-info)' : '#F472B6',
              }}>
                {a.tipo_tarea === 'mecanica' ? <Wrench size={16} /> : <Paintbrush size={16} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{a.usuario?.nombre_completo}</div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
                  {a.tipo_tarea === 'mecanica' ? t('workOrders.mechanical') : t('workOrders.painting')} · {t(`workOrders.status.${assignmentStatus(order.estatus, laborList, a.usuario_id)}`)}
                </span>
                {/* Quien entró por una tarea cobra solo sus tareas; quien se asignó a mano entra
                    además al reparto de los trabajos anteriores sin técnico (20261010000006). */}
                {moduloActivo('comisiones') && (a.origen === 'tarea' || hasInheritedLines) && (
                  <div className="assignment-origin">
                    <span
                      className={`badge assignment-origin-badge${a.origen === 'tarea' ? ' is-task' : ''}`}
                      title={a.origen === 'tarea' ? t('tasks.byTaskHint') : t('tasks.inSplitHint')}
                    >
                      {a.origen === 'tarea' ? t('tasks.byTask') : t('tasks.inSplit')}
                    </span>
                    {isAdmin && hasInheritedLines && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm assignment-split-toggle"
                        onClick={() => void detail.setAssignmentInSplit(a, a.origen === 'tarea')}
                        disabled={detail.busy || detail.paidPools.has(a.tipo_tarea)}
                        title={detail.paidPools.has(a.tipo_tarea) ? t('tasks.splitPaid') : undefined}
                      >
                        {a.origen === 'tarea' ? t('tasks.joinSplit') : t('tasks.leaveSplit')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => detail.removeAssignment(a.id, a.usuario?.nombre_completo || '')}
                  style={{ marginLeft: 'var(--space-2)' }}
                  title={t('common.delete')}
                >
                  <X size={14} style={{ color: 'var(--color-danger)' }} />
                </button>
              )}
            </div>
          ))}
        </div>
        {isAdmin ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <select
              className="form-input form-select"
              style={{ maxWidth: 280 }}
              aria-label={t('workOrders.assignedTechnician')}
              value={addingOperatorId}
              onChange={(e) => setAddingOperatorId(e.target.value)}
            >
              <option value="">-- {t('workOrders.assignedTechnician')} --</option>
              {/* Solo personal de la sede de la orden: la lista viene de la sede
                  elegida arriba, y una orden abierta desde un aviso puede ser de
                  otra. Asignar a alguien de otro taller le repartía la comisión. */}
              {/* Quien ya está solo por una tarea sí se ofrece: agregarlo a mano lo mete al
                  reparto (el hook cambia el origen de su fila en vez de duplicarla). */}
              {operators
                .filter((op) => op.sede_id === order.sede_id && !assignments.some((a) => a.usuario_id === op.id && a.origen !== 'tarea'))
                .map((op) => (
                  <option key={op.id} value={op.id}>{op.nombre_completo} ({t(`tasks.trade.${op.rol}`)})</option>
                ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={addOperator} disabled={!addingOperatorId}>
              <Plus size={16} /> {t('common.add')}
            </button>
          </div>
        ) : (
          // Aquí estaba "Unirme a la orden". Asignarse reparte la comisión
          // (`sync_order_commissions` divide la mano de obra entre los asignados), así que
          // es de administración y la base lo rechaza. Se deja la frase en su lugar: una
          // tarjeta que solo lista nombres, sin decir quién los pone, se lee como un botón
          // que falta.
          <p className="field-hint" style={{ marginTop: 'var(--space-4)' }}>
            {t('workOrders.assignedByAdmin')}
          </p>
        )}
      </div>
    </CollapsibleSection>
  );
}
