import { describe, expect, it } from 'vitest';
import { afterLoginPath, STAFF_HOME } from './staffHome';

describe('afterLoginPath', () => {
  it('vuelve a la orden que se quería abrir', () => {
    expect(afterLoginPath({ from: '/work-orders?open=abc&tab=tareas' })).toBe('/work-orders?open=abc&tab=tareas');
  });

  it('sin dirección guardada, o con una que no es de la app, va al panel', () => {
    expect(afterLoginPath(null)).toBe(STAFF_HOME);
    expect(afterLoginPath({})).toBe(STAFF_HOME);
    expect(afterLoginPath({ from: 'https://otro.sitio' })).toBe(STAFF_HOME);
    expect(afterLoginPath({ from: '//otro.sitio/x' })).toBe(STAFF_HOME);
    expect(afterLoginPath({ from: '/login' })).toBe(STAFF_HOME);
  });
});
