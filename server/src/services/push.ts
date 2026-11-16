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

export async function sendPushToUser(userId: string, title: string, body: string): Promise<void> {
  const firebaseAdmin = await getAdmin();
  if (!firebaseAdmin) return;
  const result = await query<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = $1', [userId]);
  const tokens = result.rows.map((row) => row.token);
  if (tokens.length === 0) return;
  try {
    await (firebaseAdmin as any).messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
    });
  } catch (error) {
    console.error('FCM send failed', error instanceof Error ? error.message : error);
  }
}
