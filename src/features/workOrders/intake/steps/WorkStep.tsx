import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { BookOpen, Pencil, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../../context/language.context';
import { moduloActivo } from '../../../../config/modulos';
import { useToast } from '../../../../context/toast.context';
import { money } from '../../../../lib/money';
import type { UserProfile } from '../../../../types/database';
import type { WorkOrderFormApi } from '../../useWorkOrderForm';
import CatalogPickerModal from '../../../catalog/CatalogPickerModal';
import TaskEditor from '../../TaskEditor';
import PendingWorkNotice from '../../PendingWorkNotice';
import { appendCatalogJobToForm } from '../intakeUtils';
import WorkPartsSection from './WorkPartsSection';

interface WorkStepProps {
  form: WorkOrderFormApi;
  sedeId?: string;
  operators: UserProfile[];
  isAdmin: boolean;
  saving: boolean;
  hasLines: boolean;
  guardRef: RefObject<(() => boolean) | null>;
}

export default function WorkStep({
  form,
  sedeId,
  operators,
  isAdmin,
  saving,
  hasLines,
  guardRef,
}: WorkStepProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { register, watch } = form.form;

  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  // Una tarea escrita en el editor que todavía no se agregó a la lista.
  const [taskPending, setTaskPending] = useState(false);
  const [partPending, setPartPending] = useState(false);
  const [pendingWarning, setPendingWarning] = useState<'task' | 'part' | 'edit' | null>(null);
  const onTaskPendingChange = useCallback((pending: boolean) => {
    setTaskPending(pending);
    if (!pending) setPendingWarning((w) => (w === 'task' ? null : w));
  }, []);
  const onPartPendingChange = useCallback((pending: boolean) => {
    setPartPending(pending);
    if (!pending) setPendingWarning((w) => (w === 'part' ? null : w));
  }, []);
  // La línea que se está editando en la lista (pedido del taller del 06/10/2026: lo agregado
  // en el alta solo se podía borrar). Una a la vez.
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editingPart, setEditingPart] = useState<number | null>(null);
  // La última línea agregada se resalta un momento, para que se vea que entró.
  const [justAdded, setJustAdded] = useState<{ kind: 'task' | 'part'; index: number } | null>(null);
  const justAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (justAddedTimerRef.current !== null) clearTimeout(justAddedTimerRef.current);
  }, []);
  // La explicación ("se guarda al crear…") solo la primera vez: en el teléfono los avisos
  // apilados tapaban la lista.
  const explained = useRef(false);
  const addedHint = () => {
    if (explained.current) return undefined;
    explained.current = true;
    return t('intake.addedHint');
  };
  const markAdded = (kind: 'task' | 'part', index: number) => {
    setJustAdded({ kind, index });
    if (justAddedTimerRef.current !== null) clearTimeout(justAddedTimerRef.current);
    justAddedTimerRef.current = setTimeout(() => {
      justAddedTimerRef.current = null;
      setJustAdded((cur) => (cur?.kind === kind && cur.index === index ? null : cur));
    }, 2500);
  };

  useEffect(() => {
    guardRef.current = () => {
      if (editingTask !== null || editingPart !== null) {
        setPendingWarning('edit');
        return true;
      }
      if (taskPending) {
        setPendingWarning('task');
        return true;
      }
      if (partPending) {
        setPendingWarning('part');
        return true;
      }
      return false;
    };
    return () => {
      guardRef.current = null;
    };
  }, [guardRef, editingTask, editingPart, taskPending, partPending]);

  const specialtyLabel = (especialidad: string) =>
    especialidad === 'pintura' ? t('workOrders.painting') : t('workOrders.mechanical');

  // Lo que este vehículo dejó pendiente en otras visitas: es cuando se cotiza que conviene verlo.
  const chosenVehicle = watch('selectedVehicle');

  return (
    <>
      {form.vehicleMode === 'existing' && chosenVehicle && chosenVehicle !== '__new__' && (
        <PendingWorkNotice vehicleId={chosenVehicle} />
      )}
      <div className="form-group">
        <label className="form-label" htmlFor="order-work-type">{t('workOrders.workType')}</label>
        <select id="order-work-type" className="form-input form-select" {...register('workType')}>
          <option value="mecanica">{t('workOrders.mechanical')}</option>
          <option value="pintura">{t('workOrders.painting')}</option>
          <option value="combinado">{t('workOrders.combined')}</option>
        </select>
      </div>

      {/* Mano de obra y repuestos: solo administración cotiza. Cada línea se agrega con su
          editor (botón verde → formulario → "Agregar"), entra a la lista con un aviso y desde
          ahí se edita o se quita, como en los programas de taller (pedido del 06/10/2026). */}
      {isAdmin && (
        <>
          <p className="field-hint" style={{ marginTop: 'var(--space-3)' }}>{t('quotes.createHint')}</p>
          <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
            <div className="form-label">{t('intake.tasksCount').replace('{n}', String(form.labor.fields.length))}</div>
            {form.labor.fields.length === 0 && (
              <p className="field-hint">{t('intake.noTasksYet')}</p>
            )}
            <ul className="intake-task-list">
              {form.labor.fields.map((field, i) => {
                if (editingTask === i) {
                  return (
                    <li key={field.id}>
                      <TaskEditor
                        workType={watch('workType')}
                        technicians={operators}
                        initial={{
                          descripcion: field.descripcion,
                          costo: parseFloat(field.costo) || 0,
                          especialidad: field.especialidad,
                          asignado_a: field.asignado_a || null,
                          horas: field.horas ? parseFloat(field.horas) : null,
                        }}
                        onAdd={(task) => {
                          // `update` reemplaza la fila entera: sin `grupo`, la línea salía de su trabajo.
                          form.labor.update(i, {
                            grupo: field.grupo,
                            descripcion: task.descripcion,
                            costo: task.costo.toString(),
                            especialidad: task.especialidad,
                            asignado_a: task.asignado_a || '',
                            horas: task.horas != null ? task.horas.toString() : '',
                          });
                          showToast('success', t('intake.lineUpdated'));
                        }}
                        onClose={() => {
                          setEditingTask(null);
                          setPendingWarning((w) => (w === 'edit' ? null : w));
                        }}
                        busy={saving}
                        idPrefix={`edit-task-${i}`}
                      />
                    </li>
                  );
                }
                const technician = operators.find((o) => o.id === field.asignado_a);
                const fresh = justAdded?.kind === 'task' && justAdded.index === i;
                const job = form.jobs.fields.find((j) => j.grupo === field.grupo);
                return (
                  <li key={field.id} className={'intake-task' + (fresh ? ' is-new' : '')}>
                    <div className="intake-task-text">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <strong>{field.descripcion}</strong>
                        {job && <span className="job-chip">{job.titulo}</span>}
                      </div>
                      <span>
                        {specialtyLabel(field.especialidad)} · {money(parseFloat(field.costo) || 0)}
                        {moduloActivo('reloj') && field.horas ? ` · ${field.horas} h` : ''} ·{' '}
                        {technician?.nombre_completo || t('tasks.unassigned')}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => {
                        setEditingPart(null);
                        setEditingTask(i);
                      }}
                      disabled={saving}
                      aria-label={t('intake.editTask').replace('{task}', field.descripcion)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => {
                        setEditingTask(null);
                        form.labor.remove(i);
                      }}
                      disabled={saving}
                      aria-label={t('intake.removeTask').replace('{task}', field.descripcion)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* El mismo editor de la pestaña Trabajos (F3): tipo, descripción, precio y
                técnico, con el aviso de oficio distinto. Aquí la tarea solo se suma al
                borrador; entra a la base con la orden. */}
            <TaskEditor
              workType={watch('workType')}
              technicians={operators}
              defaultTechnicianId={form.labor.fields.find((f) => f.asignado_a)?.asignado_a || null}
              onAdd={(task) => {
                markAdded('task', form.labor.fields.length);
                form.labor.append({
                  descripcion: task.descripcion,
                  costo: task.costo.toString(),
                  especialidad: task.especialidad,
                  asignado_a: task.asignado_a || '',
                  horas: task.horas != null ? task.horas.toString() : '',
                });
                showToast('success', t('intake.taskAdded').replace('{task}', task.descripcion), addedHint());
              }}
              onPendingChange={onTaskPendingChange}
              busy={saving}
              idPrefix="create-order"
              extraActions={
                sedeId && moduloActivo('catalogo') ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCatalogPickerOpen(true)}
                    disabled={saving}
                  >
                    <BookOpen size={16} /> {t('catalog.fromCatalog')}
                  </button>
                ) : undefined
              }
            />
            {pendingWarning === 'task' && (
              <p className="task-editor-error" role="alert">{t('intake.taskPending')}</p>
            )}
          </div>

          <WorkPartsSection
            form={form}
            saving={saving}
            editingPart={editingPart}
            justAddedIndex={justAdded?.kind === 'part' ? justAdded.index : null}
            showPendingWarning={pendingWarning === 'part'}
            onStartEdit={(i) => {
              setEditingTask(null);
              setEditingPart(i);
            }}
            onStopEdit={() => {
              setEditingPart(null);
              setPendingWarning((w) => (w === 'edit' ? null : w));
            }}
            onRemove={() => setEditingPart(null)}
            onAdded={(index, descripcion) => {
              markAdded('part', index);
              showToast('success', t('intake.partAdded').replace('{part}', descripcion), addedHint());
            }}
            onPendingChange={onPartPendingChange}
          />
          {pendingWarning === 'edit' && (
            <p className="task-editor-error" role="alert">{t('intake.editPending')}</p>
          )}
        </>
      )}

      {hasLines && (
        <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
          <label className="form-checkbox" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              id="order-authorized-at-intake"
              style={{ marginTop: '3px' }}
              {...register('authorizedAtIntake')}
            />
            <div>
              <span style={{ fontWeight: 500, display: 'block' }}>{t('intake.authorizedAtIntake')}</span>
              <span className="field-hint" style={{ marginTop: 'var(--space-1)', display: 'block' }}>
                {t('intake.authorizedAtIntakeHint')}
              </span>
            </div>
          </label>
        </div>
      )}

      {/* Al final: con los trabajos y repuestos a la vista ya se sabe cuándo puede estar listo
          (pedido del taller, 06/10/2026). */}
      <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
        <label className="form-label" htmlFor="order-estimated-date">{t('workOrders.estimatedDelivery')}</label>
        <input id="order-estimated-date" className="form-input" type="date" {...register('estimatedDate')} />
      </div>

      <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
        <label className="form-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            id="order-with-insurance"
            {...register('withInsurance')}
          />
          <span style={{ fontWeight: 500 }}>{t('workOrders.withInsurance')}</span>
        </label>
      </div>

      {watch('withInsurance') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="order-insurer">{t('workOrders.insurer')}</label>
            <input
              id="order-insurer"
              className="form-input"
              type="text"
              placeholder={t('workOrders.insurerPlaceholder')}
              {...register('insurer')}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="order-claim-number">{t('workOrders.claimNumber')}</label>
            <input
              id="order-claim-number"
              className="form-input"
              type="text"
              placeholder={t('workOrders.claimNumberPlaceholder')}
              {...register('claimNumber')}
            />
          </div>
        </div>
      )}

      {sedeId && moduloActivo('catalogo') && (
        <CatalogPickerModal
          isOpen={catalogPickerOpen}
          onClose={() => setCatalogPickerOpen(false)}
          sedeId={sedeId}
          technicians={operators}
          onSelectDraft={(selectedJob, assignedTechId) => {
            appendCatalogJobToForm(form, operators, selectedJob, assignedTechId);
            showToast('success', t('catalog.jobAddedSuccess'));
          }}
        />
      )}
    </>
  );
}
