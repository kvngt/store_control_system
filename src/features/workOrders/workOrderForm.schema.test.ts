// Validation used to be a run of `if` statements at the top of the submit
// handler that concatenated one message out of field labels — so a form with
// three problems reported one, said it in a sentence built from labels rather
// than a real explanation, and never pointed at a box. These tests pin what
// the schema reports and where it attaches it.

import { describe, it, expect } from 'vitest';
import * as z from 'zod/mini';
import { emptyWorkOrderForm, workOrderFormSchema, type WorkOrderFormValues } from './workOrderForm.schema';

/** A form with everything the happy path needs, plus whatever the test changes. */
function form(overrides: Partial<WorkOrderFormValues> = {}): WorkOrderFormValues {
  return {
    ...emptyWorkOrderForm(),
    selectedCustomer: 'cli-1',
    selectedVehicle: 'veh-1',
    ...overrides,
  };
}

/** The `path.to.field -> message key` map of everything the schema rejected. */
function issues(values: WorkOrderFormValues): Record<string, string> {
  const result = z.safeParse(workOrderFormSchema, values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('work order intake schema', () => {
  it('accepts an order against an existing customer and vehicle', () => {
    expect(issues(form())).toEqual({});
  });

  it('names the customer and the vehicle separately when neither is chosen', () => {
    // The old handler stopped at the first problem; both have to be reported.
    expect(issues(form({ selectedCustomer: '', selectedVehicle: '' }))).toEqual({
      selectedCustomer: 'workOrders.validation.customerRequired',
      selectedVehicle: 'workOrders.validation.vehicleRequired',
    });
  });

  it('requires name and phone when the customer is being created inline', () => {
    const found = issues(
      form({ customerMode: 'new', selectedCustomer: '', vehicleMode: 'new', selectedVehicle: '' })
    );
    expect(found['newCustomer.nombre']).toBe('workOrders.validation.customerName');
    expect(found['newCustomer.telefono']).toBe('workOrders.validation.customerPhone');
    // The existing-customer rule must not also fire on the branch being skipped.
    expect(found.selectedCustomer).toBeUndefined();
  });

  it('requires make, model and VIN when the vehicle is being created inline', () => {
    const found = issues(form({ vehicleMode: 'new', selectedVehicle: '' }));
    expect(found['newVehicle.marca']).toBe('workOrders.validation.vehicleBrand');
    expect(found['newVehicle.modelo']).toBe('workOrders.validation.vehicleModel');
    expect(found['newVehicle.vin']).toBe('workOrders.validation.vehicleVin');
    expect(found.selectedVehicle).toBeUndefined();
  });

  it('rejects a VIN that is the wrong length rather than accepting a typo', () => {
    const base = { vehicleMode: 'new' as const, selectedVehicle: '' };
    const short = form({
      ...base,
      newVehicle: { ...emptyWorkOrderForm().newVehicle, marca: 'Toyota', modelo: 'Corolla', vin: '1HGCM8263' },
    });
    expect(issues(short)['newVehicle.vin']).toBe('workOrders.validation.vinLength');

    const exact = form({
      ...base,
      newVehicle: { ...emptyWorkOrderForm().newVehicle, marca: 'Toyota', modelo: 'Corolla', vin: '1HGCM82633A004352' },
    });
    expect(issues(exact)['newVehicle.vin']).toBeUndefined();
  });

  it('refuses a negative odometer reading and a negative deposit', () => {
    const found = issues(form({ milesIn: '-500', deposit: '-10' }));
    expect(found.milesIn).toBe('workOrders.validation.milesNegative');
    expect(found.deposit).toBe('workOrders.validation.depositNegative');
  });

  it('flags the labor row that is blank, by index', () => {
    const found = issues(
      form({
        laborItems: [
          { descripcion: 'Alineación', costo: '80' },
          { descripcion: '   ', costo: '40' },
        ],
      })
    );
    // The message lands on the second row, not on the section.
    expect(found['laborItems.1.descripcion']).toBe('workOrders.validation.laborDescription');
    expect(found['laborItems.0.descripcion']).toBeUndefined();
  });

  it('flags a part with no description, no quantity or a negative price', () => {
    const found = issues(
      form({
        parts: [{ descripcion: '', cantidad: '0', costo_unitario: '5', precio_venta_unitario: '-1' }],
      })
    );
    expect(found['parts.0.descripcion']).toBe('workOrders.validation.partDescription');
    expect(found['parts.0.cantidad']).toBe('workOrders.validation.quantityMin');
    expect(found['parts.0.precio_venta_unitario']).toBe('workOrders.validation.priceNegative');
  });

  it('reports every message as a translation key, never a finished sentence', () => {
    const found = issues(
      form({ selectedCustomer: '', selectedVehicle: '', milesIn: '-1', deposit: '-1' })
    );
    expect(Object.keys(found).length).toBeGreaterThan(0);
    // A sentence here would be frozen into one language at validation time.
    for (const message of Object.values(found)) {
      expect(message).toMatch(/^workOrders\.validation\./);
    }
  });
});
