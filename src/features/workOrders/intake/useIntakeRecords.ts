import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../../context/language.context';
import { useToast } from '../../../context/toast.context';
import { customersService } from '../../../services/customers.service';
import { vehiclesService } from '../../../services/vehicles.service';
import { usersService } from '../../../services/users.service';
import { queryKeys } from '../../../lib/queryClient';
import { emptyList } from '../../../lib/emptyList';
import { duplicateVehicleField, getErrorMessage } from '../../../lib/errors';
import { checkUsPlate, checkVin } from '../../../lib/vin';
import type { Customer, UserProfile, Vehicle } from '../../../types/database';
import type { WorkOrderFormApi, WorkOrderFormValues } from '../useWorkOrderForm';

interface UseIntakeRecordsOptions {
  form: WorkOrderFormApi;
  isAdmin: boolean;
  sedeId: string | undefined;
  targetSedeId: string;
}

/**
 * Consultas de catálogos para el alta (clientes, vehículos, operadores) y guardado
 * incremental de cliente/vehículo nuevos al avanzar de paso o al cancelar.
 */
export function useIntakeRecords({ form, isAdmin, sedeId, targetSedeId }: UseIntakeRecordsOptions) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // The pickers behind the create dialog, each its own cache entry so a
  // failure to load one never blanks the board — and so Clientes and Vehículos
  // reuse them rather than asking again. Solo administración abre órdenes, así
  // que un técnico no los descarga.
  const customersQuery = useQuery({
    queryKey: queryKeys.customers(sedeId),
    queryFn: () => customersService.getCustomers(sedeId),
    enabled: isAdmin,
  });
  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles(sedeId),
    queryFn: () => vehiclesService.getVehicles(sedeId),
    enabled: isAdmin,
  });
  // Solo la consume interfaz de administración (el selector del alta y el de la tarjeta de
  // técnicos), así que en el teléfono de un mecánico era una descarga que nadie mira.
  const operatorsQuery = useQuery({
    queryKey: queryKeys.operators(sedeId),
    queryFn: () => usersService.getOperators(sedeId),
    enabled: isAdmin,
  });

  const customers = customersQuery.data ?? emptyList<Customer>();
  const vehicles = vehiclesQuery.data ?? emptyList<Vehicle>();
  const operators = operatorsQuery.data ?? emptyList<UserProfile>();

  const vehiclesForCustomer = useMemo(
    () => vehicles.filter((v) => v.cliente_id === form.selectedCustomer),
    [vehicles, form.selectedCustomer]
  );

  const reloadPickers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.customers(sedeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(sedeId) });
  }, [queryClient, sedeId]);

  // Qué quedó guardado antes de que fallara la orden.
  //
  // No hay nada que deshacer: un cliente y un vehículo sin orden son filas válidas por sí
  // solas — se crean igual desde Clientes y Vehículos — así que esto no es una escritura a
  // medias. Lo que faltaba era decirlo. El formulario ya se pasa solo a "existente" para
  // que un reintento los reutilice, pero quien lea "no se pudo crear la orden" y cierre el
  // diálogo da por hecho que no se guardó nada, y acaba creando el mismo cliente otra vez.
  //
  // Se queda puesto mientras el diálogo siga abierto: en el segundo intento el cliente ya
  // no se crea, y el aviso tiene que seguir siendo cierto.
  const guardadoAntesDeFallar = useRef({ cliente: false, vehiculo: false });

  /** La frase que dice qué se salvó ya, o cadena vacía si no se creó nada. */
  const avisoDeLoGuardado = useCallback(() => {
    const { cliente, vehiculo } = guardadoAntesDeFallar.current;
    if (cliente && vehiculo) return t('workOrders.partialSaveBoth');
    if (cliente) return t('workOrders.partialSaveCustomer');
    if (vehiculo) return t('workOrders.partialSaveVehicle');
    return '';
  }, [t]);

  const hasSavedBeforeFail = useCallback(
    () => guardadoAntesDeFallar.current.cliente || guardadoAntesDeFallar.current.vehiculo,
    []
  );

  const resetSavedFlags = useCallback(() => {
    guardadoAntesDeFallar.current = { cliente: false, vehiculo: false };
  }, []);

  // El cliente y el vehículo nuevos del alta. Se guardan en cuanto se completan sus pasos
  // ("Siguiente"), al cancelar el alta si ya estaban completos, y al crear la orden si todavía
  // no: un cliente y un vehículo sin orden son filas válidas, y así la próxima vez ya están
  // (pedido del taller del 06/10/2026). Cada uno pasa el formulario a "existente" en cuanto
  // existe, así que nunca se crean dos veces.
  const saveNewCustomer = useCallback(
    async (values: WorkOrderFormValues): Promise<string> => {
      if (values.customerMode !== 'new') return values.selectedCustomer;
      const created = await customersService.createCustomer({
        nombre: values.newCustomer.nombre,
        telefono: values.newCustomer.telefono,
        email: values.newCustomer.email,
        direccion: values.newCustomer.direccion,
        idioma: values.newCustomer.idioma,
        notas_crm: '',
        sede_id: targetSedeId,
      });
      guardadoAntesDeFallar.current.cliente = true;
      form.markCustomerCreated(created.id);
      // Put it in the picker straight away. `markCustomerCreated` switches
      // the form to "existing" so a retry cannot create the customer twice —
      // but the dropdown is fed from the query cache, which does not know
      // about them yet.
      queryClient.setQueryData<Customer[]>(queryKeys.customers(sedeId), (prev) =>
        prev ? [created, ...prev] : [created]
      );
      return created.id;
    },
    [form, queryClient, sedeId, targetSedeId]
  );

  const saveNewVehicle = useCallback(
    async (values: WorkOrderFormValues, customerId: string): Promise<string> => {
      if (values.vehicleMode !== 'new') return values.selectedVehicle;
      const v = values.newVehicle;
      // NULL, never an empty string: `placa` is nullable precisely so a unit
      // with no plate reads as "no plate" everywhere.
      const plate = v.sin_placa ? null : checkUsPlate(v.placa, v.placa_estado || undefined).normalized || null;
      const createdVehicle = await vehiclesService.createVehicle({
        cliente_id: customerId,
        marca: v.marca.trim(),
        modelo: v.modelo.trim(),
        anio: parseInt(v.anio, 10) || new Date().getFullYear(),
        vin: checkVin(v.vin).normalized,
        placa: plate,
        // A plate state with no plate is meaningless, and the column carries
        // a CHECK constraint saying so.
        placa_estado: plate ? v.placa_estado || null : null,
        color: v.color.trim(),
      });
      guardadoAntesDeFallar.current.vehiculo = true;
      form.markVehicleCreated(createdVehicle.id);
      queryClient.setQueryData<Vehicle[]>(queryKeys.vehicles(sedeId), (prev) =>
        prev ? [createdVehicle, ...prev] : [createdVehicle]
      );
      return createdVehicle.id;
    },
    [form, queryClient, sedeId]
  );

  // Al salir del paso del cliente o del vehículo con "Siguiente", ya validado.
  form.onLeaveStep.current = async (key, values) => {
    if (!(key === 'customer' && values.customerMode === 'new') && !(key === 'vehicle' && values.vehicleMode === 'new')) {
      return true;
    }
    try {
      if (key === 'customer') {
        await saveNewCustomer(values);
      } else {
        await saveNewVehicle(values, values.selectedCustomer);
      }
      return true;
    } catch (err) {
      const message = getErrorMessage(err, language);
      const dupField = key === 'vehicle' ? duplicateVehicleField(err) : null;
      if (dupField) {
        form.form.setError(`newVehicle.${dupField}`, { type: 'server', message });
        requestAnimationFrame(() => {
          const field = document.getElementById(dupField === 'placa' ? 'vehicle-plate' : 'vehicle-vin');
          field?.focus();
          // El motivo va debajo del campo y el cuerpo del diálogo se desplaza: que se vea sin buscarlo.
          field?.parentElement?.querySelector('[role="alert"]')?.scrollIntoView({ block: 'nearest' });
        });
        return false;
      }
      showToast(
        'error',
        t(key === 'customer' ? 'intake.customerSaveError' : 'intake.vehicleSaveError'),
        message
      );
      return false;
    }
  };

  /**
   * Lo que se guarda al cancelar: el cliente o el vehículo nuevos que ya están completos y aún
   * no se guardaron. Lo incompleto no se guarda (no se inventan datos) y no frena el cierre.
   */
  const savePendingRecordsOnCancel = useCallback(async (): Promise<{ cliente: boolean; vehiculo: boolean }> => {
    const saved = { cliente: false, vehiculo: false };
    const values = form.form.getValues();
    let customerId = values.customerMode === 'existing' ? values.selectedCustomer : '';
    if (values.customerMode === 'new' && (await form.form.trigger(['newCustomer']))) {
      customerId = await saveNewCustomer(form.form.getValues());
      saved.cliente = true;
    }
    const after = form.form.getValues();
    if (customerId && after.vehicleMode === 'new' && (await form.form.trigger(['newVehicle']))) {
      await saveNewVehicle(after, customerId);
      saved.vehiculo = true;
    }
    return saved;
  }, [form.form, saveNewCustomer, saveNewVehicle]);

  return {
    customers,
    vehiclesForCustomer,
    operators,
    reloadPickers,
    avisoDeLoGuardado,
    hasSavedBeforeFail,
    resetSavedFlags,
    saveNewCustomer,
    saveNewVehicle,
    savePendingRecordsOnCancel,
  };
}
