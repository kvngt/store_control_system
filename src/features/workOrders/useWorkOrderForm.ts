import { useCallback, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useIntakePhotos } from './useIntakePhotos';
import { emptyWorkOrderForm, INTAKE_STEPS, workOrderFormSchema, type WorkOrderFormValues } from './workOrderForm.schema';

export type { WorkOrderFormValues } from './workOrderForm.schema';

/**
 * Owns the "nueva orden" dialog: React Hook Form for the fields, the Zod
 * schema for the rules, and `useIntakePhotos` for the photos.
 *
 * The screen used to hold twenty-odd `useState` calls itself, mixed in with
 * the order list, the detail view and the service calls. Validation lived in
 * the submit handler as a string of `if` statements that concatenated a single
 * message out of field labels — so a form with three problems reported one,
 * and never said which box it meant. The schema reports every problem, on the
 * field it belongs to.
 *
 * Photos stay outside RHF on purpose; see `useIntakePhotos` for why.
 */
export function useWorkOrderForm() {
  const photos = useIntakePhotos();

  const form = useForm<WorkOrderFormValues>({
    resolver: standardSchemaResolver(workOrderFormSchema),
    defaultValues: emptyWorkOrderForm(),
    // Validate on submit, then keep correcting as the user fixes things:
    // flagging a field the moment it is focused and left empty is noise on a
    // form this long.
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const labor = useFieldArray({ control: form.control, name: 'laborItems' });
  const parts = useFieldArray({ control: form.control, name: 'parts' });

  const [step, setStep] = useState(1);
  // El paso más lejano al que se llegó con "Siguiente": hasta ahí se puede saltar sin validar.
  const [furthestStep, setFurthestStep] = useState(1);
  // La foto del comprobante del depósito. Fuera de RHF, como las fotos de la inspección.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const customerMode = form.watch('customerMode');
  const vehicleMode = form.watch('vehicleMode');
  const selectedCustomer = form.watch('selectedCustomer');
  const selectedOperators = form.watch('selectedOperators');
  // `VehicleFields` is a controlled component over the whole sub-object rather
  // than a set of registered inputs: the VIN decode writes three fields at once
  // and the "no plate" checkbox clears two more, which `register` cannot
  // express without the dialog reaching into RHF for each of them.
  const newVehicle = form.watch('newVehicle');

  const selectCustomer = useCallback(
    (value: string) => {
      if (value === '__new__') {
        form.setValue('customerMode', 'new');
        form.setValue('vehicleMode', 'new');
        form.setValue('selectedCustomer', '');
        form.setValue('selectedVehicle', '');
      } else {
        // Si "Siguiente" ya marcó el campo, elegir apaga el aviso en el momento.
        form.setValue('selectedCustomer', value, {
          shouldDirty: true,
          shouldValidate: form.getFieldState('selectedCustomer').invalid,
        });
        // A vehicle belongs to one customer; keeping it selected would attach
        // the order to a unit the new customer does not own.
        form.setValue('selectedVehicle', '');
      }
    },
    [form]
  );

  const selectVehicle = useCallback(
    (value: string) => {
      if (value === '__new__') {
        form.setValue('vehicleMode', 'new');
        form.setValue('selectedVehicle', '');
      } else {
        form.setValue('selectedVehicle', value, {
          shouldDirty: true,
          shouldValidate: form.getFieldState('selectedVehicle').invalid,
        });
      }
    },
    [form]
  );

  const backToExistingCustomer = useCallback(() => {
    form.setValue('customerMode', 'existing');
    form.setValue('vehicleMode', 'existing');
  }, [form]);

  const backToExistingVehicle = useCallback(() => form.setValue('vehicleMode', 'existing'), [form]);

  const setNewVehicle = useCallback(
    (next: WorkOrderFormValues['newVehicle']) =>
      form.setValue('newVehicle', next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted }),
    [form]
  );

  const toggleOperator = useCallback(
    (id: string) => {
      const current = form.getValues('selectedOperators');
      form.setValue(
        'selectedOperators',
        current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
        { shouldDirty: true }
      );
    },
    [form]
  );

  /**
   * A customer/vehicle created mid-submission is switched to "existing"
   * immediately: if a later step of the same submission fails and the user
   * retries, it must not be created a second time.
   */
  const markCustomerCreated = useCallback(
    (id: string) => {
      form.setValue('customerMode', 'existing');
      form.setValue('selectedCustomer', id);
    },
    [form]
  );

  const markVehicleCreated = useCallback(
    (id: string) => {
      form.setValue('vehicleMode', 'existing');
      form.setValue('selectedVehicle', id);
    },
    [form]
  );

  const reset = useCallback(() => {
    form.reset(emptyWorkOrderForm());
    photos.reset();
    setStep(1);
    setFurthestStep(1);
    setReceiptFile(null);
  }, [form, photos]);

  // "Siguiente" valida solo lo del paso que se deja. El esquema ya ignora la rama que no se
  // usa (cliente existente o nuevo), así que se pasan los dos lados del paso tal cual.
  const nextStep = useCallback(async () => {
    const current = INTAKE_STEPS[step - 1];
    if (!current || step >= INTAKE_STEPS.length) return;
    const valid = await form.trigger([...current.fields]);
    if (valid) {
      setStep(step + 1);
      setFurthestStep((f) => Math.max(f, step + 1));
    }
  }, [form, step]);

  const prevStep = useCallback(() => setStep((s) => Math.max(s - 1, 1)), []);

  /** Volver a un paso ya visto (la lista de pasos, o un error al crear). Nunca a uno sin validar. */
  const goToStep = useCallback(
    (target: number) => setStep(Math.min(Math.max(target, 1), furthestStep)),
    [furthestStep]
  );

  // RHF's own `isDirty` covers the fields; the photos, videos and voice notes are state it never sees.
  const isDirty = form.formState.isDirty || photos.hasMedia;

  return {
    form,
    labor,
    parts,
    photos,
    // Watched values the dialog branches on.
    customerMode,
    vehicleMode,
    selectedCustomer,
    selectedOperators,
    newVehicle,
    errors: form.formState.errors,
    isDirty,
    step,
    furthestStep,
    receiptFile,
    setReceiptFile,
    // actions
    nextStep,
    prevStep,
    goToStep,
    selectCustomer,
    selectVehicle,
    backToExistingCustomer,
    backToExistingVehicle,
    setNewVehicle,
    toggleOperator,
    markCustomerCreated,
    markVehicleCreated,
    reset,
  };
}

export type WorkOrderFormApi = ReturnType<typeof useWorkOrderForm>;
