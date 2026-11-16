import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool';
import { config } from '../config/env';
import { AppError } from '../utils/errors';
import { createRefreshToken } from '../utils/tokens';

const TWO_FACTOR_TTL_MINUTES = 5;

export function twoFactorToken(userId: string): string {
  return jwt.sign({ userId, scope: '2fa' }, config.JWT_SECRET, { expiresIn: `${TWO_FACTOR_TTL_MINUTES}m` });
}

export function verifyTwoFactorToken(token: string): string {
  const payload = jwt.verify(token, config.JWT_SECRET);
  if (typeof payload === 'string' || payload.scope !== '2fa' || typeof payload.userId !== 'string') {
    throw new AppError(401, 'INVALID_2FA_TOKEN', 'Недійсний запит другого етапу перевірки.');
  }
  return payload.userId;
}

export async function issueTwoFactorChallenge(userId: string): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO two_factor_challenges (user_id, expires_at)
     VALUES ($1, now() + make_interval(mins => $2)) RETURNING id`,
    [userId, TWO_FACTOR_TTL_MINUTES],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Two-factor challenge insert failed');
  return id;
}

export async function consumeTwoFactorChallenge(challengeId: string, userId: string): Promise<void> {
  const result = await query(
    `UPDATE two_factor_challenges
     SET consumed_at = now()
     WHERE id = $1 AND user_id = $2 AND consumed_at IS NULL AND expires_at > now()
     RETURNING id`,
    [challengeId, userId],
  );
  if (result.rowCount === 0) {
    throw new AppError(400, 'TWO_FACTOR_EXPIRED', 'Термін підтвердження минув. Увійдіть ще раз.');
  }
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const result = await query<{ two_factor_enabled: boolean }>(
    'SELECT two_factor_enabled FROM users WHERE id = $1',
    [userId],
  );
  return Boolean(result.rows[0]?.two_factor_enabled);
}

export async function getTwoFactorHint(userId: string): Promise<string | null> {
  const result = await query<{ two_factor_hint: string | null }>(
    'SELECT two_factor_hint FROM users WHERE id = $1',
    [userId],
  );
  return result.rows[0]?.two_factor_hint ?? null;
}

export async function enableTwoFactor(userId: string, password: string, currentPassword: string): Promise<void> {
  // Перевіряємо поточний пароль акаунта.
  const userResult = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const hash = userResult.rows[0]?.password_hash;
  if (!hash) throw new AppError(401, 'UNAUTHORIZED', 'Користувача не знайдено.');
  const ok = await bcrypt.compare(currentPassword, hash);
  if (!ok) throw new AppError(400, 'INVALID_PASSWORD', 'Невірний поточний пароль.');

  const factorHash = await bcrypt.hash(password, 12);
  await query(
    `UPDATE users
     SET two_factor_enabled = true, two_factor_password_hash = $2, two_factor_hint = $3, updated_at = now()
     WHERE id = $1`,
    [userId, factorHash, null],
  );
}

export async function disableTwoFactor(userId: string, currentPassword: string): Promise<void> {
  const userResult = await query<{ password_hash: string; two_factor_password_hash: string | null; two_factor_enabled: boolean }>(
    'SELECT password_hash, two_factor_password_hash, two_factor_enabled FROM users WHERE id = $1',
    [userId],
  );
  const row = userResult.rows[0];
  if (!row) throw new AppError(401, 'UNAUTHORIZED', 'Користувача не знайдено.');
  if (!row.two_factor_enabled) return;
  // Дозволяємо вимкнути або паролем акаунта, або паролем 2FA.
  const accountOk = await bcrypt.compare(currentPassword, row.password_hash);
  const factorOk = row.two_factor_password_hash
    ? await bcrypt.compare(currentPassword, row.two_factor_password_hash)
    : false;
  if (!accountOk && !factorOk) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Невірний пароль.');
  }
  await query(
    `UPDATE users
     SET two_factor_enabled = false, two_factor_password_hash = NULL, two_factor_hint = NULL, updated_at = now()
     WHERE id = $1`,
    [userId],
  );
}

export async function verifyTwoFactorPassword(userId: string, password: string): Promise<void> {
  const result = await query<{ two_factor_password_hash: string | null; two_factor_enabled: boolean }>(
    'SELECT two_factor_password_hash, two_factor_enabled FROM users WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (!row?.two_factor_enabled || !row.two_factor_password_hash) {
    throw new AppError(400, 'TWO_FACTOR_NOT_ENABLED', 'Двоетапна перевірка не увімкнена.');
  }
  const ok = await bcrypt.compare(password, row.two_factor_password_hash);
  if (!ok) throw new AppError(400, 'INVALID_TWO_FACTOR_PASSWORD', 'Невірний пароль двоетапної перевірки.');
}
