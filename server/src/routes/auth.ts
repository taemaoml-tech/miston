import { Router } from 'express';
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

const router = Router();
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/),
  displayName: z.string().trim().min(1).max(80),
  password,
});
const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});
const refreshSchema = z.object({ refreshToken: z.string().min(32).max(512) });

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
  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);

  const payload = await withTransaction(async (client) => {
    // Briefly serializes registration so first-user promotion is race-safe.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('relay:first-user'))");
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

  res.status(201).json(payload);
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

  const refresh = createRefreshToken();
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, refresh.hash, refresh.expiresAt],
  );
  res.json(authPayload(user, refresh.token));
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

export default router;
