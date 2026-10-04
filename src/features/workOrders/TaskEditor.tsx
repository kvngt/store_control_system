import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { SPECIALTIES, type Specialty, type WorkType } from '../../types/database';
import TechnicianSelect from './TechnicianSelect';
import TradeMismatchDialog from './TradeMismatchDialog';
import { isTradeMismatch, specialtyForWorkType, type TaskDraft, type Technician } from './tasks';

interface TaskEditorProps {
  /** El tipo de la orden: de él sale el tipo con el que nace cada tarea. */
  workType: WorkType;
  /** Quienes pueden recibir la tarea: mecánicos y pintores de la sede DE LA ORDEN. */
  technicians: Technician[];
  /** El técnico que viene elegido (el de la primera tarea que tenga uno). */
  defaultTechnicianId?: string | null;
  busy?: boolean;
  /** Guarda la tarea: en una orden que existe la inserta; en el alta (F4) la suma al borrador.
   * Devolver `false` deja el formulario con lo escrito, para corregir y reintentar.
   */
  onAdd: (task: TaskDraft) => Promise<boolean | void> | boolean | void;
  /** Prefijo de los id del DOM, por si hay dos editores en pantalla. */
  idPrefix?: string;
  /**
   * Abre el formulario con esta descripción (F6: al cotizar un hallazgo). `nonce` cambia en
   * cada pedido, para precargar otra vez aunque el texto sea el mismo.
   */
  prefill?: { text: string; nonce: number } | null;
  /**
   * Avisa si hay una tarea escrita que todavía no se agregó. En el alta, "Crear" la perdería
   * sin decir nada y la orden saldría sin esa mano de obra.
   */
  onPendingChange?: (pending: boolean) => void;
}

interface Draft {
  descripcion: string;
  costo: string;
  especialidad: Specialty;
  /** '' = sin técnico. */
  asignado_a: string;
}

/**
 * "Agregar trabajo": el botón verde y el formulario en línea de una tarea —tipo, descripción,
 * precio y técnico— (reunión con el taller, 03/10/2026).
 *
 * No sabe nada de la orden ni de Supabase: recibe la lista de técnicos y devuelve la tarea por
 * `onAdd`. Así lo usa la pestaña Trabajos de una orden que existe y lo usará el alta de la orden
 * (F4), donde las tareas son un borrador que todavía no está en la base.
 *
 * Si el tipo no es del oficio del técnico (pintura a un mecánico), pregunta antes de guardar:
 * la comisión de la tarea va a esa persona.
 */
export default function TaskEditor({ workType, technicians, defaultTechnicianId, busy = false, onAdd, idPrefix = 'task-editor', prefill, onPendingChange }: TaskEditorProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(!!prefill);
  // En un "combinado" el tipo que se usó la última vez: casi siempre se agregan seguidas varias
  // tareas de lo mismo.
  const [lastCombined, setLastCombined] = useState<Specialty>('mecanica');
  const [draft, setDraft] = useState<Draft>({ descripcion: prefill?.text ?? '', costo: '', especialidad: 'mecanica', asignado_a: '' });
  const [error, setError] = useState('');
  const [mismatch, setMismatch] = useState<{ task: TaskDraft; technician: Technician } | null>(null);
  const [saving, setSaving] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const technicianRef = useRef<HTMLSelectElement>(null);
  // Volver a Descripción después de guardar. No se puede enfocar en `commit`: en ese momento el
  // campo sigue deshabilitado (el guardado y el `busy` del padre todavía no se apagan) y un
  // control deshabilitado no recibe el foco, así que quedaba en el body y había que volver a
  // hacer clic para escribir la siguiente.
  const refocus = useRef(false);
  const disabled = busy || saving;

  useEffect(() => {
    if (prefill) {
      setOpen(true);
      setDraft((d) => ({ ...d, descripcion: prefill.text }));
    }
  }, [prefill]);

  const pending = open && (draft.descripcion.trim() !== '' || draft.costo.trim() !== '');
  useEffect(() => {
    onPendingChange?.(pending);
    // Al desmontarse (el alta pasa a otro paso) ya no queda nada escrito.
    return () => onPendingChange?.(false);
  }, [pending, onPendingChange]);

  useEffect(() => {
    if (!disabled && refocus.current) {
      refocus.current = false;
      descriptionRef.current?.focus();
    }
  }, [disabled]);

  const initialSpecialty = () => (workType === 'combinado' ? lastCombined : specialtyForWorkType(workType));
  const knownDefault = defaultTechnicianId && technicians.some((tech) => tech.id === defaultTechnicianId) ? defaultTechnicianId : '';

  const start = () => {
    setDraft({ descripcion: '', costo: '', especialidad: initialSpecialty(), asignado_a: knownDefault });
    setError('');
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setError('');
  };

  // El precio se recorta a cero, como en el resto de la mano de obra: un negativo sobre una orden
  // entregada se asentaría como un reembolso.
  const toTask = (): TaskDraft => ({
    descripcion: draft.descripcion.trim(),
    costo: Math.max(0, parseFloat(draft.costo) || 0),
    especialidad: draft.especialidad,
    asignado_a: draft.asignado_a || null,
  });

  const commit = async (task: TaskDraft) => {
    setSaving(true);
    try {
      const result = await onAdd(task);
      if (result === false) return;
      if (workType === 'combinado') setLastCombined(task.especialidad);
      // Queda abierto para la siguiente, con el mismo tipo y el mismo técnico.
      setDraft((prev) => ({
        ...prev,
        descripcion: '',
        costo: '',
        especialidad: workType === 'combinado' ? task.especialidad : specialtyForWorkType(workType),
      }));
      refocus.current = true;
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    const task = toTask();
    if (!task.descripcion) {
      setError(t('tasks.descriptionRequired'));
      descriptionRef.current?.focus();
      return;
    }
    setError('');
    const technician = technicians.find((tech) => tech.id === task.asignado_a);
    if (technician && isTradeMismatch(task.especialidad, technician)) {
      setMismatch({ task, technician });
      return;
    }
    void commit(task);
  };

  if (!open) {
    return (
      <div className="task-editor-start">
        {/* Verde y con su nombre: un "+" gris no le decía al admin que ahí se agrega
            (reunión con el taller, 03/10/2026). */}
        <button type="button" className="btn btn-success" onClick={start} disabled={busy} id={`${idPrefix}-open`}>
          <Plus size={16} /> {t('tasks.add')}
        </button>
      </div>
    );
  }

  return (
    <div className="task-editor" role="group" aria-label={t('tasks.formTitle')}>
      <div className="task-editor-fields">
        <div className="form-group task-editor-type">
          <label className="form-label" htmlFor={`${idPrefix}-type`}>{t('tasks.type')}</label>
          <select
            id={`${idPrefix}-type`}
            className="form-input form-select"
            value={draft.especialidad}
            onChange={(e) => setDraft({ ...draft, especialidad: e.target.value as Specialty })}
            disabled={disabled}
          >
            {SPECIALTIES.map((s) => (
              <option key={s} value={s}>{s === 'pintura' ? t('workOrders.painting') : t('workOrders.mechanical')}</option>
            ))}
          </select>
        </div>
        <div className="form-group task-editor-description">
          <label className="form-label" htmlFor={`${idPrefix}-description`}>{t('common.description')}</label>
          <input
            ref={descriptionRef}
            id={`${idPrefix}-description`}
            className="form-input"
            value={draft.descripcion}
            onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            disabled={disabled}
            autoFocus
            aria-invalid={!!error || undefined}
          />
        </div>
        <div className="form-group task-editor-price">
          <label className="form-label" htmlFor={`${idPrefix}-price`}>{t('tasks.price')}</label>
          <input
            id={`${idPrefix}-price`}
            className="form-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="$"
            value={draft.costo}
            onChange={(e) => setDraft({ ...draft, costo: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            disabled={disabled}
          />
        </div>
        <div className="form-group task-editor-technician">
          <label className="form-label" htmlFor={`${idPrefix}-technician`}>{t('tasks.technician')}</label>
          <TechnicianSelect
            ref={technicianRef}
            id={`${idPrefix}-technician`}
            value={draft.asignado_a}
            onChange={(id) => setDraft({ ...draft, asignado_a: id })}
            technicians={technicians}
            emptyLabel={t('tasks.unassigned')}
            disabled={disabled}
          />
        </div>
      </div>
      {error && <p className="task-editor-error" role="alert">{error}</p>}
      {!draft.asignado_a && <p className="field-hint">{t('tasks.noTechnicianHint')}</p>}
      <div className="task-editor-actions">
        <button type="button" className="btn btn-ghost" onClick={close} disabled={saving}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn btn-success" onClick={submit} disabled={disabled} id={`${idPrefix}-submit`}>
          <Plus size={16} /> {t('common.add')}
        </button>
      </div>

      {mismatch && (
        <TradeMismatchDialog
          especialidad={mismatch.task.especialidad}
          technician={mismatch.technician}
          onAssign={() => {
            const { task } = mismatch;
            setMismatch(null);
            void commit(task);
          }}
          onChooseOther={() => {
            setMismatch(null);
            // Después de que el diálogo se cierre, o el foco vuelve a su botón.
            setTimeout(() => technicianRef.current?.focus(), 0);
          }}
          onCancel={() => setMismatch(null)}
        />
      )}
    </div>
  );
}
