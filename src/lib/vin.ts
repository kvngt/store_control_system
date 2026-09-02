// Vehicle helpers: brand suggestions and VIN decoding via the NHTSA vPIC API
// (free, no API key, US government dataset).

export const VEHICLE_BRANDS = [
  'Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet',
  'Chrysler', 'Dodge', 'Fiat', 'Ford', 'Genesis', 'GMC', 'Honda', 'Hyundai',
  'Infiniti', 'Jaguar', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln',
  'Mazda', 'Mercedes-Benz', 'Mercury', 'Mini', 'Mitsubishi', 'Nissan',
  'Peugeot', 'Polestar', 'Pontiac', 'Porsche', 'RAM', 'Renault', 'Rivian',
  'Saab', 'Saturn', 'Scion', 'Subaru', 'Suzuki', 'Tesla', 'Toyota',
  'Volkswagen', 'Volvo',
];

export interface DecodedVin {
  marca: string;
  modelo: string;
  anio: string;
  /** Extra detail the API returned, useful as a sanity check for the user. */
  detalle?: string;
}

const NHTSA_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

/**
 * Decodes a 17-character VIN. Returns null when the API can't identify the
 * vehicle, so the caller can fall back to manual entry instead of wiping
 * whatever the user already typed.
 */
export async function decodeVin(vin: string, signal?: AbortSignal): Promise<DecodedVin | null> {
  const clean = vin.trim().toUpperCase();
  if (clean.length !== 17) {
    throw new Error('INVALID_LENGTH');
  }

  const res = await fetch(`${NHTSA_URL}/${encodeURIComponent(clean)}?format=json`, { signal });
  if (!res.ok) throw new Error('REQUEST_FAILED');

  const json = await res.json();
  const r = json?.Results?.[0];
  if (!r) return null;

  const marca = (r.Make || '').trim();
  const modelo = (r.Model || '').trim();
  const anio = (r.ModelYear || '').toString().trim();

  // vPIC answers 200 even for garbage VINs; without a make there's nothing useful.
  if (!marca && !modelo && !anio) return null;

  const detalle = [r.BodyClass, r.EngineCylinders && `${r.EngineCylinders} cil.`, r.FuelTypePrimary]
    .filter(Boolean)
    .join(' · ');

  return {
    // Title-case the make: vPIC returns it shouting ("TOYOTA").
    marca: marca ? marca.charAt(0).toUpperCase() + marca.slice(1).toLowerCase() : '',
    modelo,
    anio,
    detalle: detalle || undefined,
  };
}
