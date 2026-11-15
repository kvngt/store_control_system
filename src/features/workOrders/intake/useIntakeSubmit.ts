import { useCallback, useRef, useState } from 'react';
import { useLanguage } from '../../../context/language.context';
import { useToast } from '../../../context/toast.context';
import { useMediaUploads } from '../../media/mediaUploads.context';
import { workOrdersService } from '../../../services/workOrders.service';
import { daysFromTodayLocal } from '../../../lib/dates';
import { getErrorMessage } from '../../../lib/errors';
import { clearIntakeDraft } from '../intakeDraft';
import { firstStepWithErrors } from '../workOrderForm.schema';
import type { WorkOrderFormApi, WorkOrderFormValues } from '../useWorkOrderForm';
import type { UserProfile, WorkOrder } from '../../../types/database';
import { getErrorCode, toPaymentMethod } from './intakeUtils';
import { paymentProblem } from '../paymentReceipt';

interface UseIntakeSubmitOptions {
  form: WorkOrderFormApi;
  user: UserProfile | null;
  isAdmin: boolean;
  targetSedeId: string;
  operators: UserProfile[];
  saveNewCustomer: (values: WorkOrderFormValues) => Promise<string>;
  saveNewVehicle: (values: WorkOrderFormValues, customerId: string) => Promise<string>;
  avisoDeLoGuardado: () => string;
  reloadPickers: () => void;
  resetSavedFlags: () => void;
  onCreatedSuccess: (orderId: string) => void;
}

/**
 * Envío transaccional del alta: cliente/vehículo nuevos, comprobante de depósito
 * (con borrado si la base rechaza), creación de la orden, encolado de medios y reintentos.
 */
export function useIntakeSubmit({
  form,
  user,
  isAdmin,
  targetSedeId,
  operators,
  saveNewCustomer,
  saveNewVehicle,
  avisoDeLoGuardado,
  reloadPickers,
  resetSavedFlags,
  onCreatedSuccess,
}: UseIntakeSubmitOptions) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const mediaUploads = useMediaUploads();

  // La orden que ya se creó en este intento de envío.
  //
  // `createWorkOrder` es transaccional, pero la subida de fotos que va después
  // no está dentro de ella. Si fallaba — y con ocho fotos de teléfono sobre el
  // wifi del taller es el paso que falla — el usuario veía "error al crear la
  // orden" con la orden ya creada, y al reintentar creaba una segunda. El
  // cliente y el vehículo sí estaban protegidos contra eso
  // (`markCustomerCreated` / `markVehicleCreated`); la orden no.
  const createdOrderRef = useRef<WorkOrder | null>(null);

  // La ruta del comprobante del depósito ya subido, para no subirlo otra vez al reintentar.
  const receiptPathRef = useRef<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resetSubmitState = useCallback(() => {
    createdOrderRef.current = null;
    receiptPathRef.current = null;
    setError('');
  }, []);

  // Runs only after the Zod schema has passed, so `values` is already known to
  // carry a customer, a vehicle and a non-negative odometer. What is left here
  // is the ordering the database imposes: a new customer before the vehicle
  // that belongs to them, both before the order, the order before its photos.
  const submitOrder = form.form.handleSubmit(async (values) => {
    if (!user) return;

    // La misma regla que al cobrar en la entrega o un anticipo: con cheque, su número o su foto.
    // El esquema no la puede ver (la foto no es parte del formulario); se marca el campo.
    const depositoPedido = isAdmin ? parseFloat(values.deposit) || 0 : 0;
    const problem = paymentProblem({
      needsMethod: depositoPedido > 0,
      metodo: toPaymentMethod(values.paymentMethod) ?? '',
      numeroCheque: values.checkNumber,
      file: form.receiptFile,
    });
    if (problem) {
      form.form.setError(problem === 'delivery.methodRequired' ? 'paymentMethod' : 'checkNumber', { message: problem });
      return;
    }

    setSaving(true);
    setError('');
    let failedStage: 'customer' | 'vehicle' | 'order' = 'order';
    try {
      failedStage = 'customer';
      const customerId = await saveNewCustomer(values);
      failedStage = 'vehicle';
      const vehicleId = await saveNewVehicle(values, customerId);
      failedStage = 'order';

      // Los técnicos salen de las tareas (F4). La base ya los mete a la orden al guardar cada
      // tarea (origen 'tarea') y `create_work_order` no los duplica; mandarlos también aquí es
      // lo que la app anterior a F3 hacía y no cambia nada.
      const uniqueTechnicianIds = Array.from(new Set(values.laborItems.map((l) => l.asignado_a).filter(Boolean)));
      const asignaciones = uniqueTechnicianIds.map((id) => {
        const op = operators.find((o) => o.id === id);
        const tipoTarea: 'mecanica' | 'pintura' = op?.rol === 'pintor' ? 'pintura' : 'mecanica';
        return { usuario_id: id, tipo_tarea: tipoTarea };
      });

      // El comprobante del depósito sube antes que la orden (la ruta va dentro de la misma
      // llamada) y se guarda la ruta: un reintento no lo vuelve a subir.
      const deposito = isAdmin ? parseFloat(values.deposit) || 0 : 0;
      const receiptFile = deposito > 0 && values.paymentMethod ? form.receiptFile : null;
      const conComprobante = !!receiptFile;
      if (receiptFile && !receiptPathRef.current && !createdOrderRef.current) {
        receiptPathRef.current = await workOrdersService.uploadReceipt(targetSedeId, 'alta', receiptFile);
      }

      const crear = async () => {
        try {
          return await workOrdersService.createWorkOrder({
            sede_id: targetSedeId,
            cliente_id: customerId,
            vehiculo_id: vehicleId,
            tipo_trabajo: values.workType,
            millas_ingreso: Math.max(0, parseInt(values.milesIn, 10) || 0),
            nivel_gasolina: values.fuelLevel,
            // Desde que abrir una orden es solo de admin, estas guardas son redundantes por
            // arriba. Se quedan porque `create_work_order` también ignora el dinero que le
            // mande quien no es admin: dos capas diciendo lo mismo, y ninguna que haya que
            // recordar si algún día la pantalla cambia.
            deposito_inicial: deposito,
            deposito_metodo: deposito > 0 ? toPaymentMethod(values.paymentMethod) : null,
            deposito_cheque: deposito > 0 && values.paymentMethod === 'cheque' ? values.checkNumber.trim() || null : null,
            deposito_comprobante: conComprobante ? receiptPathRef.current : null,
            inspeccion_360_notas: values.inspectionNotes,
            marcas_danos: values.damageMarks ?? [],
            fecha_estimada_entrega: values.estimatedDate || daysFromTodayLocal(5),
            con_seguro: values.withInsurance ?? false,
            aseguradora: values.withInsurance ? (values.insurer?.trim() || null) : null,
            numero_reclamo: values.withInsurance ? (values.claimNumber?.trim() || null) : null,
            autorizado_en_recepcion: (values.laborItems.length > 0 || values.parts.length > 0) ? (values.authorizedAtIntake ?? false) : false,
            trabajos: (values.jobs ?? [])
              .filter((j) => {
                const inLabor = values.laborItems.some((l) => l.grupo === j.grupo);
                const inParts = values.parts.some((p) => p.grupo === j.grupo);
                return inLabor || inParts;
              })
              .map((j) => ({
                grupo: j.grupo,
                titulo: j.titulo,
                catalogo_id: j.catalogo_id || null,
              })),
            // `Math.max(0, ...)` igual que en los repuestos. La labor era la única
            // cifra de dinero que aceptaba un negativo, y sobre una orden entregada
            // un total que baja lo asienta Finanzas como reembolso al cliente.
            labor_items: (isAdmin ? values.laborItems : []).map((l) => ({
              descripcion: l.descripcion,
              costo: Math.max(0, parseFloat(l.costo) || 0),
              // El tipo que se eligió en la tarea, también en una orden de un solo tipo: una
              // tarea de pintura en una orden de mecánica se guardaba como mecánica.
              especialidad: l.especialidad,
              asignado_a: l.asignado_a || null,
              ...(l.horas?.trim() ? { horas: Math.max(0, parseFloat(l.horas) || 0) } : {}),
              // Como `addLaborItem`: una tarea de la app nunca entra al reparto por especialidad.
              // Sin técnico no le paga a nadie hasta que se le asigne (decisión del taller,
              // 03/10/2026). Sin esto, `create_work_order` la dejaba heredada.
              reparto_heredado: false,
              ...(l.grupo ? { grupo: l.grupo } : {}),
            })),
            // El costo es opcional: vacío = el precio (el servicio lo completa), como en la
            // tabla de repuestos de la orden. Escrito, es lo que pagó el taller.
            repuestos: (isAdmin ? values.parts : []).map((p) => ({
              descripcion: p.descripcion,
              cantidad: Math.max(1, parseInt(p.cantidad, 10) || 1),
              precio_venta_unitario: Math.max(0, parseFloat(p.precio_venta_unitario) || 0),
              costo_unitario: p.costo_unitario?.trim() ? Math.max(0, parseFloat(p.costo_unitario) || 0) : null,
              ...(p.grupo ? { grupo: p.grupo } : {}),
            })),
            asignaciones,
            creado_por: user.id,
          });
        } catch (err) {
          // La base contestó que no (traía código): la orden no existe y el comprobante sobra.
          // Sin código fue la red, y la orden pudo crearse aunque la respuesta no llegara; ahí el
          // archivo se queda, porque borrarlo dejaría la orden apuntando a nada.
          const code = getErrorCode(err);
          if (receiptPathRef.current && code) {
            const path = receiptPathRef.current;
            receiptPathRef.current = null;
            void workOrdersService.removeDeliveryReceipt(path).catch(() => {});
          }
          throw err;
        }
      };
      const order = createdOrderRef.current ?? await crear();

      // De aquí en adelante un fallo no debe volver a crear la orden.
      createdOrderRef.current = order;

      // Las fotos ya están comprimidas desde que se eligieron: entran a la cola y
      // suben en segundo plano. Crear la orden ya no espera a la red — que era el
      // paso que fallaba con ocho fotos sobre el wifi del taller — y la cola
      // reintenta sola y sobrevive a una recarga.
      const photoUploads = form.photos.toUploads();
      if (photoUploads.length) {
        mediaUploads.enqueue(
          photoUploads.map(({ zone, media }) => ({
            ...media,
            ordenId: order.id,
            sedeId: order.sede_id,
            numeroOrden: order.numero_orden,
            origen: 'recepcion',
            zona: zone,
          }))
        );
      }

      const createdNewRecords = values.customerMode === 'new' || values.vehicleMode === 'new';
      createdOrderRef.current = null;
      receiptPathRef.current = null;
      resetSavedFlags();
      // La orden ya existe: el borrador no vale.
      if (user.id) clearIntakeDraft(user.id);
      form.reset();
      if (createdNewRecords) reloadPickers();
      onCreatedSuccess(order.id);
      showToast('success', `${t('workOrders.orderCreatedSuccess')} (${order.numero_orden})`);
    } catch (err) {
      const message = getErrorMessage(err, language);
      setError([message, avisoDeLoGuardado()].filter(Boolean).join(' '));
      const titleKey =
        failedStage === 'customer'
          ? 'intake.customerSaveError'
          : failedStage === 'vehicle'
            ? 'intake.vehicleSaveError'
            : 'workOrders.orderCreatedError';
      showToast('error', t(titleKey), message);
    } finally {
      setSaving(false);
    }
  }, (errors) => {
    // "Crear" está en el paso 4 y valida todo: un error de un paso anterior no se vería desde
    // ahí, así que se abre ese paso.
    const step = firstStepWithErrors(errors);
    if (step) form.goToStep(step);
  });

  return {
    saving,
    error,
    submitOrder,
    resetSubmitState,
  };
}
