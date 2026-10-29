import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import type { AuthContext, UserRole } from '../types/domain';

const tokenOptions = {
  issuer: 'relay-messenger',
  audience: 'relay-messenger-api',
} as const;

export function signAccessToken(userId: string, role: UserRole): string {
  const options: SignOptions = {
    ...tokenOptions,
    expiresIn: config.JWT_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>,
  };
  return jwt.sign({ userId, role }, config.JWT_SECRET, options);
}

const ROLES: UserRole[] = ['user', 'moderator', 'owner'];

export function verifyAccessToken(token: string): AuthContext {
  const payload = jwt.verify(token, config.JWT_SECRET, tokenOptions);
  if (typeof payload === 'string' || typeof payload.userId !== 'string' ||
      !ROLES.includes(payload.role as UserRole)) {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }
  return { userId: payload.userId, role: payload.role as UserRole };
}

export function createRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, hash: hashRefreshToken(token), expiresAt };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
