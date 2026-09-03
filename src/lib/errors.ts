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

// Supabase Auth returns its own English strings ("Invalid login credentials"),
// which used to reach the login screen untranslated — an English sentence in an
// otherwise Spanish UI, and one that says nothing useful to shop staff. Newer
// SDK versions carry a stable `code`; older ones only have the message, so both
// are matched.
const AUTH_BY_CODE: Record<string, Record<Language, string>> = {
  invalid_credentials: {
    es: 'Correo o contraseña incorrectos. Revísalos e intenta de nuevo.',
    en: 'Wrong email or password. Check them and try again.',
  },
  email_not_confirmed: {
    es: 'Tu correo aún no está confirmado. Pide a un administrador que lo active.',
    en: 'Your email is not confirmed yet. Ask an administrator to activate it.',
  },
  user_not_found: {
    es: 'No existe una cuenta con ese correo.',
    en: 'There is no account with that email.',
  },
  over_request_rate_limit: {
    es: 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.',
    en: 'Too many attempts in a row. Wait a minute and try again.',
  },
  same_password: {
    es: 'La contraseña nueva debe ser distinta de la actual.',
    en: 'The new password must be different from the current one.',
  },
  weak_password: {
    es: 'La contraseña es demasiado débil. Usa al menos 6 caracteres.',
    en: 'That password is too weak. Use at least 6 characters.',
  },
};

// Fallback for SDK versions that don't set `code`: match on the English text.
const AUTH_BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, 'invalid_credentials'],
  [/email not confirmed/i, 'email_not_confirmed'],
  [/user not found/i, 'user_not_found'],
  [/too many requests|rate limit/i, 'over_request_rate_limit'],
  [/should be different from the old password/i, 'same_password'],
  [/password should be at least|weak password/i, 'weak_password'],
];

/**
 * Friendly message for a Supabase Auth failure. Falls back to a generic line
 * rather than the raw English one — an untranslated backend string on the login
 * screen reads as a bug to the person trying to get in.
 */
export function getAuthErrorMessage(err: unknown, language: Language): string {
  const e = err as ErrorLike;

  const byCode = e?.code ? AUTH_BY_CODE[e.code] : undefined;
  if (byCode) return byCode[language];

  const message = e?.message || '';
  for (const [pattern, key] of AUTH_BY_MESSAGE) {
    if (pattern.test(message)) return AUTH_BY_CODE[key][language];
  }

  return language === 'es'
    ? 'No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.'
    : 'Could not sign in. Check your connection and try again.';
}

export function getErrorMessage(err: unknown, language: Language): string {
  const e = err as ErrorLike;
  const friendly = e?.code ? FRIENDLY_BY_CODE[e.code] : undefined;
  if (friendly) return friendly[language];
  return e?.message || (language === 'es' ? 'Ocurrió un error inesperado.' : 'An unexpected error occurred.');
}
