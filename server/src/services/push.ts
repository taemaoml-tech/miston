import { config } from '../config/env';
import { query } from '../db/pool';

let admin: typeof import('firebase-admin') | null = null;
let initialized = false;

async function getAdmin() {
  if (initialized) return admin;
  initialized = true;
  try {
    const firebaseAdmin: any = await import('firebase-admin');
    if (config.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const credential = firebaseAdmin.credential.cert(JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON));
      firebaseAdmin.initializeApp({ credential });
      admin = firebaseAdmin;
    } else if (config.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const credential = firebaseAdmin.credential.cert(config.FIREBASE_SERVICE_ACCOUNT_PATH);
      firebaseAdmin.initializeApp({ credential });
      admin = firebaseAdmin;
    }
  } catch (error) {
    console.error('Firebase Admin init failed', error instanceof Error ? error.message : error);
    admin = null;
  }
  return admin;
}

export function pushConfigured(): boolean {
  return Boolean(config.FIREBASE_SERVICE_ACCOUNT_JSON || config.FIREBASE_SERVICE_ACCOUNT_PATH);
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
  const firebaseAdmin = await getAdmin();
  if (!firebaseAdmin) return { tokens: 0, sent: 0, failed: 0, errors: ['firebase-admin не ініціалізовано'] };
  const result = await query<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = $1', [userId]);
  const tokens = result.rows.map((row) => row.token);
  if (tokens.length === 0) return { tokens: 0, sent: 0, failed: 0, errors: [] };
  try {
    const response = await (firebaseAdmin as any).messaging().sendEachForMulticast({
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
    response.responses.forEach((entry: { success: boolean; error?: { code?: string; message?: string } }, index: number) => {
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
      sent: response.successCount ?? tokens.length - errors.length,
      failed: response.failureCount ?? errors.length,
      errors,
    };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    console.error('FCM send failed', text);
    return { tokens: tokens.length, sent: 0, failed: tokens.length, errors: [text] };
  }
}
