/**
 * Semáforo del próximo servicio en la página pública /s/<código>.
 *
 * - al_dia: verde, faltan más de 14 días;
 * - pronto: ámbar, faltan 14 días o menos;
 * - vencido: rojo, la fecha ya pasó;
 * - solo_millas: sin semáforo (cuando no hay fecha y solo hay millas).
 */

export type ServiceTrafficStatus = 'al_dia' | 'pronto' | 'vencido' | 'solo_millas';

export interface ServiceStatusResult {
  estado: ServiceTrafficStatus;
  diasRestantes: number | null;
}

export function computeServiceStatus(
  fecha: string | null | undefined,
  hoy: string
): ServiceStatusResult {
  if (!fecha) {
    return { estado: 'solo_millas', diasRestantes: null };
  }

  const [y1, m1, d1] = fecha.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = hoy.slice(0, 10).split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) {
    return { estado: 'solo_millas', diasRestantes: null };
  }

  const utcFecha = Date.UTC(y1, m1 - 1, d1);
  const utcToday = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.round((utcFecha - utcToday) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) {
    return { estado: 'vencido', diasRestantes: diffDays };
  }
  if (diffDays <= 14) {
    return { estado: 'pronto', diasRestantes: diffDays };
  }
  return { estado: 'al_dia', diasRestantes: diffDays };
}
