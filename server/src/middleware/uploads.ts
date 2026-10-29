import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config/env';
import type { MessageKind } from '../types/domain';
import { AppError } from '../utils/errors';

const extensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

const avatarMimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// Custom stickers are raster artwork; SVG uploads would let users serve markup
// that the browser can execute in the chat origin.
const stickerMimes = new Set(['image/png', 'image/webp', 'image/gif']);

// MediaRecorder commonly reports parameters such as "audio/webm;codecs=opus".
// Validation and extension selection must use only the base media type.
function baseMime(value: string): string {
  return value.split(';', 1)[0]!.trim().toLowerCase();
}

const storage = multer.diskStorage({
  destination: config.UPLOAD_DIR,
  filename: (_req, file, callback) => {
    callback(null, `${crypto.randomUUID()}${extensions[baseMime(file.mimetype)] ?? ''}`);
  },
});

function fileFilter(allowed: (mime: string) => boolean): NonNullable<multer.Options['fileFilter']> {
  return (_req, file, callback) => {
    if (!allowed(baseMime(file.mimetype))) {
      callback(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Цей тип файлу не дозволено'));
      return;
    }
    callback(null, true);
  };
}

export const upload = multer({
  storage,
  limits: { fileSize: config.MAX_FILE_SIZE, files: 1 },
  fileFilter: fileFilter((mime) => mime in extensions),
});

export const avatarUpload = multer({
  storage,
  limits: { fileSize: config.MAX_FILE_SIZE, files: 1 },
  fileFilter: fileFilter((mime) => avatarMimes.has(mime)),
});

export const stickerUpload = multer({
  storage,
  limits: { fileSize: config.MAX_STICKER_SIZE, files: 1 },
  fileFilter: fileFilter((mime) => stickerMimes.has(mime)),
});

export function isStoredAsset(asset: string): boolean {
  return asset.startsWith('/uploads/');
}

export function assetFilename(asset: string): string | undefined {
  return isStoredAsset(asset) ? asset.slice('/uploads/'.length) : undefined;
}

export function kindForMime(mime: string): Exclude<MessageKind, 'text'> {
  const normalized = baseMime(mime);
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'voice';
  return 'document';
}

export function mimeMatchesKind(mime: string, kind: MessageKind): boolean {
  if (kind === 'video_note') return baseMime(mime).startsWith('video/');
  return kindForMime(mime) === kind;
}

export function safeOriginalName(name: string): string {
  const cleaned = path.basename(name).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'attachment').slice(0, 255);
}

export async function removeUpload(filename: string | undefined): Promise<void> {
  if (!filename || path.basename(filename) !== filename) return;
  await fs.unlink(path.join(config.UPLOAD_DIR, filename)).catch(() => undefined);
}
