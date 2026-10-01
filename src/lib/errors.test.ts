import { describe, it, expect } from 'vitest';
import { getAuthErrorMessage, getErrorMessage, getRecoveryErrorMessage } from './errors';

describe('getRecoveryErrorMessage', () => {
  // Así respondía Auth con el puerto del SMTP mal escrito: 30 s de espera y un 504
  // sin código. La pantalla decía "No se pudo iniciar sesión", que no era el problema.
  it('un fallo del envío del correo no se presenta como un problema de inicio de sesión', () => {
    const timeout = { name: 'AuthRetryableFetchError', status: 504, message: 'upstream request timeout' };
    expect(getRecoveryErrorMessage(timeout, 'es')).toMatch(/No se pudo enviar el correo de recuperación/);
    expect(getRecoveryErrorMessage(timeout, 'en')).toMatch(/recovery email could not be sent/);
    expect(getAuthErrorMessage(timeout, 'es')).toMatch(/No se pudo iniciar sesión/);
  });

  it('sin red dice que revise la conexión', () => {
    expect(getRecoveryErrorMessage(new TypeError('Failed to fetch'), 'es')).toMatch(/Revisa tu conexión/);
  });

  it('los errores conocidos de Auth conservan su mensaje', () => {
    expect(getRecoveryErrorMessage({ code: 'over_email_send_rate_limit' }, 'es')).toMatch(/Ya se envió un correo hace poco/);
  });
});

describe('getErrorMessage', () => {
  it('translates a foreign key violation to a friendly Spanish message', () => {
    const msg = getErrorMessage({ code: '23503', message: 'raw pg error' }, 'es');
    expect(msg).toContain('relacionado con otros datos');
  });

  it('translates a foreign key violation to a friendly English message', () => {
    const msg = getErrorMessage({ code: '23503', message: 'raw pg error' }, 'en');
    expect(msg).toContain('linked to other data');
  });

  it('translates a unique constraint violation', () => {
    const msg = getErrorMessage({ code: '23505' }, 'es');
    expect(msg).toContain('Ya existe un registro');
  });

  it('muestra la razón que da la base en un 42501 propio, y el genérico en uno de RLS', () => {
    const own = { code: '42501', message: 'La orden ya fue entregada. Sólo un administrador puede modificarla.' };
    expect(getErrorMessage(own, 'es')).toBe(own.message);
    expect(getErrorMessage(own, 'en')).toBe("You don't have permission to perform this action.");
    const rls = { code: '42501', message: 'new row violates row-level security policy for table "orden_labor"' };
    expect(getErrorMessage(rls, 'es')).toBe('No tienes permiso para realizar esta acción.');
  });

  it('traduce un CHECK violado (monto negativo)', () => {
    expect(getErrorMessage({ code: '23514', message: 'violates check constraint' }, 'es')).toMatch(/monto negativo/);
  });

  it('falls back to the raw message when the code is unrecognized', () => {
    const msg = getErrorMessage({ code: '99999', message: 'something specific broke' }, 'es');
    expect(msg).toBe('something specific broke');
  });

  it('falls back to a generic message when there is no code or message', () => {
    expect(getErrorMessage({}, 'es')).toBe('Ocurrió un error inesperado.');
    expect(getErrorMessage({}, 'en')).toBe('An unexpected error occurred.');
  });

  it('handles a plain Error instance', () => {
    expect(getErrorMessage(new Error('boom'), 'es')).toBe('boom');
  });
});
