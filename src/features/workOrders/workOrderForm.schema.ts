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
});

// One money column, not two. A part is billed on at what it cost the shop, so
// the separate "costo unitario" field was a box nobody filled in that still had
// to be tabbed past on every line. The database keeps the two in step; see the
// 20260913000000 migration.
const partRow = z.object({
  descripcion: stringField,
  cantidad: stringField,
  precio_venta_unitario: stringField,
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
  }

  form.laborItems.forEach((item, i) => {
    if (!item.descripcion.trim()) {
      reject(['laborItems', i, 'descripcion'], 'workOrders.validation.laborDescription');
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
  });
});

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
    estimatedDate: '',
    inspectionNotes: '',
    selectedOperators: [],
    laborItems: [],
    parts: [],
  };
}
