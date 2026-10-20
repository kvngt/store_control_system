import { emptyWorkOrderForm, type WorkOrderFormValues } from './workOrderForm.schema';

/**
 * El borrador del alta de una orden.
 *
 * Alguien que llena una orden y toca «atrás» en Android (o a quien el sistema le descarta la pestaña
 * mientras habla por teléfono) perdía todo lo capturado. El formulario se guarda solo, en este
 * dispositivo y para esta persona, y al abrir «Nueva orden» se ofrece retomarlo. Lo que no cabe en un
 * borrador: las fotos, los videos y la foto del comprobante (son archivos); el diálogo lo dice.
 *
 * Es información de una sesión: `clearAllIntakeDrafts` lo borra al cerrar sesión (docs/ai-context.md,
 * regla 8c). Va con el id de la persona, así que otra persona en el mismo teléfono no lo ve.
 */
const PREFIX = 'restorify_intake_draft:';
const VERSION = 1;

export interface IntakeDraft {
  v: number;
  savedAt: string;
  /** El paso del alta en el que se quedó. */
  step: number;
  values: WorkOrderFormValues;
}

const key = (userId: string) => `${PREFIX}${userId}`;

/** ¿Es el formulario vacío de siempre? Entonces no hay nada que guardar. */
function isBlank(values: WorkOrderFormValues): boolean {
  return JSON.stringify(values) === JSON.stringify(emptyWorkOrderForm());
}

export function saveIntakeDraft(userId: string, values: WorkOrderFormValues, step: number): void {
  try {
    if (isBlank(values)) {
      localStorage.removeItem(key(userId));
      return;
    }
    const draft: IntakeDraft = { v: VERSION, savedAt: new Date().toISOString(), step, values };
    localStorage.setItem(key(userId), JSON.stringify(draft));
  } catch {
    // Sin almacenamiento (modo privado, lleno): el borrador es una ayuda, no puede romper el alta.
  }
}

export function loadIntakeDraft(userId: string): IntakeDraft | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IntakeDraft> | null;
    if (!parsed || parsed.v !== VERSION || !parsed.values || typeof parsed.values !== 'object') return null;
    // Lo que falte (un campo que se agregó después de guardarlo) se completa con el formulario vacío.
    const values = { ...emptyWorkOrderForm(), ...parsed.values } as WorkOrderFormValues;
    if (isBlank(values)) return null;
    return {
      v: VERSION,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      step: Number.isInteger(parsed.step) && (parsed.step as number) >= 1 ? (parsed.step as number) : 1,
      values,
    };
  } catch {
    return null;
  }
}

export function clearIntakeDraft(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // nada que borrar
  }
}

/** Al cerrar sesión: ningún borrador (de nadie) se queda en el aparato. */
export function clearAllIntakeDrafts(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // nada que borrar
  }
}
