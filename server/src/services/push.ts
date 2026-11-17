import { readFileSync } from 'node:fs';
import { config } from '../config/env';
import { query } from '../db/pool';

interface Messaging {
  sendEachForMulticast: (message: Record<string, unknown>) => Promise<{
    successCount: number;
    failureCount: number;
    responses: Array<{ success: boolean; error?: { code?: string; message?: string } }>;
  }>;
}

interface MessagingClient {
  messaging: Messaging;
}

let client: MessagingClient | null = null;
let initialized = false;
let initError = '';

function readServiceAccount(): Record<string, unknown> | null {
  try {
    if (config.FIREBASE_SERVICE_ACCOUNT_JSON) {
      return JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON) as Record<string, unknown>;
    }
    if (config.FIREBASE_SERVICE_ACCOUNT_PATH) {
      return JSON.parse(readFileSync(config.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')) as Record<string, unknown>;
    }
  } catch (error) {
    initError = `Не вдалося прочитати ключ Firebase: ${error instanceof Error ? error.message : String(error)}`;
    console.error(initError);
  }
  return null;
}

/**
 * firebase-admin 14 — модульний: `cert` живе в `firebase-admin/app`, а
 * `getMessaging` — в `firebase-admin/messaging`. Старий `admin.credential.cert`
 * тут уже не існує, тому імпортуємо саме підмодулі.
 */
async function getClient(): Promise<MessagingClient | null> {
  if (initialized) return client;
  initialized = true;
  try {
    const serviceAccount = readServiceAccount();
    if (!serviceAccount) return null;
    const appModule = await import('firebase-admin/app');
    const messagingModule = await import('firebase-admin/messaging');
    const app = appModule.initializeApp({ credential: appModule.cert(serviceAccount as never) });
    client = { messaging: messagingModule.getMessaging(app) as unknown as Messaging };
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error);
    console.error('Firebase Admin init failed', initError);
    client = null;
  }
  return client;
}

export function pushConfigured(): boolean {
  return Boolean(config.FIREBASE_SERVICE_ACCOUNT_JSON || config.FIREBASE_SERVICE_ACCOUNT_PATH);
}

export function pushInitError(): string {
  return initError;
}

export async function registerPushToken(userId: string, token: string, platform: string): Promise<void> {
  await query(
    `INSERT INTO push_tokens (user_id, token, platform, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now()`,
    [userId, token, platform],
  );
}

export async function unregisterPushToken(token: string): Promise<void> {
  await query('DELETE FROM push_tokens WHERE token = $1', [token]);
}

export async function pushTokenCount(userId: string): Promise<number> {
  const result = await query<{ count: number }>('SELECT count(*)::int AS count FROM push_tokens WHERE user_id = $1', [userId]);
  return result.rows[0]?.count ?? 0;
}

export interface PushResult {
  tokens: number;
  sent: number;
  failed: number;
  errors: string[];
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<PushResult> {
  const current = await getClient();
  if (!current) {
    return { tokens: 0, sent: 0, failed: 0, errors: [initError || 'firebase-admin не ініціалізовано'] };
  }
  const result = await query<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = $1', [userId]);
  const tokens = result.rows.map((row) => row.token);
  if (tokens.length === 0) return { tokens: 0, sent: 0, failed: 0, errors: [] };
  try {
    const response = await current.messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { ...data, title, body },
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' },
        notification: { title, body, tag: data.conversationId || 'miston' },
        fcmOptions: { link: 'https://taemaoml-tech.github.io/miston/' },
      },
    });

    // Прибираємо токени, яких Firebase більше не знає (видалений застосунок,
    // скидання даних, перевстановлення APK).
    const stale: string[] = [];
    const errors: string[] = [];
    response.responses.forEach((entry, index) => {
      if (entry.success) return;
      const code = entry.error?.code ?? 'unknown';
      errors.push(`${code}: ${entry.error?.message ?? ''}`.trim());
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        stale.push(tokens[index]!);
      }
    });
    if (stale.length > 0) {
      await query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [stale]);
    }
    return {
      tokens: tokens.length,
      sent: response.successCount,
      failed: response.failureCount,
      errors,
    };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    console.error('FCM send failed', text);
    return { tokens: tokens.length, sent: 0, failed: tokens.length, errors: [text] };
  }
}
