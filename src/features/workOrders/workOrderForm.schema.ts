import * as z from 'zod/mini';

/**
 * Validation for the "nueva orden" dialog.
 *
 * Every message is a **translation key**, not a sentence. The schema runs when
 * the user submits; the sentence is produced when the error is painted. That
 * separation is what stops switching the UI language from meaning "revalidate
 * the form", and it is the same rule the data layer follows — errors are held
 * raw and translated at render.
 *
 * Built on `zod/mini` rather than the full Zod surface: this is the only
 * schema in the app, it needs a handful of primitives and one custom check,
 * and the classic builder API costs roughly 60 kB in the Órdenes chunk — the
 * busiest screen in the shop, opened on tablets over shop wifi.
 */

const stringField = z.string();

const laborRow = z.object({
  descripcion: stringField,
  costo: stringField,
  // A qué bolsa de comisión va. Solo se elige en una orden "combinado"; en las demás manda
  // el tipo de orden y la base la pone sola.
  especialidad: z.enum(['mecanica', 'pintura']),
  asignado_a: stringField,
});

// El precio es lo que se le cobra al cliente; el costo (lo que pagó el taller) es opcional y
// vacío quiere decir "igual al precio", como en la tabla de repuestos de la orden (decisión del
// taller del 05/10/2026; en el alta desde el 06/10/2026).
const partRow = z.object({
  descripcion: stringField,
  cantidad: stringField,
  precio_venta_unitario: stringField,
  costo_unitario: z.optional(stringField),
});

/**
 * Fields are strings because they come from `<input>`s — including the numeric
 * ones. Parsing to numbers happens on the way to the service, where the
 * database's own rules (an INTEGER odometer, a NOT NULL cost) decide the shape.
 */
const baseShape = z.object({
  customerMode: z.enum(['existing', 'new']),
  vehicleMode: z.enum(['existing', 'new']),
  selectedCustomer: stringField,
  selectedVehicle: stringField,
  newCustomer: z.object({
    nombre: stringField,
    telefono: stringField,
    email: stringField,
    direccion: stringField,
  }),
  newVehicle: z.object({
    marca: stringField,
    modelo: stringField,
    anio: stringField,
    vin: stringField,
    placa: stringField,
    placa_estado: stringField,
    color: stringField,
    sin_placa: z.boolean(),
  }),
  workType: z.enum(['mecanica', 'pintura', 'combinado']),
  fuelLevel: stringField,
  milesIn: stringField,
  deposit: stringField,
  paymentMethod: stringField,
  checkNumber: stringField,
  estimatedDate: stringField,
  inspectionNotes: stringField,
  selectedOperators: z.array(stringField),
  laborItems: z.array(laborRow),
  parts: z.array(partRow),
});

export type WorkOrderFormValues = z.infer<typeof baseShape>;

export const workOrderFormSchema = baseShape.check((ctx) => {
  const form = ctx.value;
  const reject = (path: (string | number)[], message: string) =>
    ctx.issues.push({ code: 'custom', path, message, input: form });

  // The two either/or branches: an order attaches to a customer and a vehicle
  // that either already exist or are being created alongside it. Checked here
  // rather than as a discriminated union so the half the user is not looking
  // at keeps its typed-in values if they switch back.
  if (form.customerMode === 'existing') {
    if (!form.selectedCustomer) reject(['selectedCustomer'], 'workOrders.validation.customerRequired');
  } else {
    if (!form.newCustomer.nombre.trim()) reject(['newCustomer', 'nombre'], 'workOrders.validation.customerName');
    if (!form.newCustomer.telefono.trim()) reject(['newCustomer', 'telefono'], 'workOrders.validation.customerPhone');
  }

  if (form.vehicleMode === 'existing') {
    if (!form.selectedVehicle) reject(['selectedVehicle'], 'workOrders.validation.vehicleRequired');
  } else {
    if (!form.newVehicle.marca.trim()) reject(['newVehicle', 'marca'], 'workOrders.validation.vehicleBrand');
    if (!form.newVehicle.modelo.trim()) reject(['newVehicle', 'modelo'], 'workOrders.validation.vehicleModel');
    const vin = form.newVehicle.vin.trim();
    if (!vin) {
      reject(['newVehicle', 'vin'], 'workOrders.validation.vehicleVin');
    } else if (vin.length !== 17) {
      // A VIN is fixed-length; a shorter one is a typo, not a short VIN.
      reject(['newVehicle', 'vin'], 'workOrders.validation.vinLength');
    }
    // The plate is deliberately not required here. A car already on the lift is
    // worth registering before anyone has walked out to read its plate, and the
    // column is nullable precisely so "no plate" can be recorded honestly.
  }

  // An odometer never runs backwards, and the column carries the same rule as
  // a CHECK constraint, so a direct API call cannot get around the form.
  // Checked on the parsed number rather than the leading character: "1e-3" and
  // a pasted "  -5" both read as negative but neither starts with a minus, and
  // the field is a spinner the user can click straight down past zero.
  const miles = parseFloat(form.milesIn);
  if (form.milesIn.trim().startsWith('-') || (Number.isFinite(miles) && miles < 0)) {
    reject(['milesIn'], 'workOrders.validation.milesNegative');
  }
  if (parseFloat(form.deposit) < 0) {
    reject(['deposit'], 'workOrders.validation.depositNegative');
  } else if (parseFloat(form.deposit) > 0) {
    if (!form.paymentMethod) {
      reject(['paymentMethod'], 'delivery.methodRequired');
    }
    if (form.paymentMethod === 'cheque' && !form.checkNumber.trim()) {
      reject(['checkNumber'], 'delivery.checkRequired');
    }
  }

  form.laborItems.forEach((item, i) => {
    if (!item.descripcion.trim()) {
      reject(['laborItems', i, 'descripcion'], 'workOrders.validation.laborDescription');
    }
    // Los repuestos ya se saneaban en tres capas y la labor en ninguna, y no es
    // una asimetría inocente: una línea de labor negativa baja `total_general`,
    // y sobre una orden ya entregada `handle_delivered_order_adjustment` lo
    // interpreta como un reembolso al cliente y lo asienta en Finanzas. Era una
    // forma de emitir un reembolso desde la tabla de mano de obra.
    if (parseFloat(item.costo) < 0) {
      reject(['laborItems', i, 'costo'], 'workOrders.validation.laborCostNegative');
    }
  });

  form.parts.forEach((part, i) => {
    if (!part.descripcion.trim()) {
      reject(['parts', i, 'descripcion'], 'workOrders.validation.partDescription');
    }
    if ((parseInt(part.cantidad, 10) || 0) < 1) {
      reject(['parts', i, 'cantidad'], 'workOrders.validation.quantityMin');
    }
    if (parseFloat(part.precio_venta_unitario) < 0) {
      reject(['parts', i, 'precio_venta_unitario'], 'workOrders.validation.priceNegative');
    }
    if (parseFloat(part.costo_unitario ?? '') < 0) {
      reject(['parts', i, 'costo_unitario'], 'workOrders.validation.priceNegative');
    }
  });
});

/**
 * Los cuatro pasos del alta (F4, reunión con el taller del 03/10/2026) y los campos de cada
 * uno. Desde el 06/10/2026 los trabajos van antes que el depósito: el taller cotiza y después
 * cobra, y la fecha estimada de entrega se decide al final de los trabajos. "Siguiente" valida solo los del paso que se deja; al crear se valida todo, y un error
 * de un paso anterior manda de vuelta a ese paso, porque en el paso 4 no se vería.
 */
export const INTAKE_STEPS = [
  { key: 'customer', fields: ['selectedCustomer', 'newCustomer'] },
  { key: 'vehicle', fields: ['selectedVehicle', 'newVehicle', 'fuelLevel', 'milesIn', 'inspectionNotes'] },
  { key: 'work', fields: ['workType', 'estimatedDate', 'laborItems', 'parts', 'selectedOperators'] },
  { key: 'deposit', fields: ['deposit', 'paymentMethod', 'checkNumber'] },
] as const satisfies readonly { key: string; fields: readonly (keyof WorkOrderFormValues)[] }[];

/** El primer paso (1–4) que tiene un error, o `null` si no hay ninguno. */
export function firstStepWithErrors(errors: Partial<Record<keyof WorkOrderFormValues, unknown>>): number | null {
  const index = INTAKE_STEPS.findIndex((step) => step.fields.some((field) => errors[field]));
  return index === -1 ? null : index + 1;
}

/** A blank intake. */
export function emptyWorkOrderForm(): WorkOrderFormValues {
  return {
    customerMode: 'existing',
    vehicleMode: 'existing',
    selectedCustomer: '',
    selectedVehicle: '',
    newCustomer: { nombre: '', telefono: '', email: '', direccion: '' },
    newVehicle: {
      marca: '',
      modelo: '',
      // Blank rather than the current year: the VIN decode fills it in, and a
      // pre-filled year is a wrong answer the user has to notice to correct.
      anio: '',
      vin: '',
      placa: '',
      placa_estado: '',
      color: '',
      sin_placa: false,
    },
    workType: 'mecanica',
    fuelLevel: '1/2',
    milesIn: '',
    deposit: '0',
    paymentMethod: '',
    checkNumber: '',
    estimatedDate: '',
    inspectionNotes: '',
    selectedOperators: [],
    laborItems: [],
    parts: [],
  };
}
