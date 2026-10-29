import { describe, expect, it } from 'vitest';
import { clockLabel, hoursRows, shopClock, shopStatusAt, statusLabel } from './hours';

// Fechas en UTC: Maryland es UTC−4 en horario de verano y UTC−5 en invierno.
const at = (iso: string) => new Date(iso);

describe('shopClock', () => {
  it('reads the time in Maryland, not in the visitor’s zone', () => {
    // 27/10/2026 03:30 UTC = lunes 26/10 a las 11:30 p. m. en Maryland (verano).
    expect(shopClock(at('2026-10-27T03:30:00Z'))).toEqual({ day: 1, minute: 23 * 60 + 30 });
    // 15/01/2027 14:00 UTC = viernes 9:00 a. m. en Maryland (invierno).
    expect(shopClock(at('2027-01-15T14:00:00Z'))).toEqual({ day: 5, minute: 9 * 60 });
  });
});

describe('shopStatusAt', () => {
  it('is open on a weekday between 9 and 6', () => {
    // Martes 27/10/2026, 10:00 a. m. en Maryland.
    expect(shopStatusAt(at('2026-10-27T14:00:00Z'))).toEqual({ open: true, closes: '18:00' });
  });

  it('closes at 6 on weekdays and at 5 on Saturday', () => {
    // Martes 6:00 p. m. en punto: cerrado, abre mañana.
    expect(shopStatusAt(at('2026-10-27T22:00:00Z'))).toMatchObject({ open: false, inDays: 1, opens: '09:00' });
    // Sábado 31/10/2026, 4:59 p. m.: abierto hasta las 5.
    expect(shopStatusAt(at('2026-10-31T20:59:00Z'))).toEqual({ open: true, closes: '17:00' });
  });

  it('before opening says it opens today', () => {
    // Miércoles 28/10/2026, 7:30 a. m.
    expect(shopStatusAt(at('2026-10-28T11:30:00Z'))).toMatchObject({ open: false, inDays: 0, opens: '09:00' });
  });

  it('skips Sunday: on Saturday night it opens on Monday', () => {
    // Sábado 31/10/2026, 8:00 p. m. → abre el lunes, dentro de dos días.
    expect(shopStatusAt(at('2026-11-01T00:00:00Z'))).toMatchObject({ open: false, inDays: 2, day: 1 });
    // Domingo 01/11/2026 al mediodía (ya en horario de invierno) → abre mañana.
    expect(shopStatusAt(at('2026-11-01T17:00:00Z'))).toMatchObject({ open: false, inDays: 1, day: 1 });
  });
});

describe('labels', () => {
  it('says the time the way people say it', () => {
    expect(clockLabel('18:00', 'en')).toBe('6 pm');
    expect(clockLabel('09:00', 'es')).toBe('9 a. m.');
    expect(clockLabel('17:30', 'es')).toBe('5:30 p. m.');
  });

  it('reads well in both languages', () => {
    expect(statusLabel({ open: true, closes: '18:00' }, 'en')).toBe('Open now · until 6 pm');
    expect(statusLabel({ open: true, closes: '17:00' }, 'es')).toBe('Abierto · hasta las 5 p. m.');
    expect(statusLabel({ open: false, opens: '09:00', inDays: 2, day: 1 }, 'en')).toBe('Closed · opens Monday at 9 am');
    expect(statusLabel({ open: false, opens: '09:00', inDays: 1, day: 3 }, 'es')).toBe('Cerrado · abre mañana a las 9 a. m.');
    expect(statusLabel({ open: false, opens: '09:00', inDays: 0, day: 3 }, 'es')).toBe('Cerrado · abre hoy a las 9 a. m.');
  });
});

describe('hoursRows', () => {
  const labels = { days: { weekdays: 'Monday to Friday', saturday: 'Saturday', sunday: 'Sunday' }, closed: 'Closed' };

  it('lists the week as the shop says it, Sunday closed', () => {
    expect(hoursRows(labels, 'en')).toEqual([
      { days: 'Monday to Friday', time: '9 am – 6 pm' },
      { days: 'Saturday', time: '9 am – 5 pm' },
      { days: 'Sunday', time: 'Closed' },
    ]);
  });

  it('writes the time in Spanish style', () => {
    expect(hoursRows(labels, 'es')[0].time).toBe('9 a. m. – 6 p. m.');
  });
});
