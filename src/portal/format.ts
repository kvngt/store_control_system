import { useMemo } from 'react';
import type { PortalLanguage, portalStrings } from './strings';

export type PortalStrings = (typeof portalStrings)['es'];

/** Una columna DATE ('2026-10-01') a mediodía UTC, para que no retroceda un día en EE. UU. */
export function toDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

export function useFormatters(language: PortalLanguage) {
  return useMemo(() => {
    const locale = language === 'es' ? 'es-US' : 'en-US';
    const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const dateTime = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
    const number = new Intl.NumberFormat(locale);
    return {
      date: (v: string | null | undefined) => (v ? date.format(toDate(v)) : '—'),
      dateTime: (v: string | null | undefined) => (v ? dateTime.format(new Date(v)) : '—'),
      money: (v: number | null | undefined) => money.format(Number(v ?? 0)),
      number: (v: number | null | undefined) => (v == null ? '—' : number.format(v)),
    };
  }, [language]);
}

export type Formatters = ReturnType<typeof useFormatters>;
