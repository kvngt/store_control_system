// Los datos del taller que muestra la página de inicio.
//
// Están aquí y no en la base a propósito: la página la abre cualquiera, sin sesión, y no debe
// esperar a Supabase para decir dónde queda el taller. El costo es que un dato que cambie se cambia
// en dos lugares: aquí y en Configuración (los teléfonos de la sede que ve el cliente en su enlace).
//
// Fuentes, verificadas el 26 y el 27/10/2026: la tarjeta de presentación del taller (la dirección
// "Ste C", quién atiende cada teléfono, el correo, "We work with all insurance companies" y
// REPAIR • RESTORE • PERFORM); la orden de trabajo en papel (los servicios de mecánica y que el
// diagnóstico y el estimado se cobran: la página no promete nada gratis); su sitio anterior,
// restorifyauto.shop (el horario, "30+ years combined experience", 4.9 en Google y las fotos de
// assets/work/); su Instagram (@restorifyauto) y la página de Facebook y de Beacons que dio el
// taller. Lo que el taller no confirme (los años, la calificación) se quita de aquí, no de la pantalla.

export type LineId = 'en' | 'es' | 'office';

export interface ShopLine {
  id: LineId;
  /** Para `tel:` y `wa.me`. */
  e164: string;
  /** Como se lee. */
  display: string;
  whatsapp: boolean;
  /** Quién contesta, como lo dice la tarjeta del taller. La oficina no tiene nombre. */
  person?: string;
}

export const SHOP = {
  name: 'Restorify Auto',
  street: '5010 46th Ave C',
  /** La calle como la escribe la tarjeta del taller, en dos renglones. */
  streetLines: ['5010 46th Ave', 'Ste C'],
  city: 'Hyattsville',
  region: 'MD',
  postalCode: '20781',
  /** Del edificio en OpenStreetMap; para el marcado de negocio local de index.html. */
  geo: { lat: 38.9518, lng: -76.9392 },
  email: 'restorifyauto@gmail.com',
  lines: [
    { id: 'en', e164: '+12403551266', display: '(240) 355-1266', whatsapp: true, person: 'Jesus D.' },
    { id: 'es', e164: '+12026076126', display: '(202) 607-6126', whatsapp: true, person: 'Carlos G.' },
    { id: 'office', e164: '+13019099937', display: '(301) 909-9937', whatsapp: false },
  ] satisfies ShopLine[],
  /** Lunes a viernes de 9 a 6 y sábado de 9 a 5; domingo cerrado. */
  hours: { weekdays: ['09:00', '18:00'], saturday: ['09:00', '17:00'] },
  googleRating: '4.9',
  links: {
    /** La ficha del taller en Google Maps: reseñas, fotos y cómo llegar. */
    google: 'https://maps.google.com/maps?cid=6406593209024641082',
    instagram: 'https://www.instagram.com/restorifyauto/',
    facebook: 'https://www.facebook.com/RestorifyAuto/',
    beacons: 'https://beacons.ai/restorify',
  },
} as const;

/**
 * Aseguradoras grandes de la zona, para la cinta "trabajamos con todas": solo el nombre, como
 * ejemplo de "todas" (lo dice la tarjeta del taller); ningún logo ni convenio.
 */
export const INSURERS = [
  'GEICO',
  'State Farm',
  'Progressive',
  'Allstate',
  'USAA',
  'Liberty Mutual',
  'Erie',
  'Nationwide',
  'Farmers',
  'Travelers',
] as const;

/**
 * La reseña que el taller muestra en su perfil de Google (restorifyauto.shop, verificada el
 * 26/10/2026). Es pública, pero va solo con la inicial del apellido.
 */
export const REVIEW = {
  quote: 'The quality of the work is incredible. I can’t believe it’s the same car.',
  author: 'Cheyenne C.',
  /** Para la versión en español, junto a la original. */
  quoteEs: 'La calidad del trabajo es increíble. No puedo creer que sea el mismo carro.',
} as const;

export function shopLine(id: LineId): ShopLine {
  return SHOP.lines.find((line) => line.id === id)!;
}

export function fullAddress(): string {
  return `${SHOP.street}, ${SHOP.city}, ${SHOP.region} ${SHOP.postalCode}`;
}

/** Abre la navegación en Google Maps (en el teléfono, la app) con el taller como destino. */
export function directionsUrl(): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${SHOP.name}, ${fullAddress()}`)}`;
}
