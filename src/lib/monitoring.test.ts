import { describe, it, expect } from 'vitest';
import { isExpectedFailure, monitoringEnabled, openProblemReport, reportError } from './monitoring';

// Qué llega a Sentry desde la caché de consultas: solo lo inesperado. Lo que ya tiene su
// mensaje en pantalla (una fila que no existe, un permiso, una regla de la base, la red del
// taller) llenaría Sentry de ruido y escondería los errores de verdad.
describe('isExpectedFailure', () => {
  it.each([
    ['fila inexistente', { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }],
    ['permiso negado', { code: '42501', message: 'La orden ya fue entregada.' }],
    ['regla de la base', { code: '23514', message: 'violates check constraint' }],
    ['duplicado', { code: '23505', message: 'duplicate key' }],
    ['excepción del taller', { code: 'P0001', message: 'Pagar otra vez las mismas comisiones' }],
    ['red caída (Chrome)', new TypeError('Failed to fetch')],
    ['red caída (Safari)', new TypeError('Load failed')],
  ])('%s no se reporta', (_caso, error) => {
    expect(isExpectedFailure(error)).toBe(true);
  });

  it.each([
    ['una función que la base no tiene', { code: '42883', message: 'function public.x() does not exist' }],
    ['un 500 de la API', { code: 'PGRST000', message: 'Could not connect' }],
    ['un error del código', new TypeError("Cannot read properties of undefined (reading 'id')")],
  ])('%s sí se reporta', (_caso, error) => {
    expect(isExpectedFailure(error)).toBe(false);
  });
});

describe('sin DSN', () => {
  it('no hace nada ni abre el formulario', async () => {
    expect(monitoringEnabled).toBe(false);
    expect(() => reportError(new Error('x'))).not.toThrow();
    await expect(openProblemReport({} as never)).resolves.toBe(false);
  });
});
