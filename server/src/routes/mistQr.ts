import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { createRefreshToken } from '../utils/tokens';
import { authPayload } from './auth';

const router = Router();

// Генерація QR-токена для входу (з пристрою, де вже увійшли)
router.post('/generate', requireAuth, asyncHandler(async (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 хвилин
  await query(
    `INSERT INTO mist_qr_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, req.auth!.userId, expiresAt],
  );
  res.json({ token, expiresAt: expiresAt.toISOString() });
}));

// Верифікація QR-токена (з нового пристрою)
router.post('/verify', asyncHandler(async (req, res) => {
  const { token } = z.object({ token: z.string().min(10).max(64) }).parse(req.body);
  const result = await query<{ id: string; user_id: string; expires_at: Date; consumed_at: Date | null }>(
    'SELECT id, user_id, expires_at, consumed_at FROM mist_qr_tokens WHERE token = $1',
    [token],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Невірний QR-код');
  if (row.consumed_at) throw new Error('QR-код уже використано');
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new Error('Термін дії QR-коду минув');
  // Спалюємо токен
  await query('UPDATE mist_qr_tokens SET consumed_at = now() WHERE id = $1', [row.id]);
  // Видаємо сесію
  const userResult = await query<Record<string, unknown>>('SELECT * FROM users WHERE id = $1', [row.user_id]);
  const user = userResult.rows[0];
  if (!user) throw new Error('Користувача не знайдено');
  const device = { userAgent: null, ip: null };
  const refresh = createRefreshToken();
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refresh.hash, refresh.expiresAt, device.userAgent, device.ip],
  );
  res.json(authPayload(user, refresh.token));
}));

export default router;
