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
  // Необов'язкова тека зі зібраним клієнтом (використовується десктопною збіркою).
  CLIENT_DIR: z.string().optional(),
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
  // Twilio: підтвердження номера телефону 8-значним кодом з SMS.
  TWILIO_ACCOUNT_SID: z.string().trim().optional(),
  TWILIO_AUTH_TOKEN: z.string().trim().optional(),
  TWILIO_FROM_NUMBER: z.string().trim().optional(),
  // Zavu: уніфікований API для SMS/WhatsApp/e-mail (docs.zavu.dev).
  ZAVU_API_KEY: z.string().trim().optional(),
  // Канал відправки: sms (власний номер), sms_oneway (спільні номери).
  // Якщо порожньо — Zavu сам обирає канал за номером отримувача.
  ZAVU_CHANNEL: z.string().trim().optional(),
  // Адреса відправника (E.164) — необов'язково, за замовчуванням береться дефолтний sender проєкту.
  ZAVU_FROM_NUMBER: z.string().trim().optional(),
  // База API (для локальних тестів можна вказати мок-сервер).
  ZAVU_API_BASE_URL: z.string().trim().default('https://api.zavu.dev'),
  PHONE_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
  PHONE_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  PHONE_SMS_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  // Підтвердження входу: код у чаті з ботом Miston або SMS.
  LOGIN_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(30).default(10),
  LOGIN_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  LOGIN_SMS_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  // SMS-повідомлення про нові повідомлення в месенджері.
  // Через скільки хвилин без відповіді в розмові вважатимемо, що людина "не читає".
  SMS_NOTIFY_IDLE_MINUTES: z.coerce.number().int().min(0).max(240).default(5),
  // Мінімальний інтервал між SMS в одну й ту саму розмову (хвилини).
  SMS_NOTIFY_THROTTLE_MINUTES: z.coerce.number().int().min(0).max(1440).default(10),
  // Максимум SMS на добу на користувача; 0 — без ліміту.
  SMS_NOTIFY_MAX_PER_DAY: z.coerce.number().int().min(0).max(1000).default(0),
  // Email (SMTP) для кодів підтвердження входу, коли немає доступу до Miston.
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_SECURE: booleanValue.default(false),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASS: z.string().trim().optional(),
  SMTP_FROM: z.string().trim().optional(),
  // Firebase Cloud Messaging (push-повідомлення про нові повідомлення).
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().trim().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().trim().optional(),
  // Лише для розробки/тестів.
  SMS_DEBUG_SHOW_CODE: booleanValue.default(false),
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
