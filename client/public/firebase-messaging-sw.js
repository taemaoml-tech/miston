importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAYdu-gmVqERGEy1zCG-0euOW75GBTVrn0',
  authDomain: 'miston-messenger.firebaseapp.com',
  projectId: 'miston-messenger',
  storageBucket: 'miston-messenger.firebasestorage.app',
  messagingSenderId: '1037351652213',
  appId: '1:1037351652213:web:e5a54e3d11c930d207e13c',
});

const messaging = firebase.messaging();
const base = self.location.pathname.replace(/firebase-messaging-sw\.js$/, '');

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  if (data.type === 'call') {
    const title = data.callerName ? `Вхідний дзвінок · ${data.callerName}` : 'Вхідний дзвінок';
    const body = data.kind === 'video' ? 'Вхідний відеодзвінок' : 'Вхідний аудіодзвінок';
    self.registration.showNotification(title, {
      body,
      icon: base + 'icons/icon-192.png',
      badge: base + 'icons/icon-72.png',
      tag: `call:${data.callId}`,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { type: 'call', callId: data.callId },
      actions: [
        { action: 'accept', title: 'Прийняти' },
        { action: 'decline', title: 'Відхилити' },
      ],
    });
    return;
  }
  const title = payload?.notification?.title || 'Planegram';
  const body = payload?.notification?.body || 'Нове повідомлення';
  self.registration.showNotification(title, {
    body,
    icon: base + 'icons/icon-192.png',
    badge: base + 'icons/icon-72.png',
    tag: data.conversationId || undefined,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = base || '/';
  if (data.type === 'call' && data.callId) {
    if (event.action === 'decline') return;
    const url = target + '?incomingCall=' + encodeURIComponent(data.callId);
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const client of list) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'incoming-call', callId: data.callId });
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
    );
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin + target) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});