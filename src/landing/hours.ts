import { SHOP } from './business';
import type { LandingLanguage } from './strings';

// ¿Está abierto el taller ahora? Con la hora de Maryland, no la del teléfono de quien mira (puede
// estar en otro estado o tener mal la zona horaria). No sabe de días feriados: por eso la etiqueta
// dice el horario, no promete que alguien conteste.

const TIME_ZONE = 'America/New_York';

/** Domingo = 0. Sin entrada: cerrado. */
const SCHEDULE: Record<number, readonly [string, string]> = {
  1: SHOP.hours.weekdays,
  2: SHOP.hours.weekdays,
  3: SHOP.hours.weekdays,
  4: SHOP.hours.weekdays,
  5: SHOP.hours.weekdays,
  6: SHOP.hours.saturday,
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type ShopStatus =
  | { open: true; closes: string }
  | { open: false; opens: string; /** 0 = hoy, 1 = mañana, n = dentro de n días. */ inDays: number; day: number };

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Día de la semana y minutos desde la medianoche, en Maryland. */
export function shopClock(date: Date): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: WEEKDAYS.indexOf(get('weekday')), minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function shopStatusAt(date: Date): ShopStatus {
  const { day, minute } = shopClock(date);
  const today = SCHEDULE[day];
  if (today && minute >= minutes(today[0]) && minute < minutes(today[1])) return { open: true, closes: today[1] };
  if (today && minute < minutes(today[0])) return { open: false, opens: today[0], inDays: 0, day };
  for (let inDays = 1; inDays <= 7; inDays++) {
    const next = (day + inDays) % 7;
    if (SCHEDULE[next]) return { open: false, opens: SCHEDULE[next][0], inDays, day: next };
  }
  return { open: false, opens: SHOP.hours.weekdays[0], inDays: 1, day: (day + 1) % 7 };
}

const DAY_NAMES: Record<LandingLanguage, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
};

/** "6 pm" / "6 p. m.", sin ":00". */
export function clockLabel(hhmm: string, language: LandingLanguage): string {
  const [h, m] = [Number(hhmm.slice(0, 2)), hhmm.slice(3, 5)];
  const hour = h % 12 || 12;
  const time = m === '00' ? `${hour}` : `${hour}:${m}`;
  if (language === 'es') return `${time} ${h < 12 ? 'a. m.' : 'p. m.'}`;
  return `${time} ${h < 12 ? 'am' : 'pm'}`;
}

/** Las filas de la tabla de horario, desde `SHOP.hours` (no escritas a mano en los textos). */
export function hoursRows(
  labels: { days: { weekdays: string; saturday: string; sunday: string }; closed: string },
  language: LandingLanguage,
): Array<{ days: string; time: string }> {
  const range = ([open, close]: readonly [string, string]) => `${clockLabel(open, language)} – ${clockLabel(close, language)}`;
  return [
    { days: labels.days.weekdays, time: range(SHOP.hours.weekdays) },
    { days: labels.days.saturday, time: range(SHOP.hours.saturday) },
    { days: labels.days.sunday, time: labels.closed },
  ];
}

export function statusLabel(status: ShopStatus, language: LandingLanguage): string {
  if (status.open) {
    return language === 'es'
      ? `Abierto · hasta las ${clockLabel(status.closes, 'es')}`
      : `Open now · until ${clockLabel(status.closes, 'en')}`;
  }
  const time = clockLabel(status.opens, language);
  if (language === 'es') {
    const when = status.inDays === 0 ? 'hoy' : status.inDays === 1 ? 'mañana' : `el ${DAY_NAMES.es[status.day]}`;
    return `Cerrado · abre ${when} a las ${time}`;
  }
  const when = status.inDays === 0 ? 'today' : status.inDays === 1 ? 'tomorrow' : DAY_NAMES.en[status.day];
  return `Closed · opens ${when} at ${time}`;
}
