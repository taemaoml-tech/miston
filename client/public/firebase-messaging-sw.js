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
  const title = payload?.notification?.title || 'Miston';
  const body = payload?.notification?.body || 'Нове повідомлення';
  self.registration.showNotification(title, {
    body,
    icon: base + 'icons/icon-192.png',
    badge: base + 'icons/icon-72.png',
    tag: payload?.data?.conversationId || undefined,
  });
});

// Клік по сповіщенню відкриває застосунок (або фокусує вже відкриту вкладку).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = base || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin + target) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
