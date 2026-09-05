import { useCallback } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useIntakePhotos } from './useIntakePhotos';
import { emptyWorkOrderForm, workOrderFormSchema, type WorkOrderFormValues } from './workOrderForm.schema';

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

  const customerMode = form.watch('customerMode');
  const vehicleMode = form.watch('vehicleMode');
  const selectedCustomer = form.watch('selectedCustomer');
  const selectedOperators = form.watch('selectedOperators');

  const selectCustomer = useCallback(
    (value: string) => {
      if (value === '__new__') {
        form.setValue('customerMode', 'new');
        form.setValue('vehicleMode', 'new');
        form.setValue('selectedCustomer', '');
        form.setValue('selectedVehicle', '');
      } else {
        form.setValue('selectedCustomer', value, { shouldDirty: true });
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
        form.setValue('selectedVehicle', value, { shouldDirty: true });
      }
    },
    [form]
  );

  const backToExistingCustomer = useCallback(() => {
    form.setValue('customerMode', 'existing');
    form.setValue('vehicleMode', 'existing');
  }, [form]);

  const backToExistingVehicle = useCallback(() => form.setValue('vehicleMode', 'existing'), [form]);

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
  }, [form, photos]);

  // RHF's own `isDirty` covers the fields; the photos are state it never sees.
  const isDirty = form.formState.isDirty || photos.hasPhotos;

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
    errors: form.formState.errors,
    isDirty,
    // actions
    selectCustomer,
    selectVehicle,
    backToExistingCustomer,
    backToExistingVehicle,
    toggleOperator,
    markCustomerCreated,
    markVehicleCreated,
    reset,
  };
}

export type WorkOrderFormApi = ReturnType<typeof useWorkOrderForm>;
