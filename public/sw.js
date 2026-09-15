/* ===================================================================================
   RESTORIFY — Service worker
   ===================================================================================
   Existe para una sola cosa: recibir notificaciones push con la app cerrada y
   abrir la orden al tocarlas.

   A propósito NO tiene manejador de `fetch` y no cachea nada. Una app que se
   sirve desde caché puede quedarse con una versión vieja después de un
   despliegue — justo el tipo de desfase entre frontend y base de datos que el
   aviso de "esquema desactualizado" existe para detectar. Si algún día se quiere
   modo sin conexión, es una decisión aparte, no un efecto secundario del push.
   ================================================================================= */

self.addEventListener('install', () => {
  // Una versión nueva de este archivo entra en uso de inmediato.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Restorify';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    // El mismo tag reemplaza al aviso anterior en vez de apilar otro igual.
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Solo rutas de esta app: un aviso nunca abre otro sitio, aunque su `url` lo pidiera.
  const requested = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  const target = requested.origin === self.location.origin ? requested.href : self.location.origin + '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Si la app ya está abierta, se lleva a la orden en esa ventana en vez de
      // abrir otra.
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then((focused) => (focused && 'navigate' in focused ? focused.navigate(target) : undefined));
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
