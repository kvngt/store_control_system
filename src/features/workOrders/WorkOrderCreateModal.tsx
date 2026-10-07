import { useCallback, useRef, useState } from 'react';
import { Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Pencil, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { isMediaError } from '../../lib/media/errors';
import { money } from '../../lib/money';
import type { Customer, UserProfile, Vehicle, PaymentMethod } from '../../types/database';
import VehicleFields from '../vehicles/VehicleFields';
import MediaCaptureBar from '../media/MediaCaptureBar';
import DraftMediaStrip from '../media/DraftMediaStrip';
import { ZONES } from './useIntakePhotos';
import type { WorkOrderFormApi } from './useWorkOrderForm';
import { INTAKE_STEPS } from './workOrderForm.schema';
import { AlertError } from '../../components/AlertError';
import PhoneInput from '../../components/PhoneInput';
import PaymentFields from './PaymentFields';
import TaskEditor from './TaskEditor';
import PartEditor from './PartEditor';
import PendingWorkNotice from './PendingWorkNotice';

/**
 * Refuses the keys that put a minus sign into a `type="number"` box.
 *
 * `min={0}` is inert here: the form is `noValidate`, so the browser never runs
 * its own constraint check, and the schema only speaks up on "Siguiente" or
 * submit — by which point the user has already typed the number and been told
 * off for it. This stops the common case at the keyboard instead. It
 * deliberately does not clamp the value: a paste or an autofill still has to
 * reach the schema and be reported, because silently rewriting somebody's -500
 * to 0 is worse than telling them it is wrong.
 */
const blockNegativeKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
};

const TOTAL_STEPS = INTAKE_STEPS.length;

interface WorkOrderCreateModalProps {
  form: WorkOrderFormApi;
  customers: Customer[];
  /** Already narrowed to the selected customer by the caller. */
  vehiclesForCustomer: Vehicle[];
  operators: UserProfile[];
  isAdmin: boolean;
  saving: boolean;
  /** Already translated by the caller. */
  error: string;
  onSubmit: () => void;
  onClose: () => void;
}

/**
 * The "nueva orden" dialog, in four steps since the meeting with the shop on
 * 03/10/2026 (F4): customer; vehicle and check-in (odometer, fuel, 360-degree
 * photos plus extra photos, videos and voice notes); deposit and how it was
 * paid; and the jobs — each with its type, price and technician — and parts.
 *
 * Deliberately presentational — every field belongs to `useWorkOrderForm` and
 * submission belongs to the screen — so the dialog can be rendered and
 * exercised on its own. Validation messages arrive as translation keys and are
 * turned into sentences here, at render, so switching language never means
 * revalidating the form.
 */
export default function WorkOrderCreateModal({
  form,
  customers,
  vehiclesForCustomer,
  operators,
  isAdmin,
  saving,
  error,
  onSubmit,
  onClose,
}: WorkOrderCreateModalProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { register, formState, watch, setValue } = form.form;
  const { errors } = formState;
  const photos = form.photos;
  const newVehicle = form.newVehicle;
  const { step, furthestStep, nextStep, prevStep, goToStep } = form;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  // La barra está comprimiendo una foto o convirtiendo un video de galería.
  const [captureBusy, setCaptureBusy] = useState(false);
  const preparing = photos.processing > 0 || captureBusy;
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
    setTimeout(() => setJustAdded((cur) => (cur?.kind === kind && cur.index === index ? null : cur)), 2500);
  };

  const FieldError = ({ messageKey }: { messageKey?: string }) =>
    messageKey ? (
      <span role="alert" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
        {t(messageKey)}
      </span>
    ) : null;

  const handleZoneClick = (zoneKey: string) => {
    setActiveZone(zoneKey);
    fileInputRef.current?.click();
  };

  // Una foto que no se pudo leer (un HEIC en un navegador que no lo decodifica)
  // se dice en el momento, en vez de desaparecer sin rastro.
  const reportPhotoError = (err: unknown) => {
    const detail = isMediaError(err) ? t('media.errors.' + err.code) : t('media.errors.unsupported-image');
    showToast('error', t('media.addError'), detail);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeZone) photos.setZonePhoto(activeZone, file).catch(reportPhotoError);
    e.target.value = '';
  };

  const removePhoto = (zoneKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    photos.removePhoto(zoneKey);
  };

  const currentKey = INTAKE_STEPS[step - 1]?.key;

  // Enter dentro de un paso avanza al siguiente; solo en el último crea la orden. Antes de
  // esto, un Enter en el depósito enviaba el formulario entero desde la mitad del asistente.
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Salir de Trabajos con algo escrito sin agregar, o con una línea abierta, lo perdería: el
    // editor se desmonta al cambiar de paso.
    if (currentKey === 'work') {
      if (editingTask !== null || editingPart !== null) {
        setPendingWarning('edit');
        return;
      }
      if (taskPending) {
        setPendingWarning('task');
        return;
      }
      if (partPending) {
        setPendingWarning('part');
        return;
      }
    }
    if (step < TOTAL_STEPS) {
      void nextStep();
      return;
    }
    onSubmit();
  };

  const specialtyLabel = (especialidad: string) =>
    especialidad === 'pintura' ? t('workOrders.painting') : t('workOrders.mechanical');

  const renderCustomerStep = () => (
    <div className="form-group">
      <label className="form-label" htmlFor="intake-customer">{t('customers.customerProfile')}</label>
      {form.customerMode === 'existing' ? (
        <>
          <select
            id="intake-customer"
            className="form-input form-select"
            value={form.selectedCustomer}
            aria-invalid={!!errors.selectedCustomer}
            onChange={(e) => form.selectCustomer(e.target.value)}
          >
            <option value="">{t('intake.selectCustomer')}</option>
            <option value="__new__">+ {t('customers.newCustomer')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <FieldError messageKey={errors.selectedCustomer?.message} />
        </>
      ) : (
        <div className="intake-inline-panel">
          <div className="form-row">
            <div style={{ flex: 1 }}>
              <input
                className="form-input"
                placeholder={t('common.name')}
                aria-invalid={!!errors.newCustomer?.nombre}
                {...register('newCustomer.nombre')}
              />
              <FieldError messageKey={errors.newCustomer?.nombre?.message} />
            </div>
            <div style={{ flex: 1 }}>
              {/* Controlado a mano en vez de `register`: el campo son dos controles
                  (país y número) que juntos dan un solo valor. */}
              <PhoneInput
                value={watch('newCustomer.telefono')}
                onChange={(telefono) =>
                  setValue('newCustomer.telefono', telefono, {
                    shouldDirty: true,
                    shouldValidate: formState.isSubmitted || !!errors.newCustomer?.telefono,
                  })
                }
                invalid={!!errors.newCustomer?.telefono}
                placeholder={t('common.phone')}
              />
              <FieldError messageKey={errors.newCustomer?.telefono?.message} />
            </div>
          </div>
          <div className="form-row" style={{ marginTop: 'var(--space-2)' }}>
            <input className="form-input" type="email" placeholder={t('common.email')} {...register('newCustomer.email')} />
            <input className="form-input" placeholder={t('common.address')} {...register('newCustomer.direccion')} />
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 'var(--space-2)' }}
            onClick={form.backToExistingCustomer}
          >
            <ChevronLeft size={14} /> {t('common.back')}
          </button>
        </div>
      )}
    </div>
  );

  const renderVehicleStep = () => (
    <>
      <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
        <label className="form-label" htmlFor="intake-vehicle">{t('vehicles.title')}</label>
        {form.vehicleMode === 'existing' ? (
          <>
            <select
              id="intake-vehicle"
              className="form-input form-select"
              value={watch('selectedVehicle')}
              aria-invalid={!!errors.selectedVehicle}
              onChange={(e) => form.selectVehicle(e.target.value)}
              disabled={!form.selectedCustomer}
            >
              <option value="">{t('intake.selectVehicle')}</option>
              <option value="__new__">+ {t('vehicles.newVehicle')}</option>
              {vehiclesForCustomer.map((v) => (
                <option key={v.id} value={v.id}>{v.marca} {v.modelo} ({v.placa})</option>
              ))}
            </select>
            <FieldError messageKey={errors.selectedVehicle?.message} />
          </>
        ) : (
          /* The same VIN-first form the Vehiculos screen uses: VIN lookup, plate
             check and brand/model suggestions, with the customer standing there. */
          <div className="intake-inline-panel">
            <VehicleFields
              value={newVehicle}
              onChange={form.setNewVehicle}
              touched={formState.isSubmitted || !!errors.newVehicle}
              requirePlate={false}
              disabled={saving}
            />
            <FieldError messageKey={errors.newVehicle?.vin?.message} />
            <FieldError messageKey={errors.newVehicle?.marca?.message} />
            <FieldError messageKey={errors.newVehicle?.modelo?.message} />
            {form.customerMode === 'existing' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 'var(--space-2)' }}
                onClick={form.backToExistingVehicle}
              >
                <ChevronLeft size={14} /> {t('common.back')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="order-fuel">{t('workOrders.fuelLevel')}</label>
          <select id="order-fuel" className="form-input form-select" {...register('fuelLevel')}>
            <option value="E (Vacio)">E (Vacío / Empty)</option>
            <option value="1/4">1/4</option>
            <option value="1/2">1/2</option>
            <option value="3/4">3/4</option>
            <option value="F (Lleno)">F (Lleno / Full)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="order-miles-in">{t('workOrders.milesIn')}</label>
          {/* An odometer reading below zero is meaningless and it corrupts the
              printed report, so the minus key is refused outright rather than
              accepted and then complained about. */}
          <input
            className="form-input"
            id="order-miles-in"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            aria-invalid={!!errors.milesIn}
            onKeyDown={blockNegativeKeys}
            {...register('milesIn')}
          />
          <FieldError messageKey={errors.milesIn?.message} />
        </div>
      </div>

      <div className="form-group" style={{ marginTop: 'var(--space-2)' }}>
        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('workOrders.inspection360')}</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: photos.zonesCovered === ZONES.length ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: 600 }}>
            {photos.zonesCovered}/{ZONES.length}
            {photos.extraMedia.length > 0 && ` +${photos.extraMedia.length}`}
          </span>
        </label>
        <div className="photo-zone-grid">
          {ZONES.map(({ key, label }) => {
            const photo = photos.photos[key];
            return (
              <div key={key} onClick={() => handleZoneClick(key)} className={`photo-zone ${photo ? 'filled' : ''}`}>
                {photo && (
                  <>
                    <img
                      src={photo.preview}
                      alt={label}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      className="photo-zone-remove"
                      onClick={(e) => removePhoto(key, e)}
                      aria-label={`${t('common.delete')} ${label}`}
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
                {!photo ? (
                  <>
                    <Camera size={24} className="photo-zone-icon" />
                    <span className="photo-zone-label">{label}</span>
                  </>
                ) : (
                  <span className="photo-zone-caption">
                    <CheckCircle2 size={12} /> {label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Lo mismo que la tarjeta de la orden ya creada: más fotos, un video de
            recorrido o una nota de voz sobre cómo llegó el vehículo (pedido del taller,
            octubre 2026). Queda en el navegador y entra a la cola de subida al crear la
            orden, con las fotos. */}
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <DraftMediaStrip items={photos.extraMedia} onRemove={photos.removeMedia} />
          <MediaCaptureBar onAdd={photos.addMedia} disabled={saving} onBusyChange={setCaptureBusy} />
        </div>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)' }}>
          {photos.processing > 0 ? (
            <>
              <span className="spinner-small media-capture-spinner" /> {t('media.processing')}
            </>
          ) : (
            t('workOrders.tapToCapture')
          )}
        </p>
      </div>

      <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
        <label className="form-label" htmlFor="order-inspection-notes">{t('intake.inspectionNotes')}</label>
        <textarea
          id="order-inspection-notes"
          className="form-input form-textarea"
          placeholder={t('intake.inspectionNotesPlaceholder')}
          rows={2}
          {...register('inspectionNotes')}
        />
      </div>
    </>
  );

  // Cobrar es de administración, igual que abrir la orden desde 20261004000000. El `isAdmin`
  // se queda como red, porque `create_work_order` también ignora el depósito si no lo manda
  // un admin.
  const renderDepositStep = () =>
    isAdmin ? (
      <>
        <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>{t('intake.depositHint')}</p>
        <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
          <label className="form-label" htmlFor="order-deposit">{t('workOrders.deposit')} ($)</label>
          <input
            id="order-deposit"
            className="form-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            aria-invalid={!!errors.deposit}
            onKeyDown={blockNegativeKeys}
            {...register('deposit')}
          />
          <FieldError messageKey={errors.deposit?.message} />
        </div>
        {parseFloat(watch('deposit') || '0') > 0 && (
          <>
            <PaymentFields
              metodo={watch('paymentMethod') as PaymentMethod | ''}
              onChangeMetodo={(val) => setValue('paymentMethod', val, { shouldDirty: true, shouldValidate: !!errors.paymentMethod })}
              numeroCheque={watch('checkNumber')}
              onChangeNumeroCheque={(val) => setValue('checkNumber', val, { shouldDirty: true, shouldValidate: !!errors.checkNumber })}
              onChangeFile={form.setReceiptFile}
              disabled={saving}
            />
            {/* El campo de archivo se vacía al volver a este paso; el comprobante elegido no. */}
            {form.receiptFile && (
              <p className="field-hint">
                {t('intake.receiptChosen').replace('{name}', form.receiptFile.name)}{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => form.setReceiptFile(null)}>
                  {t('common.delete')}
                </button>
              </p>
            )}
          </>
        )}
        <FieldError messageKey={errors.paymentMethod?.message} />
        <FieldError messageKey={errors.checkNumber?.message} />
      </>
    ) : null;

  // Lo que este vehículo dejó pendiente en otras visitas: es cuando se cotiza que conviene verlo.
  const chosenVehicle = watch('selectedVehicle');
  const renderWorkStep = () => (
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
                        }}
                        onAdd={(task) => {
                          form.labor.update(i, {
                            descripcion: task.descripcion,
                            costo: task.costo.toString(),
                            especialidad: task.especialidad,
                            asignado_a: task.asignado_a || '',
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
                return (
                  <li key={field.id} className={'intake-task' + (fresh ? ' is-new' : '')}>
                    <div className="intake-task-text">
                      <strong>{field.descripcion}</strong>
                      <span>
                        {specialtyLabel(field.especialidad)} · {money(parseFloat(field.costo) || 0)} ·{' '}
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
                });
                showToast('success', t('intake.taskAdded').replace('{task}', task.descripcion), addedHint());
              }}
              onPendingChange={onTaskPendingChange}
              busy={saving}
              idPrefix="create-order"
            />
            {pendingWarning === 'task' && (
              <p className="task-editor-error" role="alert">{t('intake.taskPending')}</p>
            )}
          </div>

          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-label">{t('intake.partsCount').replace('{n}', String(form.parts.fields.length))}</div>
            {form.parts.fields.length === 0 && <p className="field-hint">{t('intake.noPartsYet')}</p>}
            <ul className="intake-task-list">
              {form.parts.fields.map((field, i) => {
                if (editingPart === i) {
                  return (
                    <li key={field.id}>
                      <PartEditor
                        initial={{ descripcion: field.descripcion, cantidad: field.cantidad, precio_venta_unitario: field.precio_venta_unitario, costo_unitario: field.costo_unitario ?? '' }}
                        onSave={(part) => {
                          form.parts.update(i, part);
                          showToast('success', t('intake.lineUpdated'));
                        }}
                        onClose={() => {
                          setEditingPart(null);
                          setPendingWarning((w) => (w === 'edit' ? null : w));
                        }}
                        disabled={saving}
                        idPrefix={`edit-part-${i}`}
                      />
                    </li>
                  );
                }
                const fresh = justAdded?.kind === 'part' && justAdded.index === i;
                const rowError =
                  errors.parts?.[i]?.descripcion?.message ||
                  errors.parts?.[i]?.cantidad?.message ||
                  errors.parts?.[i]?.precio_venta_unitario?.message;
                return (
                  <li key={field.id} className={'intake-task' + (fresh ? ' is-new' : '')}>
                    <div className="intake-task-text">
                      <strong>{field.descripcion}</strong>
                      <span>
                        {field.cantidad} × {money(parseFloat(field.precio_venta_unitario) || 0)}
                        {field.costo_unitario?.trim() ? ` · ${t('parts.cost')} ${money(parseFloat(field.costo_unitario) || 0)}` : ''}
                      </span>
                      <FieldError messageKey={rowError} />
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => {
                        setEditingTask(null);
                        setEditingPart(i);
                      }}
                      disabled={saving}
                      aria-label={t('intake.editPart').replace('{part}', field.descripcion)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => {
                        setEditingPart(null);
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
                markAdded('part', form.parts.fields.length);
                form.parts.append(part);
                showToast('success', t('intake.partAdded').replace('{part}', part.descripcion), addedHint());
              }}
              onPendingChange={onPartPendingChange}
              disabled={saving}
              idPrefix="create-order-part"
            />
            {pendingWarning === 'part' && (
              <p className="task-editor-error" role="alert">{t('intake.partPending')}</p>
            )}
          </div>
          {pendingWarning === 'edit' && (
            <p className="task-editor-error" role="alert">{t('intake.editPending')}</p>
          )}
        </>
      )}

      {/* Al final: con los trabajos y repuestos a la vista ya se sabe cuándo puede estar listo
          (pedido del taller, 06/10/2026). */}
      <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
        <label className="form-label" htmlFor="order-estimated-date">{t('workOrders.estimatedDelivery')}</label>
        <input id="order-estimated-date" className="form-input" type="date" {...register('estimatedDate')} />
      </div>
    </>
  );

  const current = INTAKE_STEPS[step - 1];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('workOrders.newOrder')}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        {/* `noValidate`: the schema owns the rules, so the browser's own
            bubbles never fire first with an untranslated message. */}
        <form noValidate onSubmit={handleFormSubmit} style={{ display: 'contents' }}>
          <div className="modal-body">
            <AlertError message={error} />
            <input type="file" ref={fileInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />

            {/* Los pasos ya vistos se pueden volver a abrir; los de adelante, solo con
                "Siguiente", que valida el paso que se deja. */}
            <ol className="intake-steps" aria-label={t('intake.stepOf').replace('{step}', String(step)).replace('{total}', String(TOTAL_STEPS))}>
              {INTAKE_STEPS.map(({ key }, i) => {
                const n = i + 1;
                const state = n === step ? 'current' : n < step || n <= furthestStep ? 'done' : 'todo';
                const label = t(`intake.steps.${key}`);
                return (
                  <li key={key} className={`intake-step intake-step-${state}`} aria-current={n === step ? 'step' : undefined}>
                    {state === 'done' ? (
                      <button type="button" className="intake-step-button" onClick={() => goToStep(n)} disabled={saving}>
                        <span className="intake-step-number"><Check size={12} /></span>
                        <span className="intake-step-label">{label}</span>
                      </button>
                    ) : (
                      <span className="intake-step-button">
                        <span className="intake-step-number">{n}</span>
                        <span className="intake-step-label">{label}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            <h4 className="intake-step-title">
              {t('intake.stepOf').replace('{step}', String(step)).replace('{total}', String(TOTAL_STEPS))}
              {' · '}
              {t(`intake.steps.${current.key}`)}
            </h4>

            {step === 1 && renderCustomerStep()}
            {step === 2 && renderVehicleStep()}
            {currentKey === 'work' && renderWorkStep()}
            {currentKey === 'deposit' && renderDepositStep()}
          </div>
          <div className="modal-footer intake-footer">
            <div>
              {step > 1 && (
                <button type="button" className="btn btn-secondary" onClick={prevStep} disabled={saving}>
                  <ChevronLeft size={16} /> {t('common.previous')}
                </button>
              )}
            </div>
            <div className="intake-footer-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
                {t('common.cancel')}
              </button>
              {/* Mientras una foto se comprime o un video se convierte, seguir lo dejaría afuera. */}
              {step < TOTAL_STEPS ? (
                <button key="next" type="submit" className="btn btn-primary" disabled={saving || preparing || form.leaving}>
                  {preparing ? t('media.processing') : form.leaving ? t('common.loading') : t('common.next')} {!preparing && !form.leaving && <ChevronRight size={16} />}
                </button>
              ) : (
                <button
                  key="create"
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || preparing}
                  // "Crear" aparece donde estaba "Siguiente": un doble clic en el paso 3 no
                  // debe crear la orden sin que nadie haya visto el último.
                  onClick={(e) => {
                    if (e.detail > 1) e.preventDefault();
                  }}
                >
                  {saving ? t('common.loading') : preparing ? t('media.processing') : t('common.create')}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
