import type { MediaKind, MediaOrigin, PreparedMedia } from '../../types/database';
import { MediaProcessingError } from './errors';
import { extensionFor, mediaPath } from './mime';
import type { QueueStore } from './queueStore';

export type UploadState = 'pendiente' | 'subiendo' | 'guardando' | 'listo' | 'error';

/** Un archivo en camino al bucket, con todo lo que hace falta para retomarlo. */
export interface UploadItem {
  id: string;
  /** La cola de un usuario no se reanuda en la sesión de otro. */
  userId: string;
  ordenId: string;
  sedeId: string;
  numeroOrden: string | null;
  avanceId: string | null;
  origen: MediaOrigin;
  zona: string | null;
  tipo: MediaKind;
  blob: Blob;
  mime: string;
  thumb: Blob | null;
  duracionSeg: number | null;
  ancho: number | null;
  alto: number | null;
  ruta: string;
  rutaMiniatura: string | null;
  estado: UploadState;
  /** 0..1 */
  progreso: number;
  error: string | null;
  /**
   * Qué pasos ya terminaron. Persistidos: si el archivo subió pero guardar la
   * fila falló, el reintento no vuelve a subir 25 MB para escribir una fila.
   */
  subidoPrincipal: boolean;
  subidaMiniatura: boolean;
  intentos: number;
  creadoEn: number;
}

export interface NewUpload extends PreparedMedia {
  userId: string;
  ordenId: string;
  sedeId: string;
  numeroOrden?: string | null;
  avanceId?: string | null;
  origen: MediaOrigin;
  zona?: string | null;
}

/** El transporte. La cola decide cuándo y en qué orden; esto solo mueve bytes. */
export interface MediaUploader {
  upload(
    item: UploadItem,
    which: 'principal' | 'miniatura',
    onProgress: (fraction: number) => void,
    signal: AbortSignal
  ): Promise<void>;
  saveRow(item: UploadItem): Promise<void>;
  /** Mejor esfuerzo, al descartar un archivo que ya había subido. */
  removeFiles?(item: UploadItem): Promise<void>;
}

export interface QueueOptions {
  uploader: MediaUploader;
  store: QueueStore;
  concurrency?: number;
  /** Intentos automáticos antes de dejar el archivo en error para reintento manual. */
  maxAutoAttempts?: number;
  retryDelayMs?: (attempt: number) => number;
  isOnline?: () => boolean;
  onItemDone?: (item: UploadItem) => void;
  /** Cuánto se queda visible un archivo terminado en la bandeja. */
  doneLingerMs?: number;
  newId?: () => string;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Safari anterior a 15.4. Un UUID v4 armado a mano con getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Si vale la pena reintentar solo. Un error de red o un 5xx, sí. Un permiso
 * negado, una restricción de la base o un archivo rechazado por el bucket no se
 * arreglan esperando: reintentarlos solo gasta datos móviles del técnico.
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof MediaProcessingError) return false;
  const e = err as { code?: unknown; statusCode?: unknown; status?: unknown; originalResponse?: { getStatus?: () => number } };
  const code = typeof e?.code === 'string' ? e.code : '';
  if (/^(42501|23|22|P0001)/.test(code)) return false;
  const status = Number(e?.statusCode ?? e?.status ?? e?.originalResponse?.getStatus?.());
  if (Number.isFinite(status) && status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  return true;
}

/**
 * La cola de subida de multimedia.
 *
 * Existe para que subir no le cueste al técnico su tiempo. Antes, crear una orden
 * esperaba a que subieran las fotos una por una, y si una fallaba en el wifi del
 * taller, la orden ya creada se reportaba como error. Ahora un archivo entra aquí
 * y el técnico sigue trabajando: se sube en segundo plano, de a dos, con
 * reintentos, y sobrevive a una recarga.
 *
 * No depende de React ni de Supabase — el transporte y el almacenamiento se
 * inyectan — para poder probar su lógica, que es donde están los errores
 * difíciles: reanudar, no duplicar, no perder.
 */
export class MediaUploadQueue {
  private readonly items = new Map<string, UploadItem>();
  private readonly running = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly retryAt = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private snapshot: UploadItem[] = [];
  private userId: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private readonly uploader: MediaUploader;
  private readonly store: QueueStore;
  private readonly concurrency: number;
  private readonly maxAutoAttempts: number;
  private readonly retryDelayMs: (attempt: number) => number;
  private readonly isOnline: () => boolean;
  private readonly onItemDone?: (item: UploadItem) => void;
  private readonly doneLingerMs: number;
  private readonly newId: () => string;

  constructor(options: QueueOptions) {
    this.uploader = options.uploader;
    this.store = options.store;
    this.concurrency = options.concurrency ?? 2;
    this.maxAutoAttempts = options.maxAutoAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? ((attempt) => [2000, 10000, 30000][attempt - 1] ?? 30000);
    this.isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    this.onItemDone = options.onItemDone;
    this.doneLingerMs = options.doneLingerMs ?? 4000;
    this.newId = options.newId ?? randomId;
  }

  // ----- lectura (forma de useSyncExternalStore) ------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  /** Si hay algo que perder al cerrar la pestaña. */
  get hasActive(): boolean {
    return this.snapshot.some((i) => i.estado === 'pendiente' || i.estado === 'subiendo' || i.estado === 'guardando');
  }

  private emit() {
    this.snapshot = [...this.items.values()].sort((a, b) => a.creadoEn - b.creadoEn);
    this.listeners.forEach((l) => l());
  }

  // ----- ciclo de vida --------------------------------------------------------

  /**
   * Toma la cola del usuario que inició sesión, retomando lo que quedó pendiente
   * de una visita anterior. Llamarlo con null (cerrar sesión) detiene las
   * subidas sin borrarlas: se retoman cuando esa persona vuelva a entrar.
   */
  async setUser(userId: string | null) {
    if (this.userId === userId) return;
    this.abortRunning();
    this.userId = userId;
    this.items.clear();
    this.retryAt.clear();
    this.emit();
    if (!userId) return;

    const saved = await this.store.loadAll().catch(() => [] as UploadItem[]);
    if (this.userId !== userId || this.disposed) return;

    for (const item of saved) {
      if (item.userId !== userId) continue;
      if (item.estado === 'listo') {
        // Terminó justo antes de cerrarse la pestaña, sin llegar a borrarse.
        void this.store.remove(item.id);
        continue;
      }
      this.items.set(item.id, { ...item, estado: 'pendiente', progreso: 0 });
    }
    this.emit();
    this.pump();
  }

  dispose() {
    this.disposed = true;
    this.abortRunning();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listeners.clear();
  }

  private abortRunning() {
    this.controllers.forEach((c) => c.abort());
    this.controllers.clear();
    this.running.clear();
  }

  // ----- acciones -------------------------------------------------------------

  enqueue(uploads: NewUpload[]): UploadItem[] {
    const now = Date.now();
    const created = uploads.map((u, index) => {
      const id = this.newId();
      const item: UploadItem = {
        id,
        userId: u.userId,
        ordenId: u.ordenId,
        sedeId: u.sedeId,
        numeroOrden: u.numeroOrden ?? null,
        avanceId: u.avanceId ?? null,
        origen: u.origen,
        zona: u.zona ?? null,
        tipo: u.tipo,
        blob: u.blob,
        mime: u.mime,
        thumb: u.thumb,
        duracionSeg: u.duracionSeg,
        ancho: u.ancho,
        alto: u.alto,
        ruta: mediaPath(u.sedeId, u.ordenId, `${id}.${extensionFor(u.mime)}`),
        rutaMiniatura: u.thumb ? mediaPath(u.sedeId, u.ordenId, `${id}-thumb.jpg`) : null,
        estado: 'pendiente',
        progreso: 0,
        error: null,
        subidoPrincipal: false,
        subidaMiniatura: false,
        intentos: 0,
        // + index: varios archivos del mismo instante conservan el orden en que
        // se eligieron.
        creadoEn: now + index,
      };
      this.items.set(id, item);
      void this.store.put(item);
      return item;
    });
    this.emit();
    this.pump();
    return created;
  }

  retry(id: string) {
    const item = this.items.get(id);
    if (!item || item.estado !== 'error') return;
    this.retryAt.delete(id);
    this.update(id, { estado: 'pendiente', intentos: 0, error: null });
    this.pump();
  }

  /** Reintenta todo lo que falló. Se llama al recuperar la conexión. */
  retryFailed() {
    for (const item of this.items.values()) {
      if (item.estado === 'error') this.update(item.id, { estado: 'pendiente', intentos: 0, error: null });
    }
    this.retryAt.clear();
    this.pump();
  }

  async discard(id: string) {
    const item = this.items.get(id);
    if (!item) return;
    this.controllers.get(id)?.abort();
    this.items.delete(id);
    this.retryAt.delete(id);
    this.emit();
    await this.store.remove(id);
    if (item.subidoPrincipal && item.estado !== 'listo') {
      await this.uploader.removeFiles?.(item).catch(() => {});
    }
  }

  /** Arranca lo que haya pendiente, hasta el límite de concurrencia. */
  pump() {
    if (this.disposed || !this.userId || !this.isOnline()) return;

    const now = Date.now();
    let nextRetry = Infinity;

    for (const item of this.snapshot) {
      if (this.running.size >= this.concurrency) break;
      if (item.estado !== 'pendiente' || this.running.has(item.id) || item.userId !== this.userId) continue;

      const at = this.retryAt.get(item.id) ?? 0;
      if (at > now) {
        nextRetry = Math.min(nextRetry, at);
        continue;
      }

      this.retryAt.delete(item.id);
      this.running.add(item.id);
      void this.run(item.id).finally(() => {
        this.running.delete(item.id);
        this.pump();
      });
    }

    if (nextRetry !== Infinity) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.pump(), Math.max(0, nextRetry - Date.now()));
    }
  }

  // ----- ejecución ------------------------------------------------------------

  private update(id: string, patch: Partial<UploadItem>, persist = true) {
    const current = this.items.get(id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.items.set(id, next);
    if (persist) void this.store.put(next);
    this.emit();
  }

  private async run(id: string) {
    const controller = new AbortController();
    this.controllers.set(id, controller);
    const alive = () => !controller.signal.aborted && this.items.has(id);

    try {
      const start = this.items.get(id);
      if (!start) return;
      this.update(id, { estado: 'subiendo', error: null }, false);

      // La miniatura pesa ~30 KB: el progreso visible es el del archivo principal.
      const hasThumb = !!start.thumb && !!start.rutaMiniatura;
      const mainShare = hasThumb ? 0.95 : 1;
      let lastEmitted = -1;
      const progress = (base: number, span: number) => (fraction: number) => {
        const value = base + Math.min(1, Math.max(0, fraction)) * span;
        // Un evento por punto porcentual basta; TUS reporta muchos más.
        if (Math.round(value * 100) === lastEmitted) return;
        lastEmitted = Math.round(value * 100);
        this.update(id, { progreso: value }, false);
      };

      if (!start.subidoPrincipal) {
        await this.uploader.upload(start, 'principal', progress(0, mainShare), controller.signal);
        if (!alive()) return;
        this.update(id, { subidoPrincipal: true, progreso: mainShare });
      }

      const afterMain = this.items.get(id);
      if (!afterMain) return;
      if (hasThumb && !afterMain.subidaMiniatura) {
        await this.uploader.upload(afterMain, 'miniatura', progress(mainShare, 1 - mainShare), controller.signal);
        if (!alive()) return;
        this.update(id, { subidaMiniatura: true });
      }

      this.update(id, { estado: 'guardando', progreso: 1 }, false);
      const ready = this.items.get(id);
      if (!ready) return;
      await this.uploader.saveRow(ready);
      if (!alive()) return;

      this.update(id, { estado: 'listo', progreso: 1, error: null }, false);
      await this.store.remove(id);
      this.onItemDone?.(ready);
      setTimeout(() => {
        if (this.items.get(id)?.estado === 'listo') {
          this.items.delete(id);
          this.emit();
        }
      }, this.doneLingerMs);
    } catch (err) {
      if (!alive()) return;
      const current = this.items.get(id);
      if (!current) return;

      const intentos = current.intentos + 1;
      const message = err instanceof Error ? err.message : String(err);

      if (isRetryable(err) && intentos < this.maxAutoAttempts) {
        this.retryAt.set(id, Date.now() + this.retryDelayMs(intentos));
        this.update(id, { estado: 'pendiente', intentos, error: message });
      } else {
        this.update(id, { estado: 'error', intentos, error: message });
      }
    } finally {
      this.controllers.delete(id);
    }
  }
}
