import crypto from 'node:crypto';
import { query } from '../db/pool';
import { config } from '../config/env';
import { AppError } from '../utils/errors';
import { isUserOnline } from '../sockets/presence';
import { sendEmail, emailConfigured } from './email';
import { replaceBotMessage, sendBotMessage } from './bot';

/**
 * Підтвердження входу в акаунт.
 *
 * 1. Після правильного пароля створюється одноразовий 8-значний код.
 * 2. Якщо в користувача зараз відкритий Miston на іншому пристрої — код
 *    приходить повідомленням від бота Miston у чат.
 * 3. Якщо доступу до Miston немає — код надсилається SMS на підтверджений
 *    номер телефону (автоматично або на вибір користувача).
 *
 * Токени доступу видаються лише після підтвердження коду.
 */

export type LoginDelivery = 'miston' | 'email';

export interface LoginChallengeView {
  loginRequired: true;
  challengeId: string;
  delivery: LoginDelivery;
  expiresAt: string;
  canRequestEmail: boolean;
  emailHint: string | null;
  deliveryError?: string;
  smsDebugCode?: string;
}

interface ChallengeRow {
  id: string;
  user_id: string;
  code_hash: string;
  delivery: LoginDelivery;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  message_id: string | null;
  created_at: Date;
}

interface UserRow {
  id: string;
  email: string;
  phone_number: string | null;
  phone_verified_at: Date | null;
  display_name: string;
}

export function loginCodeHash(userId: string, code: string): string {
  return crypto.createHmac('sha256', config.JWT_SECRET).update(`login:${userId}:${code}`).digest('hex');
}

function newCode(): string {
  return String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const safeLocal = local ?? '';
  const maskedLocal = safeLocal.length <= 2 ? `${safeLocal[0] ?? ''}***` : `${safeLocal.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

function challengeView(
  row: ChallengeRow,
  user: UserRow,
  extra: { deliveryError?: string; smsDebugCode?: string } = {},
): LoginChallengeView {
  return {
    loginRequired: true,
    challengeId: String(row.id),
    delivery: row.delivery,
    expiresAt: new Date(row.expires_at).toISOString(),
    canRequestEmail: true,
    emailHint: maskEmail(String(user.email)),
    ...extra,
  };
}

function loginMessage(code: string): string {
  const ttl = config.LOGIN_CODE_TTL_MINUTES;
  return [
    '🔐 Код підтвердження входу',
    '',
    code,
    '',
    `Код діє ${ttl} хв. Нікому його не повідомляйте.`,
    'Якщо це були не ви — змініть пароль у налаштуваннях.',
  ].join('\n');
}

async function loadUser(userId: string): Promise<UserRow> {
  const result = await query<UserRow>(
    'SELECT id, email, phone_number, phone_verified_at, display_name FROM users WHERE id = $1',
    [userId],
  );
  const user = result.rows[0];
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Користувача не знайдено.');
  return user;
}

/**
 * Створює новий код і доставляє його в Miston та/або SMS.
 * forceSms — користувач сам попросив SMS, бо не має доступу до застосунку.
 */
export async function issueLoginChallenge(
  userId: string,
  options: { forceEmail?: boolean } = {},
): Promise<LoginChallengeView> {
  const user = await loadUser(userId);

  const online = isUserOnline(userId);
  const delivery: LoginDelivery = options.forceEmail ? 'email' : (online ? 'miston' : 'email');
  const code = newCode();
  const ttl = config.LOGIN_CODE_TTL_MINUTES;

  await query(
    'UPDATE login_challenges SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL',
    [userId],
  );
  const inserted = await query<ChallengeRow>(
    `INSERT INTO login_challenges (user_id, code_hash, delivery, phone_number, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))
     RETURNING *`,
    [userId, loginCodeHash(userId, code), delivery, user.phone_number, ttl],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error('Login challenge insert returned no row');

  let botSent: Awaited<ReturnType<typeof sendBotMessage>> = null;
  try {
    botSent = await sendBotMessage(userId, loginMessage(code));
  } catch (error) {
    console.error('Failed to send the login code to the Miston chat', error instanceof Error ? error.message : error);
  }

  let finalDelivery = delivery;
  let deliveryError: string | undefined;
  let smsDebugCode: string | undefined;

  if (delivery === 'email') {
    if (!emailConfigured() && !config.SMS_DEBUG_SHOW_CODE) {
      finalDelivery = botSent ? 'miston' : 'email';
      deliveryError = 'Email ще не налаштований на сервері.';
      if (!botSent) throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Відправка email ще не налаштована.');
    } else {
      try {
        await sendEmail(
          String(user.email),
          'Planegram - код підтвердження входу',
          'Ваш код підтвердження входу: ' + code + '\n\nКод діє ' + ttl + ' хв. Нікому його не повідомляйте.\nЯкщо це були не ви - змініть пароль.',
        );
      } catch (error) {
        finalDelivery = botSent ? 'miston' : 'email';
        deliveryError = error instanceof Error ? error.message : 'Не вдалося надіслати email.';
        if (!botSent) throw error;
        if (config.SMS_DEBUG_SHOW_CODE) smsDebugCode = code;
      }
    }
  } else if (!botSent) {
    throw new AppError(503, 'LOGIN_CODE_UNAVAILABLE', 'Не вдалося доставити код підтвердження входу.');
  }

  const updated = await query<ChallengeRow>(
    `UPDATE login_challenges
     SET delivery = $2, conversation_id = $3, message_id = $4
     WHERE id = $1 RETURNING *`,
    [row.id, finalDelivery, botSent?.conversationId ?? null, botSent?.messageId ?? null],
  );

  return challengeView(updated.rows[0] ?? { ...row, delivery: finalDelivery }, user, {
    ...(deliveryError ? { deliveryError } : {}),
    ...(smsDebugCode ? { smsDebugCode } : {}),
  });
}

async function loadChallenge(challengeId: string): Promise<{ challenge: ChallengeRow; user: UserRow }> {
  const result = await query<ChallengeRow>('SELECT * FROM login_challenges WHERE id = $1', [challengeId]);
  const challenge = result.rows[0];
  if (!challenge) throw new AppError(400, 'LOGIN_CHALLENGE_NOT_FOUND', 'Запит на вхід не знайдено. Увійдіть ще раз.');
  if (challenge.consumed_at) {
    throw new AppError(400, 'LOGIN_CHALLENGE_USED', 'Цей код уже використано. Увійдіть ще раз.');
  }
  return { challenge, user: await loadUser(String(challenge.user_id)) };
}

function cooldownSeconds(challenge: ChallengeRow): number {
  const elapsed = (Date.now() - new Date(challenge.created_at).getTime()) / 1000;
  return Math.max(0, Math.ceil(config.LOGIN_SMS_COOLDOWN_SECONDS - elapsed));
}

/** Повторна відправка коду тим самим каналом (Miston або SMS). */
export async function resendLoginChallenge(challengeId: string): Promise<LoginChallengeView> {
  const { challenge } = await loadChallenge(challengeId);
  const cooldown = cooldownSeconds(challenge);
  if (cooldown > 0) {
    throw new AppError(429, 'LOGIN_CODE_COOLDOWN', `Повторно надіслати код можна через ${cooldown} с.`, {
      retryAfter: cooldown,
    });
  }
  const forceEmail = challenge.delivery === 'email';
  return issueLoginChallenge(String(challenge.user_id), { forceEmail });
}

/** Перемикання на email, коли немає доступу до Miston. */
export async function requestLoginEmail(challengeId: string): Promise<LoginChallengeView> {
  const { challenge, user } = await loadChallenge(challengeId);
  const cooldown = cooldownSeconds(challenge);
  if (cooldown > 0) {
    throw new AppError(429, 'LOGIN_CODE_COOLDOWN', `Повторно надіслати код можна через ${cooldown} с.`, {
      retryAfter: cooldown,
    });
  }
  return issueLoginChallenge(String(challenge.user_id), { forceEmail: true });
}

export interface VerifiedChallenge {
  userId: string;
  messageId: string | null;
}

/** Перевіряє 8-значний код і «спалює» запит на вхід. */
export async function verifyLoginChallenge(challengeId: string, code: string): Promise<VerifiedChallenge> {
  const { challenge, user } = await loadChallenge(challengeId);

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    throw new AppError(400, 'LOGIN_CODE_EXPIRED', 'Термін дії коду минув. Надішліть код ще раз.');
  }
  if (challenge.attempts >= config.LOGIN_CODE_MAX_ATTEMPTS) {
    throw new AppError(429, 'LOGIN_CODE_ATTEMPTS', 'Забагато невдалих спроб. Увійдіть ще раз.');
  }

  const expected = String(challenge.code_hash);
  const actual = loginCodeHash(String(challenge.user_id), code);
  const matches = expected.length === actual.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));

  if (!matches) {
    await query('UPDATE login_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
    const attemptsLeft = Math.max(0, config.LOGIN_CODE_MAX_ATTEMPTS - challenge.attempts - 1);
    throw new AppError(400, 'LOGIN_CODE_INVALID', 'Невірний код підтвердження входу.', { attemptsLeft });
  }

  await query('UPDATE login_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);

  // Прибираємо код із чату: історія має лишатися без одноразових секретів.
  const messageId = challenge.message_id == null ? null : String(challenge.message_id);
  if (messageId) {
    const when = new Intl.DateTimeFormat('uk-UA', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Kyiv',
    }).format(new Date());
    await replaceBotMessage(messageId, `✅ Вхід у Miston підтверджено ${when}.`);
  }

  return { userId: String(user.id), messageId };
}
