// Vehicle helpers: brand/model suggestions, VIN decoding via the NHTSA vPIC API
// (free, no API key, US government dataset) and US licence-plate checking.

export const VEHICLE_BRANDS = [
  'Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet',
  'Chrysler', 'Dodge', 'Fiat', 'Ford', 'Genesis', 'GMC', 'Honda', 'Hyundai',
  'Infiniti', 'Jaguar', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln',
  'Mazda', 'Mercedes-Benz', 'Mercury', 'Mini', 'Mitsubishi', 'Nissan',
  'Peugeot', 'Polestar', 'Pontiac', 'Porsche', 'RAM', 'Renault', 'Rivian',
  'Saab', 'Saturn', 'Scion', 'Subaru', 'Suzuki', 'Tesla', 'Toyota',
  'Volkswagen', 'Volvo',
];

/**
 * Offline model suggestions per brand. vPIC is queried first (see
 * `fetchModelsForMake`), but the shop has to keep working when the API is slow
 * or the tablet is off-line, so the common models ship with the app.
 */
export const VEHICLE_MODELS: Record<string, string[]> = {
  acura: ['ILX', 'Integra', 'MDX', 'RDX', 'RLX', 'TL', 'TLX', 'TSX', 'ZDX'],
  audi: ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'TT', 'e-tron'],
  bmw: ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X6', 'X7', 'i4', 'iX'],
  buick: ['Enclave', 'Encore', 'Envision', 'LaCrosse', 'Regal', 'Verano'],
  cadillac: ['ATS', 'CT4', 'CT5', 'CTS', 'Escalade', 'SRX', 'XT4', 'XT5', 'XT6'],
  chevrolet: ['Blazer', 'Bolt', 'Camaro', 'Colorado', 'Corvette', 'Cruze', 'Equinox', 'Impala', 'Malibu', 'Silverado 1500', 'Silverado 2500', 'Sonic', 'Spark', 'Suburban', 'Tahoe', 'Trailblazer', 'Traverse', 'Trax'],
  chrysler: ['200', '300', 'Pacifica', 'Town & Country', 'Voyager'],
  dodge: ['Challenger', 'Charger', 'Dart', 'Durango', 'Grand Caravan', 'Hornet', 'Journey'],
  fiat: ['500', '500L', '500X'],
  ford: ['Bronco', 'Bronco Sport', 'Edge', 'Escape', 'Expedition', 'Explorer', 'F-150', 'F-250', 'F-350', 'Fiesta', 'Focus', 'Fusion', 'Maverick', 'Mustang', 'Mustang Mach-E', 'Ranger', 'Transit'],
  genesis: ['G70', 'G80', 'G90', 'GV70', 'GV80'],
  gmc: ['Acadia', 'Canyon', 'Sierra 1500', 'Sierra 2500', 'Terrain', 'Yukon'],
  honda: ['Accord', 'CR-V', 'Civic', 'Fit', 'HR-V', 'Insight', 'Odyssey', 'Passport', 'Pilot', 'Ridgeline'],
  hyundai: ['Accent', 'Elantra', 'Ioniq 5', 'Kona', 'Palisade', 'Santa Fe', 'Sonata', 'Tucson', 'Veloster', 'Venue'],
  infiniti: ['Q50', 'Q60', 'QX50', 'QX60', 'QX80'],
  jaguar: ['E-Pace', 'F-Pace', 'F-Type', 'XE', 'XF', 'XJ'],
  jeep: ['Cherokee', 'Compass', 'Gladiator', 'Grand Cherokee', 'Patriot', 'Renegade', 'Wrangler'],
  kia: ['Carnival', 'Forte', 'K5', 'Niro', 'Optima', 'Rio', 'Seltos', 'Sorento', 'Soul', 'Sportage', 'Telluride'],
  'land rover': ['Defender', 'Discovery', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport'],
  lexus: ['ES', 'GX', 'IS', 'LS', 'NX', 'RC', 'RX', 'UX'],
  lincoln: ['Aviator', 'Continental', 'Corsair', 'MKC', 'MKZ', 'Nautilus', 'Navigator'],
  mazda: ['CX-3', 'CX-30', 'CX-5', 'CX-9', 'MX-5 Miata', 'Mazda3', 'Mazda6'],
  'mercedes-benz': ['A-Class', 'C-Class', 'CLA', 'E-Class', 'G-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'S-Class', 'Sprinter'],
  mini: ['Clubman', 'Cooper', 'Countryman'],
  mitsubishi: ['Eclipse Cross', 'Mirage', 'Outlander', 'Outlander Sport'],
  nissan: ['Altima', 'Armada', 'Frontier', 'Kicks', 'Leaf', 'Maxima', 'Murano', 'Pathfinder', 'Rogue', 'Sentra', 'Titan', 'Versa'],
  polestar: ['Polestar 2', 'Polestar 3'],
  porsche: ['718 Cayman', '911', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
  ram: ['1500', '2500', '3500', 'ProMaster'],
  rivian: ['R1S', 'R1T'],
  subaru: ['Ascent', 'BRZ', 'Crosstrek', 'Forester', 'Impreza', 'Legacy', 'Outback', 'WRX'],
  tesla: ['Cybertruck', 'Model 3', 'Model S', 'Model X', 'Model Y'],
  toyota: ['4Runner', 'Avalon', 'Camry', 'Corolla', 'Highlander', 'Prius', 'RAV4', 'Sequoia', 'Sienna', 'Tacoma', 'Tundra', 'Venza', 'Yaris'],
  volkswagen: ['Atlas', 'Beetle', 'GTI', 'ID.4', 'Jetta', 'Passat', 'Taos', 'Tiguan'],
  volvo: ['S60', 'S90', 'V60', 'XC40', 'XC60', 'XC90'],
};

/**
 * Colour suggestions, per app language. Colour is deliberately *not* decoded
 * from the VIN — the standard doesn't encode it — so the fastest we can make
 * that field is a list of the paints a body shop actually sees.
 */
export const VEHICLE_COLORS: Record<string, string[]> = {
  es: ['Blanco', 'Negro', 'Gris', 'Plata', 'Azul', 'Rojo', 'Verde', 'Beige', 'Café', 'Dorado', 'Naranja', 'Amarillo', 'Vino', 'Morado'],
  en: ['White', 'Black', 'Gray', 'Silver', 'Blue', 'Red', 'Green', 'Beige', 'Brown', 'Gold', 'Orange', 'Yellow', 'Burgundy', 'Purple'],
};

/** Locally known models for a brand; empty when the brand isn't in the table. */
export function localModelsForMake(make: string): string[] {
  return VEHICLE_MODELS[make.trim().toLowerCase()] || [];
}

/**
 * Years for the picker, newest first. Starts one year ahead of today because
 * dealers sell next year's models before the year turns.
 */
export function yearOptions(oldest = 1960, now = new Date()): number[] {
  const newest = now.getFullYear() + 1;
  const years: number[] = [];
  for (let y = newest; y >= oldest; y--) years.push(y);
  return years;
}

// ===== VIN =====

// I, O and Q are excluded from VINs precisely because they look like 1 and 0.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

const CHECK_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export type VinProblem = 'LENGTH' | 'CHARSET' | 'CHECKSUM';

export interface VinCheck {
  /** `error` blocks the lookup; `warn` is shown but the user may continue. */
  level: 'ok' | 'warn' | 'error';
  problem?: VinProblem;
  normalized: string;
}

export function normalizeVin(vin: string): string {
  return vin.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Validates a VIN off-line: length, alphabet and the position-9 check digit
 * defined by 49 CFR 565. The checksum is mandatory for vehicles built for the
 * US market but some grey imports fail it, so a bad digit is only a warning.
 */
export function checkVin(vin: string): VinCheck {
  const normalized = normalizeVin(vin);
  if (normalized.length !== 17) return { level: 'error', problem: 'LENGTH', normalized };
  if (!VIN_RE.test(normalized)) return { level: 'error', problem: 'CHARSET', normalized };

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = normalized[i];
    const value = ch >= '0' && ch <= '9' ? Number(ch) : TRANSLITERATION[ch];
    sum += value * CHECK_WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  if (normalized[8] !== expected) return { level: 'warn', problem: 'CHECKSUM', normalized };

  return { level: 'ok', normalized };
}

// Position 10 encodes the model year on a 30-year cycle starting at 1980.
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

/**
 * Model year read straight out of the VIN, no network needed. The code repeats
 * every 30 years; a digit in position 7 means the older cycle (1980-2009),
 * a letter the newer one (2010-2039).
 */
export function vinModelYear(vin: string, now = new Date()): number | null {
  const clean = normalizeVin(vin);
  if (clean.length !== 17) return null;
  const index = YEAR_CODES.indexOf(clean[9]);
  if (index === -1) return null;

  const olderCycle = 1980 + index;
  const newerCycle = 2010 + index;
  const seventhIsDigit = clean[6] >= '0' && clean[6] <= '9';
  const year = seventhIsDigit ? olderCycle : newerCycle;
  // Guard against a year in the future when the position-7 rule doesn't hold.
  return year > now.getFullYear() + 1 ? olderCycle : year;
}

export interface DecodedVin {
  marca: string;
  modelo: string;
  anio: string;
  /** Everything else vPIC could tell us, as label/value pairs for display. */
  detalles: { etiqueta: string; valor: string }[];
}

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Decodes a 17-character VIN. Returns null when the API can't identify the
 * vehicle, so the caller can fall back to manual entry instead of wiping
 * whatever the user already typed.
 */
export async function decodeVin(vin: string, signal?: AbortSignal): Promise<DecodedVin | null> {
  const check = checkVin(vin);
  if (check.level === 'error') throw new Error(check.problem);

  const res = await fetch(
    `${NHTSA_BASE}/DecodeVinValues/${encodeURIComponent(check.normalized)}?format=json`,
    { signal }
  );
  if (!res.ok) throw new Error('REQUEST_FAILED');

  const json = await res.json();
  const r = json?.Results?.[0];
  if (!r) return null;

  const marca = (r.Make || '').trim();
  const modelo = (r.Model || '').trim();
  const anio = (r.ModelYear || '').toString().trim();

  // vPIC answers 200 even for garbage VINs; without make/model/year there is
  // nothing worth pre-filling.
  if (!marca && !modelo && !anio) return null;

  // vPIC reports displacement to nine decimals ("2.998832712"); one is plenty.
  const engine = r.DisplacementL ? `${Number(r.DisplacementL).toFixed(1)}L` : '';

  const detalles = ([
    ['trim', r.Trim || r.Series],
    ['bodyClass', r.BodyClass],
    ['engine', engine],
    ['cylinders', r.EngineCylinders],
    ['fuel', r.FuelTypePrimary],
    ['transmission', r.TransmissionStyle],
    ['drive', r.DriveType],
    ['doors', r.Doors],
    ['manufacturer', r.Manufacturer],
    ['plant', [r.PlantCity, r.PlantCountry].filter(Boolean).join(', ')],
  ] as [string, unknown][])
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([etiqueta, valor]) => ({ etiqueta, valor: String(valor).trim() }));

  return {
    // vPIC returns the make shouting ("TOYOTA"); the model is already cased.
    marca: marca ? titleCase(marca) : '',
    modelo,
    anio,
    detalles,
  };
}

const modelCache = new Map<string, string[]>();

/**
 * Models vPIC knows for a brand, merged with the offline table. Results are
 * cached per brand so retyping in the form doesn't re-hit the network.
 */
export async function fetchModelsForMake(make: string, signal?: AbortSignal): Promise<string[]> {
  const key = make.trim().toLowerCase();
  if (!key) return [];
  const cached = modelCache.get(key);
  if (cached) return cached;

  const local = localModelsForMake(key);
  let remote: string[] = [];
  try {
    const res = await fetch(
      `${NHTSA_BASE}/GetModelsForMake/${encodeURIComponent(key)}?format=json`,
      { signal }
    );
    if (res.ok) {
      const json = await res.json();
      remote = ((json?.Results || []) as { Model_Name?: string }[])
        .map((r) => (r.Model_Name || '').trim())
        .filter(Boolean);
    }
  } catch (err) {
    // An aborted request means the user changed brand — let the caller drop it.
    if ((err as Error).name === 'AbortError') throw err;
  }

  const merged = [...new Set([...local, ...remote])].sort((a, b) => a.localeCompare(b));
  // Only worth caching once we actually have something.
  if (merged.length) modelCache.set(key, merged);
  return merged;
}

// ===== US licence plates =====

export interface UsState {
  code: string;
  name: string;
  /** Usual passenger-plate formats; vanity plates legitimately differ. */
  patterns: RegExp[];
}

export const US_STATES: UsState[] = [
  { code: 'AL', name: 'Alabama', patterns: [/^\d{1,2}[A-Z]{2}\d{3,4}$/] },
  { code: 'AK', name: 'Alaska', patterns: [/^[A-Z]{3}\d{3}$/] },
  { code: 'AZ', name: 'Arizona', patterns: [/^[A-Z]{3}\d{4}$/, /^[A-Z]{2}\d{5}$/] },
  { code: 'AR', name: 'Arkansas', patterns: [/^\d{3}[A-Z]{3}$/] },
  { code: 'CA', name: 'California', patterns: [/^\d[A-Z]{3}\d{3}$/] },
  { code: 'CO', name: 'Colorado', patterns: [/^[A-Z]{3}\d{3}$/, /^\d{3}[A-Z]{3}$/] },
  { code: 'CT', name: 'Connecticut', patterns: [/^[A-Z]{2}\d{5}$/, /^\d[A-Z]{5}$/] },
  { code: 'DC', name: 'District of Columbia', patterns: [/^[A-Z]{2}\d{4}$/] },
  { code: 'DE', name: 'Delaware', patterns: [/^\d{1,6}$/, /^[A-Z]{2}\d{1,5}$/] },
  { code: 'FL', name: 'Florida', patterns: [/^[A-Z]{3}[A-Z0-9]\d{2}$/, /^[A-Z]{4}\d{2}$/] },
  { code: 'GA', name: 'Georgia', patterns: [/^[A-Z]{3}\d{4}$/] },
  { code: 'HI', name: 'Hawaii', patterns: [/^[A-Z]{3}\d{3}$/] },
  { code: 'IA', name: 'Iowa', patterns: [/^[A-Z]{3}\d{3}$/] },
  { code: 'ID', name: 'Idaho', patterns: [/^[A-Z]\d{6}$/, /^\d[A-Z]\d{5}$/] },
  { code: 'IL', name: 'Illinois', patterns: [/^[A-Z]{2}\d{5}$/, /^[A-Z]{3}\d{4}$/] },
  { code: 'IN', name: 'Indiana', patterns: [/^\d{3}[A-Z]{3}$/, /^[A-Z]{3}\d{3}$/] },
  { code: 'KS', name: 'Kansas', patterns: [/^\d{3}[A-Z]{3}$/] },
  { code: 'KY', name: 'Kentucky', patterns: [/^\d{3}[A-Z]{3}$/] },
  { code: 'LA', name: 'Louisiana', patterns: [/^\d{3}[A-Z]{3}$/] },
  { code: 'MA', name: 'Massachusetts', patterns: [/^\d[A-Z]{2}\d{3}$/, /^\d{4}[A-Z]{2}$/] },
  { code: 'MD', name: 'Maryland', patterns: [/^\d[A-Z]{2}\d{4}$/] },
  { code: 'ME', name: 'Maine', patterns: [/^\d{4}[A-Z]{2}$/] },
  { code: 'MI', name: 'Michigan', patterns: [/^[A-Z]{3}\d{4}$/, /^\d[A-Z]{5}$/] },
  { code: 'MN', name: 'Minnesota', patterns: [/^\d{3}[A-Z]{3}$/] },
  { code: 'MO', name: 'Missouri', patterns: [/^[A-Z]{2}\d[A-Z]\d[A-Z]$/, /^[A-Z]{3}[A-Z0-9]\d[A-Z]$/] },
  { code: 'MS', name: 'Mississippi', patterns: [/^[A-Z]{3}\d{4}$/] },
  { code: 'MT', name: 'Montana', patterns: [/^\d{5,6}[A-Z]$/, /^[A-Z0-9]{6,7}$/] },
  { code: 'NC', name: 'North Carolina', patterns: [/^[A-Z]{3}\d{4}$/] },
  { code: 'ND', name: 'North Dakota', patterns: [/^\d{3}[A-Z]{3}$/] },
  { code: 'NE', name: 'Nebraska', patterns: [/^[A-Z]{3}\d{3}$/, /^\d{2}[A-Z]\d{3}$/] },
  { code: 'NH', name: 'New Hampshire', patterns: [/^\d{7}$/, /^[A-Z]{3}\d{3}$/] },
  { code: 'NJ', name: 'New Jersey', patterns: [/^[A-Z]\d{2}[A-Z]{3}$/] },
  { code: 'NM', name: 'New Mexico', patterns: [/^\d{3}[A-Z]{3}$/, /^[A-Z]{3}\d{3}$/] },
  { code: 'NV', name: 'Nevada', patterns: [/^\d{3}[A-Z]{3}$/] },
  { code: 'NY', name: 'New York', patterns: [/^[A-Z]{3}\d{4}$/] },
  { code: 'OH', name: 'Ohio', patterns: [/^[A-Z]{3}\d{4}$/] },
  { code: 'OK', name: 'Oklahoma', patterns: [/^[A-Z]{3}\d{3}$/, /^\d{3}[A-Z]{3}$/] },
  { code: 'OR', name: 'Oregon', patterns: [/^\d{3}[A-Z]{3}$/, /^[A-Z]{3}\d{3}$/] },
  { code: 'PA', name: 'Pennsylvania', patterns: [/^[A-Z]{3}\d{4}$/] },
  { code: 'PR', name: 'Puerto Rico', patterns: [/^[A-Z]{3}\d{3}$/] },
  { code: 'RI', name: 'Rhode Island', patterns: [/^\d{6}$/, /^[A-Z]{2}\d{3}$/] },
  { code: 'SC', name: 'South Carolina', patterns: [/^[A-Z]{3}\d{3}$/] },
  { code: 'SD', name: 'South Dakota', patterns: [/^\d{2}[A-Z]\d{3}$/, /^[A-Z]{3}\d{3}$/] },
  { code: 'TN', name: 'Tennessee', patterns: [/^[A-Z]{3}\d{3}$/] },
  { code: 'TX', name: 'Texas', patterns: [/^[A-Z]{3}\d{4}$/, /^\d{3}[A-Z]{4}$/] },
  { code: 'UT', name: 'Utah', patterns: [/^[A-Z]\d{3}[A-Z]{2}$/, /^[A-Z]{3}\d{3}$/] },
  { code: 'VA', name: 'Virginia', patterns: [/^[A-Z]{3}\d{4}$/] },
  { code: 'VT', name: 'Vermont', patterns: [/^[A-Z]{3}\d{3}$/, /^\d{3}[A-Z]{3}$/] },
  { code: 'WA', name: 'Washington', patterns: [/^[A-Z]{3}\d{4}$/, /^\d{3}[A-Z]{3}$/] },
  { code: 'WI', name: 'Wisconsin', patterns: [/^[A-Z]{3}\d{4}$/] },
  { code: 'WV', name: 'West Virginia', patterns: [/^[A-Z]{2}\d{4}$/] },
  { code: 'WY', name: 'Wyoming', patterns: [/^\d{4,7}$/] },
];

export type PlateProblem = 'CHARSET' | 'LENGTH' | 'UNUSUAL';

export interface PlateCheck {
  /** `error` blocks saving; `warn` (vanity or legacy plates) does not. */
  level: 'ok' | 'warn' | 'error';
  problem?: PlateProblem;
  normalized: string;
}

/**
 * Checks a US plate. Charset and length are hard rules in every jurisdiction;
 * the per-state format is only a hint, because vanity and legacy plates
 * legitimately break it — so a mismatch warns instead of blocking the save.
 */
export function checkUsPlate(plate: string, stateCode?: string): PlateCheck {
  const raw = plate.trim().toUpperCase();
  const normalized = raw.replace(/[\s.-]/g, '');

  if (/[^A-Z0-9\s.-]/.test(raw)) return { level: 'error', problem: 'CHARSET', normalized };
  // No US jurisdiction issues fewer than 2 or more than 8 characters.
  if (normalized.length < 2 || normalized.length > 8) {
    return { level: 'error', problem: 'LENGTH', normalized };
  }

  const state = stateCode ? US_STATES.find((s) => s.code === stateCode) : undefined;
  if (state && !state.patterns.some((p) => p.test(normalized))) {
    return { level: 'warn', problem: 'UNUSUAL', normalized };
  }

  return { level: 'ok', normalized };
}
