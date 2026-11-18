import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { AppError } from '../utils/errors';
import { createRefreshToken } from '../utils/tokens';
import { assertNotBlocked, authPayload } from './auth';

const router = Router();

const QR_TTL_MS = 5 * 60 * 1000;
const LOGIN_PREFIX = 'mistlogin:';

const tokenSchema = z.object({ token: z.string().trim().min(10).max(96) });

/** QR несепрефіксований токен, щоб сканер друзів не сприйняв його за Mist ID. */
function normalizeLoginToken(raw: string): string {
  const value = raw.trim();
  return value.startsWith(LOGIN_PREFIX) ? value.slice(LOGIN_PREFIX.length).trim() : value;
}

function newToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

async function issueSession(userId: string, userAgent: string | null, ip: string | null) {
  const userResult = await query<Record<string, unknown>>('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
  assertNotBlocked(user);

  const refresh = createRefreshToken();
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refresh.hash, refresh.expiresAt, userAgent, ip],
  );
  return authPayload(user, refresh.token);
}

function clientMeta(req: Request): { userAgent: string | null; ip: string | null } {
  return {
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : null,
    ip: typeof req.ip === 'string' ? req.ip.slice(0, 64) : null,
  };
}

// ── Старий напрямок: залогінений пристрій видає токен, новий його вводить. ──

// Генерація одноразового QR-токена для входу (з пристрою, де вже увійшли).
router.post('/generate', requireAuth, asyncHandler(async (req, res) => {
  const token = newToken();
  const expiresAt = new Date(Date.now() + QR_TTL_MS);
  await query(
    `INSERT INTO mist_qr_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, req.auth!.userId, expiresAt],
  );
  res.json({ token, expiresAt: expiresAt.toISOString() });
}));

// Вхід за QR-токеном (з нового пристрою).
router.post('/verify', asyncHandler(async (req, res) => {
  const { token: rawToken } = tokenSchema.parse(req.body);
  const token = normalizeLoginToken(rawToken);

  // Атомарно спалюємо токен: дві одночасні спроби не зможуть використати його двічі.
  const consumed = await query<{ user_id: string }>(
    `UPDATE mist_qr_tokens
     SET consumed_at = now()
     WHERE token = $1 AND consumed_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [token],
  );
  const userId = consumed.rows[0]?.user_id;
  if (!userId) {
    const known = await query('SELECT 1 FROM mist_qr_tokens WHERE token = $1', [token]);
    throw new AppError(
      400,
      'QR_INVALID',
      known.rowCount ? 'Термін дії QR-коду минув або його вже використано.' : 'Невірний QR-код.',
    );
  }

  const meta = clientMeta(req);
  res.json(await issueSession(userId, meta.userAgent, meta.ip));
}));

// ── Новий напрямок: новий пристрій показує QR, телефон його сканує. ──

// Створення запиту на вхід з пристрою, де ще немає сесії.
router.post('/session', asyncHandler(async (_req, res) => {
  const token = newToken();
  const expiresAt = new Date(Date.now() + QR_TTL_MS);
  await query(
    `INSERT INTO mist_qr_login_sessions (token, expires_at) VALUES ($1, $2)`,
    [token, expiresAt],
  );
  // Саме цей рядок і кодується у QR-коді на сторінці входу.
  res.json({ token: `${LOGIN_PREFIX}${token}`, expiresAt: expiresAt.toISOString() });
}));

// Телефон підтверджує запит — без пароля і без додаткової перевірки.
router.post('/session/approve', requireAuth, asyncHandler(async (req, res) => {
  const { token: rawToken } = tokenSchema.parse(req.body);
  const token = normalizeLoginToken(rawToken);
  const userId = req.auth!.userId;

  const approved = await query<{ token: string }>(
    `UPDATE mist_qr_login_sessions
     SET user_id = $2, status = 'approved', approved_at = now()
     WHERE token = $1 AND status = 'pending' AND expires_at > now()
     RETURNING token`,
    [token, userId],
  );
  if (!approved.rows[0]) {
    const known = await query('SELECT status, expires_at FROM mist_qr_login_sessions WHERE token = $1', [token]);
    const row = known.rows[0] as { status: string; expires_at: Date } | undefined;
    if (!row) throw new AppError(404, 'QR_NOT_FOUND', 'QR-код не знайдено. Оновіть код на іншому пристрої.');
    if (row.status !== 'pending') throw new AppError(400, 'QR_ALREADY_USED', 'Цей QR-код уже підтверджено.');
    throw new AppError(400, 'QR_EXPIRED', 'Термін дії QR-коду минув. Оновіть код на іншому пристрої.');
  }
  res.json({ ok: true });
}));

// Новий пристрій опитує статус; після підтвердження отримує готову сесію.
router.post('/session/status', asyncHandler(async (req, res) => {
  const { token: rawToken } = tokenSchema.parse(req.body);
  const token = normalizeLoginToken(rawToken);

  const result = await query<{ user_id: string | null; status: string; expires_at: Date }>(
    `SELECT user_id, status, expires_at FROM mist_qr_login_sessions WHERE token = $1`,
    [token],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, 'QR_NOT_FOUND', 'QR-код не знайдено.');
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new AppError(400, 'QR_EXPIRED', 'Термін дії QR-коду минув.');
  if (row.status === 'pending') {
    res.json({ status: 'pending' });
    return;
  }
  if (row.status !== 'approved' || !row.user_id) {
    throw new AppError(400, 'QR_ALREADY_USED', 'Цей QR-код уже використано.');
  }

  // Атомарно спалюємо код: навіть протягом 5 хвилин його не можна використати двічі.
  const consumed = await query<{ user_id: string }>(
    `UPDATE mist_qr_login_sessions
     SET status = 'consumed'
     WHERE token = $1 AND status = 'approved' AND expires_at > now()
     RETURNING user_id`,
    [token],
  );
  const userId = consumed.rows[0]?.user_id;
  if (!userId) throw new AppError(400, 'QR_ALREADY_USED', 'Цей QR-код уже використано.');

  const meta = clientMeta(req);
  res.json({ status: 'approved', auth: await issueSession(userId, meta.userAgent, meta.ip) });
}));

export default router;
