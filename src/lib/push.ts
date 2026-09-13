/**
 * Notificaciones push en el navegador (Web Push + service worker).
 *
 * Es lo que hace que un aviso le llegue al mecánico con la app cerrada, que en
 * el teléfono de un taller es casi siempre. La campana en tiempo real solo sirve
 * mientras la app está abierta.
 *
 * Restricción que manda en todo el diseño: en iPhone, Safari solo permite push a
 * una app **agregada a la pantalla de inicio** (iOS 16.4 o posterior). Desde una
 * pestaña normal de Safari la API ni siquiera existe, así que la pantalla tiene
 * que distinguir "no se puede" de "se puede después de instalarla".
 */

export const VAPID_PUBLIC_KEY: string = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';

export type PushSupport =
  /** Todo listo para pedir permiso. */
  | 'supported'
  /** iPhone/iPad en Safari sin instalar: hay que agregarla a inicio primero. */
  | 'needs-install'
  /** El navegador no tiene push (o es muy viejo). */
  | 'unsupported'
  /** La build no trae llave VAPID: push no está configurado en este despliegue. */
  | 'not-configured';

export interface PushEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  standalone: boolean;
  vapidKey: string;
}

/** iPhone, iPod o iPad — incluido el iPad que se presenta como Mac de escritorio. */
export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function currentPushEnvironment(): PushEnvironment {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const win = typeof window !== 'undefined' ? window : undefined;
  const standalone =
    !!win?.matchMedia?.('(display-mode: standalone)').matches ||
    // Safari en iOS lo expone aparte, fuera del estándar.
    (nav as Navigator & { standalone?: boolean } | undefined)?.standalone === true;
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    hasServiceWorker: !!nav && 'serviceWorker' in nav,
    hasPushManager: !!win && 'PushManager' in win,
    hasNotification: !!win && 'Notification' in win,
    standalone,
    vapidKey: VAPID_PUBLIC_KEY,
  };
}

export function detectPushSupport(env: PushEnvironment = currentPushEnvironment()): PushSupport {
  if (!env.vapidKey) return 'not-configured';
  const ios = isIos(env.userAgent, env.maxTouchPoints);
  if (ios && !env.standalone) return 'needs-install';
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported';
  return 'supported';
}

/** La llave VAPID viene en base64url; `pushManager.subscribe` la quiere en bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Lo que la base guarda de una suscripción. */
export function subscriptionKeys(subscription: PushSubscription): { endpoint: string; p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, p256dh, auth };
}

/**
 * El service worker listo, o null si no llega a tiempo. `ready` no se resuelve
 * nunca si el registro falló, y una pantalla de ajustes no debe quedarse
 * esperando para siempre.
 */
export async function getServiceWorker(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await getServiceWorker();
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Pide permiso y suscribe este navegador. Tiene que llamarse desde un toque del
 * usuario: Safari rechaza pedir permiso fuera de un gesto.
 */
export async function subscribeThisDevice(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  }
  const registration = await getServiceWorker();
  if (!registration) throw Object.assign(new Error('no-service-worker'), { code: 'no-service-worker' });

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    // Obligatorio en Chrome: cada push debe mostrar una notificación visible.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

/** Registra el service worker. Sin `fetch` handler: no cachea la app (ver public/sw.js). */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker no hay push, pero la app funciona igual.
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
