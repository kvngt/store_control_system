import { Pencil, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../../context/language.context';
import { useToast } from '../../../../context/toast.context';
import { money } from '../../../../lib/money';
import type { WorkOrderFormApi } from '../../useWorkOrderForm';
import PartEditor from '../../PartEditor';
import FieldError from '../FieldError';

interface WorkPartsSectionProps {
  form: WorkOrderFormApi;
  saving: boolean;
  editingPart: number | null;
  justAddedIndex: number | null;
  showPendingWarning: boolean;
  onStartEdit: (index: number) => void;
  onStopEdit: () => void;
  onRemove: () => void;
  onAdded: (index: number, descripcion: string) => void;
  onPendingChange: (pending: boolean) => void;
}

export default function WorkPartsSection({
  form,
  saving,
  editingPart,
  justAddedIndex,
  showPendingWarning,
  onStartEdit,
  onStopEdit,
  onRemove,
  onAdded,
  onPendingChange,
}: WorkPartsSectionProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { errors } = form.form.formState;

  return (
    <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
      <div className="form-label">{t('intake.partsCount').replace('{n}', String(form.parts.fields.length))}</div>
      {form.parts.fields.length === 0 && <p className="field-hint">{t('intake.noPartsYet')}</p>}
      <ul className="intake-task-list">
        {form.parts.fields.map((field, i) => {
          if (editingPart === i) {
            return (
              <li key={field.id}>
                <PartEditor
                  initial={{
                    descripcion: field.descripcion,
                    cantidad: field.cantidad,
                    precio_venta_unitario: field.precio_venta_unitario,
                    costo_unitario: field.costo_unitario ?? '',
                  }}
                  onSave={(part) => {
                    form.parts.update(i, { ...part, grupo: field.grupo });
                    showToast('success', t('intake.lineUpdated'));
                  }}
                  onClose={onStopEdit}
                  disabled={saving}
                  idPrefix={`edit-part-${i}`}
                />
              </li>
            );
          }
          const fresh = justAddedIndex === i;
          const job = form.jobs.fields.find((j) => j.grupo === field.grupo);
          const rowError =
            errors.parts?.[i]?.descripcion?.message ||
            errors.parts?.[i]?.cantidad?.message ||
            errors.parts?.[i]?.precio_venta_unitario?.message;
          return (
            <li key={field.id} className={'intake-task' + (fresh ? ' is-new' : '')}>
              <div className="intake-task-text">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <strong>{field.descripcion}</strong>
                  {job && <span className="job-chip">{job.titulo}</span>}
                </div>
                <span>
                  {field.cantidad} × {money(parseFloat(field.precio_venta_unitario) || 0)}
                  {field.costo_unitario?.trim() ? ` · ${t('parts.cost')} ${money(parseFloat(field.costo_unitario) || 0)}` : ''}
                </span>
                <FieldError messageKey={rowError} />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => onStartEdit(i)}
                disabled={saving}
                aria-label={t('intake.editPart').replace('{part}', field.descripcion)}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => {
                  onRemove();
                  form.parts.remove(i);
                }}
                disabled={saving}
                aria-label={t('intake.removePart')}
              >
                <Trash2 size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      <PartEditor
        onSave={(part) => {
          const index = form.parts.fields.length;
          form.parts.append(part);
          onAdded(index, part.descripcion);
        }}
        onPendingChange={onPendingChange}
        disabled={saving}
        idPrefix="create-order-part"
      />
      {showPendingWarning && (
        <p className="task-editor-error" role="alert">{t('intake.partPending')}</p>
      )}
    </div>
  );
}
