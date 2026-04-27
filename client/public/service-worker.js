/* eslint-disable no-restricted-globals */
// Minimal service worker for Web Push.
// Handles: push events (display notification) and notificationclick
// (focus or open the app and route to the relevant list).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Update', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Expense Logger';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.svg',
    badge: data.badge || '/icon-192.svg',
    tag: data.tag || undefined,
    renotify: data.priority === 'high',
    requireInteraction: data.priority === 'high' || !!data.inStore,
    data: data.data || {},
    vibrate: data.priority === 'high' || data.inStore ? [200, 100, 200] : [100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetListId = event.notification.data?.listId;
  const url = targetListId ? `/?openList=${targetListId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'shopping-notification-clicked', listId: targetListId });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return null;
    })
  );
});
