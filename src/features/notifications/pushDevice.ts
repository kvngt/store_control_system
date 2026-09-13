import { currentSubscription, detectPushSupport, subscriptionKeys } from '../../lib/push';
import { notificationsService } from '../../services/notifications.service';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * Vuelve a asociar este teléfono a quien acaba de iniciar sesión.
 *
 * El caso que resuelve: la tablet del taller la usan varios. Si Luis activó push
 * y después entra Ana, el navegador conserva la misma suscripción — y sin esto
 * los avisos de Luis seguirían llegando a la tablet de Ana. No pide permiso: solo
 * actúa si ya estaba concedido.
 */
export async function syncThisDevice(): Promise<void> {
  if (detectPushSupport() !== 'supported') return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const subscription = await withTimeout(currentSubscription(), 4000);
  const keys = subscription ? subscriptionKeys(subscription) : null;
  if (keys) await notificationsService.registerDevice(keys);
}

/**
 * Al cerrar sesión, este dispositivo deja de recibir los avisos de esa persona.
 * La suscripción del navegador se conserva, para que quien entre después no
 * tenga que volver a dar permiso. Nunca bloquea el cierre de sesión más de
 * un segundo y medio.
 */
export async function detachThisDevice(): Promise<void> {
  try {
    if (detectPushSupport() !== 'supported') return;
    const subscription = await withTimeout(currentSubscription(), 1500);
    if (subscription) await withTimeout(notificationsService.unregisterDevice(subscription.endpoint), 1500);
  } catch {
    // Cerrar sesión no puede fallar por esto.
  }
}
