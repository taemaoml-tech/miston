import { api } from '../api';
import type { Message } from '../types/models';

/**
 * Наскрізне шифрування Miston.
 *
 * Кожен користувач має пару RSA-OAEP 2048. Публічний ключ лежить на сервері,
 * приватний — лише в localStorage цього пристрою (або в резервній копії,
 * зашифрованій паролем). Кожна розмова має випадковий AES-GCM ключ, який
 * зберігається на сервері окремо загорнутим для кожного учасника. Сервер
 * бачить тільки шифротекст повідомлення.
 */
export const E2EE_VERSION = 1;

const STORAGE_PREFIX = 'miston.e2ee.identity.';
const OPTOUT_PREFIX = 'miston.e2ee.optout.';
const BACKUP_ITERATIONS = 210_000;
const keyCache = new Map<string, Uint8Array>();

export interface E2eeIdentity {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedPayload {
  content: string;
  encrypted: true;
  encryptionVersion: number;
}

function cacheKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function loadIdentity(userId: string): E2eeIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<E2eeIdentity>;
    if (typeof candidate.publicKey !== 'string' || typeof candidate.privateKey !== 'string') return null;
    return { publicKey: candidate.publicKey, privateKey: candidate.privateKey };
  } catch {
    return null;
  }
}

function saveIdentity(userId: string, identity: E2eeIdentity): void {
  localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(identity));
}

function clearLocalIdentity(userId: string): void {
  localStorage.removeItem(STORAGE_PREFIX + userId);
  keyCache.clear();
}

export function isE2eeOptedOut(userId: string): boolean {
  try { return localStorage.getItem(OPTOUT_PREFIX + userId) === '1'; } catch { return false; }
}

function setE2eeOptOut(userId: string, value: boolean): void {
  try {
    const key = OPTOUT_PREFIX + userId;
    if (value) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
}

function rsaAlgorithm(): RsaHashedImportParams {
  return { name: 'RSA-OAEP', hash: 'SHA-256' };
}

async function importPrivateKey(identity: E2eeIdentity): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', base64ToBytes(identity.privateKey), rsaAlgorithm(), false, ['decrypt']);
}

async function importPublicKey(publicKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToBytes(publicKey), rsaAlgorithm(), false, ['encrypt']);
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function deriveBackupKey(passphrase: string, salt: string, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToBytes(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Чи можна зараз шифрувати/розшифровувати на цьому пристрої. */
export function isE2eeReady(userId: string | null | undefined): boolean {
  return Boolean(userId && loadIdentity(userId));
}

/** Увімкнути E2EE: створити ключі на пристрої й опублікувати публічний ключ. */
export async function enableE2ee(userId: string): Promise<void> {
  const status = await api.e2ee.status();
  let identity = loadIdentity(userId);
  if (status.publicKey && (!identity || identity.publicKey !== status.publicKey)) {
    throw new Error('На цьому пристрої немає відповідного приватного ключа. Відновіть його з резервної копії.');
  }
  if (!identity) {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt'],
    ) as CryptoKeyPair;
    identity = {
      publicKey: bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))),
      privateKey: bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))),
    };
    saveIdentity(userId, identity);
  }
  if (status.publicKey !== identity.publicKey) await api.e2ee.publishPublicKey(identity.publicKey);
  setE2eeOptOut(userId, false);
}

export async function disableE2ee(userId: string): Promise<void> {
  await api.e2ee.disable();
  clearLocalIdentity(userId);
  setE2eeOptOut(userId, true);
}

/** Зашифрувати приватний ключ паролем і зберегти резервну копію на сервері. */
export async function createBackup(userId: string, passphrase: string): Promise<void> {
  const identity = loadIdentity(userId);
  if (!identity) throw new Error('Спочатку увімкніть шифрування');
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(passphrase, salt, BACKUP_ITERATIONS);
  const payload = new TextEncoder().encode(JSON.stringify(identity));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  await api.e2ee.saveBackup({
    salt,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iterations: BACKUP_ITERATIONS,
  });
}

/** Відновити приватний ключ на новому пристрої з пароля. */
export async function restoreBackup(userId: string, passphrase: string): Promise<void> {
  const { backup } = await api.e2ee.backup();
  if (!backup) throw new Error('Резервну копію не знайдено');
  const key = await deriveBackupKey(passphrase, backup.salt, backup.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(backup.iv) },
      key,
      base64ToBytes(backup.ciphertext),
    );
  } catch {
    throw new Error('Невірний пароль резервної копії');
  }
  let identity: E2eeIdentity;
  try {
    identity = JSON.parse(new TextDecoder().decode(plain)) as E2eeIdentity;
    if (!identity.publicKey || !identity.privateKey) throw new Error('Poisoned backup');
  } catch {
    throw new Error('Резервна копія пошкоджена');
  }
  const status = await api.e2ee.status();
  if (status.publicKey && status.publicKey !== identity.publicKey) {
    throw new Error('Резервна копія не відповідає ключу цього акаунта');
  }
  saveIdentity(userId, identity);
  keyCache.clear();
  if (!status.publicKey) await api.e2ee.publishPublicKey(identity.publicKey);
}

export async function removeBackup(): Promise<void> {
  await api.e2ee.deleteBackup();
}

async function resolveConversationKey(
  userId: string,
  conversationId: string,
  memberIds: string[] | undefined,
  createIfMissing: boolean,
): Promise<Uint8Array | null> {
  const cached = keyCache.get(cacheKey(userId, conversationId));
  if (cached) return cached;
  const identity = loadIdentity(userId);
  if (!identity) return null;

  const unwrap = async (wrappedKey: string): Promise<Uint8Array | null> => {
    try {
      const privateKey = await importPrivateKey(identity);
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, base64ToBytes(wrappedKey)));
    } catch {
      return null;
    }
  };

  const ids = [...new Set([...(memberIds ?? []), userId])];
  const wrapFor = async (raw: Uint8Array, targets: string[]) => {
    const { keys } = await api.e2ee.publicKeys(targets);
    const entries: Array<{ userId: string; wrappedKey: string }> = [];
    for (const id of targets) {
      const publicKey = keys[id];
      if (!publicKey) continue;
      try {
        const key = await importPublicKey(publicKey);
        const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, raw);
        entries.push({ userId: id, wrappedKey: bytesToBase64(new Uint8Array(wrapped)) });
      } catch {
        // Невалідний чужий ключ не блокує надсилання іншим учасникам.
      }
    }
    return entries;
  };

  // Якщо учасник увійшов у групу пізніше або щойно увімкнув E2EE,
  // роздаємо йому той самий ключ, не створюючи новий (інакше старі повідомлення
  // стали б нерозшифрованими для всіх).
  const distribute = async (raw: Uint8Array) => {
    if (!ids.length) return;
    const [existing, { keys }] = await Promise.all([
      api.e2ee.conversationKeyMembers(conversationId),
      api.e2ee.publicKeys(ids),
    ]);
    const missing = ids.filter((id) => !existing.userIds.includes(id) && Boolean(keys[id]));
    if (missing.length === 0) return;
    const entries = await wrapFor(raw, missing);
    if (entries.length) await api.e2ee.saveConversationKeys(conversationId, entries);
  };

  const record = await api.e2ee.conversationKey(conversationId);
  if (record.wrappedKey) {
    const raw = await unwrap(record.wrappedKey);
    if (raw) {
      if (createIfMissing) await distribute(raw);
      keyCache.set(cacheKey(userId, conversationId), raw);
      return raw;
    }
  }

  if (!createIfMissing || !memberIds?.length) return null;

  // Створюємо новий ключ розмови й загортаємо його для всіх учасників,
  // які вже опублікували публічний ключ.
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const entries = await wrapFor(raw, ids);
  if (entries.length === 0) return null;
  await api.e2ee.saveConversationKeys(conversationId, entries);
  await distribute(raw);

  // Перечитуємо key: можливо, інший учасник щойно зберіг свій варіант.
  const stored = await api.e2ee.conversationKey(conversationId);
  const actual = stored.wrappedKey ? await unwrap(stored.wrappedKey) : raw;
  const result = actual ?? raw;
  keyCache.set(cacheKey(userId, conversationId), result);
  return result;
}

async function decryptWithKey(key: Uint8Array, ciphertext: string): Promise<string | null> {
  try {
    const blob = base64ToBytes(ciphertext);
    if (blob.length < 13) return null;
    const cryptoKey = await importAesKey(key);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.subarray(0, 12) },
      cryptoKey,
      blob.subarray(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Зашифрувати текст для конкретної розмови. */
export async function encryptForConversation(
  userId: string,
  conversationId: string,
  memberIds: string[] | undefined,
  plaintext: string,
): Promise<EncryptedPayload> {
  const raw = await resolveConversationKey(userId, conversationId, memberIds, true);
  if (!raw) throw new Error('Шифрування недоступне: учасники розмови ще не увімкнули E2EE');
  const key = await importAesKey(raw);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  const blob = new Uint8Array(iv.length + encrypted.length);
  blob.set(iv, 0);
  blob.set(encrypted, iv.length);
  return { content: bytesToBase64(blob), encrypted: true, encryptionVersion: E2EE_VERSION };
}

/**
 * Розшифрувати повідомлення, отримані з API або сокета. Оригінальні об'єкти
 * не змінюються — повертаються нові, з розшифрованим `content`.
 */
export async function decryptMessages(
  userId: string,
  conversationId: string,
  messages: Message[],
  memberIds?: string[],
): Promise<Message[]> {
  if (!messages.some((message) => message.encrypted && !message.decrypted)) return messages;
  const identity = loadIdentity(userId);
  if (!identity) {
    return messages.map((message) => message.encrypted && !message.decrypted
      ? { ...message, content: '', decryptionFailed: true }
      : message);
  }
  let resolved: Uint8Array | null | undefined;
  const getKey = async (): Promise<Uint8Array | null> => {
    if (resolved === undefined) {
      try {
        resolved = await resolveConversationKey(userId, conversationId, memberIds, false);
      } catch {
        resolved = null;
      }
    }
    return resolved;
  };

  const result: Message[] = [];
  for (const message of messages) {
    if (!message.encrypted || message.decrypted) {
      result.push(message);
      continue;
    }
    const key = await getKey();
    if (!key) {
      result.push({ ...message, content: '', decryptionFailed: true });
      continue;
    }
    const plain = await decryptWithKey(key, message.content);
    if (plain === null) {
      keyCache.delete(cacheKey(userId, conversationId));
      result.push({ ...message, content: '', decryptionFailed: true });
      continue;
    }
    let replyTo = message.replyTo;
    if (replyTo?.encrypted && replyTo.content) {
      const replyPlain = await decryptWithKey(key, replyTo.content);
      replyTo = { ...replyTo, content: replyPlain ?? '', encrypted: replyPlain === null };
    }
    result.push({ ...message, content: plain, decrypted: true, replyTo });
  }
  return result;
}
