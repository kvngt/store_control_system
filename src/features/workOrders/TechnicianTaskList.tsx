import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Circle, MessageSquarePlus, Clock, X, Plus, Eye, EyeOff, XCircle, Play, Pause } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { formatDurationMinutes } from '../../lib/dates';
import { isMediaError } from '../../lib/media/errors';
import type { LaborItem, OrderProgressUpdate, PreparedMedia } from '../../types/database';
import { isApproved } from './lineState';
import LaborTable from './LaborTable';
import DraftMediaStrip from '../media/DraftMediaStrip';
import MediaCaptureBar from '../media/MediaCaptureBar';
import { prepareMediaFile } from '../media/prepareMedia';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';
import ReportFindingModal from './ReportFindingModal';
import { findingOutcome } from './techStatus';
import { techNextStep } from './techNextStep';

interface TechnicianTaskListProps {
  items: LaborItem[];
  currentUserId: string;
  detail: WorkOrderDetailApi;
  /** Cambia cada vez que una acción rápida pide abrir "Reportar trabajo adicional". */
  reportRequest?: number;
}

export default function TechnicianTaskList({ items, currentUserId, detail, reportRequest = 0 }: TechnicianTaskListProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [addingProgressTo, setAddingProgressTo] = useState<LaborItem | null>(null);
  const [initialDrafts, setInitialDrafts] = useState<PreparedMedia[]>([]);
  const [reporting, setReporting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (reportRequest > 0) setReporting(true);
  }, [reportRequest]);
  // Lo que reportó: así sabe si administración ya lo vio y qué decidió.
  const myFindings = (detail.order?.hallazgos || []).filter((h) => h.reportado_por === currentUserId);

  const myTasks = items.filter((item) => item.asignado_a === currentUserId);
  // Los avances de cada tarea (06/10/2026: se guardaban con su tarea pero no se veían ahí).
  const updatesByTask = new Map<string, OrderProgressUpdate[]>();
  for (const avance of detail.order?.avances || []) {
    if (avance.labor_id) updatesByTask.set(avance.labor_id, [...(updatesByTask.get(avance.labor_id) ?? []), avance]);
  }
  const otherTasks = items.filter((item) => item.asignado_a !== currentUserId);

  const handleQuickPhoto = async (task: LaborItem, file: File) => {
    try {
      const prepared = await prepareMediaFile(file);
      setInitialDrafts([prepared]);
      setAddingProgressTo(task);
    } catch (err) {
      const detailMsg = isMediaError(err) ? t('media.errors.' + err.code) : t('media.errors.unsupported-file');
      showToast('error', t('media.addError'), detailMsg);
    }
  };

  const handleAddProgress = (task: LaborItem) => {
    setInitialDrafts([]);
    setAddingProgressTo(task);
  };

  // D1: Siguiente paso calculado con la función pura compartida con acciones rápidas
  const nextStep = techNextStep(detail.order, items, currentUserId);
  const otherPending = items.filter((item) => item.asignado_a !== currentUserId && isApproved(item) && !item.completado_en);

  return (
    <div className="technician-tasks" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* D1: En estado finish queda la ayuda; el botón principal vive en QuickActions */}
      {nextStep === 'finish' && (
        <p className="field-hint" style={{ textAlign: 'center', margin: 0 }}>
          {t('tasks.finishOrderHint')}
        </p>
      )}

      {/* D1: Aviso de tareas pendientes de otros compañeros */}
      {nextStep === 'partDone' && (
        <div
          className="card"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-bg-secondary)',
            borderLeft: '4px solid var(--color-warning)',
          }}
        >
          <p style={{ fontSize: 'var(--font-size-sm)', margin: 0, color: 'var(--color-text-secondary)' }}>
            {t('tasks.myPartDone').replace('{lista}', otherPending.map((p) => p.descripcion).join(', '))}
          </p>
        </div>
      )}
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
                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span>{t('tasks.taskLabel')}: {task.descripcion}</span>
                    {(() => {
                      const job = detail.order?.trabajos?.find((j) => j.id === task.trabajo_id);
                      return job ? <span className="job-chip">{job.titulo}</span> : null;
                    })()}
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

              {(updatesByTask.get(task.id) ?? []).length > 0 && (
                <div className="task-updates">
                  <div className="task-updates-title">
                    {t('workOrders.taskProgressCount').replace('{n}', String(updatesByTask.get(task.id)!.length))}
                  </div>
                  <ul>
                    {[...updatesByTask.get(task.id)!]
                      .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
                      .slice(0, 3)
                      .map((u) => (
                        <li key={u.id}>
                          <span className="task-updates-date">{new Date(u.creado_en).toLocaleDateString()}</span>{' '}
                          {u.descripcion || t('workOrders.progressFilesOnly')}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {approved && (
                <TaskActions
                  task={task}
                  completed={completed}
                  detail={detail}
                  currentUserId={currentUserId}
                  now={now}
                  onAddProgress={handleAddProgress}
                  onQuickPhoto={handleQuickPhoto}
                />
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
            laborTimes={detail.laborTimes}
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
          initialDrafts={initialDrafts}
          saving={detail.busy}
          onCancel={() => {
            setAddingProgressTo(null);
            setInitialDrafts([]);
          }}
          onConfirm={async (note, media, isVisible) => {
            const ok = await detail.addProgressUpdate(note, media, isVisible, addingProgressTo.id);
            if (ok) {
              setAddingProgressTo(null);
              setInitialDrafts([]);
            }
          }}
        />
      )}
    </div>
  );
}

function TaskActions({
  task,
  completed,
  detail,
  currentUserId,
  now,
  onAddProgress,
  onQuickPhoto,
}: {
  task: LaborItem;
  completed: boolean;
  detail: WorkOrderDetailApi;
  currentUserId: string;
  now: number;
  onAddProgress: (task: LaborItem) => void;
  onQuickPhoto: (task: LaborItem, file: File) => void;
}) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      onQuickPhoto(task, file);
    }
  };

  const runningEntry = (detail.laborTimes || []).find(
    (e) => e.labor_id === task.id && e.usuario_id === currentUserId && !e.fin
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
      {!completed && (
        runningEntry ? (
          <button
            type="button"
            className="btn btn-warning"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
            onClick={() => detail.stopClock(task.id)}
            disabled={detail.busy}
          >
            <Pause size={18} />
            {t('tasks.pauseClock')} ({formatDurationMinutes(Math.max(0, Math.floor((now - new Date(runningEntry.inicio).getTime()) / 60000)))})
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
            onClick={() => detail.startClock(task.id)}
            disabled={detail.busy}
          >
            <Play size={18} />
            {t('tasks.startClock')}
          </button>
        )
      )}
      <button
        type="button"
        className={`btn ${completed ? 'btn-secondary' : 'btn-success'}`}
        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
        onClick={() => detail.toggleLaborComplete(task)}
        disabled={detail.busy}
      >
        {completed ? <Circle size={16} /> : <CheckCircle2 size={16} />}
        {completed ? t('tasks.reopen') : t('tasks.markDone')}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
        onClick={() => onAddProgress(task)}
        disabled={detail.busy}
      >
        <MessageSquarePlus size={16} /> {t('tasks.addProgress')}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
        onClick={() => fileInputRef.current?.click()}
        disabled={detail.busy}
      >
        <Camera size={16} /> {t('tasks.quickPhoto')}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        disabled={detail.busy}
        onChange={handleFileChange}
      />
    </div>
  );
}

function TaskProgressModal({
  task,
  initialDrafts = [],
  saving,
  onCancel,
  onConfirm,
}: {
  task: LaborItem;
  initialDrafts?: PreparedMedia[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (note: string, media: PreparedMedia[], isVisible: boolean) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<PreparedMedia[]>(initialDrafts);
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
