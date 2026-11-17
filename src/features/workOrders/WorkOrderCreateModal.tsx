import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { Customer, UserProfile, Vehicle } from '../../types/database';
import type { WorkOrderFormApi } from './useWorkOrderForm';
import { INTAKE_STEPS } from './workOrderForm.schema';
import { AlertError } from '../../components/AlertError';
import Modal from '../../components/Modal';
import IntakeStepper from './intake/IntakeStepper';
import CustomerStep from './intake/steps/CustomerStep';
import VehicleStep from './intake/steps/VehicleStep';
import WorkStep from './intake/steps/WorkStep';
import DepositStep from './intake/steps/DepositStep';

const TOTAL_STEPS = INTAKE_STEPS.length;

interface WorkOrderCreateModalProps {
  form: WorkOrderFormApi;
  /** La sede donde se abre la orden: de ahí sale el catálogo de trabajos. */
  sedeId?: string;
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
  sedeId,
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
  const { watch, setValue } = form.form;
  const photos = form.photos;
  const [damageDiagramOpen, setDamageDiagramOpen] = useState(false);
  const { step, furthestStep, nextStep, prevStep, goToStep } = form;

  // La barra está comprimiendo una foto o convirtiendo un video de galería.
  const [captureBusy, setCaptureBusy] = useState(false);
  const preparing = photos.processing > 0 || captureBusy;
  const workStepGuardRef = useRef<(() => boolean) | null>(null);

  const hasLines = form.labor.fields.length > 0 || form.parts.fields.length > 0;
  useEffect(() => {
    if (!hasLines) {
      setValue('authorizedAtIntake', false);
    }
  }, [hasLines, setValue]);

  // Un cliente con un solo vehículo casi siempre trae ese: queda elegido (se cambia en el mismo
  // selector). Es un toque menos en el mostrador; recibir un carro debe tomar menos de 60 s.
  const selectedVehicle = watch('selectedVehicle');
  const onlyVehicleId = vehiclesForCustomer.length === 1 ? vehiclesForCustomer[0].id : null;
  const { selectVehicle, vehicleMode, selectedCustomer } = form;
  useEffect(() => {
    if (onlyVehicleId && selectedCustomer && vehicleMode === 'existing' && !selectedVehicle) {
      selectVehicle(onlyVehicleId);
    }
    // Solo al cambiar de cliente (o al llegar su lista): si alguien deja el selector vacío a
    // propósito, no se lo vuelve a llenar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer, onlyVehicleId]);

  const currentKey = INTAKE_STEPS[step - 1]?.key;

  // Enter dentro de un paso avanza al siguiente; solo en el último crea la orden. Antes de
  // esto, un Enter en el depósito enviaba el formulario entero desde la mitad del asistente.
  // Salir de Trabajos con algo escrito sin agregar, o con una línea abierta, lo perdería: el
  // editor se desmonta al cambiar de paso. Vale para avanzar, para «Anterior» y para los pasos
  // de arriba (antes solo se revisaba al avanzar).
  const holdOnWorkStep = (): boolean => {
    if (currentKey !== 'work') return false;
    return workStepGuardRef.current?.() ?? false;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (holdOnWorkStep()) return;
    if (step < TOTAL_STEPS) {
      void nextStep();
      return;
    }
    onSubmit();
  };

  return (
    <Modal
      onClose={onClose}
      style={{ maxWidth: '720px' }}
      title={t('workOrders.newOrder')}
      as="form"
      noValidate
      onSubmit={handleFormSubmit}
      footerClassName="intake-footer"
      footer={
        <>
          <div>
            {step > 1 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { if (!holdOnWorkStep()) prevStep(); }}
                disabled={saving}
              >
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
        </>
      }
    >
      <AlertError message={error} />

      <IntakeStepper
        step={step}
        furthestStep={furthestStep}
        saving={saving}
        onSelectStep={(n) => {
          if (n === step || !holdOnWorkStep()) goToStep(n);
        }}
      />

      {step === 1 && <CustomerStep form={form} customers={customers} sedeId={sedeId} />}
      {step === 2 && (
        <VehicleStep
          form={form}
          vehiclesForCustomer={vehiclesForCustomer}
          saving={saving}
          damageDiagramOpen={damageDiagramOpen}
          onOpenDamageDiagram={() => setDamageDiagramOpen(true)}
          onCaptureBusyChange={setCaptureBusy}
        />
      )}
      {currentKey === 'work' && (
        <WorkStep
          form={form}
          sedeId={sedeId}
          operators={operators}
          isAdmin={isAdmin}
          saving={saving}
          hasLines={hasLines}
          guardRef={workStepGuardRef}
        />
      )}
      {currentKey === 'deposit' && <DepositStep form={form} isAdmin={isAdmin} saving={saving} />}
    </Modal>
  );
}
