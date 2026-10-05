import { money } from '../../lib/money';
import type { HistoryChange, OrderHistoryEntry } from '../../types/database';
import { ZONES } from './useIntakePhotos';

/** Una fila del historial lista para leer: quién, qué hizo y el detalle de lo que cambió. */
export interface HistoryItem {
  id: number;
  at: string;
  actor: string;
  action: string;
  details: string[];
}

interface Ctx {
  t: (key: string) => string;
  statusLabels: Record<string, string>;
  language: string;
}

const MONEY_FIELDS = new Set([
  'costo', 'precio_venta_unitario', 'costo_unitario', 'deposito_inicial', 'descuento', 'total_propuesto', 'total_aprobado',
]);
const SPECIALTY_KEY: Record<string, string> = {
  mecanica: 'workOrders.mechanical',
  pintura: 'workOrders.painting',
  combinado: 'workOrders.combined',
};
/** Lo que al crear una fila ya dice la acción o no le importa a quien lee. */
const SKIP_ON_CREATE = new Set([
  'descripcion', 'estado', 'tipo', 'origen', 'zona', 'cliente_id', 'vehiculo_id', 'visible_cliente', 'respondido_via',
]);

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === '';
}

/** "2026-10-10" como fecha local, sin el corrimiento de zona horaria de `new Date('AAAA-MM-DD')`. */
function formatDay(value: string, language: string) {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });
}

function quote(value: unknown) {
  const text = String(value).trim();
  return `«${text.length > 80 ? `${text.slice(0, 80)}…` : text}»`;
}

function formatValue(entry: OrderHistoryEntry, field: string, value: unknown, ctx: Ctx): string {
  const { t } = ctx;
  // El técnico de una tarea llega por nombre (20261010000006). Vacío no es "—": es una tarea
  // sin técnico, y eso es lo que importa leer ("Sin técnico → Ana").
  if (field === 'tecnico') return isEmpty(value) ? t('tasks.noTechnician') : String(value);
  if (isEmpty(value)) return '—';
  if (MONEY_FIELDS.has(field)) return money(value as number);
  switch (field) {
    case 'estatus':
      return ctx.statusLabels[String(value)] ?? String(value);
    case 'estado':
      return entry.entidad === 'presupuesto' ? t(`history.quoteState.${value}`) : t(`quotes.lineState.${value}`);
    case 'porcentaje_avance':
      return `${value} %`;
    case 'especialidad':
    case 'tipo_tarea':
    case 'tipo_trabajo':
      return SPECIALTY_KEY[String(value)] ? t(SPECIALTY_KEY[String(value)]) : String(value);
    case 'fecha_estimada_entrega':
      return formatDay(String(value), ctx.language);
    case 'respondido_via':
      return t(`quotes.responseVia.${value}`);
    // Pedido → llegó (20261010000017). Vacío ya salió arriba como "—".
    case 'estado_pedido':
      return value === 'recibido' ? t('parts.received') : t('parts.ordered');
    case 'descripcion':
    case 'inspeccion_360_notas':
    case 'motivo_autorizacion':
    case 'descuento_motivo':
      return quote(value);
    default:
      return String(value);
  }
}

/**
 * Cambios que se leen mejor como una frase que como "antes → después": marcar hecha, firmar,
 * archivar, publicar. Devuelve null si el campo no es uno de esos.
 */
function describeToggle(field: string, change: HistoryChange, t: Ctx['t']): string | null {
  const before = !isEmpty(change.antes);
  const after = !isEmpty(change.despues);
  switch (field) {
    case 'completado_en':
      return t(after ? 'history.value.done' : 'history.value.reopened');
    case 'firma_fecha':
      return t(after ? (before ? 'history.value.resigned' : 'history.value.signed') : 'history.value.unsigned');
    case 'archivada_en':
      return t(after ? 'history.value.archived' : 'history.value.unarchived');
    case 'visible_cliente':
      return t(change.despues === true ? 'history.value.shown' : 'history.value.hidden');
    case 'cliente_id':
    case 'vehiculo_id':
      return t(`history.value.${field === 'cliente_id' ? 'customerChanged' : 'vehicleChanged'}`);
    // Si la persona entra al reparto por especialidad de los trabajos anteriores (origen 'manual'
    // de su asignación) o cobra solo sus tareas (20261010000006).
    case 'reparto':
      return t(change.despues === true ? 'history.value.joinedSplit' : 'history.value.leftSplit');
    // Se cerró sin hacer el trabajo, o se reabrió (20261010000017).
    case 'retirada_sin_reparar':
      return t(change.despues === true ? 'history.value.withdrawn' : 'history.value.unwithdrawn');
    default:
      return null;
  }
}

/** "Foto (recepción, Frontal)" a partir del resumen que guarda el trigger ("foto · recepcion · front"). */
function fileLabel(entry: OrderHistoryEntry, t: Ctx['t']) {
  const [tipo, origen, zona] = (entry.resumen ?? '').split(' · ');
  const kind = tipo ? t(`media.kind.${tipo}`) : t('history.file');
  const where = [
    origen ? t(`history.origin.${origen}`) : '',
    zona ? (ZONES.find((z) => z.key === zona)?.label ?? zona) : '',
  ].filter(Boolean);
  return where.length ? `${kind} (${where.join(', ')})` : kind;
}

function subject(entry: OrderHistoryEntry, t: Ctx['t']) {
  if (entry.entidad === 'archivo') return fileLabel(entry, t);
  return entry.resumen ?? '';
}

function actorName(entry: OrderHistoryEntry, t: Ctx['t']) {
  if (entry.origen === 'portal') return t('history.actor.portal');
  if (entry.origen === 'sistema') return t('history.actor.system');
  return entry.actor_nombre || t('history.actor.unknown');
}

export function describeHistoryEntry(entry: OrderHistoryEntry, ctx: Ctx): HistoryItem {
  const { t } = ctx;
  const action = t(`history.action.${entry.entidad}.${entry.accion}`).replace('{x}', subject(entry, t));

  const details: string[] = [];
  if (entry.accion !== 'borrar' && !(entry.entidad === 'orden' && entry.accion === 'crear')) {
    for (const [field, change] of Object.entries(entry.cambios ?? {})) {
      if (entry.accion === 'crear' && SKIP_ON_CREATE.has(field)) continue;
      // Al asignar a alguien, entrar al reparto es lo de siempre: solo se dice lo distinto, que
      // entró a la orden por una tarea.
      if (field === 'reparto' && entry.accion === 'crear') {
        if (change.despues === false) details.push(t('history.value.byTask'));
        continue;
      }
      const toggle = describeToggle(field, change, t);
      if (toggle) {
        details.push(toggle);
        continue;
      }
      const label = t(`history.field.${field}`);
      details.push(
        entry.accion === 'crear'
          ? `${label}: ${formatValue(entry, field, change.despues, ctx)}`
          : `${label}: ${formatValue(entry, field, change.antes, ctx)} → ${formatValue(entry, field, change.despues, ctx)}`
      );
    }
  }

  return { id: entry.id, at: entry.ocurrido_en, actor: actorName(entry, t), action, details };
}
