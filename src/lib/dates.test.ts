// Corre deliberadamente en una zona al oeste de UTC.
//
// El defecto que estas pruebas fijan es invisible en UTC: `new Date('2026-09-01')`
// es medianoche UTC, y en UTC `getMonth()` devuelve septiembre, así que una
// suite que corre en UTC — como la de un CI por defecto — habría dado el visto
// bueno a la implementación rota. El taller está en Estados Unidos, y ahí es
// donde el día 1 de cada mes se contaba en el mes anterior.
//
// Se asigna antes de importar el módulo para que las fechas que se construyan
// dentro ya vean la zona.
//
// `process` se declara aquí en vez de añadir `@types/node` a `tsconfig.app.json`:
// el resto de la app corre en el navegador y no debería tener el ámbito de Node
// a mano sólo porque una prueba necesita una variable de entorno.
declare const process: { env: Record<string, string | undefined> };
process.env.TZ = 'America/Chicago';

import { describe, it, expect } from 'vitest';
import { isSameMonth, todayLocal } from './dates';

describe('isSameMonth', () => {
  // La premisa. Si esto falla, el proceso no tomó la zona y el resto de las
  // pruebas de este archivo no estarían comprobando nada.
  it('corre en una zona al oeste de UTC, que es donde el bug existe', () => {
    expect(new Date('2026-09-01').getMonth()).toBe(7); // agosto, en local
    expect(new Date('2026-09-01').getUTCMonth()).toBe(8); // septiembre, en UTC
  });

  it('lee una columna DATE por sus componentes, sin zona horaria de por medio', () => {
    // El caso exacto que se reportaba mal: un carro entregado el día 1.
    expect(isSameMonth('2026-09-01', new Date(2026, 8, 15))).toBe(true);
    expect(isSameMonth('2026-09-01', new Date(2026, 7, 15))).toBe(false);
  });

  it('acierta el último día del mes, que es el otro extremo', () => {
    expect(isSameMonth('2026-09-30', new Date(2026, 8, 1))).toBe(true);
    expect(isSameMonth('2026-09-30', new Date(2026, 9, 1))).toBe(false);
  });

  it('distingue el mismo mes de años distintos', () => {
    expect(isSameMonth('2025-09-15', new Date(2026, 8, 15))).toBe(false);
  });

  it('compara un TIMESTAMPTZ como el instante real que es', () => {
    // `fecha_finalizacion` y `creado_en` sí llevan hora y desplazamiento, así
    // que se comparan en la hora local del taller y no por componentes.
    expect(isSameMonth('2026-09-15T14:03:00+00:00', new Date(2026, 8, 20))).toBe(true);

    // Medianoche UTC del 1 de septiembre es, en Chicago, el 31 de agosto: para
    // un instante con zona eso es correcto y no hay nada que corregir.
    expect(isSameMonth('2026-09-01T00:00:00+00:00', new Date(2026, 7, 15))).toBe(true);
  });

  it('no revienta con una cadena vacía o inválida', () => {
    expect(isSameMonth('', new Date())).toBe(false);
    expect(isSameMonth('no es una fecha', new Date())).toBe(false);
  });
});

describe('todayLocal', () => {
  it('devuelve el día local, no el día UTC', () => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    expect(todayLocal()).toBe(expected);
  });

  it('da una fecha que isSameMonth ubica en el mes corriente', () => {
    // La pareja que importa: el valor por defecto de los formularios de dinero
    // tiene que caer en el mes que los KPI van a contar. Con
    // `toISOString().split('T')[0]`, un movimiento capturado a las 8 de la noche
    // llevaba la fecha de mañana — y el último día del mes, la del mes siguiente.
    expect(isSameMonth(todayLocal(), new Date())).toBe(true);
  });
});
