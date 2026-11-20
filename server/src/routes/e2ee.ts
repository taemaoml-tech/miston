import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { AppError, forbidden, notFound } from '../utils/errors';
import { uuid } from '../utils/validation';

/**
 * E2EE-сервіс зберігає тільки те, чим можна ділитися відкрито:
 * публічні ключі учасників, ключ розмови загорнутий RSA-OAEP для кожного
 * учасника, і резервну копію приватного ключа, зашифровану паролем.
 * Сервер ніколи не бачить приватний ключ, пароль або відкритий текст.
 */
const router = Router();
router.use(requireAuth);

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).min(8).max(16_000);
const publicKeySchema = z.object({ publicKey: base64.max(2_000) });
const wrappedKeySchema = z.object({
  userId: uuid,
  wrappedKey: base64.max(2_000),
});
const keysSchema = z.object({ keys: z.array(wrappedKeySchema).min(1).max(200) });
const backupSchema = z.object({
  salt: base64.max(200),
  iv: base64.max(200),
  ciphertext: base64.max(16_000),
  iterations: z.number().int().min(100_000).max(2_000_000),
});

async function assertMember(conversationId: string, userId: string): Promise<void> {
  const result = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  if (result.rowCount === 0) throw forbidden('Ця розмова вам недоступна');
}

router.get('/me', asyncHandler(async (req, res) => {
  const result = await query<{ e2ee_public_key: string | null }>(
    'SELECT e2ee_public_key FROM users WHERE id = $1', [req.auth!.userId],
  );
  const backup = await query('SELECT 1 FROM e2ee_backups WHERE user_id = $1', [req.auth!.userId]);
  res.json({
    enabled: Boolean(result.rows[0]?.e2ee_public_key),
    publicKey: result.rows[0]?.e2ee_public_key ?? null,
    hasBackup: (backup.rowCount ?? 0) > 0,
  });
}));

/** Публічні ключі учасників — потрібні, щоб загорнути ключ розмови для кожного з них. */
router.get('/public-keys', asyncHandler(async (req, res) => {
  const idsRaw = typeof req.query.ids === 'string' ? req.query.ids : '';
  const ids = [...new Set(idsRaw.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 200);
  if (ids.length === 0) {
    res.json({ keys: {} });
    return;
  }
  const result = await query<{ id: string; e2ee_public_key: string | null }>(
    'SELECT id, e2ee_public_key FROM users WHERE id = ANY($1::uuid[]) AND e2ee_public_key IS NOT NULL',
    [ids],
  );
  const keys: Record<string, string> = {};
  for (const row of result.rows) keys[String(row.id)] = String(row.e2ee_public_key);
  res.json({ keys });
}));

router.put('/public-key', asyncHandler(async (req, res) => {
  const { publicKey } = publicKeySchema.parse(req.body);
  await query(
    'UPDATE users SET e2ee_public_key = $2, e2ee_public_key_updated_at = now() WHERE id = $1',
    [req.auth!.userId, publicKey],
  );
  res.json({ ok: true });
}));

router.delete('/public-key', asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE users SET e2ee_public_key = NULL, e2ee_public_key_updated_at = NULL WHERE id = $1',
      [req.auth!.userId],
    );
    await client.query('DELETE FROM e2ee_conversation_keys WHERE user_id = $1', [req.auth!.userId]);
  });
  res.json({ ok: true });
}));

router.get('/conversations/:id/key', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  await assertMember(id, req.auth!.userId);
  const result = await query<{ wrapped_key: string; key_version: number }>(
    'SELECT wrapped_key, key_version FROM e2ee_conversation_keys WHERE conversation_id = $1 AND user_id = $2',
    [id, req.auth!.userId],
  );
  const row = result.rows[0];
  res.json({
    wrappedKey: row?.wrapped_key ?? null,
    keyVersion: row?.key_version ?? null,
  });
}));

/** Учасники, для яких уже є загорнутий ключ розмови. */
router.get('/conversations/:id/key/members', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  await assertMember(id, req.auth!.userId);
  const result = await query<{ user_id: string }>(
    'SELECT user_id FROM e2ee_conversation_keys WHERE conversation_id = $1', [id],
  );
  res.json({ userIds: result.rows.map((row) => String(row.user_id)) });
}));

/** Клієнт зберігає ключ розмови, загорнутий окремо для кожного учасника. */
router.post('/conversations/:id/keys', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { keys } = keysSchema.parse(req.body);
  await assertMember(id, req.auth!.userId);
  const members = await query<{ user_id: string }>(
    'SELECT user_id FROM conversation_members WHERE conversation_id = $1',
    [id],
  );
  const allowed = new Set(members.rows.map((row) => String(row.user_id)));
  if (keys.some((entry) => !allowed.has(entry.userId))) {
    throw new AppError(400, 'INVALID_E2EE_MEMBER', 'Ключ можна зберегти лише для учасника розмови');
  }
  await withTransaction(async (client) => {
    for (const entry of keys) {
      await client.query(
        `INSERT INTO e2ee_conversation_keys (conversation_id, user_id, wrapped_key, key_version, updated_at)
         VALUES ($1, $2, $3, 1, now())
         ON CONFLICT (conversation_id, user_id)
         DO UPDATE SET wrapped_key = EXCLUDED.wrapped_key, updated_at = now()`,
        [id, entry.userId, entry.wrappedKey],
      );
    }
  });
  res.json({ ok: true });
}));

router.get('/backup', asyncHandler(async (req, res) => {
  const result = await query<{ salt: string; iv: string; ciphertext: string; iterations: number; updated_at: Date }>(
    'SELECT salt, iv, ciphertext, iterations, updated_at FROM e2ee_backups WHERE user_id = $1',
    [req.auth!.userId],
  );
  const row = result.rows[0];
  res.json({
    backup: row ? {
      salt: String(row.salt),
      iv: String(row.iv),
      ciphertext: String(row.ciphertext),
      iterations: Number(row.iterations),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    } : null,
  });
}));

router.put('/backup', asyncHandler(async (req, res) => {
  const backup = backupSchema.parse(req.body);
  await query(
    `INSERT INTO e2ee_backups (user_id, salt, iv, ciphertext, iterations, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET
       salt = EXCLUDED.salt, iv = EXCLUDED.iv, ciphertext = EXCLUDED.ciphertext,
       iterations = EXCLUDED.iterations, updated_at = now()`,
    [req.auth!.userId, backup.salt, backup.iv, backup.ciphertext, backup.iterations],
  );
  res.json({ ok: true });
}));

router.delete('/backup', asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM e2ee_backups WHERE user_id = $1', [req.auth!.userId]);
  if (result.rowCount === 0) throw notFound('Резервну копію не знайдено');
  res.json({ ok: true });
}));

export default router;
