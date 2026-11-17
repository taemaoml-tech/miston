import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

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

let pushActive = false;

/** Чи цей пристрій уже має FCM-токен — тоді дублювати сповіщення локально не треба. */
export function isPushActive(): boolean {
  return pushActive;
}

export function isNativeApp(): boolean {
  const win = window as Window & { androidBridge?: unknown; webkit?: { messageHandlers?: { bridge?: unknown } } };
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  const capNative = typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
  return capNative || Boolean(win.androidBridge) || Boolean(win.webkit?.messageHandlers?.bridge);
}

/**
 * У застосунку сторінка відкривається з мережі, тому її скрипти інколи
 * виконуються раніше за ін'єкцію Capacitor-містка. Чекаємо, доки місток
 * з'явиться, інакше виклик плагіна пішов би у веб-заглушку.
 */
async function nativeReady(): Promise<boolean> {
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()) return true;
  if (!isNativeApp()) return false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const c = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (typeof c?.isNativePlatform === 'function' && c.isNativePlatform()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/** Веб (Chrome/Edge, у т.ч. PWA): токен через service worker. */
export async function getFcmToken(): Promise<string | null> {
  if (isNativeApp()) return null;
  if (!firebaseConfigured()) return null;
  if (!(await isSupported())) return null;
  try {
    if (!('Notification' in window)) return null;
    if (Notification.permission === 'denied') return null;
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const app = getApps().length ? getApps()[0]! : initializeApp(config);
    const messaging = getMessaging(app);
    const base = import.meta.env.BASE_URL || '/';
    const swUrl = `${base}firebase-messaging-sw.js`.replace(/\/\//g, '/');
    const registration = await navigator.serviceWorker.register(swUrl, { scope: base });
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

    // Коли вкладка активна, системне сповіщення не показуємо — повідомлення
    // і так з'являється в чаті через сокет.
    void onMessage(messaging, () => undefined);

    if (token) pushActive = true;
    return token || null;
  } catch (error) {
    console.warn('FCM token error', error);
    return null;
  }
}

/** Android APK (WebView): нативний FCM-токен через Capacitor-плагін. */
export async function getNativeFcmToken(): Promise<string | null> {
  if (!isNativeApp()) return null;
  if (!(await nativeReady())) return null;
  try {
    const permission = await FirebaseMessaging.requestPermissions();
    if (permission.receive === 'denied') return null;
    const { token } = await FirebaseMessaging.getToken();
    if (token) pushActive = true;
    return token || null;
  } catch (error) {
    console.warn('Native FCM token error', error);
    return null;
  }
}

/**
 * Слухає оновлення нативного FCM-токена (він може змінитися після
 * перевстановлення, очищення даних або ротації Google).
 */
export async function watchNativeFcmToken(onToken: (token: string) => void): Promise<void> {
  if (!isNativeApp()) return;
  if (!(await nativeReady())) return;
  try {
    await FirebaseMessaging.addListener('tokenReceived', (event) => {
      if (event.token) onToken(event.token);
    });
  } catch (error) {
    console.warn('Native FCM listener error', error);
  }
}
