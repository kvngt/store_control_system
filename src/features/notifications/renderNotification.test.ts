import { describe, it, expect } from 'vitest';
import { getTranslation } from '../../i18n/translations';
import type { AppNotification } from '../../types/database';
import { relativeTime, renderNotification } from './renderNotification';

const es = (key: string) => getTranslation('es', key);
const en = (key: string) => getTranslation('en', key);

function notification(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: 'n-1',
    usuario_id: 'u-1',
    sede_id: 's-1',
    tipo: 'asignacion',
    titulo: 'Nueva orden asignada · ORD-2026-014',
    cuerpo: '2019 Toyota Camry — Marta Ruiz',
    datos: { numero_orden: 'ORD-2026-014', vehiculo: '2019 Toyota Camry', cliente: 'Marta Ruiz' },
    orden_id: 'o-1',
    url: '/work-orders?open=o-1',
    leida_en: null,
    creado_en: '2026-09-12T10:00:00Z',
    ...overrides,
  };
}

describe('renderNotification', () => {
  it('redacta el aviso en el idioma de la pantalla con los datos guardados', () => {
    expect(renderNotification(notification({}), en)).toEqual({
      title: 'New order assigned · ORD-2026-014',
      body: '2019 Toyota Camry — Marta Ruiz',
    });
    expect(renderNotification(notification({}), es).title).toBe('Nueva orden asignada · ORD-2026-014');
  });

  it('no deja un separador colgando cuando falta un dato', () => {
    const n = notification({ datos: { numero_orden: 'ORD-2026-014', vehiculo: '2019 Toyota Camry', cliente: '' } });
    expect(renderNotification(n, es).body).toBe('2019 Toyota Camry');
  });

  it('formatea el monto de una comisión', () => {
    const n = notification({
      tipo: 'comision_generada',
      datos: { numero_orden: 'ORD-2026-014', vehiculo: '2019 Toyota Camry', monto: 175 },
    });
    expect(renderNotification(n, en).body).toBe('$175.00 for the labor on 2019 Toyota Camry');
  });

  it('muestra tal cual lo que escribió el técnico en un avance', () => {
    const n = notification({ tipo: 'avance_tecnico', cuerpo: 'Luis Ramos: cambié las pastillas delanteras' });
    expect(renderNotification(n, en)).toEqual({
      title: 'New progress update · ORD-2026-014',
      body: 'Luis Ramos: cambié las pastillas delanteras',
    });
  });

  it('usa el texto de la base para un tipo que el frontend todavía no conoce', () => {
    const n = notification({ tipo: 'presupuesto_aprobado', titulo: 'Trabajo autorizado · ORD-2026-014', cuerpo: 'Puedes continuar' });
    expect(renderNotification(n, en)).toEqual({ title: 'Trabajo autorizado · ORD-2026-014', body: 'Puedes continuar' });
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-09-12T10:10:00Z').getTime();

  it('dice cuánto hace en minutos, horas o días', () => {
    expect(relativeTime('2026-09-12T10:05:00Z', 'en', now)).toMatch(/5 min/);
    expect(relativeTime('2026-09-12T07:10:00Z', 'es', now)).toMatch(/3 h/);
    expect(relativeTime('2026-09-10T10:10:00Z', 'en', now)).toMatch(/2 days ago/);
  });
});
