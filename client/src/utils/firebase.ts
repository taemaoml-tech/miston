import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function firebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.messagingSenderId && config.appId);
}

export async function getFcmToken(): Promise<string | null> {
  if (!firebaseConfigured()) return null;
  if (!(await isSupported())) return null;
  try {
    const app = getApps().length ? getApps()[0]! : initializeApp(config);
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const base = import.meta.env.BASE_URL || '/';
    const swUrl = `${base}firebase-messaging-sw.js`.replace(/\/\//g, '/');
    const registration = await navigator.serviceWorker.register(swUrl, { scope: base });
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    return token || null;
  } catch (error) {
    console.warn('FCM token error', error);
    return null;
  }
}

export async function getNativeFcmToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { FirebaseMessaging } = await import(/* @vite-ignore */ '@capacitor-firebase/messaging');
    await FirebaseMessaging.requestPermissions();
    const { token } = await FirebaseMessaging.getToken();
    return token || null;
  } catch (error) {
    console.warn('Native FCM token error', error);
    return null;
  }
}

