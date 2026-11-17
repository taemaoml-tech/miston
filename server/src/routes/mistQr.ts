import { Router } from 'express';
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

// Генерація одноразового QR-токена для входу (з пристрою, де вже увійшли).
router.post('/generate', requireAuth, asyncHandler(async (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + QR_TTL_MS);
  await query(
    `INSERT INTO mist_qr_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, req.auth!.userId, expiresAt],
  );
  res.json({ token, expiresAt: expiresAt.toISOString() });
}));

// Вхід за QR-токеном (з нового пристрою).
router.post('/verify', asyncHandler(async (req, res) => {
  const { token } = z.object({ token: z.string().trim().min(10).max(64) }).parse(req.body);

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

  const userResult = await query<Record<string, unknown>>('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
  assertNotBlocked(user);

  const refresh = createRefreshToken();
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : null;
  const ip = typeof req.ip === 'string' ? req.ip.slice(0, 64) : null;
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refresh.hash, refresh.expiresAt, userAgent, ip],
  );

  res.json(authPayload(user, refresh.token));
}));

export default router;
