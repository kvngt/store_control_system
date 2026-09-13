// Textos del portal del cliente, en español e inglés.
//
// Aparte de src/i18n/translations.ts a propósito: ese archivo trae todos los textos
// de la app del taller, y el cliente solo necesita estos.

export type PortalLanguage = 'es' | 'en';

const es = {
  loading: 'Cargando su reporte…',
  loadError: 'No pudimos cargar el reporte. Revise su conexión e intente de nuevo.',
  retry: 'Intentar de nuevo',
  notFoundTitle: 'Enlace no válido',
  notFoundBody: 'Revise que el enlace esté completo. Si lo copió de un mensaje, puede haberse cortado.',
  revokedTitle: 'Este enlace ya no está activo',
  revokedBody: 'El taller desactivó este enlace. Pídale uno nuevo.',
  expiredTitle: 'Este enlace venció',
  expiredBody: 'Los reportes quedan disponibles 90 días después de la entrega. Si necesita el suyo, comuníquese con el taller.',
  order: 'Orden',
  status: {
    recepcion: 'Recibido',
    en_proceso: 'En proceso',
    espera_repuestos: 'Esperando repuestos',
    finalizado: 'Listo para recoger',
    entregado: 'Entregado',
  },
  statusHint: {
    recepcion: 'Su vehículo está en el taller y pronto comenzará el trabajo.',
    en_proceso: 'Estamos trabajando en su vehículo.',
    espera_repuestos: 'El trabajo está en pausa mientras llegan las piezas.',
    finalizado: 'El trabajo terminó. Ya puede pasar a recogerlo.',
    entregado: 'Su vehículo fue entregado. Gracias por su confianza.',
  },
  steps: {
    received: 'Recibido',
    working: 'En proceso',
    ready: 'Listo',
    delivered: 'Entregado',
  },
  progress: 'Avance',
  estimatedDelivery: 'Entrega estimada',
  vehicle: 'Vehículo',
  plate: 'Placa',
  noPlate: 'Sin placa',
  vinEnding: 'VIN termina en',
  receptionTitle: 'Recepción del vehículo',
  receivedOn: 'Ingresó',
  mileage: 'Millaje',
  fuel: 'Gasolina',
  receptionNotes: 'Observaciones',
  signature: 'Firma del cliente',
  signedOn: 'Firmado',
  progressTitle: 'Avances del trabajo',
  noProgressMedia: 'Cuando el taller comparta fotos o videos del trabajo, aparecerán aquí.',
  noReceptionMedia: 'Sin fotos de recepción.',
  voiceNote: 'Nota de voz',
  photo: 'Foto',
  video: 'Video',
  close: 'Cerrar',
  previous: 'Anterior',
  next: 'Siguiente',
  mediaExpired: 'Las imágenes caducaron. Actualizando…',
  accountTitle: 'Su cuenta',
  labor: 'Mano de obra',
  parts: 'Repuestos',
  quantityShort: 'Cant.',
  total: 'Total',
  deposit: 'Depósito',
  paid: 'Pagado',
  balance: 'Saldo pendiente',
  paidInFull: 'Pagado en su totalidad',
  noCharges: 'El taller todavía no registró cargos en esta orden.',
  contactTitle: 'Contacto',
  call: 'Llamar',
  whatsapp: 'WhatsApp',
  whatsappMessage: 'Hola, le escribo por la orden {numero}.',
  writeEmail: 'Escribir un correo',
  emailsTitle: 'Avisos por correo',
  emailsOn: 'Le avisamos por correo cuando su vehículo cambia de estado.',
  emailsOff: 'No le enviamos correos sobre esta orden.',
  emailsStop: 'Dejar de recibir correos',
  emailsStart: 'Volver a recibir correos',
  emailsStopConfirm: '¿Quiere dejar de recibir los avisos por correo? Puede volver a activarlos aquí mismo.',
  emailsSaved: 'Preferencia guardada.',
  emailsError: 'No se pudo guardar. Intente de nuevo.',
  unsubscribeHint: 'Llegó desde el enlace de baja del correo. Confirme con el botón:',
  privateLink: 'Este enlace es personal. No lo comparta.',
  expiresOn: 'Disponible hasta el {fecha}.',
  language: 'English',
  fuelLevels: { E: 'Vacío', '1/4': '1/4', '1/2': '1/2', '3/4': '3/4', F: 'Lleno' } as Record<string, string>,
};

type PortalStrings = typeof es;

const en: PortalStrings = {
  loading: 'Loading your report…',
  loadError: 'We could not load the report. Check your connection and try again.',
  retry: 'Try again',
  notFoundTitle: 'Invalid link',
  notFoundBody: 'Make sure the link is complete. If you copied it from a message, it may have been cut off.',
  revokedTitle: 'This link is no longer active',
  revokedBody: 'The shop turned this link off. Ask them for a new one.',
  expiredTitle: 'This link has expired',
  expiredBody: 'Reports stay available for 90 days after pickup. If you need yours, contact the shop.',
  order: 'Order',
  status: {
    recepcion: 'Checked in',
    en_proceso: 'In progress',
    espera_repuestos: 'Waiting for parts',
    finalizado: 'Ready for pickup',
    entregado: 'Picked up',
  },
  statusHint: {
    recepcion: 'Your vehicle is at the shop and work will start soon.',
    en_proceso: 'We are working on your vehicle.',
    espera_repuestos: 'Work is paused while we wait for parts.',
    finalizado: 'The work is done. You can pick up your vehicle.',
    entregado: 'Your vehicle was picked up. Thank you for your trust.',
  },
  steps: {
    received: 'Checked in',
    working: 'In progress',
    ready: 'Ready',
    delivered: 'Picked up',
  },
  progress: 'Progress',
  estimatedDelivery: 'Estimated completion',
  vehicle: 'Vehicle',
  plate: 'Plate',
  noPlate: 'No plate',
  vinEnding: 'VIN ending in',
  receptionTitle: 'Vehicle check-in',
  receivedOn: 'Checked in',
  mileage: 'Mileage',
  fuel: 'Fuel',
  receptionNotes: 'Notes',
  signature: 'Customer signature',
  signedOn: 'Signed',
  progressTitle: 'Work updates',
  noProgressMedia: 'Photos and videos of the work will appear here when the shop shares them.',
  noReceptionMedia: 'No check-in photos.',
  voiceNote: 'Voice note',
  photo: 'Photo',
  video: 'Video',
  close: 'Close',
  previous: 'Previous',
  next: 'Next',
  mediaExpired: 'The images expired. Refreshing…',
  accountTitle: 'Your account',
  labor: 'Labor',
  parts: 'Parts',
  quantityShort: 'Qty',
  total: 'Total',
  deposit: 'Deposit',
  paid: 'Paid',
  balance: 'Balance due',
  paidInFull: 'Paid in full',
  noCharges: 'The shop has not added charges to this order yet.',
  contactTitle: 'Contact',
  call: 'Call',
  whatsapp: 'WhatsApp',
  whatsappMessage: 'Hi, I am writing about order {numero}.',
  writeEmail: 'Send an email',
  emailsTitle: 'Email updates',
  emailsOn: 'We email you when your vehicle changes status.',
  emailsOff: 'We do not send you emails about this order.',
  emailsStop: 'Stop email updates',
  emailsStart: 'Turn email updates back on',
  emailsStopConfirm: 'Stop receiving email updates? You can turn them back on right here.',
  emailsSaved: 'Preference saved.',
  emailsError: 'Could not save. Please try again.',
  unsubscribeHint: 'You came from the unsubscribe link in the email. Confirm with the button:',
  privateLink: 'This link is personal. Do not share it.',
  expiresOn: 'Available until {fecha}.',
  language: 'Español',
  fuelLevels: { E: 'Empty', '1/4': '1/4', '1/2': '1/2', '3/4': '3/4', F: 'Full' },
};

export const portalStrings: Record<PortalLanguage, PortalStrings> = { es, en };

const STORAGE_KEY = 'restorify_portal_lang';

/** Lo que eligió antes; si no, el idioma del teléfono; español por defecto. */
export function initialPortalLanguage(): PortalLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    // Almacenamiento bloqueado (modo privado de algunos navegadores).
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return /^en\b/i.test(nav) ? 'en' : 'es';
}

export function savePortalLanguage(language: PortalLanguage) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Sin almacenamiento, la elección dura lo que dure la página.
  }
}
