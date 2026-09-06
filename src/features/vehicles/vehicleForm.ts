// The value shape and validation rules the vehicle form works on.
//
// Split out of `VehicleFields.tsx` so that file exports a component and
// nothing else: mixing constants and helpers in with a component breaks Vite's
// Fast Refresh, which on a form this long means losing whatever was typed
// every time the file is touched.
import { checkUsPlate, checkVin } from '../../lib/vin';

/** Everything the two vehicle forms in the app capture. */
export interface VehicleFieldValues {
  marca: string;
  modelo: string;
  anio: string;
  vin: string;
  placa: string;
  placa_estado: string;
  color: string;
  /**
   * Auction units arrive with no plate at all. An explicit flag rather than an
   * inferred empty field, so "not filled in yet" and "this vehicle genuinely
   * has no plate" stay distinguishable while the form is open.
   */
  sin_placa: boolean;
}

export interface VehicleFieldErrors {
  marca?: boolean;
  modelo?: boolean;
  anio?: boolean;
  vin?: boolean;
  placa?: boolean;
}

export const EMPTY_VEHICLE_FIELDS: VehicleFieldValues = {
  marca: '',
  modelo: '',
  anio: '',
  vin: '',
  placa: '',
  placa_estado: '',
  color: '',
  sin_placa: false,
};

/**
 * Which of these fields are invalid, given the same rules the component renders
 * messages for. Exported so a caller can gate its own submit on it without
 * restating them — the Vehículos screen and the order intake disagreed about
 * exactly this before they shared a form.
 */
export function validateVehicleFields(
  value: VehicleFieldValues,
  { requirePlate = true, requireYear = true }: { requirePlate?: boolean; requireYear?: boolean } = {}
): VehicleFieldErrors {
  const plateCheck = checkUsPlate(value.placa, value.placa_estado || undefined);
  return {
    marca: !value.marca.trim(),
    modelo: !value.modelo.trim(),
    anio: requireYear && !value.anio,
    vin: checkVin(value.vin).level === 'error',
    placa: requirePlate && !value.sin_placa && (!value.placa.trim() || plateCheck.level === 'error'),
  };
}
