import type { AppNotification } from '../../types/database';

const money = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
};

/**
 * El texto de un aviso en el idioma de la pantalla.
 *
 * La base redacta cada aviso en español (es lo que viaja por push, donde no se
 * sabe qué idioma prefiere nadie) y guarda aparte sus datos. Aquí se vuelve a
 * redactar con `notifications.types.<tipo>` para quien usa la app en inglés. Si
 * el tipo no tiene traducción — uno nuevo que llegó antes que el frontend — se
 * muestra el texto de la base tal cual.
 */
export function renderNotification(n: AppNotification, t: (key: string) => string): { title: string; body: string } {
  const data = (n.datos || {}) as Record<string, unknown>;

  const fill = (template: string) =>
    template
      .replace(/\{(\w+)\}/g, (_, key: string) => (key === 'monto' ? money(data.monto) : String(data[key] ?? '')))
      // Un dato vacío no debe dejar un separador colgando: "2019 Toyota Camry — ".
      .replace(/\s*—\s*$/, '')
      .replace(/^\s*—\s*/, '')
      .trim();

  const titleKey = `notifications.types.${n.tipo}.title`;
  const bodyKey = `notifications.types.${n.tipo}.body`;
  const titleTemplate = t(titleKey);
  const bodyTemplate = t(bodyKey);

  const title = titleTemplate === titleKey ? n.titulo : fill(titleTemplate) || n.titulo;
  // El avance lleva lo que escribió el técnico: eso no se traduce, se muestra.
  const body = n.tipo === 'avance_tecnico' || bodyTemplate === bodyKey ? n.cuerpo : fill(bodyTemplate);

  return { title, body };
}

/** "hace 5 min" / "5 min ago". */
export function relativeTime(iso: string, language: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(language === 'en' ? 'en' : 'es', { numeric: 'auto', style: 'short' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.round(seconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}
