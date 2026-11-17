import { Router } from 'express';
import type { Request } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { config } from '../config/env';
import { asyncHandler } from '../utils/http';
import { serializeUser } from '../utils/serializers';
import { createRefreshToken, hashRefreshToken, signAccessToken } from '../utils/tokens';
import { password } from '../utils/validation';
import { AppError, unauthorized } from '../utils/errors';
import { normalizePhone } from '../utils/phone';
import { isUserOnline } from '../sockets/presence';
import {
  consumeTwoFactorChallenge,
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorHint,
  isTwoFactorEnabled,
  issueTwoFactorChallenge,
  twoFactorToken,
  verifyTwoFactorPassword,
  verifyTwoFactorToken,
} from '../services/twoFactor';
import { sendSms, smsConfigured } from '../services/sms';
import {
  issueLoginChallenge,
  requestLoginEmail,
  resendLoginChallenge,
  verifyLoginChallenge,
} from '../services/loginConfirm';

const router = Router();
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/),
  displayName: z.string().trim().min(1).max(80),
  password,
  phone: z.string().trim().min(5).max(30).optional(),
});
const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});
const refreshSchema = z.object({ refreshToken: z.string().min(32).max(512) });
const challengeSchema = z.object({ challengeId: z.string().uuid() });
const challengeConfirmSchema = challengeSchema.extend({ code: z.string().trim().regex(/^\d{8}$/) });
const phoneRequestSchema = z.object({ phone: z.string().trim().min(5).max(30) });
const phoneVerifySchema = z.object({ code: z.string().trim().regex(/^\d{8}$/) });

function hashCode(userId: string, code: string): string {
  return crypto.createHmac('sha256', config.JWT_SECRET).update(`${userId}:${code}`).digest('hex');
}

interface IssuedPhoneCode {
  expiresAt: Date;
  debugCode?: string;
}

/**
 * Creates a fresh 8-digit SMS code for the user, stores only its HMAC and the
 * phone number, then sends the SMS through Twilio. In local development codes
 * can be returned to the client when SMS_DEBUG_SHOW_CODE=true.
 */
async function issuePhoneCode(userId: string, phone: string): Promise<IssuedPhoneCode> {
  const twilioReady = smsConfigured();
  if (!twilioReady && !config.SMS_DEBUG_SHOW_CODE) {
    throw new AppError(
      503,
      'SMS_NOT_CONFIGURED',
      'Відправка SMS ще не налаштована. Додайте ZAVU_API_KEY (або дані Twilio) в налаштуваннях сервера.',
    );
  }

  const ttl = config.PHONE_CODE_TTL_MINUTES;
  const code = String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');

  await query(
    'UPDATE phone_verification_codes SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL',
    [userId],
  );
  const inserted = await query<{ id: string; expires_at: Date }>(
    `INSERT INTO phone_verification_codes (user_id, phone_number, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))
     RETURNING id, expires_at`,
    [userId, phone, hashCode(userId, code), ttl],
  );
  // Номер зберігається в users лише після підтвердження, щоб не «резервувати»
  // чужі номери, якщо людина так і не ввела код.

  if (twilioReady) {
    try {
      await sendSms(phone, `Miston: ваш код підтвердження ${code}. Діє ${ttl} хв.`);
    } catch (error) {
      // Невдала відправка не повинна «з'їдати» спробу: код стає недійсним.
      await query(
        'UPDATE phone_verification_codes SET consumed_at = now() WHERE id = $1',
        [inserted.rows[0]?.id ?? null],
      );
      throw error;
    }
  }

  return {
    expiresAt: inserted.rows[0]?.expires_at ?? new Date(Date.now() + ttl * 60_000),
    ...(twilioReady ? {} : { debugCode: code }),
  };
}

function authPayload(user: Record<string, unknown>, refreshToken: string) {
  const serialized = serializeUser(user);
  return {
    token: signAccessToken(serialized.id, serialized.role),
    refreshToken,
    user: serialized,
  };
}

/**
 * Токен-видачі перевіряють блокування окремо від requireAuth: заблокований
 * акаунт не повинен отримати ні нового доступу, ні оновленого refresh-токена.
 */
function assertNotBlocked(row: Record<string, unknown>): void {
  const blockedAt = row.blocked_at as Date | null | undefined;
  const blockedUntil = row.blocked_until as Date | null | undefined;
  if (!blockedAt || (blockedUntil && blockedUntil.getTime() <= Date.now())) return;
  const reason = String(row.blocked_reason ?? '');
  throw new AppError(
    403,
    'ACCOUNT_BLOCKED',
    `Акаунт заблоковано${blockedUntil ? ` до ${blockedUntil.toISOString().slice(0, 16)} UTC` : ''}${reason ? `. Причина: ${reason}` : ''}`,
    { userId: String(row.id) },
  );
}

router.post('/register', asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) {
    throw new AppError(400, 'INVALID_PHONE', 'Вкажіть коректний номер телефону, наприклад +380501234567.');
  }
  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);

  const payload = await withTransaction(async (client) => {
    // Briefly serializes registration so first-user promotion is race-safe.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('relay:first-user'))");
    if (phone) {
      const taken = await client.query('SELECT 1 FROM users WHERE phone_number = $1', [phone]);
      if (taken.rowCount) {
        throw new AppError(409, 'PHONE_TAKEN', 'Цей номер телефону вже прив’язаний до іншого акаунта.');
      }
    }
    const existing = await client.query<{ has_users: boolean }>('SELECT EXISTS (SELECT 1 FROM users) AS has_users');
    const role = existing.rows[0]?.has_users ? 'user' : 'owner';
    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO users (email, username, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.email, input.username, input.displayName, passwordHash, role],
    );
    const user = inserted.rows[0];
    if (!user) throw new Error('User insert returned no row');
    await client.query('INSERT INTO user_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    const refresh = createRefreshToken();
    await client.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, refresh.hash, refresh.expiresAt],
    );
    return authPayload(user, refresh.token);
  });

  let phoneVerificationSent = false;
  let phoneDebugCode: string | undefined;
  if (phone) {
    try {
      const issued = await issuePhoneCode(payload.user.id, phone);
      phoneVerificationSent = true;
      phoneDebugCode = issued.debugCode;
    } catch (error) {
      console.error('Failed to send the registration SMS', error instanceof Error ? error.message : error);
    }
  }

  res.status(201).json({
    ...payload,
    ...(phone ? { user: { ...payload.user, phoneNumber: phone, phoneVerified: false }, phoneVerificationSent } : {}),
    ...(phoneDebugCode ? { phoneDebugCode } : {}),
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await query<Record<string, unknown>>(
    'SELECT * FROM users WHERE email = $1 OR username = $1 LIMIT 1',
    [input.identifier],
  );
  const user = result.rows[0];
  const matches = await bcrypt.compare(input.password, String(user?.password_hash ?? DUMMY_HASH));
  if (!user || !matches) throw unauthorized('Невірні дані для входу');
  assertNotBlocked(user);

  // Акаунти без підтвердженого номера і без активної сесії Miston входять як раніше:
  // інакше такі користувачі назавжди втратили б доступ. Після входу застосунок
  // запропонує прив'язати номер телефону (екран підтвердження).
  const hasPhone = Boolean(user.phone_number && user.phone_verified_at);
  const online = isUserOnline(String(user.id));
  if ((!hasPhone && !online) || user.skip_login_confirmation === true) {
    const refresh = createRefreshToken();
    const device = deviceInfo(req);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, refresh.hash, refresh.expiresAt, device.userAgent, device.ip],
    );
    res.json(authPayload(user, refresh.token));
    return;
  }

  // Пароль правильний, але сесію ще не видаємо: спершу 8-значний код.
  // Він приходить у чат із ботом Miston, або SMS, якщо доступу до застосунку немає.
  res.json(await issueLoginChallenge(String(user.id)));
}));

const deviceInfo = (req: Request) => ({
  userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
  ip: String(req.ip ?? '').slice(0, 64) || null,
});

/** Коди підтвердження входу: перевірка, повторна відправка, перехід на SMS. */
router.post('/login/verify', asyncHandler(async (req, res) => {
  const { challengeId, code } = challengeConfirmSchema.parse(req.body);
  const { userId } = await verifyLoginChallenge(challengeId, code);
  const result = await query<Record<string, unknown>>('SELECT * FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];
  if (!user) throw unauthorized('Користувача не знайдено');
  assertNotBlocked(user);

  // Другий етап: якщо увімкнено двоетапну перевірку, спершу просимо пароль.
  if (user.two_factor_enabled) {
    const tfToken = twoFactorToken(String(user.id));
    res.json({ twoFactorRequired: true, twoFactorToken: tfToken });
    return;
  }

  const device = deviceInfo(req);
  const refresh = createRefreshToken();
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refresh.hash, refresh.expiresAt, device.userAgent, device.ip],
  );
  res.json(authPayload(user, refresh.token));
}));

router.post('/login/resend', asyncHandler(async (req, res) => {
  const { challengeId } = challengeSchema.parse(req.body);
  res.json(await resendLoginChallenge(challengeId));
}));

router.post('/login/email', asyncHandler(async (req, res) => {
  const { challengeId } = challengeSchema.parse(req.body);
  res.json(await requestLoginEmail(challengeId));
}));

router.post('/login/2fa', asyncHandler(async (req, res) => {
  const { token: tfToken, password: tfPassword } = z.object({
    token: z.string().min(10),
    password: z.string().min(1).max(128),
  }).parse(req.body);
  const userId = verifyTwoFactorToken(tfToken);
  await verifyTwoFactorPassword(userId, tfPassword);
  const result = await query<Record<string, unknown>>('SELECT * FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];
  if (!user) throw unauthorized('Користувача не знайдено');
  assertNotBlocked(user);
  const device = deviceInfo(req);
  const refresh = createRefreshToken();
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refresh.hash, refresh.expiresAt, device.userAgent, device.ip],
  );
  res.json(authPayload(user, refresh.token));
}));

/** Двоетапна перевірка. */
router.get('/2fa', requireAuth, asyncHandler(async (req, res) => {
  res.json({
    enabled: await isTwoFactorEnabled(req.auth!.userId),
    hint: await getTwoFactorHint(req.auth!.userId),
  });
}));

router.post('/2fa/setup', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, password, hint } = z.object({
    currentPassword: z.string().min(1).max(128),
    password: z.string().min(6).max(128),
    hint: z.string().trim().max(100).optional(),
  }).parse(req.body);
  await enableTwoFactor(req.auth!.userId, password, currentPassword);
  if (hint) {
    await query('UPDATE users SET two_factor_hint = $2, updated_at = now() WHERE id = $1', [req.auth!.userId, hint]);
  }
  res.json({ enabled: true });
}));

router.post('/2fa/disable', requireAuth, asyncHandler(async (req, res) => {
  const { password } = z.object({ password: z.string().min(1).max(128) }).parse(req.body);
  await disableTwoFactor(req.auth!.userId, password);
  res.json({ enabled: false });
}));

/** Активні сесії для екрана «Пристрої». */
router.get('/sessions', requireAuth, asyncHandler(async (req, res) => {
  const result = await query<{ id: string; created_at: Date; expires_at: Date; user_agent: string | null; ip_address: string | null }>(
    `SELECT id, created_at, expires_at, user_agent, ip_address
     FROM refresh_tokens
     WHERE user_id = $1 AND expires_at > now()
     ORDER BY created_at DESC`,
    [req.auth!.userId],
  );
  res.json({
    sessions: result.rows.map((row) => ({
      id: String(row.id),
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
    })),
  });
}));

router.delete('/sessions/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const result = await query(
    'DELETE FROM refresh_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, req.auth!.userId],
  );
  if (result.rowCount === 0) throw new AppError(404, 'SESSION_NOT_FOUND', 'Сесію не знайдено.');
  res.status(204).send();
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokenHash = hashRefreshToken(refreshToken);

  const payload = await withTransaction(async (client) => {
    // Locking and consuming the old token in one transaction makes rotation replay-safe.
    const result = await client.query<Record<string, unknown>>(
      `SELECT u.* FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > now()
       FOR UPDATE OF rt`,
      [tokenHash],
    );
    const user = result.rows[0];
    if (!user) throw unauthorized('Недійсний або протермінований токен оновлення');
    assertNotBlocked(user);

    await client.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    const refresh = createRefreshToken();
    await client.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, refresh.hash, refresh.expiresAt],
    );
    return authPayload(user, refresh.token);
  });

  res.json(payload);
}));

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  await query('DELETE FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2', [
    hashRefreshToken(refreshToken), req.auth!.userId,
  ]);
  res.status(204).send();
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const result = await query<Record<string, unknown>>('SELECT * FROM users WHERE id = $1', [req.auth!.userId]);
  if (!result.rows[0]) throw unauthorized('Користувача більше не існує');
  res.json({ user: serializeUser(result.rows[0]) });
}));

router.get('/phone', requireAuth, asyncHandler(async (req, res) => {
  const result = await query<Record<string, unknown>>('SELECT * FROM users WHERE id = $1', [req.auth!.userId]);
  const user = result.rows[0];
  if (!user) throw unauthorized();
  const pending = await query<{ phone_number: string; expires_at: Date }>(
    `SELECT phone_number, expires_at FROM phone_verification_codes
     WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [req.auth!.userId],
  );
  res.json({
    phoneNumber: user.phone_number == null ? null : String(user.phone_number),
    phoneVerified: user.phone_verified_at != null,
    smsNotificationsEnabled: user.sms_notifications_enabled !== false,
    pendingPhone: pending.rows[0]?.phone_number ?? null,
    pendingExpiresAt: pending.rows[0]?.expires_at ?? null,
    smsConfigured: smsConfigured() || config.SMS_DEBUG_SHOW_CODE,
  });
}));

router.patch('/phone/notifications', requireAuth, asyncHandler(async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  const result = await query<Record<string, unknown>>(
    'UPDATE users SET sms_notifications_enabled = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [req.auth!.userId, enabled],
  );
  const user = result.rows[0];
  if (!user) throw unauthorized();
  res.json({ user: serializeUser(user), smsNotificationsEnabled: user.sms_notifications_enabled !== false });
}));

router.post('/phone/request', requireAuth, asyncHandler(async (req, res) => {
  const input = phoneRequestSchema.parse(req.body);
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw new AppError(400, 'INVALID_PHONE', 'Вкажіть коректний номер телефону, наприклад +380501234567.');
  }

  const taken = await query('SELECT 1 FROM users WHERE phone_number = $1 AND id <> $2', [phone, req.auth!.userId]);
  if (taken.rowCount) {
    throw new AppError(409, 'PHONE_TAKEN', 'Цей номер телефону вже прив’язаний до іншого акаунта.');
  }

  const cooldown = await query<{ seconds_left: number }>(
    `SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (created_at + make_interval(secs => $2) - now()))))::int AS seconds_left
     FROM phone_verification_codes
     WHERE user_id = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [req.auth!.userId, config.PHONE_SMS_COOLDOWN_SECONDS],
  );
  const secondsLeft = cooldown.rows[0]?.seconds_left ?? 0;
  if (secondsLeft > 0) {
    throw new AppError(
      429,
      'PHONE_CODE_COOLDOWN',
      `Повторно надіслати код можна через ${secondsLeft} с.`,
      { retryAfter: secondsLeft },
    );
  }

  const issued = await issuePhoneCode(req.auth!.userId, phone);
  res.json({
    sent: true,
    phoneNumber: phone,
    expiresAt: issued.expiresAt,
    ...(issued.debugCode ? { debugCode: issued.debugCode } : {}),
  });
}));

router.post('/phone/verify', requireAuth, asyncHandler(async (req, res) => {
  const { code } = phoneVerifySchema.parse(req.body);

  const updated = await withTransaction(async (client) => {
    const pending = await client.query<Record<string, unknown>>(
      `SELECT * FROM phone_verification_codes
       WHERE user_id = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [req.auth!.userId],
    );
    const row = pending.rows[0];
    if (!row) {
      throw new AppError(400, 'PHONE_CODE_NOT_FOUND', 'Спочатку запросіть код підтвердження.');
    }
    if (new Date(row.expires_at as string).getTime() <= Date.now()) {
      throw new AppError(400, 'PHONE_CODE_EXPIRED', 'Термін дії коду минув. Запросіть новий код.');
    }
    if (Number(row.attempts) >= config.PHONE_CODE_MAX_ATTEMPTS) {
      throw new AppError(429, 'PHONE_CODE_ATTEMPTS', 'Забагато невдалих спроб. Запросіть новий код.');
    }

    const expected = String(row.code_hash);
    const actual = hashCode(req.auth!.userId, code);
    const matches = expected.length === actual.length
      && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));

    await client.query('UPDATE phone_verification_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);

    if (!matches) {
      const attemptsLeft = Math.max(0, config.PHONE_CODE_MAX_ATTEMPTS - Number(row.attempts) - 1);
      throw new AppError(400, 'PHONE_CODE_INVALID', 'Невірний код. Спробуйте ще раз.', { attemptsLeft });
    }

    await client.query('UPDATE phone_verification_codes SET consumed_at = now() WHERE id = $1', [row.id]);
    let user: Record<string, unknown> | undefined;
    try {
      const userResult = await client.query<Record<string, unknown>>(
        'UPDATE users SET phone_number = $2, phone_verified_at = now() WHERE id = $1 RETURNING *',
        [req.auth!.userId, String(row.phone_number)],
      );
      user = userResult.rows[0];
    } catch (error) {
      // Унікальний індекс users.phone_number: номер уже підтверджено іншим акаунтом.
      if ((error as { code?: string }).code === '23505') {
        throw new AppError(409, 'PHONE_TAKEN', 'Цей номер телефону вже прив’язаний до іншого акаунта.');
      }
      throw error;
    }
    if (!user) throw unauthorized();
    return user;
  });

  res.json({ user: serializeUser(updated), verified: true });
}));

export default router;
