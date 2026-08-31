import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errors';

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
