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
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'Miston';
  const body = payload?.notification?.body || 'Нове повідомлення';
  self.registration.showNotification(title, { body, icon: '/icons/icon-192.png' });
});
