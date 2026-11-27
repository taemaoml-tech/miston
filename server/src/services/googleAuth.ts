import { readFileSync } from 'node:fs';
import { config } from '../config/env';
import { AppError } from '../utils/errors';

interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

function serviceAccount(): Record<string, unknown> | null {
  try {
    if (config.FIREBASE_SERVICE_ACCOUNT_JSON) {
      return JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON) as Record<string, unknown>;
    }
    if (config.FIREBASE_SERVICE_ACCOUNT_PATH) {
      return JSON.parse(readFileSync(config.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')) as Record<string, unknown>;
    }
  } catch (error) {
    console.error('Google auth: Firebase service account error', error instanceof Error ? error.message : error);
  }
  return null;
}

/**
 * Перевіряє ID-токен Google саме на сервері. Клієнтський токен ніколи не є
 * сесією Miston: після перевірки ми видаємо звичайний JWT + refresh-токен.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const account = serviceAccount();
  if (!account) {
    throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Вхід через Google ще не налаштовано на сервері.');
  }
  try {
    const appModule = await import('firebase-admin/app');
    const authModule = await import('firebase-admin/auth');
    const app = appModule.getApps().length
      ? appModule.getApp()
      : appModule.initializeApp({ credential: appModule.cert(account as never) });
    const decoded = await authModule.getAuth(app).verifyIdToken(idToken, true);
    if (!decoded.sub || !decoded.email || !decoded.email_verified) {
      throw new AppError(401, 'GOOGLE_EMAIL_NOT_VERIFIED', 'Потрібен Google-акаунт із підтвердженою поштою.');
    }
    return {
      sub: decoded.sub,
      email: decoded.email,
      emailVerified: decoded.email_verified,
      displayName: typeof decoded.name === 'string' && decoded.name.trim() ? decoded.name.trim() : decoded.email.split('@')[0]!,
      avatarUrl: typeof decoded.picture === 'string' ? decoded.picture : null,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Не вдалося підтвердити Google-акаунт.', { cause: error instanceof Error ? error.message : String(error) });
  }
}
