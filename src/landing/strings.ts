// Textos de la página de inicio, en inglés y en español.
//
// Aparte de src/i18n/translations.ts a propósito, como los del portal: ese archivo trae todos los
// textos de la app del taller, y esta página no debe descargarlos. Al cliente se le habla de usted,
// como en el portal. Lo que es una afirmación del taller (servicios, años, garantías, precios) tiene
// que venir de sus propios materiales o estar confirmado por el taller: ver business.ts. El
// diagnóstico y el estimado se cobran (orden de trabajo del taller): nada de "estimado gratis".
// El simulador del portal usa las mismas palabras que el portal real (src/portal/strings.ts).
//
// `{person}` es el nombre de quien contesta cada línea (business.ts) y `{items}`, lo marcado en la
// lista de servicios.

export type LandingLanguage = 'en' | 'es';

const en = {
  metaTitle: 'Restorify Auto | Collision repair, paint and mechanics in Hyattsville, MD',
  skipToContent: 'Skip to content',
  nav: {
    label: 'Main',
    work: 'Our work',
    services: 'Services',
    insurance: 'Insurance',
    studio: 'Color studio',
    online: 'Your car online',
    visit: 'Visit us',
    staff: 'Staff login',
    languageLabel: 'Language',
    message: 'Message us',
    menu: 'Menu',
    close: 'Close menu',
  },
  hero: {
    // El lema de la tarjeta: va en inglés en las dos versiones.
    words: ['Repair.', 'Restore.', 'Perform.'],
    lead: 'Collision repair, paint and mechanics in Hyattsville, Maryland. Call us in English or in Spanish.',
    // Cada botón habla el idioma de su línea, en las dos versiones de la página.
    callEnglish: '{person}, in English',
    callSpanish: '{person}, en español',
    callLabel: 'Call',
    rating: '{rating} on Google',
    insuranceBefore: 'We work with',
    insuranceAll: 'all',
    insuranceAfter: 'insurance companies',
  },
  work: {
    title: 'Work from our shop.',
    text: 'Cars we repaired and painted, photographed at the shop. Our team has over 30 years of combined experience.',
    before: 'Before',
    after: 'After',
    cases: [
      {
        name: 'Lexus IS',
        text: 'Bodywork and primer, then the whole car in gloss black.',
        before: 'The Lexus in gray primer and yellow filler, with its windows masked',
        after: 'The same Lexus, finished in gloss black',
      },
      {
        name: 'Dodge Charger',
        text: 'Bodywork, primer and a full repaint in burgundy.',
        before: 'The Charger in gray primer, front and rear',
        after: 'The Charger painted burgundy, front and rear',
      },
    ],
    more: 'See more of our work on Instagram',
  },
  services: {
    title: 'What does your car need?',
    text: 'Check everything that applies and send us the list on WhatsApp. Then add the year, make and model.',
    groups: [
      {
        name: 'Body and paint',
        items: ['Collision repair', 'Frame straightening', 'Bumpers and fenders', 'Dents and scratches', 'Paint and color matching'],
      },
      {
        name: 'Mechanics',
        items: [
          'Brake repair',
          'Suspension repair',
          'Check engine light on',
          'Engine won’t start',
          'Engine tune-up',
          'Full synthetic oil change',
          'Check all fluids',
          'Battery and charging system',
          'Transmission service',
          'A/C service',
          'Repairs to pass inspection',
        ],
      },
    ],
    none: 'Nothing checked yet',
    selected: '{count} checked',
    selectedOne: '1 checked',
    send: 'Send to {person} on WhatsApp',
    // El otro idioma, escrito en ese idioma.
    other: 'En español, escríbale a {person}',
    message: 'Hi, Restorify! My car needs: {items}. Year, make and model: ',
    messageEmpty: 'Hi, Restorify! I have a question about my car. Year, make and model: ',
  },
  insurance: {
    title: 'We work with all insurance companies.',
    text: 'Had an accident? Bring the car in. We document the damage with photos and video, write the estimate, handle the paperwork and coordinate directly with your insurance company.',
    stepsLabel: 'How a claim works with us',
    steps: [
      { name: 'Drop off', text: 'Bring the car in or call us. We photograph how it arrived.' },
      { name: 'Estimate', text: 'We write the estimate and coordinate it with your insurance company.' },
      { name: 'Repair', text: 'Follow the work from the link we send you.' },
      { name: 'Pick up', text: 'Drive away with the job done.' },
    ],
    insurersLabel: 'Some of the insurers our customers have',
    cta: 'Send us photos of the damage',
    ctaMessage: 'Hi, Restorify! I had an accident and I’d like an estimate. I’ll send you photos of the damage.',
  },
  studio: {
    title: 'See your car in a new color.',
    text: 'Pick a color and a finish, then spin the car to see it from every angle. Like it? Send it to us and we’ll give you an estimate.',
    colorsLabel: 'Color',
    finishLabel: 'Finish',
    finishes: { gloss: 'Gloss', metallic: 'Metallic', pearl: 'Pearl', matte: 'Matte' },
    cta: 'Ask for this color',
    ctaMessage: 'Hi, Restorify! I’d like an estimate to paint my car {color}, {finish} finish.',
    drag: 'Drag to rotate',
    loading: 'Loading the studio…',
    note: 'Colors on screen are approximate. We match the real paint to your car’s paint code.',
    fallback: 'Your browser can’t show the 3D studio, but you can still pick a color and send it to us.',
    canvasLabel: '3D car painted {color}, {finish} finish',
  },
  online: {
    title: 'Follow the repair from your phone.',
    text: 'Every car gets a private link. No app, no account, no password.',
    live: 'Sample customer link',
    tabsLabel: 'What you see in your link',
    tabs: [
      { name: 'Check-in photos', text: 'Photos of your car from every angle when we check it in.' },
      { name: 'Work updates', text: 'Photos, videos and voice notes the shop shares as the work moves along.' },
      { name: 'Authorize the quote', text: 'Check the work you approve, line by line, from your phone.' },
      { name: 'Service sticker', text: 'A QR sticker on your windshield that shows your next service.' },
    ],
    mockLabel: 'Example of a customer link',
    mock: {
      order: 'Order 1042',
      received: 'Checked in',
      inProgress: 'In progress',
      waiting: 'Waiting for your approval',
      receivedOn: 'Checked in today, 9:14 am',
      photos: '12 photos',
      video: 'Video',
      mileage: 'Mileage',
      mileageValue: '48,210 mi',
      fuel: 'Fuel',
      signed: 'Signed at check-in',
      progress: 'Progress',
      update1: 'Front end straightened and primed, ready for paint.',
      update1When: 'Today, 2:40 pm',
      voice: 'Voice note from the shop',
      update2: 'Base coat matched to your paint code.',
      update2When: 'Today, 4:05 pm',
      quoteTitle: 'Quote to authorize',
      line1: 'Front bumper repair and paint',
      line2: 'Right fender, dent repair',
      line3: 'Headlight polish',
      authorize: 'Authorize checked items',
      authorized: 'Authorized',
      total: 'Total',
      stickerTitle: 'Next service',
      stickerDate: 'Dec 15, 2026',
      stickerMiles: 'or at 48,500 mi',
      stickerScan: 'Scan to see your next service',
    },
  },
  reviews: {
    title: 'What our customers say',
    rating: 'Google rating',
    source: 'Google review',
    translatedNote: 'Translated from English',
    all: 'Read the reviews on Google',
  },
  visit: {
    title: 'Find us in Hyattsville.',
    hoursTitle: 'Hours',
    days: { weekdays: 'Monday to Friday', saturday: 'Saturday', sunday: 'Sunday' },
    closed: 'Closed',
    directions: 'Get directions',
    google: 'Google reviews',
    mapLink: 'Get directions to Restorify Auto, 5010 46th Ave C, Hyattsville',
    mapCredit: 'Map data © OpenStreetMap contributors',
    cardLabel: 'Restorify Auto contact card',
    lines: {
      en: 'English',
      es: 'Español',
      office: 'Office',
    },
    call: 'Call',
    whatsapp: 'WhatsApp',
    text: 'Text',
    email: 'Email',
    address: 'Address',
    followTitle: 'Follow our work',
    beacons: 'All our links',
    whatsappMessage: 'Hi, Restorify! I have a question about my car.',
  },
  footer: {
    label: 'Footer',
    rights: 'Restorify Auto. Hyattsville, Maryland.',
    privacy: 'Privacy',
    staff: 'Staff login',
    credit:
      '3D car in the color studio: “Car Concept” by Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH, CC BY 4.0, based on a public-domain model by Unity Fan. We optimized it and removed its logos.',
    license: 'License',
    source: 'Original model',
  },
  bar: {
    label: 'Contact',
    call: 'Call',
    english: 'English',
    spanish: 'Español',
    whatsapp: 'WhatsApp',
    map: 'Map',
  },
};

export type LandingStrings = typeof en;

const es: LandingStrings = {
  metaTitle: 'Restorify Auto | Enderezado, pintura y mecánica en Hyattsville, MD',
  skipToContent: 'Ir al contenido',
  nav: {
    label: 'Principal',
    work: 'Trabajos',
    services: 'Servicios',
    insurance: 'Seguros',
    studio: 'Estudio de color',
    online: 'Su carro en línea',
    visit: 'Visítenos',
    staff: 'Acceso del taller',
    languageLabel: 'Idioma',
    message: 'Escríbanos',
    menu: 'Menú',
    close: 'Cerrar el menú',
  },
  hero: {
    words: ['Repair.', 'Restore.', 'Perform.'],
    lead: 'Enderezado, pintura y mecánica en Hyattsville, Maryland. Llámenos en español o en inglés.',
    callEnglish: '{person}, in English',
    callSpanish: '{person}, en español',
    callLabel: 'Llamar a',
    rating: '{rating} en Google',
    insuranceBefore: 'Trabajamos con',
    insuranceAll: 'todas',
    insuranceAfter: 'las aseguradoras',
  },
  work: {
    title: 'Trabajos de nuestro taller.',
    text: 'Carros que reparamos y pintamos, fotografiados en el taller. Nuestro equipo tiene más de 30 años de experiencia combinada.',
    before: 'Antes',
    after: 'Después',
    cases: [
      {
        name: 'Lexus IS',
        text: 'Carrocería y fondo, y después todo el carro en negro brillante.',
        before: 'El Lexus con fondo gris y masilla amarilla, con los vidrios tapados',
        after: 'El mismo Lexus, terminado en negro brillante',
      },
      {
        name: 'Dodge Charger',
        text: 'Carrocería, fondo y pintura completa en color vino.',
        before: 'El Charger con fondo gris, de frente y de atrás',
        after: 'El Charger pintado de color vino, de frente y de atrás',
      },
    ],
    more: 'Vea más de nuestro trabajo en Instagram',
  },
  services: {
    title: '¿Qué necesita su carro?',
    text: 'Marque todo lo que aplique y mándenos la lista por WhatsApp. Después agregue el año, la marca y el modelo.',
    groups: [
      {
        name: 'Carrocería y pintura',
        items: ['Reparación de choques', 'Enderezado de chasis', 'Bumpers y fenders', 'Golpes y rayones', 'Pintura e igualación de color'],
      },
      {
        name: 'Mecánica',
        items: [
          'Frenos',
          'Suspensión',
          'Luz de check engine encendida',
          'El motor no arranca',
          'Afinación del motor',
          'Cambio de aceite sintético',
          'Revisión de todos los líquidos',
          'Batería y sistema de carga',
          'Servicio de transmisión',
          'Aire acondicionado',
          'Reparaciones para pasar la inspección',
        ],
      },
    ],
    none: 'Nada marcado todavía',
    selected: '{count} marcados',
    selectedOne: '1 marcado',
    send: 'Mandar a {person} por WhatsApp',
    other: 'In English, message {person}',
    message: '¡Hola, Restorify! Mi carro necesita: {items}. Año, marca y modelo: ',
    messageEmpty: '¡Hola, Restorify! Tengo una pregunta sobre mi carro. Año, marca y modelo: ',
  },
  insurance: {
    title: 'Trabajamos con todas las aseguradoras.',
    text: '¿Tuvo un accidente? Traiga su carro. Documentamos los daños con fotos y video, preparamos el estimado, nos encargamos del papeleo y nos coordinamos directamente con su aseguradora.',
    stepsLabel: 'Cómo funciona un reclamo con nosotros',
    steps: [
      { name: 'Lo recibimos', text: 'Traiga su carro o llámenos. Fotografiamos cómo llegó.' },
      { name: 'Estimado', text: 'Preparamos el estimado y lo coordinamos con su aseguradora.' },
      { name: 'Reparación', text: 'Siga el trabajo desde el enlace que le enviamos.' },
      { name: 'Entrega', text: 'Se lleva su carro con el trabajo terminado.' },
    ],
    insurersLabel: 'Algunas de las aseguradoras de nuestros clientes',
    cta: 'Mándenos fotos del daño',
    ctaMessage: '¡Hola, Restorify! Tuve un accidente y quisiera un estimado. Les mando fotos del daño.',
  },
  studio: {
    title: 'Vea su carro con otro color.',
    text: 'Elija un color y un acabado, y gire el carro para verlo desde todos los ángulos. ¿Le gustó? Mándenoslo y le damos un estimado.',
    colorsLabel: 'Color',
    finishLabel: 'Acabado',
    finishes: { gloss: 'Brillante', metallic: 'Metálico', pearl: 'Perlado', matte: 'Mate' },
    cta: 'Pedir este color',
    ctaMessage: '¡Hola, Restorify! Quisiera un estimado para pintar mi carro de color {color}, acabado {finish}.',
    drag: 'Arrastre para girar',
    loading: 'Cargando el estudio…',
    note: 'Los colores en pantalla son aproximados. La pintura real se iguala al código de pintura de su carro.',
    fallback: 'Su navegador no puede mostrar el estudio en 3D, pero igual puede elegir un color y mandárnoslo.',
    canvasLabel: 'Carro en 3D pintado de {color}, acabado {finish}',
  },
  online: {
    title: 'Vea cómo va su reparación desde el teléfono.',
    text: 'Cada carro tiene su enlace privado. Sin aplicaciones, sin cuentas, sin contraseñas.',
    live: 'Ejemplo del enlace del cliente',
    tabsLabel: 'Lo que ve en su enlace',
    tabs: [
      { name: 'Fotos de recepción', text: 'Fotos de su carro desde todos los ángulos al recibirlo.' },
      { name: 'Avances del trabajo', text: 'Fotos, videos y notas de voz que el taller comparte mientras avanza el trabajo.' },
      { name: 'Autorice el presupuesto', text: 'Marque desde su teléfono, línea por línea, el trabajo que autoriza.' },
      { name: 'Sticker de servicio', text: 'Un sticker con código QR en el parabrisas que le dice cuándo le toca el próximo servicio.' },
    ],
    mockLabel: 'Ejemplo del enlace de un cliente',
    mock: {
      order: 'Orden 1042',
      received: 'Recibido',
      inProgress: 'En proceso',
      waiting: 'Esperando su autorización',
      receivedOn: 'Recibido hoy, 9:14 a. m.',
      photos: '12 fotos',
      video: 'Video',
      mileage: 'Millaje',
      mileageValue: '48,210 mi',
      fuel: 'Gasolina',
      signed: 'Firmado al recibirlo',
      progress: 'Avance',
      update1: 'Frente enderezado y con fondo, listo para pintar.',
      update1When: 'Hoy, 2:40 p. m.',
      voice: 'Nota de voz del taller',
      update2: 'Color igualado al código de pintura.',
      update2When: 'Hoy, 4:05 p. m.',
      quoteTitle: 'Presupuesto por autorizar',
      line1: 'Bumper delantero: reparación y pintura',
      line2: 'Fender derecho: reparación de golpe',
      line3: 'Pulido de faros',
      authorize: 'Autorizar lo marcado',
      authorized: 'Autorizado',
      total: 'Total',
      stickerTitle: 'Próximo servicio',
      stickerDate: '15 dic. 2026',
      stickerMiles: 'o a las 48,500 millas',
      stickerScan: 'Escanee para ver su próximo servicio',
    },
  },
  reviews: {
    title: 'Lo que dicen nuestros clientes',
    rating: 'Calificación en Google',
    source: 'Reseña de Google',
    translatedNote: 'Traducida del inglés',
    all: 'Leer las reseñas en Google',
  },
  visit: {
    title: 'Estamos en Hyattsville.',
    hoursTitle: 'Horario',
    days: { weekdays: 'Lunes a viernes', saturday: 'Sábado', sunday: 'Domingo' },
    closed: 'Cerrado',
    directions: 'Cómo llegar',
    google: 'Reseñas en Google',
    mapLink: 'Cómo llegar a Restorify Auto, 5010 46th Ave C, Hyattsville',
    mapCredit: 'Datos del mapa © colaboradores de OpenStreetMap',
    cardLabel: 'Tarjeta de contacto de Restorify Auto',
    lines: {
      en: 'English',
      es: 'Español',
      office: 'Oficina',
    },
    call: 'Llamar',
    whatsapp: 'WhatsApp',
    text: 'Mensaje',
    email: 'Correo',
    address: 'Dirección',
    followTitle: 'Vea nuestro trabajo',
    beacons: 'Todos nuestros enlaces',
    whatsappMessage: '¡Hola, Restorify! Tengo una pregunta sobre mi carro.',
  },
  footer: {
    label: 'Pie de página',
    rights: 'Restorify Auto. Hyattsville, Maryland.',
    privacy: 'Privacidad',
    staff: 'Acceso del taller',
    credit:
      'Carro 3D del estudio de color: “Car Concept” de Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH, CC BY 4.0, basado en un modelo de dominio público de Unity Fan. Lo optimizamos y le quitamos sus logotipos.',
    license: 'Licencia',
    source: 'Modelo original',
  },
  bar: {
    label: 'Contacto',
    call: 'Llamar',
    english: 'English',
    spanish: 'Español',
    whatsapp: 'WhatsApp',
    map: 'Mapa',
  },
};

export const landingStrings: Record<LandingLanguage, LandingStrings> = { en, es };

/** Rellena `{dato}` en un texto. */
export const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');

// La misma llave que el portal del cliente: quien eligió español en su enlace ve esta página en
// español, y al revés.
const STORAGE_KEY = 'restorify_portal_lang';

export function initialLandingLanguage(): LandingLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    // Sin almacenamiento, el idioma por defecto.
  }
  // Por defecto, inglés (así lo pidió el taller, que está en Maryland), sin mirar el idioma del
  // navegador: quien prefiera español lo elige con EN / ES y la página se lo recuerda.
  return 'en';
}

export function saveLandingLanguage(language: LandingLanguage) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Sin almacenamiento, la elección dura lo que dure la página.
  }
}
