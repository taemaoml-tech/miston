import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const booleanValue = z.preprocess(
  (value) => value === 'true' ? true : value === 'false' ? false : value,
  z.boolean(),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('postgresql://relay:change-me@localhost:5432/relay'),
  JWT_SECRET: z.string().min(32).default('development-secret-change-in-production-32chars'),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_URL: z.string().min(1).default('http://localhost:5173'),
  UPLOAD_DIR: z.string().min(1).default('uploads'),
  MAX_FILE_SIZE: z.coerce.number().int().positive().max(1024 * 1024 * 1024).default(25 * 1024 * 1024),
  MAX_STICKER_SIZE: z.coerce.number().int().positive().max(16 * 1024 * 1024).default(1024 * 1024),
  TRUST_PROXY: booleanValue.default(false),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),
  // Render підставляє власний рядок підключення без sslmode, тому перемикач
  // окремий від URL: auto — слідувати за sslmode=require, require — TLS без
  // перевірки сертифіката, verify — TLS із перевіркою, disable — без TLS.
  DB_SSL: z.enum(['auto', 'disable', 'require', 'verify']).default('auto'),
  WEBRTC_STUN_URLS: z.string().default('stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'),
  WEBRTC_TURN_URL: z.string().optional(),
  WEBRTC_TURN_USERNAME: z.string().optional(),
  WEBRTC_TURN_CREDENTIAL: z.string().optional(),
  CALL_RING_TIMEOUT_MS: z.coerce.number().int().min(5000).max(180000).default(45000),
  MAX_CALL_PARTICIPANTS: z.coerce.number().int().min(2).max(20).default(6),
});

const env = schema.parse(process.env);

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const stunServers: IceServerConfig[] = env.WEBRTC_STUN_URLS
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)
  .map((urls) => ({ urls }));

const iceServers: IceServerConfig[] = [
  ...stunServers,
  ...(env.WEBRTC_TURN_URL
    ? [{
        urls: env.WEBRTC_TURN_URL,
        username: env.WEBRTC_TURN_USERNAME ?? '',
        credential: env.WEBRTC_TURN_CREDENTIAL ?? '',
      }]
    : []),
];

export const config = {
  ...env,
  UPLOAD_DIR: path.resolve(env.UPLOAD_DIR),
  CORS_ORIGINS: env.CLIENT_URL.split(',').map((origin) => origin.trim()).filter(Boolean),
  ICE_SERVERS: iceServers,
} as const;
