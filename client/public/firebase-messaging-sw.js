importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: self.__FIREBASE_CONFIG__?.apiKey,
  projectId: self.__FIREBASE_CONFIG__?.projectId,
  messagingSenderId: self.__FIREBASE_CONFIG__?.messagingSenderId,
  appId: self.__FIREBASE_CONFIG__?.appId,
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'Miston';
  const body = payload?.notification?.body || 'Нове повідомлення';
  self.registration.showNotification(title, { body, icon: '/icons/icon-192.png' });
});
