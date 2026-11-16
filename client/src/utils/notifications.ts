import { publicAsset } from '../api/client';

export type NotificationKind = 'messages' | 'calls';

export const OPEN_CONVERSATION_EVENT = 'miston:open-conversation';

const PLUGIN = 'LocalNotifications';

const CHANNELS: Record<NotificationKind, { id: string; name: string; description: string; importance: 4 | 5 }> = {
  messages: { id: 'miston-messages', name: 'Повідомлення', description: 'Нові повідомлення в чатах', importance: 4 },
  calls: { id: 'miston-calls', name: 'Дзвінки', description: 'Вхідні дзвінки', importance: 5 },
};

type NativeCall = (method: string, options?: Record<string, unknown>) => Promise<Record<string, any>>;

interface CapacitorWindow extends Window {
  Capacitor?: {
    nativePromise?: (plugin: string, method: string, options?: Record<string, unknown>) => Promise<any>;
    nativeCallback?: (plugin: string, method: string, options: Record<string, unknown> | undefined, callback: (event: any) => void) => string | null;
    PluginHeaders?: { name?: string }[];
  };
  androidBridge?: unknown;
  webkit?: { messageHandlers?: { bridge?: unknown } };
}

let channelsReady: NativeCall | null = null;
let permissionState = 'unknown';
let lastFailure = '';
let cachedBridge: NativeCall | null = null;
let waitingForBridge: Promise<NativeCall | null> | null = null;

const idsByGroup = new Map<string, number>();
let idSequence = 1;

function fail(scope: string, cause: unknown): void {
  const text = cause instanceof Error ? cause.message : String(cause);
  lastFailure = `${scope}: ${text}`;
  console.warn(`[notif] ${scope}`, cause);
}

/** Місток Android з'являється на сторінці лише після його ін'єкції — перевіряємо щоразу. */
function readBridge(): NativeCall | null {
  const cap = (window as CapacitorWindow).Capacitor;
  if (!cap?.nativePromise) return null;
  if (!cap.PluginHeaders?.some((header) => header?.name === PLUGIN)) return null;
  const nativePromise = cap.nativePromise.bind(cap);
  return (method, options) => nativePromise(PLUGIN, method, options ?? {});
}

export function isNativeApp(): boolean {
  const win = window as CapacitorWindow;
  return !!win.androidBridge || !!win.webkit?.messageHandlers?.bridge || !!cachedBridge;
}

/**
 * Застосунок відкриває сайт із мережі, тому модулі сторінки виконуються раніше
 * за ін'єкцію містка. Прив'язка до плагіна на старті назавжди приземлилась би
 * на веб-реалізацію, яка в WebView не вміє нічого, — тому чекаємо місток.
 */
async function nativePlugin(timeoutMs = 10000): Promise<NativeCall | null> {
  if (cachedBridge) return cachedBridge;
  if (!isNativeApp()) return null;
  if (waitingForBridge) return waitingForBridge;
  waitingForBridge = (async () => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const bridge = readBridge();
      if (bridge) {
        cachedBridge = bridge;
        break;
      }
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    waitingForBridge = null;
    return cachedBridge;
  })();
  return waitingForBridge;
}

/** Канали й обробник тапу реєструються один раз на місток. */
async function prepareNotifications(): Promise<NativeCall | null> {
  const bridge = await nativePlugin();
  if (!bridge) return null;
  if (channelsReady !== bridge) {
    channelsReady = bridge;
    for (const channel of Object.values(CHANNELS)) {
      await bridge('createChannel', channel).catch((cause) => fail('createChannel', cause));
    }
    const nativeCallback = (window as CapacitorWindow).Capacitor?.nativeCallback?.bind((window as CapacitorWindow).Capacitor);
    if (nativeCallback) {
      nativeCallback(PLUGIN, 'addListener', { eventName: 'localNotificationActionPerformed' }, (event) => {
        const conversationId = (event?.notification?.extra as { conversationId?: unknown } | undefined)?.conversationId;
        if (typeof conversationId === 'string') openConversationLater(conversationId);
      });
    }
  }
  return bridge;
}

function openConversationLater(conversationId: string) {
  window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: { conversationId } }));
}

function nextId(group: string): number {
  const existing = idsByGroup.get(group);
  if (existing !== undefined) return existing;
  const id = idSequence++;
  idsByGroup.set(group, id);
  return id;
}

export async function requestNotificationPermission(): Promise<void> {
  const bridge = await nativePlugin();
  if (bridge) {
    const status = await bridge('requestPermissions').catch((cause) => { fail('requestPermissions', cause); return null; });
    if (status) permissionState = String(status.display ?? 'unknown');
    return;
  }
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => undefined);
  }
}

/**
 * Сповіщення в фоні. У застосунку воно нативне (WebView не підтримує Web
 * Notification), у браузері — звичайне, якщо користувач уже дав дозвіл.
 */
export async function notifyInBackground(options: {
  title: string;
  body?: string;
  kind?: NotificationKind;
  group?: string;
  conversationId?: string;
}): Promise<void> {
  const kind = options.kind ?? 'messages';
  const body = options.body ?? '';
  const bridge = await prepareNotifications();
  if (bridge) {
    const group = options.group ?? `${kind}:${options.title}`;
    await bridge('schedule', {
      notifications: [{
        id: nextId(group),
        title: options.title,
        body,
        channelId: CHANNELS[kind].id,
        extra: options.conversationId ? { conversationId: options.conversationId } : undefined,
      }],
    }).catch((cause) => fail('schedule', cause));
    return;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notification = new Notification(options.title, { body, icon: publicAsset('favicon.svg'), tag: options.group });
  if (options.conversationId) {
    notification.onclick = () => openConversationLater(options.conversationId as string);
  }
}

export async function dismissBackgroundNotification(options: { kind: NotificationKind; group: string }): Promise<void> {
  const bridge = await prepareNotifications();
  const id = idsByGroup.get(options.group);
  if (!bridge || id === undefined) return;
  idsByGroup.delete(options.group);
  await bridge('cancel', { notifications: [{ id }] }).catch(() => undefined);
}

export interface NotificationReport {
  surface: 'app' | 'browser';
  ready: boolean;
  message: string;
}

function androidSettingsHint(): string {
  return lastFailure ? ` Остання помилка: ${lastFailure}` : '';
}

/**
 * Чесна відповідь на «чому пуші не приходять» — без неї з телефону дізнатися
 * причини неможливо, а помилки плагіна в потоці повідомлень навмисно мовчазні.
 */
export async function diagnoseNotifications(): Promise<NotificationReport> {
  if (!isNativeApp()) {
    if (!('Notification' in window)) return { surface: 'browser', ready: false, message: 'Цей браузер не вміє сповіщення.' };
    if (Notification.permission === 'granted') return { surface: 'browser', ready: true, message: 'Браузер готовий надсилати сповіщення.' };
    if (Notification.permission === 'denied') return { surface: 'browser', ready: false, message: 'Браузер заблокував сповіщення для цього сайту. Розблокуйте їх у налаштуваннях сайту.' };
    return { surface: 'browser', ready: false, message: 'Ви ще не підтвердили дозвіл на сповіщення в браузері.' };
  }

  const bridge = await nativePlugin();
  if (!bridge) {
    return {
      surface: 'app',
      ready: false,
      message: `Android не передав місток сповіщень у цю сторінку. Перезавантажте застосунок, а якщо повториться — установіть APK останньої версії.${androidSettingsHint()}`,
    };
  }
  const permissions = await bridge('checkPermissions').catch((cause) => { fail('checkPermissions', cause); return null; });
  if (!permissions) return { surface: 'app', ready: false, message: `Не вдалося дізнатися стан дозволу.${androidSettingsHint()}` };
  permissionState = String(permissions.display ?? 'unknown');
  if (permissionState !== 'granted') {
    return { surface: 'app', ready: false, message: `Android не дав дозвіл на сповіщення: Налаштування → Додатки → Miston → Сповіщення → Увімкнути.${androidSettingsHint()}` };
  }
  return { surface: 'app', ready: true, message: `Застосунок готовий надсилати сповіщення.${androidSettingsHint()}` };
}

/** Тестовий пуш: показує результат текстом, щоб причину можна було прочитати на місці. */
export async function sendTestNotification(): Promise<string> {
  if (!isNativeApp()) {
    if (!('Notification' in window)) return 'Цей браузер не вміє сповіщення.';
    if (Notification.permission === 'denied') return 'Браузер заблокував сповіщення для цього сайту.';
    if (Notification.permission !== 'granted') await Notification.requestPermission().catch(() => undefined);
    if (Notification.permission !== 'granted') return 'Дозвіл не надано — браузер питає його при першому натисканні на сторінку.';
    new Notification('Miston · тест', { body: 'Якщо ви це бачите, сповіщення працюють.', icon: publicAsset('favicon.svg') });
    return 'Тестове сповіщення надіслано.';
  }

  const bridge = await prepareNotifications();
  if (!bridge) return 'Застосунок не отримав доступ до системних сповіщень — установіть APK останньої версії й перезавантажте Miston.';
  try {
    await bridge('requestPermissions');
    await bridge('schedule', {
      notifications: [{ id: nextId('test'), title: 'Miston · тест', body: 'Якщо ви це бачите, сповіщення працюють.', channelId: CHANNELS.messages.id }],
    });
    return 'Тестове сповіщення надіслано — перевірте панель сповіщень.';
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : String(cause);
    if (text.includes('not enabled')) {
      return 'Android вимкнув сповіщення для Miston: Налаштування → Додатки → Miston → Сповіщення → Увімкнути.';
    }
    return `Не вдалося показати сповіщення: ${text}`;
  }
}

/** Стан дозволу, прочитаний під час останньої спроби — для панелі налаштувань. */
export function notificationPermissionState(): string {
  return permissionState;
}
