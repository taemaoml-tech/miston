import { Capacitor } from '@capacitor/core';
import { publicAsset } from '../api/client';

export type NotificationKind = 'messages' | 'calls';

export const OPEN_CONVERSATION_EVENT = 'miston:open-conversation';

const CHANNELS: Record<NotificationKind, { id: string; name: string; description: string; importance: 4 | 5 }> = {
  messages: { id: 'miston-messages', name: 'Повідомлення', description: 'Нові повідомлення в чатах', importance: 4 },
  calls: { id: 'miston-calls', name: 'Дзвінки', description: 'Вхідні дзвінки', importance: 5 },
};

type Plugin = typeof import('@capacitor/local-notifications').LocalNotifications;

let plugin: Plugin | null | undefined;
let channelsReady = false;
let tapListenerReady = false;
const idsByGroup = new Map<string, number>();
let idSequence = 1;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

async function loadPlugin(): Promise<Plugin | null> {
  if (!Capacitor.isNativePlatform()) return null;
  if (plugin === undefined) {
    plugin = await import('@capacitor/local-notifications').then((module) => module.LocalNotifications).catch(() => null);
  }
  if (!plugin) return null;

  if (!channelsReady) {
    channelsReady = true;
    for (const channel of Object.values(CHANNELS)) {
      await plugin.createChannel(channel).catch(() => undefined);
    }
  }
  if (!tapListenerReady) {
    tapListenerReady = true;
    await plugin.addListener('localNotificationActionPerformed', (event) => {
      const conversationId = (event.notification?.extra as { conversationId?: unknown } | undefined)?.conversationId;
      if (typeof conversationId === 'string') openConversationLater(conversationId);
    }).catch(() => undefined);
  }
  return plugin;
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
  const native = await loadPlugin();
  if (native) {
    await native.requestPermissions().catch(() => undefined);
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
  const native = await loadPlugin();
  if (native) {
    const group = options.group ?? `${kind}:${options.title}`;
    await native.schedule({
      notifications: [{
        id: nextId(group),
        title: options.title,
        body,
        channelId: CHANNELS[kind].id,
        extra: options.conversationId ? { conversationId: options.conversationId } : undefined,
      }],
    }).catch(() => undefined);
    return;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notification = new Notification(options.title, { body, icon: publicAsset('favicon.svg'), tag: options.group });
  if (options.conversationId) {
    notification.onclick = () => openConversationLater(options.conversationId as string);
  }
}

export async function dismissBackgroundNotification(options: { kind: NotificationKind; group: string }): Promise<void> {
  const native = await loadPlugin();
  const id = idsByGroup.get(options.group);
  if (!native || id === undefined) return;
  idsByGroup.delete(options.group);
  await native.cancel({ notifications: [{ id }] }).catch(() => undefined);
}
