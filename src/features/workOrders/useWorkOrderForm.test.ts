// @vitest-environment jsdom
//
// What the hook adds on top of React Hook Form and the schema: the either/or
// branching between an existing and a newly created customer/vehicle, the
// retry safety after a partial submission, and a dirty check that also counts
// the photos — which RHF cannot see, because they are not form fields.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useWorkOrderForm } from './useWorkOrderForm';

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock/1'),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('useWorkOrderForm', () => {
  it('starts clean and reports dirty once a field is entered', () => {
    const { result } = renderHook(() => useWorkOrderForm());
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.form.setValue('milesIn', '45000', { shouldDirty: true }));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.reset());
    expect(result.current.isDirty).toBe(false);
  });

  // The photos are not form fields, so RHF's own `isDirty` cannot see them —
  // and a draft that is nothing but six intake photos is exactly the one worth
  // protecting from a stray click.
  it('counts photos as unsaved work even with every field untouched', () => {
    const { result } = renderHook(() => useWorkOrderForm());
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.photos.setZonePhoto('front', new File(['x'], 'front.jpg')));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.reset());
    expect(result.current.isDirty).toBe(false);
  });

  it('switches to the inline-customer branch and drags the vehicle with it', () => {
    const { result } = renderHook(() => useWorkOrderForm());

    act(() => result.current.selectCustomer('__new__'));

    expect(result.current.customerMode).toBe('new');
    // A brand-new customer cannot already own a vehicle, so the vehicle side
    // has to follow rather than offer an empty picker.
    expect(result.current.vehicleMode).toBe('new');
  });

  it('clears the chosen vehicle when the customer changes', () => {
    const { result } = renderHook(() => useWorkOrderForm());

    act(() => result.current.selectCustomer('cli-1'));
    act(() => result.current.selectVehicle('veh-1'));
    expect(result.current.form.getValues('selectedVehicle')).toBe('veh-1');

    act(() => result.current.selectCustomer('cli-2'));

    // A vehicle belongs to one customer; keeping it selected would attach the
    // order to a unit the new customer does not own.
    expect(result.current.form.getValues('selectedVehicle')).toBe('');
  });

  // If a later step of the same submission fails and the user presses Crear
  // again, the customer created on the first attempt must not be created twice.
  it('switches to the existing-customer path once one has been created', () => {
    const { result } = renderHook(() => useWorkOrderForm());

    act(() => result.current.selectCustomer('__new__'));
    expect(result.current.customerMode).toBe('new');

    act(() => result.current.markCustomerCreated('cli-99'));

    expect(result.current.customerMode).toBe('existing');
    expect(result.current.selectedCustomer).toBe('cli-99');
  });

  it('does the same for a vehicle created mid-submission', () => {
    const { result } = renderHook(() => useWorkOrderForm());

    act(() => result.current.selectVehicle('__new__'));
    expect(result.current.vehicleMode).toBe('new');

    act(() => result.current.markVehicleCreated('veh-99'));

    expect(result.current.vehicleMode).toBe('existing');
    expect(result.current.form.getValues('selectedVehicle')).toBe('veh-99');
  });

  it('toggles an operator on and off', () => {
    const { result } = renderHook(() => useWorkOrderForm());

    act(() => result.current.toggleOperator('op-1'));
    expect(result.current.selectedOperators).toEqual(['op-1']);

    act(() => result.current.toggleOperator('op-2'));
    expect(result.current.selectedOperators).toEqual(['op-1', 'op-2']);

    act(() => result.current.toggleOperator('op-1'));
    expect(result.current.selectedOperators).toEqual(['op-2']);
  });

  it('appends, edits and removes labor and part rows', () => {
    const { result } = renderHook(() => useWorkOrderForm());

    act(() => {
      result.current.labor.append({ descripcion: '', costo: '' });
      result.current.labor.append({ descripcion: 'Alineación', costo: '80' });
    });
    expect(result.current.labor.fields).toHaveLength(2);

    act(() => result.current.labor.remove(0));
    expect(result.current.form.getValues('laborItems')).toEqual([
      { descripcion: 'Alineación', costo: '80' },
    ]);

    act(() => result.current.parts.append({ descripcion: 'Filtro', cantidad: '1', costo_unitario: '8', precio_venta_unitario: '15' }));
    expect(result.current.form.getValues('parts')[0].precio_venta_unitario).toBe('15');
  });

  it('drops every row and every photo on reset', () => {
    const { result } = renderHook(() => useWorkOrderForm());

    act(() => {
      result.current.labor.append({ descripcion: 'Alineación', costo: '80' });
      result.current.photos.addExtraPhotos([new File(['x'], 'dent.jpg')]);
      result.current.toggleOperator('op-1');
    });

    act(() => result.current.reset());

    expect(result.current.form.getValues('laborItems')).toEqual([]);
    expect(result.current.selectedOperators).toEqual([]);
    expect(result.current.photos.hasPhotos).toBe(false);
  });
});
