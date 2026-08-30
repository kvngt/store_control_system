import type { Language } from '../i18n/translations';

// Supabase/PostgREST errors carry a Postgres error `code` (unique violation,
// foreign key violation, etc.) that's meaningless to shop staff. This maps the
// common ones to a friendly bilingual message instead of showing raw SQL errors.
const FRIENDLY_BY_CODE: Record<string, Record<Language, string>> = {
  '23503': {
    es: 'No se puede completar la acción porque este registro está relacionado con otros datos (por ejemplo, órdenes o vehículos existentes). Elimina o reasigna esas referencias primero.',
    en: "This can't be completed because this record is linked to other data (e.g. existing orders or vehicles). Remove or reassign those first.",
  },
  '23505': {
    es: 'Ya existe un registro con ese mismo valor único (correo, VIN, número de orden, etc.). Verifica los datos e intenta de nuevo.',
    en: 'A record with that same unique value already exists (email, VIN, order number, etc.). Check the data and try again.',
  },
  '23502': {
    es: 'Falta completar un campo obligatorio. Revisa el formulario e intenta de nuevo.',
    en: 'A required field is missing. Check the form and try again.',
  },
  '42501': {
    es: 'No tienes permiso para realizar esta acción.',
    en: "You don't have permission to perform this action.",
  },
  PGRST116: {
    es: 'No se encontró el registro solicitado.',
    en: 'The requested record was not found.',
  },
};

interface ErrorLike {
  code?: string;
  message?: string;
}

export function getErrorMessage(err: unknown, language: Language): string {
  const e = err as ErrorLike;
  const friendly = e?.code ? FRIENDLY_BY_CODE[e.code] : undefined;
  if (friendly) return friendly[language];
  return e?.message || (language === 'es' ? 'Ocurrió un error inesperado.' : 'An unexpected error occurred.');
}
