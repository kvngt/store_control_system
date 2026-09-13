import type { UploadItem } from './uploadQueue';

/**
 * Dónde sobrevive la cola de subida a una recarga.
 *
 * El caso para el que existe: un técnico graba tres videos, bloquea el teléfono
 * y la pestaña se descarta. Sin esto, lo que no terminó de subir se pierde sin
 * aviso. Con esto, la próxima vez que abre la app la subida sigue donde iba — el
 * archivo desde aquí, y el punto exacto dentro del archivo desde TUS.
 */
export interface QueueStore {
  loadAll(): Promise<UploadItem[]>;
  put(item: UploadItem): Promise<void>;
  remove(id: string): Promise<void>;
}

const DB_NAME = 'restorify-media';
const STORE = 'uploads';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Solo lo que vale la pena guardar: el progreso se recalcula al reanudar. */
function persistable(item: UploadItem): UploadItem {
  return { ...item, progreso: 0, estado: item.estado === 'listo' ? 'listo' : 'pendiente' };
}

/**
 * IndexedDB guarda Blobs directamente, así que el archivo comprimido entero cabe
 * aquí. Si IndexedDB no está disponible (modo privado de algunos navegadores),
 * cae a memoria: la cola funciona igual, solo que no sobrevive a una recarga.
 */
export function createQueueStore(): QueueStore {
  if (typeof indexedDB === 'undefined') return createMemoryStore();

  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDb());

  const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) => {
    const database = await db();
    return request(fn(database.transaction(STORE, mode).objectStore(STORE)));
  };

  const fallback = createMemoryStore();
  let broken = false;

  return {
    async loadAll() {
      if (broken) return fallback.loadAll();
      try {
        return (await withStore('readonly', (s) => s.getAll())) as UploadItem[];
      } catch {
        broken = true;
        return fallback.loadAll();
      }
    },
    async put(item) {
      if (broken) return fallback.put(item);
      try {
        await withStore('readwrite', (s) => s.put(persistable(item)));
      } catch {
        broken = true;
        await fallback.put(item);
      }
    },
    async remove(id) {
      if (broken) return fallback.remove(id);
      try {
        await withStore('readwrite', (s) => s.delete(id));
      } catch {
        broken = true;
        await fallback.remove(id);
      }
    },
  };
}

export function createMemoryStore(): QueueStore {
  const items = new Map<string, UploadItem>();
  return {
    async loadAll() {
      return [...items.values()];
    },
    async put(item) {
      items.set(item.id, persistable(item));
    },
    async remove(id) {
      items.delete(id);
    },
  };
}
