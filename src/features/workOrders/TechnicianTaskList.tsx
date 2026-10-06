import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, MessageSquarePlus, Clock, X, Plus, Eye, EyeOff, XCircle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { LaborItem, PreparedMedia } from '../../types/database';
import { isApproved } from './lineState';
import LaborTable from './LaborTable';
import DraftMediaStrip from '../media/DraftMediaStrip';
import MediaCaptureBar from '../media/MediaCaptureBar';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';
import ReportFindingModal from './ReportFindingModal';
import { findingOutcome } from './techStatus';

interface TechnicianTaskListProps {
  items: LaborItem[];
  currentUserId: string;
  detail: WorkOrderDetailApi;
}

export default function TechnicianTaskList({ items, currentUserId, detail }: TechnicianTaskListProps) {
  const { t } = useLanguage();
  const [addingProgressTo, setAddingProgressTo] = useState<LaborItem | null>(null);
  const [reporting, setReporting] = useState(false);
  // Lo que reportó: así sabe si administración ya lo vio y qué decidió.
  const myFindings = (detail.order?.hallazgos || []).filter((h) => h.reportado_por === currentUserId);

  const myTasks = items.filter((item) => item.asignado_a === currentUserId);
  const otherTasks = items.filter((item) => item.asignado_a !== currentUserId);

  return (
    <div className="technician-tasks" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {myTasks.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          <p>{t('tasks.noTasksAssigned')}</p>
        </div>
      ) : (
        myTasks.map((task) => {
          const approved = isApproved(task);
          const completed = !!task.completado_en;
          // El cliente no la autorizó: queda cerrada sin ejecutarse, no "esperando" (06/10/2026).
          const rejected = task.estado === 'rechazado';

          return (
            <div key={task.id} className={`card task-card ${completed ? 'task-done' : ''} ${rejected ? 'task-rejected' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    {t('tasks.taskLabel')}: {task.descripcion}
                  </h3>
                  {rejected ? (
                    <span className="badge line-state line-state-rechazado" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <XCircle size={12} /> {t('tasks.rejectedBadge')}
                    </span>
                  ) : !approved ? (
                    <span className="badge badge-waiting-auth" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {t('quotes.waitingBadge')}
                    </span>
                  ) : completed ? (
                    <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={12} /> {t('tasks.done')}
                    </span>
                  ) : (
                    <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
                      <Circle size={12} /> {t('tasks.pendingBadge')}
                    </span>
                  )}
                  {rejected && <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>{t('tasks.rejectedHint')}</p>}
                </div>
              </div>

              {approved && (
                <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className={`btn ${completed ? 'btn-secondary' : 'btn-success'}`}
                    onClick={() => detail.toggleLaborComplete(task)}
                    disabled={detail.busy}
                  >
                    {completed ? <Circle size={16} /> : <CheckCircle2 size={16} />}
                    {completed ? t('tasks.reopen') : t('tasks.markDone')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setAddingProgressTo(task)}
                    disabled={detail.busy}
                  >
                    <MessageSquarePlus size={16} /> {t('tasks.addProgress')}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Una orden finalizada solo la reabre administración: tampoco se pausa reportando trabajo. */}
      {detail.canEdit && detail.order?.estatus !== 'finalizado' && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => setReporting(true)}
          disabled={detail.busy}
        >
          <AlertTriangle size={16} /> {t('findings.reportButton')}
        </button>
      )}

      {myFindings.length > 0 && (
        <div className="card">
          {/* No `.card-title`: dentro de una sección plegable del teléfono ese título se esconde. */}
          <h3 className="findings-heading">{t('findings.myFindings')}</h3>
          <ul className="findings-list">
            {myFindings.map((h) => {
              // Cotizado: en qué quedó con el cliente, no solo que se le mandó.
              const outcome = findingOutcome(h, items);
              return (
                <li key={h.id} className="findings-item">
                  <p className="findings-text">{h.descripcion}</p>
                  <span className={`badge findings-badge is-${outcome}`}>{t(`findings.state.${outcome}`)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {otherTasks.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <LaborTable
            title={t('tasks.otherTasks')}
            items={otherTasks}
            workType={detail.order?.tipo_trabajo}
            canEdit={false}
            busy={detail.busy}
            onAdd={detail.addLabor}
            onUpdate={detail.updateLabor}
            onRemove={detail.removeLabor}
            canComplete={false}
            onToggleComplete={detail.toggleLaborComplete}
          />
        </div>
      )}
      {reporting && (
        <ReportFindingModal
          saving={detail.busy}
          onCancel={() => setReporting(false)}
          onConfirm={async (descripcion, media) => {
            const ok = await detail.reportFinding(descripcion, media);
            if (ok) setReporting(false);
            return ok;
          }}
        />
      )}
      {addingProgressTo && (
        <TaskProgressModal
          task={addingProgressTo}
          saving={detail.busy}
          onCancel={() => setAddingProgressTo(null)}
          onConfirm={async (note, media, isVisible) => {
            const ok = await detail.addProgressUpdate(note, media, isVisible, addingProgressTo.id);
            if (ok) setAddingProgressTo(null);
          }}
        />
      )}
    </div>
  );
}

function TaskProgressModal({
  task,
  saving,
  onCancel,
  onConfirm,
}: {
  task: LaborItem;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (note: string, media: PreparedMedia[], isVisible: boolean) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<PreparedMedia[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  const canSubmit = !saving && (note.trim().length > 0 || drafts.length > 0);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">
            <MessageSquarePlus size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('tasks.addProgress')}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onCancel} disabled={saving} aria-label={t('common.cancel')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ padding: 'var(--space-4)' }}>
          <p style={{ marginBottom: 'var(--space-4)', fontWeight: 600 }}>{task.descripcion}</p>

          <div className="form-group">
            <textarea
              className="form-input form-textarea"
              placeholder={t('workOrders.progressPlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              disabled={saving}
            />
          </div>

          <DraftMediaStrip items={drafts} onRemove={(index) => setDrafts((prev) => prev.filter((_, i) => i !== index))} />
          <MediaCaptureBar onAdd={(items) => setDrafts((prev) => [...prev, ...items])} disabled={saving} />

          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} disabled={saving} />
              {isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
              <span>{t('tasks.visibleToCustomer')}</span>
            </label>
            <p className="field-hint" style={{ marginLeft: 24, marginTop: 4 }}>
              {isVisible ? t('tasks.visibleHint') : t('tasks.internalHint')}
            </p>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(note, drafts, isVisible)} disabled={!canSubmit}>
            <Plus size={16} /> {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
