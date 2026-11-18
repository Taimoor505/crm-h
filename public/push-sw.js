/*
 * Web push handlers for the PWA service worker.
 * In the app's service worker: importScripts('/push-sw.js');
 * Payload (from server/notifications/dispatch.ts):
 *   { title, body, url, tag, data: { notification_id, type, contact_id?, task_id? } }
 */
self.addEventListener('push', function (event) {
  var p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch (e) {
    p = { title: event.data ? event.data.text() : 'New notification' };
  }
  event.waitUntil(
    self.registration.showNotification(p.title || 'New notification', {
      body: p.body || '',
      tag: p.tag,
      renotify: !!p.tag,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { url: p.url || '/', notification_id: p.data && p.data.notification_id },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if ('focus' in clients[i]) {
          clients[i].navigate(url);
          return clients[i].focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
